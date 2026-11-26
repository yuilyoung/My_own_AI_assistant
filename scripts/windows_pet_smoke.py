"""Exercise the native Chromium desktop window, local demo turn and window controls."""

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from threading import Thread

from PySide6.QtCore import QPoint, Qt
from PySide6.QtGui import QCursor
from PySide6.QtTest import QTest
from PySide6.QtWidgets import QApplication

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services"))

from gateway.config import Settings  # noqa: E402
from gateway.desktop_pet import PetWindow, pet_gateway  # noqa: E402


def wait_for(app, predicate, label, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        app.processEvents()
        if predicate():
            return
        time.sleep(0.02)
    raise AssertionError(f"Timed out waiting for {label}")


def javascript(app, page, expression):
    results = []
    page.runJavaScript(expression, 0, results.append)
    wait_for(app, lambda: bool(results), "native renderer")
    return results[0]


def check_windows_launcher(directory):
    """Start Pet.cmd and close the actual window belonging to its Gateway PID."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.WinDLL("user32", use_last_error=True)
    enum_callback = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    user32.EnumWindows.argtypes = (enum_callback, wintypes.LPARAM)
    user32.GetWindowThreadProcessId.argtypes = (wintypes.HWND, ctypes.POINTER(wintypes.DWORD))
    user32.IsWindowVisible.argtypes = (wintypes.HWND,)
    user32.GetWindowLongW.argtypes = (wintypes.HWND, ctypes.c_int)
    user32.PostMessageW.argtypes = (wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM)

    log_path = directory / "launcher.log"
    env = dict(
        os.environ, ASSISTANT_DATA_DIR=str(directory), TTS_PROVIDER="none", STT_PROVIDER="none"
    )
    with log_path.open("wb") as log:
        launcher = subprocess.Popen(
            [os.environ["COMSPEC"], "/d", "/c", "Pet.cmd", "-Provider", "demo"],
            cwd=ROOT,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        try:
            handles = []
            host_pid = None

            @enum_callback
            def find_window(handle, _data):
                pid = wintypes.DWORD()
                user32.GetWindowThreadProcessId(handle, ctypes.byref(pid))
                if (
                    pid.value == host_pid
                    and user32.IsWindowVisible(handle)
                    and user32.GetWindowLongW(handle, -20) & 0x00000008
                ):
                    handles.append(handle)
                    return False
                return True

            deadline = time.monotonic() + 180
            while not handles and time.monotonic() < deadline:
                if launcher.poll() is not None:
                    raise AssertionError(
                        f"Pet.cmd exited before showing its window ({launcher.returncode})"
                    )
                if host_pid is None:
                    match = re.search(rb"Started server process \[(\d+)\]", log_path.read_bytes())
                    if match:
                        host_pid = int(match[1])
                if host_pid is not None:
                    user32.EnumWindows(find_window, 0)
                time.sleep(0.1)
            assert handles, "Pet.cmd did not show an always-on-top native window"
            assert user32.PostMessageW(handles[0], 0x0010, 0, 0), "Could not close the pet window"
            assert launcher.wait(timeout=30) == 0, "Pet.cmd did not shut down cleanly"
        finally:
            if launcher.poll() is None:
                subprocess.run(
                    ["taskkill.exe", "/T", "/F", "/PID", str(launcher.pid)],
                    capture_output=True,
                    timeout=10,
                    check=False,
                )
                launcher.wait(timeout=10)


def check_windows_input(app, window, point, js):
    """Exercise Win32 hit-testing and dragging when the runner has an input desktop."""
    import ctypes
    from ctypes import wintypes

    api = ctypes.WinDLL("user32", use_last_error=True)
    api.WindowFromPoint.argtypes = (wintypes.POINT,)
    api.WindowFromPoint.restype = wintypes.HWND
    api.GetAncestor.argtypes = (wintypes.HWND, wintypes.UINT)
    api.GetAncestor.restype = wintypes.HWND
    api.ClientToScreen.argtypes = (wintypes.HWND, ctypes.POINTER(wintypes.POINT))
    api.SetCursorPos.argtypes = (ctypes.c_int, ctypes.c_int)
    hwnd = int(window.winId())

    def screen_point(x, y):
        scale = window.devicePixelRatioF()
        pt = wintypes.POINT(round(x * scale), round(y * scale))
        assert api.ClientToScreen(hwnd, ctypes.byref(pt))
        return pt

    def hit(point):
        return api.GetAncestor(api.WindowFromPoint(point), 2)

    face = screen_point(*point)
    if hit(face) != hwnd or not api.SetCursorPos(face.x, face.y):
        print("Runner input desktop unavailable for Win32 hit-test and pointer drag.")
        return
    assert hit(screen_point(1, 1)) != hwnd, "Transparent corner intercepted desktop input"
    window.activateWindow()
    window.raise_()
    QTest.qWait(100)
    js("""
        window.petPointerDown = [];
        window.addEventListener('pointerdown', e => window.petPointerDown.push({
          figure: !!e.target.closest('.pet-figure'), trusted: e.isTrusted, x:e.clientX, y:e.clientY
        }), {capture:true});
    """)
    before = window.pos()
    down = []

    def drag():
        api.mouse_event(0x0002, 0, 0, 0, 0)
        try:
            time.sleep(0.18)
            down.append(bool(api.GetAsyncKeyState(1) & 0x8000))
            for i in range(1, 13):
                api.SetCursorPos(face.x - i * 3, face.y)
                time.sleep(0.025)
        finally:
            api.mouse_event(0x0004, 0, 0, 0, 0)

    pointer = Thread(target=drag)
    pointer.start()
    wait_for(app, lambda: not pointer.is_alive(), "native pointer release")
    pointer.join()
    observed = js("JSON.stringify(window.petPointerDown)")
    assert window.x() < before.x() - 5, (
        f"Pointer drag did not move window: before={before.toTuple()}, "
        f"after={window.pos().toTuple()}, pressed={down}, events={observed}"
    )
    print("Win32 hit-testing and mouse drag passed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-dir", type=Path, default=ROOT / "apps/web/dist")
    parser.add_argument("--launcher", action="store_true", help="Also exercise Pet.cmd on Windows")
    args = parser.parse_args()
    assert (args.web_dir / "index.html").is_file()
    app = QApplication([])
    app.setQuitOnLastWindowClosed(False)
    with tempfile.TemporaryDirectory() as directory:
        settings = Settings(data_dir=Path(directory), web_dir=args.web_dir)
        with pet_gateway(settings) as local:
            assert local.port != 0 and len(local.token) >= 32
            window = PetWindow(local)
            window.show()
            try:
                page = window.page()

                def js(statement):
                    return javascript(app, page, statement)

                wait_for(
                    app,
                    lambda: js(
                        "!!(window.desktopPet && document.querySelector('[data-pet-chat]'))"
                    ),
                    "packaged pet controls",
                )
                assert not page.url().fragment(), "Pairing fragment was not cleared"
                flags = window.windowFlags()
                assert flags & Qt.WindowType.FramelessWindowHint
                assert flags & Qt.WindowType.WindowStaysOnTopHint
                assert window.testAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
                assert page.backgroundColor().alpha() == 0
                assert js("getComputedStyle(document.body).backgroundColor") == "rgba(0, 0, 0, 0)"
                js("document.querySelector('[data-pet-chat]').click()")
                wait_for(
                    app,
                    lambda: js("!!document.querySelector('input[aria-label=\"메시지\"]:enabled')"),
                    "authenticated Gateway session",
                )
                js("""
                    const field = document.querySelector('input[aria-label="메시지"]');
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
                      .set.call(field, '데스크톱 테스트');
                    field.dispatchEvent(new Event('input', {bubbles:true}));
                """)
                click_point = json.loads(
                    js("""
                    (() => {
                      const r = document.querySelector('.pet-chat form button').getBoundingClientRect();
                      return JSON.stringify([Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]);
                    })()
                """)
                )
                QTest.mouseClick(
                    window.focusProxy() or window,
                    Qt.MouseButton.LeftButton,
                    Qt.KeyboardModifier.NoModifier,
                    QPoint(*click_point),
                )
                wait_for(
                    app,
                    lambda: js(
                        "document.querySelector('[role=log]').textContent.includes('고정 응답')"
                    ),
                    "real Gateway demo response",
                )
                wait_for(
                    app,
                    lambda: js("!!document.querySelector('.pet-chat input:enabled')"),
                    "completed demo turn",
                )
                js(
                    "requestAnimationFrame(() => requestAnimationFrame(() => { window.petPainted = true; }))"
                )
                wait_for(app, lambda: js("window.petPainted === true"), "rendered conversation")
                QTest.qWait(160)
                image = window.grab().toImage()
                assert image.pixelColor(1, 1).alpha() == 0, "Native corner was opaque"
                colors = {
                    image.pixelColor(x, y).rgba()
                    for x in range(2, image.width(), 8)
                    for y in range(2, image.height(), 8)
                }
                assert len(colors) > 32, "Native capture was blank"
                if report := os.getenv("PET_SCREENSHOT_PATH"):
                    assert image.save(report), "Could not capture native window"
                js("document.querySelector('[data-pet-chat]').click()")
                wait_for(
                    app,
                    lambda: js("!document.querySelector('.pet-chat')"),
                    "compact pet",
                )
                if os.name == "nt":
                    QTest.qWait(200)
                    face = json.loads(
                        js("""
                        (() => {
                          const r = document.querySelector('.pet-figure svg').getBoundingClientRect();
                          return JSON.stringify([r.x + r.width * .5, r.y + r.height * .32]);
                        })()
                    """)
                    )
                    check_windows_input(app, window, face, js)
                QCursor.setPos(window.screen().availableGeometry().topLeft() + QPoint(1, 1))
                bounds = window.screen().availableGeometry()
                if window.frameGeometry().contains(QCursor.pos()):
                    for edge in (
                        bounds.topLeft(),
                        QPoint(
                            bounds.right() - window.width() + 1,
                            bounds.bottom() - window.height() + 1,
                        ),
                    ):
                        window.move(edge)
                        if not window.frameGeometry().contains(QCursor.pos()):
                            break
                before = window.pos()
                reduced = js("matchMedia('(prefers-reduced-motion: reduce)').matches")
                js(
                    "[...document.querySelectorAll('button')].find(b => b.textContent === '산책').click()"
                )
                if reduced:
                    QTest.qWait(240)
                    assert before == window.pos() and not window.controls.timer.isActive()
                    # Exercise native movement separately from the UI's accessibility policy.
                    js("window.desktopPet.setRoaming(true)")
                wait_for(
                    app, window.controls.timer.isActive, f"roaming request (reduced={reduced})"
                )
                details = (
                    f"screen={bounds.getRect()}, frame={window.frameGeometry().getRect()}, "
                    f"cursor={QCursor.pos().toTuple()}, held={QApplication.mouseButtons()}, "
                    f"modal={bool(QApplication.activeModalWidget())}, reduced={reduced}"
                )
                wait_for(app, lambda: window.pos() != before, "native desktop movement " + details)
                js("window.desktopPet.setRoaming(false)")
                wait_for(app, lambda: not window.controls.timer.isActive(), "roaming stop")
                assert window.screen().availableGeometry().contains(window.frameGeometry())

                js("window.desktopPet.close()")
                wait_for(app, lambda: not window.isVisible(), "native close action")
            finally:
                window.close()
        with socket.socket() as probe:
            assert probe.connect_ex(("127.0.0.1", local.port)) != 0
    if args.launcher:
        if os.name != "nt":
            parser.error("--launcher requires Windows")
        with tempfile.TemporaryDirectory() as directory:
            check_windows_launcher(Path(directory))
    print("Native frameless desktop pet, local pairing, demo chat, roaming and shutdown passed.")


if __name__ == "__main__":
    main()
