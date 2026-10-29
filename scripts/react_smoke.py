"""Production React browser check with synthetic STT/TTS, never external models.

Run after npm ci && npm run build in apps/web. Requires playwright + Chromium.
The fixture server is private to this script and never used by gateway.cli.
"""

import io
import json
import math
import os
import secrets
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def serve():
    import uvicorn
    from gateway.api import create_app
    from gateway.config import Settings
    from gateway.speech import validate_input_wav

    class FixtureSTT:
        async def transcribe(self, data):
            validate_input_wav(data)
            return "검토할 음성 입력"

    class FixtureTTS:
        async def synthesize(self, text):
            result = io.BytesIO()
            with wave.open(result, "wb") as audio:
                audio.setnchannels(1)
                audio.setsampwidth(2)
                audio.setframerate(16000)
                audio.writeframes(
                    b"".join(
                        struct.pack("<h", int(9000 * math.sin(2 * math.pi * 220 * n / 16000)))
                        for n in range(24000)
                    )
                )
            return result.getvalue()

    settings = Settings.from_env()
    app = create_app(settings)
    app.state.transcriptions.provider = FixtureSTT()
    app.state.engine.tts = FixtureTTS()
    uvicorn.run(app, host="127.0.0.1", port=settings.port, access_log=False)


def main():
    from playwright.sync_api import expect, sync_playwright

    if not (ROOT / "apps/web/dist/index.html").is_file():
        raise RuntimeError("Build apps/web first")
    token = secrets.token_urlsafe(32)
    base = "http://127.0.0.1:18765"
    with tempfile.TemporaryDirectory() as data:
        env = os.environ.copy()
        env.update(
            PYTHONPATH=str(ROOT / "services"),
            ASSISTANT_DATA_DIR=data,
            ASSISTANT_TOKEN=token,
            ASSISTANT_PORT="18765",
            LLM_PROVIDER="demo",
            TTS_PROVIDER="none",
            STT_PROVIDER="none",
            ASSISTANT_WEB_DIR=str(ROOT / "apps/web/dist"),
        )
        with open(Path(data) / "server.log", "w") as log:
            process = subprocess.Popen(
                [sys.executable, __file__, "--serve"], cwd=ROOT, env=env, stdout=log, stderr=log
            )
            try:
                for _ in range(100):
                    if process.poll() is not None:
                        raise RuntimeError("Fixture server failed to start")
                    try:
                        urllib.request.urlopen(base, timeout=1).close()
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.1)
                else:
                    raise RuntimeError("Fixture server startup timeout")
                with sync_playwright() as playwright:
                    browser = playwright.chromium.launch(
                        args=[
                            "--use-fake-ui-for-media-stream",
                            "--use-fake-device-for-media-stream",
                            "--autoplay-policy=no-user-gesture-required",
                        ]
                    )
                    context = browser.new_context(permissions=["microphone"])
                    page = context.new_page()
                    page.on(
                        "console",
                        lambda message: (
                            print("BROWSER", message.type, message.text)
                            if message.type == "error"
                            else None
                        ),
                    )
                    page.on(
                        "response",
                        lambda response: (
                            print("HTTP", response.status, response.url)
                            if response.status >= 400
                            else None
                        ),
                    )
                    errors = []
                    turns = []
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    page.on(
                        "request",
                        lambda request: (
                            turns.append(request.url)
                            if request.method == "POST" and request.url.endswith("/turns")
                            else None
                        ),
                    )
                    page.goto(base + "/#token=" + token)
                    page.get_by_role("button", name="연결", exact=True).click()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    assert token not in page.url
                    expect(page.get_by_text("Live2D 미연결")).to_be_visible()
                    expect(page.get_by_text("DEMO · 고정 응답", exact=False)).to_be_visible()
                    page.get_by_label("기억할 내용").fill("비서 전용 기억")
                    page.get_by_role("button", name="기억 저장").click()
                    expect(
                        page.get_by_role("listitem").filter(has_text="비서 전용 기억")
                    ).to_be_visible()
                    page.get_by_label("비서 메모", exact=True).fill("검증 메모")
                    page.get_by_role("button", name="메모 저장").click()
                    expect(page.get_by_text("검증 메모", exact=True)).to_be_visible()
                    page.get_by_role("button", name="마이크로 입력").click()
                    expect(page.get_by_role("button", name="녹음 완료")).to_be_enabled()
                    page.wait_for_timeout(400)
                    page.get_by_role("button", name="녹음 완료").click()
                    try:
                        expect(page.get_by_label("메시지", exact=True)).to_have_value(
                            "검토할 음성 입력"
                        )
                    except Exception:
                        print("VOICE ALERTS", page.get_by_role("alert").all_text_contents())
                        print("VOICE STATUS", page.get_by_role("status").all_text_contents())
                        raise
                    assert not turns, "Transcription must never auto-submit a turn"
                    page.get_by_role("button", name="전송", exact=True).click()
                    expect(
                        page.get_by_text("연결 확인용 고정 응답입니다.", exact=False)
                    ).to_be_visible()
                    page.wait_for_function('document.querySelector("meter").value > 0')
                    expect(page.get_by_role("button", name="전송", exact=True)).to_be_disabled()
                    page.wait_for_function('document.querySelector("meter").value === 0')
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    page.get_by_role("button", name="가상 소개팅", exact=True).click()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(
                        page.get_by_role("listitem").filter(has_text="비서 전용 기억")
                    ).to_have_count(0)
                    expect(page.get_by_label("비서 메모", exact=True)).to_have_count(0)
                    page.get_by_role("button", name="마이크로 입력").click()
                    expect(page.get_by_role("button", name="녹음 완료")).to_be_enabled()
                    page.get_by_role("button", name="개인 비서", exact=True).click()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(page.get_by_label("메시지", exact=True)).to_have_value("")
                    expect(
                        page.get_by_role("listitem").filter(has_text="비서 전용 기억")
                    ).to_be_visible()
                    assert not errors, errors
                    browser.close()
                    print(
                        json.dumps(
                            {
                                "react_browser": "passed",
                                "synthetic_stt_tts": True,
                                "real_model_inference": False,
                                "checks": [
                                    "pairing",
                                    "memory_scope",
                                    "notes",
                                    "worklet_capture",
                                    "transcript_review",
                                    "wav_playback_rms",
                                    "mode_cancel",
                                ],
                            },
                            ensure_ascii=False,
                        )
                    )
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    serve() if "--serve" in sys.argv else main()
