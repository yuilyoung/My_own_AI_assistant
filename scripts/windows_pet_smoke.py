"""Exercise the native Chromium desktop window, local demo turn and window controls."""

import argparse
import os
import socket
import sys
import tempfile
import time
from pathlib import Path

from PySide6.QtCore import QPoint, Qt
from PySide6.QtGui import QCursor
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--web-dir", type=Path, default=ROOT / "apps/web/dist")
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
                js("document.querySelector('.pet-chat form button').click()")
                wait_for(
                    app,
                    lambda: js(
                        "document.querySelector('[role=log]').textContent.includes('고정 응답')"
                    ),
                    "real Gateway demo response",
                )
                if report := os.getenv("PET_SCREENSHOT_PATH"):
                    assert window.grab().save(report), "Could not capture native window"
                js("document.querySelector('[data-pet-chat]').click()")
                wait_for(
                    app,
                    lambda: js("!document.querySelector('.pet-chat')"),
                    "compact pet",
                )
                QCursor.setPos(window.screen().availableGeometry().topLeft() + QPoint(1, 1))
                before = window.pos()
                js(
                    "[...document.querySelectorAll('button')].find(b => b.textContent === '산책').click()"
                )
                wait_for(app, lambda: window.pos() != before, "native desktop movement")
                js("window.desktopPet.setRoaming(false)")
                wait_for(app, lambda: not window.controls.timer.isActive(), "roaming stop")
                assert window.screen().availableGeometry().contains(window.frameGeometry())

                js("window.desktopPet.close()")
                wait_for(app, lambda: not window.isVisible(), "native close action")
            finally:
                window.close()
        with socket.socket() as probe:
            assert probe.connect_ex(("127.0.0.1", local.port)) != 0
    print("Native frameless desktop pet, local pairing, demo chat, roaming and shutdown passed.")


if __name__ == "__main__":
    main()
