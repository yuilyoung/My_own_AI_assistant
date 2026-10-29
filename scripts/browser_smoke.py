"""Optional real-browser smoke checks. No external models or APIs are called.

Install playwright separately; uses system Chromium when available.
A disposable local server and synthetic sine-wave fixture are created, then stopped.
"""

import io
import json
import math
import os
import re
import secrets
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.request
import wave
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def fixture_wave():
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(
            b"".join(
                struct.pack("<h", int(9000 * math.sin(2 * math.pi * 220 * n / 16000)))
                for n in range(48000)
            )
        )
    return buffer.getvalue()


def main():
    results = []
    token = secrets.token_urlsafe(32)
    base = "http://127.0.0.1:18765"
    with tempfile.TemporaryDirectory() as data:
        env = os.environ.copy()
        env.update(
            PYTHONPATH=str(ROOT / "services"),
            ASSISTANT_WEB_DIR=str(ROOT / "apps/diagnostics"),
            ASSISTANT_TOKEN=token,
            ASSISTANT_DATA_DIR=data,
            ASSISTANT_PORT="18765",
            LLM_PROVIDER="demo",
            TTS_PROVIDER="none",
        )
        with open(Path(data) / "server.log", "w") as log:
            process = subprocess.Popen(
                [sys.executable, "-m", "gateway.cli"], cwd=ROOT, env=env, stdout=log, stderr=log
            )
            try:
                for _ in range(80):
                    try:
                        urllib.request.urlopen(base, timeout=0.2).close()
                        break
                    except Exception:
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Test gateway did not start")
                with sync_playwright() as p:
                    executable = os.getenv("BROWSER_EXECUTABLE") or shutil.which("chromium")
                    browser = p.chromium.launch(
                        headless=True,
                        executable_path=executable,
                        args=["--no-sandbox"] if executable else [],
                    )
                    page = browser.new_page(viewport={"width": 1300, "height": 1000})
                    errors = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.goto(base + "/#token=" + token)
                    expect(page.locator("#profile")).to_contain_text("DEMO")
                    expect(page.locator("#state")).to_have_text("대기")
                    assert "token=" not in page.url
                    results.append("pairing and fragment removal")

                    page.locator("#message").fill("오늘 할 일을 함께 정리하고 싶어요.")
                    page.locator("#send").click()
                    expect(page.locator("#messages")).to_contain_text("연결 확인용 고정 응답")
                    expect(page.locator("#state")).to_have_text("대기")
                    results.append("real HTTP demo turn")

                    page.locator("#remember").evaluate(
                        "node => node.closest('details').open = true"
                    )
                    page.locator("#remember input").fill("퇴근 후 20분 산책하기")
                    page.locator("#remember button").click()
                    expect(page.locator("#memories")).to_contain_text("퇴근 후 20분 산책하기")
                    page.locator("#companion").click()
                    expect(page.locator("#state")).to_have_text("대기")
                    expect(page.locator("#memories")).not_to_contain_text("퇴근 후 20분 산책하기")
                    expect(page.locator("#note-form")).to_be_hidden()
                    page.locator("#assistant").click()
                    expect(page.locator("#memories")).to_contain_text("퇴근 후 20분 산책하기")
                    results.append("mode isolation and scoped memory reload")

                    attack = '<img src=x onerror="window.xss=1">'
                    page.locator("#memory").fill(attack)
                    page.locator("#remember button").click()
                    expect(page.locator("#memories")).to_contain_text(attack)
                    assert page.locator("#memories img").count() == 0
                    assert page.evaluate("window.xss") is None
                    page.locator("#memories .item").filter(has_text=attack).get_by_role(
                        "button"
                    ).click()
                    expect(page.locator("#memories")).not_to_contain_text(attack)
                    results.append("untrusted memory rendered as text and deleted")

                    def with_fixture_audio(route):
                        if route.request.method != "GET":
                            return route.continue_()
                        response = route.fetch()
                        payload = response.json()
                        for segment in payload.get("segments", []):
                            segment["audio_id"] = "synthetic-test-wave"
                        route.fulfill(response=response, json=payload)

                    page.route(re.compile(r"/api/sessions/[^/]+/turns/[^/]+$"), with_fixture_audio)
                    page.route(
                        "**/audio/synthetic-test-wave",
                        lambda r: r.fulfill(
                            status=200, content_type="audio/wav", body=fixture_wave()
                        ),
                    )
                    page.locator("#message").fill("오디오 재생과 중지를 점검합니다.")
                    page.locator("#send").click()
                    page.wait_for_function(
                        "parseFloat(document.querySelector('#level').style.width)>0"
                    )
                    page.locator("#stop").click()
                    expect(page.locator("#state")).to_have_text("대기")
                    page.wait_for_function("document.querySelector('#level').style.width === '0%'")
                    results.append("Web Audio playback/RMS/stop with synthetic audio fixture")

                    bad = browser.new_page()
                    bad.goto(base + "/#token=invalid")
                    expect(bad.locator("#error")).to_contain_text("연결 토큰")
                    expect(bad.locator("#pairing")).to_be_visible()
                    bad.close()
                    results.append("invalid pairing token rejected")

                    page.set_viewport_size({"width": 390, "height": 844})
                    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                    page.set_viewport_size({"width": 1300, "height": 1000})
                    page.locator("details").evaluate("node=>node.open=false")
                    screenshot = Path(
                        os.getenv("SMOKE_SCREENSHOT", str(ROOT / ".local-data/browser-smoke.png"))
                    )
                    screenshot.parent.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(screenshot), full_page=True)
                    results.append("responsive layout and screenshot")
                    assert not errors, errors
                    results.append("no browser JavaScript errors")
                    browser.close()
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    print(json.dumps({"passed": len(results), "checks": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
