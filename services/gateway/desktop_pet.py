"""A transparent, movable desktop window backed by a private loopback Gateway."""

import secrets
import socket
import sys
import time
from contextlib import contextmanager
from dataclasses import replace
from threading import Thread
from urllib.parse import urlencode

import uvicorn
from PySide6.QtCore import QFile, QIODevice, QObject, QPoint, Qt, QTimer, QUrl, Slot
from PySide6.QtGui import QColor, QCursor, QGuiApplication, QKeySequence, QShortcut
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import (
    QWebEnginePage,
    QWebEnginePermission,
    QWebEngineProfile,
    QWebEngineScript,
    QWebEngineSettings,
    QWebEngineUrlRequestInterceptor,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMessageBox

from .api import create_app
from .config import Settings


@contextmanager
def pet_gateway(settings: Settings):
    if settings.public_origin or settings.host != "127.0.0.1":
        raise ValueError("Desktop pet requires a local Gateway")
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        settings = replace(settings, port=port, token=secrets.token_urlsafe(32))
        server = uvicorn.Server(
            uvicorn.Config(
                create_app(settings),
                host=settings.host,
                port=port,
                access_log=False,
                timeout_graceful_shutdown=5,
            )
        )
        worker = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        worker.start()
        try:
            deadline = time.monotonic() + 15
            while not server.started:
                if not worker.is_alive() or time.monotonic() >= deadline:
                    raise RuntimeError("Desktop pet Gateway could not start")
                time.sleep(0.025)
            yield settings
        finally:
            server.should_exit = True
            worker.join(timeout=8)


def local_url(url: QUrl, port: int) -> bool:
    return (
        url.scheme() == "http"
        and url.host() == "127.0.0.1"
        and url.port() == port
        and not url.userInfo()
    )


class LocalRequests(QWebEngineUrlRequestInterceptor):
    def __init__(self, parent, port: int):
        super().__init__(parent)
        self.port = port

    def interceptRequest(self, info):
        url = info.requestUrl()
        if url.scheme() == "blob":
            url = QUrl(url.toString()[len("blob:") :])
        info.block(not local_url(url, self.port))


class PetPage(QWebEnginePage):
    def __init__(self, profile, parent, port: int):
        super().__init__(profile, parent)
        self.port = port
        self.permissionRequested.connect(self.request_permission)

    def acceptNavigationRequest(self, url, navigation_type, is_main_frame):
        return (
            is_main_frame
            and local_url(url, self.port)
            and url.path() == "/"
            and url.query() == "pet=1"
        )

    def request_permission(self, permission):
        if (
            local_url(permission.origin(), self.port)
            and permission.permissionType() == QWebEnginePermission.PermissionType.MediaAudioCapture
            and QMessageBox.question(
                self.parent(), "My Companion", "이 대화에 마이크를 사용하시겠어요?"
            )
            == QMessageBox.StandardButton.Yes
        ):
            permission.grant()
        else:
            permission.deny()


class WindowControls(QObject):
    def __init__(self, view):
        super().__init__(view)
        self.view = view
        self.direction = -1
        self.timer = QTimer(self)
        self.timer.setInterval(65)
        self.timer.timeout.connect(self.step)

    @Slot()
    def drag(self):
        handle = self.view.windowHandle()
        if handle and QGuiApplication.mouseButtons() & Qt.MouseButton.LeftButton:
            handle.startSystemMove()

    @Slot()
    def close(self):
        QTimer.singleShot(0, self.view.close)

    @Slot(bool)
    def setRoaming(self, enabled):
        if enabled:
            self.timer.start()
        else:
            self.timer.stop()

    def step(self):
        if (
            self.view.frameGeometry().contains(QCursor.pos())
            or QGuiApplication.mouseButtons() != Qt.MouseButton.NoButton
            or QApplication.activeModalWidget()
        ):
            return
        bounds = self.view.screen().availableGeometry()
        x = self.view.x()
        if x <= bounds.left():
            self.direction = 1
        elif x + self.view.width() >= bounds.right() + 1:
            self.direction = -1
        self.move_by(self.direction * 2, 0)

    def move_by(self, dx, dy):
        bounds = self.view.screen().availableGeometry()
        x = min(self.view.x() + dx, bounds.right() + 1 - self.view.width())
        y = min(self.view.y() + dy, bounds.bottom() + 1 - self.view.height())
        self.view.move(max(bounds.left(), x), max(bounds.top(), y))


class PetWindow(QWebEngineView):
    def __init__(self, settings: Settings):
        super().__init__()
        self.setWindowTitle("My Companion · 바탕화면 펫")
        self.setWindowFlags(
            Qt.WindowType.Window
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setContextMenuPolicy(Qt.ContextMenuPolicy.NoContextMenu)
        bounds = QGuiApplication.primaryScreen().availableGeometry()
        self.resize(min(360, bounds.width()), min(500, bounds.height()))
        self.move(
            bounds.topLeft()
            + QPoint(
                max(0, bounds.width() - self.width() - 16),
                max(0, bounds.height() - self.height() - 16),
            )
        )

        # The unnamed profile is off-the-record, including the initial pairing fragment.
        self.profile = QWebEngineProfile(QApplication.instance())
        self.destroyed.connect(self.profile.deleteLater)
        self.requests = LocalRequests(self.profile, settings.port)
        self.profile.setUrlRequestInterceptor(self.requests)
        self.profile.setPersistentPermissionsPolicy(
            QWebEngineProfile.PersistentPermissionsPolicy.AskEveryTime
        )
        page = PetPage(self.profile, self, settings.port)
        self.setPage(page)
        page.setBackgroundColor(QColor(Qt.GlobalColor.transparent))
        page.settings().setAttribute(
            QWebEngineSettings.WebAttribute.JavascriptCanOpenWindows, False
        )

        self.controls = WindowControls(self)
        self.channel = QWebChannel(page)
        self.channel.registerObject("controls", self.controls)
        page.setWebChannel(self.channel)
        library = QFile(":/qtwebchannel/qwebchannel.js")
        if not library.open(QIODevice.OpenModeFlag.ReadOnly):
            raise RuntimeError("Qt WebChannel library is unavailable")
        script = QWebEngineScript()
        script.setName("Desktop pet window controls")
        script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
        script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentReady)
        script.setSourceCode(
            bytes(library.readAll()).decode("utf-8")
            + """
            new QWebChannel(qt.webChannelTransport, channel => {
              const controls = channel.objects.controls;
              window.desktopPet = Object.freeze({
                close: () => controls.close(),
                drag: () => controls.drag(),
                setRoaming: enabled => controls.setRoaming(enabled === true),
              });
              window.dispatchEvent(new Event('desktop-pet-ready'));
            });
        """
        )
        page.scripts().insert(script)
        for key, dx, dy in (("Left", -12, 0), ("Right", 12, 0), ("Up", 0, -12), ("Down", 0, 12)):
            shortcut = QShortcut(QKeySequence(f"Alt+{key}"), self)
            shortcut.activated.connect(lambda dx=dx, dy=dy: self.controls.move_by(dx, dy))
        query = urlencode({"token": settings.token})
        self.setUrl(QUrl(f"http://127.0.0.1:{settings.port}/?pet=1#{query}"))


def main():
    app = QApplication(sys.argv[:1])
    app.setApplicationName("My Companion")
    with pet_gateway(Settings.from_env()) as settings:
        window = PetWindow(settings)
        window.show()
        app.exec()


if __name__ == "__main__":
    main()
