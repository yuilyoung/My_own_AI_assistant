"""Production React browser check with synthetic STT/TTS, never external models.

Run after npm ci && npm run build in apps/web. Requires playwright + Chromium.
The fixture server is private to this script and never used by gateway.cli.
"""

import io
import json
import math
import os
import re
import secrets
import socket
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


def tone_wav(frequency=220):
    result = io.BytesIO()
    with wave.open(result, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(
            b"".join(
                struct.pack("<h", int(9000 * math.sin(2 * math.pi * frequency * n / 16000)))
                for n in range(24000)
            )
        )
    return result.getvalue()


def serve():
    from dataclasses import replace

    import uvicorn
    from gateway.api import create_app
    from gateway.config import Settings
    from gateway.contracts import Reply
    from gateway.speech import validate_input_wav

    class FixtureSTT:
        async def transcribe(self, data):
            validate_input_wav(data)
            return "검토할 음성 입력"

    class FixtureTTS:
        def __init__(self, frequency):
            self.frequency = frequency

        async def synthesize(self, text):
            return tone_wav(self.frequency)

    class FixtureLLM:
        def __init__(self, service):
            self.service = service

        async def reply(self, messages):
            if self.service == "cloud":
                assert "로컬 전용 기억" not in json.dumps(messages, ensure_ascii=False)
            emotion, gesture = {
                "어떤 점이 궁금해?": ("curious", "tilt"),
                "어디를 가리키는 거야?": ("thoughtful", "point"),
            }.get(messages[-1]["content"], ("happy", "greeting"))
            return Reply.model_validate(
                {
                    "segments": [
                        {
                            "text": self.service + " 모의 응답입니다.",
                            "emotion": emotion,
                            "gesture": gesture,
                        }
                    ]
                }
            )

    settings = replace(
        Settings.from_env(),
        local_llm_enabled=True,
        cloud_api_key="synthetic-key-never-sent",
        cloud_model="synthetic-cloud-model",
    )
    app = create_app(settings)
    for service, runtime in app.state.services.runtimes.items():
        runtime.transcriptions.provider = FixtureSTT()
        # Compare two timbres at the same amplitude in the browser.
        runtime.engine.tts = FixtureTTS(2600 if service == "local" else 220)
        if service != "demo":
            runtime.engine.llm = FixtureLLM(service)
    uvicorn.run(app, host="127.0.0.1", port=settings.port, access_log=False)


def check_avatar_cast(page, turns):
    """Change portraits and send real turns within the current local session."""
    from playwright.sync_api import expect

    selector = page.get_by_label("아바타 종류")
    history = page.get_by_role("log", name="대화 내용").locator("article")
    turn_path = turns[-1]
    cases = [
        (
            "hana",
            "하나",
            ".hana__kerchief",
            "어떤 점이 궁금해?",
            "호기심.*고개 기울임",
            "tilt",
            ".avatar-panel__head",
        ),
        (
            "isol",
            "이솔",
            ".isol__braid",
            "어디를 가리키는 거야?",
            "사색.*가리키기",
            "point",
            ".avatar-panel__hand",
        ),
    ]
    for character, name, artwork, question, cue_label, gesture, joint in cases:
        previous_history = history.all_text_contents()
        assert previous_history, "Expected an existing conversation before changing portrait"
        expect(selector.locator(f'option[value="{character}"]')).to_have_count(1)
        selector.select_option(character)
        portrait = page.get_by_role("img", name=re.compile(name))
        expect(portrait).to_have_attribute("data-character", character)
        expect(portrait.locator(artwork)).to_be_visible()
        assert history.all_text_contents() == previous_history, "Switching portrait changed history"

        count = len(turns)
        page.get_by_label("메시지", exact=True).fill(question)
        page.get_by_role("button", name="전송", exact=True).click()
        expect(portrait).to_have_accessible_name(re.compile(cue_label))
        expect(portrait.get_by_test_id("avatar-character")).to_have_attribute(
            "data-gesture", gesture
        )
        expect(portrait.locator(joint)).not_to_have_css("animation-name", "none")
        expect(page.get_by_role("meter")).not_to_have_attribute("value", "0")
        mouth = portrait.get_by_test_id("avatar-mouth")
        speaking_height = float(mouth.get_attribute("ry"))
        expect(page.get_by_text("대화 준비됨")).to_be_visible()
        assert float(mouth.get_attribute("ry")) < speaking_height, f"{name}'s mouth did not close"
        assert turns[count:] == [turn_path], "Avatar selection created a different chat session"
        assert history.all_text_contents()[: len(previous_history)] == previous_history
        expect(history).to_have_count(len(previous_history) + 2)

    page.emulate_media(reduced_motion="reduce")
    expect(portrait.locator(".seorin__eyes")).to_have_css("animation-name", "none")
    expect(portrait.locator(".avatar-panel__hand")).to_have_css("animation-name", "none")
    page.emulate_media(reduced_motion="no-preference")
    selector.select_option("builtin")
    expect(page.get_by_role("img", name=re.compile("서린"))).to_be_visible()


def main():
    from playwright.sync_api import expect, sync_playwright

    if not (ROOT / "apps/web/dist/index.html").is_file():
        raise RuntimeError("Build apps/web first")
    token = secrets.token_urlsafe(32)
    # Use a disposable loopback port to avoid conflicting with an active Gateway.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory() as data:
        microphone = Path(data) / "microphone.wav"
        microphone.write_bytes(tone_wav())
        env = os.environ.copy()
        env.update(
            PYTHONPATH=str(ROOT / "services"),
            ASSISTANT_DATA_DIR=data,
            ASSISTANT_TOKEN=token,
            ASSISTANT_PORT=str(port),
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
                        executable_path=os.getenv("SMOKE_BROWSER_EXECUTABLE"),
                        args=[
                            "--use-fake-ui-for-media-stream",
                            "--use-fake-device-for-media-stream",
                            "--use-file-for-fake-audio-capture=" + str(microphone),
                            "--autoplay-policy=no-user-gesture-required",
                        ],
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
                    uploads = []

                    def inspect_request(request):
                        if request.method != "POST":
                            return
                        if request.url.endswith("/turns"):
                            turns.append(request.url)
                        if request.url.endswith("/transcriptions"):
                            with wave.open(io.BytesIO(request.post_data_buffer), "rb") as recording:
                                frames = recording.getnframes()
                                nonzero = any(recording.readframes(frames))
                                uploads.append((recording.getframerate(), frames, nonzero))
                                print("WAV_UPLOAD", uploads[-1])

                    page.on("request", inspect_request)
                    page.goto(base + "/#token=invalid-test-token")
                    expect(page.get_by_label("연결 토큰")).to_have_value("invalid-test-token")
                    page.get_by_role("button", name="연결", exact=True).click()
                    expect(page.get_by_role("alert")).to_contain_text("연결 토큰")
                    expect(page.get_by_label("LLM 서비스", exact=True)).to_have_count(0)
                    page.goto(base + "/#token=" + token)
                    expect(page.get_by_label("연결 토큰")).not_to_have_value("")
                    assert not page.evaluate("Boolean(location.hash)")
                    committed_sessions = []

                    def drop_session_response(route):
                        response = route.fetch()
                        assert response.status == 201
                        committed_sessions.append(response.json()["id"])
                        route.abort("connectionreset")

                    # Arm both faults before connecting. When its last one-shot route
                    # expires, Playwright asynchronously disables request interception.
                    page.route("**/api/sessions", drop_session_response, times=1)
                    page.route("**/api/status", lambda route: route.fulfill(status=503), times=1)
                    page.get_by_role("button", name="연결", exact=True).click()
                    expect(page.get_by_role("alert")).to_contain_text("503")
                    with page.expect_event(
                        "requestfailed",
                        predicate=lambda request: (
                            request.method == "POST" and request.url == base + "/api/sessions"
                        ),
                    ):
                        page.get_by_role("button", name="다시 연결", exact=True).click()
                    retry = page.get_by_role("button", name="대화 연결 다시 시도")
                    expect(retry).to_be_visible()
                    with page.expect_response("**/api/sessions") as replay:
                        retry.click()
                    assert committed_sessions == [replay.value.json()["id"]]
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    assert token not in page.url
                    page.goto(base + "/#token=unused-while-connected")
                    page.wait_for_function("!location.hash")
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    portrait = page.get_by_role("img", name=re.compile("서린"))
                    expect(portrait).to_be_visible()
                    expect(portrait).to_have_accessible_name(re.compile("기본 아바타"))
                    eyes = portrait.locator(".seorin__eyes")
                    expect(eyes).to_be_visible()
                    neutral_eyes = eyes.inner_html()
                    hand = portrait.locator(".avatar-panel__hand")
                    mouth = portrait.get_by_test_id("avatar-mouth")
                    expect(mouth).to_be_visible()
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
                    assert (
                        uploads
                        and uploads[0][0] == 16000
                        and uploads[0][1] >= 1600
                        and uploads[0][2]
                    ), uploads
                    assert not turns, "Transcription must never auto-submit a turn"
                    page.get_by_role("button", name="전송", exact=True).click()
                    expect(
                        page.get_by_text("연결 확인용 고정 응답입니다.", exact=False)
                    ).to_be_visible()
                    # Browser-rendered fallback avatar must consume the same
                    # synthetic TTS RMS and reply cues as the conversation.
                    # This does not verify any licensed Live2D SDK renderer.
                    expect(portrait).to_have_accessible_name(re.compile("기쁨.*인사"))
                    expect(page.get_by_test_id("avatar-character")).to_have_attribute(
                        "data-gesture", "greeting"
                    )
                    assert eyes.inner_html() != neutral_eyes, "Happy cue did not change the eyes"
                    expect(hand).not_to_have_css("animation-name", "none")
                    meter = page.locator("meter")
                    expect(meter).not_to_have_attribute("value", "0")
                    low_width = float(mouth.get_attribute("rx"))
                    low_height = float(mouth.get_attribute("ry"))
                    expect(page.get_by_role("button", name="전송", exact=True)).to_be_disabled()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(meter).to_have_attribute("value", "0")
                    # Measure the same happy expression after the audio ends.
                    closed_width = mouth.get_attribute("rx")
                    closed_height = mouth.get_attribute("ry")
                    assert low_height > float(closed_height), "Low tone did not open the mouth"
                    # The wave and audio have independent durations. Wait for the
                    # arm to relax here, before changing mode can remount the portrait.
                    expect(portrait.locator(".seorin__resting-sleeve")).to_be_visible()
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
                    # Select real service routes with synthetic inference only.
                    selector = page.get_by_label("LLM 서비스", exact=True)
                    selector.select_option("local")
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(
                        page.get_by_role("listitem").filter(has_text="비서 전용 기억")
                    ).to_have_count(0)
                    page.get_by_label("기억할 내용", exact=True).fill("로컬 전용 기억")
                    page.get_by_role("button", name="기억 저장", exact=True).click()
                    expect(
                        page.get_by_role("listitem").filter(has_text="로컬 전용 기억")
                    ).to_be_visible()
                    page.get_by_label("메시지", exact=True).fill("로컬 질문")
                    page.get_by_role("button", name="전송", exact=True).click()
                    expect(page.get_by_text("local 모의 응답입니다.", exact=True)).to_be_visible()
                    expect(meter).not_to_have_attribute("value", "0")
                    high_width = float(mouth.get_attribute("rx"))
                    high_height = float(mouth.get_attribute("ry"))
                    assert high_width > low_width, "Bright tone did not spread the mouth"
                    assert high_height > float(closed_height), "Bright tone did not open the mouth"
                    page.get_by_role("button", name="중지", exact=True).click()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(meter).to_have_attribute("value", "0")
                    expect(mouth).to_have_attribute("rx", closed_width)
                    expect(mouth).to_have_attribute("ry", closed_height)
                    check_avatar_cast(page, turns)
                    selector.select_option("cloud")
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(
                        page.get_by_role("listitem").filter(has_text="로컬 전용 기억")
                    ).to_have_count(0)
                    expect(page.get_by_text("local 모의 응답입니다.", exact=True)).to_have_count(0)
                    page.get_by_label("메시지", exact=True).fill("클라우드 질문")
                    page.get_by_role("button", name="전송", exact=True).click()
                    expect(page.get_by_text("cloud 모의 응답입니다.", exact=True)).to_be_visible()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(
                        page.get_by_text("클라우드 제공자에게 전송", exact=False)
                    ).to_be_visible()
                    selector.select_option("local")
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(
                        page.get_by_role("listitem").filter(has_text="로컬 전용 기억")
                    ).to_be_visible()
                    # Leave the screenshot in cloud mode to show both choices.
                    selector.select_option("cloud")
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    assert not errors, errors
                    if screenshot_path := os.getenv("SMOKE_SCREENSHOT_PATH"):
                        screenshot = Path(screenshot_path)
                        screenshot.parent.mkdir(parents=True, exist_ok=True)
                        page.screenshot(path=str(screenshot), full_page=True)
                    browser.close()
                    report = {
                        "react_browser": "passed",
                        "synthetic_stt_tts": True,
                        "real_model_inference": False,
                        "synthetic_local_cloud_switching": True,
                        "windows_microphone_hardware": False,
                        "live2d_rendering": False,
                        "avatar_mouth_radii": {
                            "rest": {"rx": float(closed_width), "ry": float(closed_height)},
                            "220_hz": {"rx": low_width, "ry": low_height},
                            "2600_hz": {"rx": high_width, "ry": high_height},
                        },
                        "checks": [
                            "pairing",
                            "invalid_token_reentry",
                            "same_tab_token_link",
                            "temporary_status_failure_retry",
                            "lost_session_response_reuses_committed_session",
                            "memory_scope",
                            "notes",
                            "worklet_capture",
                            "transcript_review",
                            "wav_playback_rms",
                            "builtin_avatar_audio_rms_and_reset",
                            "builtin_avatar_reply_cues",
                            "seorin_greeting_returns_to_rest",
                            "seorin_spectral_mouth_width_and_stop_reset",
                            "cast_selection_keeps_session_and_history",
                            "hana_tilt_isol_point_and_speech",
                            "cast_reduced_motion",
                            "mode_cancel",
                            "service_switch_cancel_and_isolation",
                        ],
                    }
                    if report_path := os.getenv("SMOKE_REPORT_PATH"):
                        output = Path(report_path)
                        output.parent.mkdir(parents=True, exist_ok=True)
                        output.write_text(
                            json.dumps(report, ensure_ascii=False, indent=2),
                            encoding="utf-8",
                        )
                    print(json.dumps(report, ensure_ascii=False))
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    serve() if "--serve" in sys.argv else main()
