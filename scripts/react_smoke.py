"""Production React browser check with synthetic STT/TTS, never external models.

Run after npm ci && npm run build in apps/web. Requires playwright + Chromium.
Set SMOKE_MOBILE=1 to run the same flow with a touch/mobile viewport.
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
from contextlib import contextmanager
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


def decoded_layers(portrait):
    layer_sizes = portrait.locator("image").evaluate_all("""async layers =>
        Promise.all(layers.map(async layer => {
            const image = new Image();
            image.src = layer.href.baseVal;
            await image.decode();
            return [image.naturalWidth, image.naturalHeight];
        }))""")
    assert layer_sizes and all(w > 0 and h > 0 for w, h in layer_sizes), "Missing portrait layer"
    return len(layer_sizes)


def check_portrait(page, portrait, character, artwork):
    """Check the role artwork, decoded raster layers and horizontal viewport fit."""
    from playwright.sync_api import expect

    expect(portrait).to_have_attribute("data-character", character)
    expect(portrait.locator(artwork)).to_be_visible()
    bounds = portrait.bounding_box()
    assert bounds and bounds["width"] > 0 and bounds["height"] > 0
    assert 0 <= bounds["x"] <= page.viewport_size["width"] - bounds["width"] + 1, bounds
    return {"layers": decoded_layers(portrait), "width_px": round(bounds["width"])}


def mouth_box(portrait, *, speaking):
    """Measure the cavity and the deformations of the painted upper/lower lips."""
    from playwright.sync_api import expect

    rest = portrait.locator("image.painted-face__mouth-rest")
    expect(rest).to_have_css("opacity", "0" if speaking else "1")
    path = portrait.locator('path[data-testid="avatar-mouth"]')
    if speaking:
        expect(path).to_be_visible()
    state = path.evaluate("""path => {
        const {width, height} = path.getBBox();
        let opacity = 1;
        for (let node = path; node; node = node.parentElement)
            opacity *= Number(getComputedStyle(node).opacity);
        const style = getComputedStyle(path);
        const halves = [...path.parentElement.querySelectorAll('.painted-face__lip')];
        const transforms = halves.map(half =>
            [...half.querySelectorAll('g[transform] > use')].map(piece => {
                const source = document.getElementById(piece.href.baseVal.slice(1));
                if (!source?.querySelector('image')) throw Error('Missing lip artwork');
                return new DOMMatrixReadOnly(getComputedStyle(piece.parentElement).transform);
            })
        );
        if (transforms.length !== 2 || transforms.some(half => !half.length))
            throw Error('Missing painted lip pieces');
        const [upper, lower] = transforms;
        return {
            width, height, painted: opacity > 0 && style.fill !== 'none',
            lip_spread: upper[0].a,
            upper_lift: Math.min(...upper.map(m => m.f)),
            lower_drop: Math.max(...lower.map(m => m.f)),
        };
    }""")
    if speaking:
        assert state["painted"] and state["height"] > 0, state
        assert state["upper_lift"] < 0 < state["lower_drop"], state
    else:
        assert state["height"] < 0.001, state
        assert state["upper_lift"] == state["lower_drop"] == 0, state
    return {
        "width_svg_units": state["width"],
        "height_svg_units": state["height"],
        "lip_width_scale": state["lip_spread"],
        "upper_lift_svg_units": state["upper_lift"],
        "lower_drop_svg_units": state["lower_drop"],
    }


def check_expression_profiles(page, selector):
    """The same preview should pose each character's own painted eyes differently."""
    from playwright.sync_api import expect

    eye_art, curious_poses = set(), set()
    preview = page.locator("details.avatar-panel__preview")
    summary = preview.locator("summary")
    if preview.get_attribute("open") is not None:
        summary.click()
    for value, name in [("builtin", "서린"), ("hana", "하나"), ("isol", "이솔")]:
        selector.select_option(value)
        portrait = page.get_by_role("img", name=re.compile(name))
        eyes = portrait.locator("image.painted-face__eye-open")
        brows = portrait.locator("image.painted-face__brow")
        expect(eyes).to_have_count(2)
        expect(brows).to_have_count(2)
        expect(eyes.first).to_be_visible()
        expect(brows.first).to_be_visible()
        decoded_layers(portrait)
        eye_art.add(tuple(eyes.evaluate_all("images => images.map(i => i.href.baseVal)")))
        pose = portrait.locator(".painted-face__eye-pose").first
        neutral = pose.evaluate("eye => getComputedStyle(eye).transform")
        summary.click()
        page.get_by_role("button", name="갸웃하기", exact=True).click()
        expect(portrait).to_have_accessible_name(re.compile("호기심"))
        expect(pose).not_to_have_css("transform", neutral)
        curious_poses.add(
            pose.evaluate("""async eye => {
                // Measure the final pose, after the 170 ms eyelid transition.
                await Promise.all(eye.getAnimations().map(animation => animation.finished));
                return new DOMMatrixReadOnly(getComputedStyle(eye).transform).d;
            }""")
        )
        summary.click()
        expect(pose).to_have_css("transform", neutral)
    assert len(eye_art) == 3 and len(curious_poses) == 3, (eye_art, curious_poses)
    selector.select_option("builtin")


@contextmanager
def hold_asset(page, resource):
    held = []
    released = False

    def hold(route):
        if released:
            route.continue_()
        else:
            held.append(route)

    page.route(resource, hold)
    try:
        yield held
    finally:
        released = True
        for route in held:
            route.continue_()
        page.unroute(resource, hold)


def check_cold_portrait(page, selector):
    """A slow eye must not expose a head without its painted features."""
    from playwright.sync_api import expect

    resource = "**/assets/eye-left-*.webp"
    with hold_asset(page, resource) as held:
        with (
            page.expect_request(resource),
            page.expect_response("**/assets/eye-right-*.webp") as eye,
        ):
            selector.select_option("isol")
        assert eye.value.ok and eye.value.body().startswith(b"RIFF")
        assert held, "The eye asset was not intercepted"
        portrait = page.get_by_role("img", name=re.compile("이솔"))
        expect(portrait.get_by_text("캐릭터 그림을 불러오는 중")).to_be_visible()
        expect(portrait.get_by_test_id("avatar-character")).to_have_count(0)
        expect(portrait.locator(".isol__braid, image.painted-face__eye-open")).to_have_count(0)
    expect(portrait.get_by_test_id("avatar-character")).to_be_visible()
    expect(portrait.locator("image.painted-face__eye-open")).to_have_count(2)
    decoded_layers(portrait)
    selector.select_option("builtin")


def check_delayed_wave(page, selector):
    """Hold Hana's raised uniform longer than a wave before releasing its bytes."""
    from playwright.sync_api import expect

    resource = "**/assets/waving-*.webp"
    with hold_asset(page, resource) as held:
        with page.expect_request(resource) as request:
            selector.select_option("hana")
            portrait = page.get_by_role("img", name=re.compile("하나"))
            rest = portrait.locator(".seorin__resting-sleeve")
            expect(rest).to_be_visible()
            decoded_layers(portrait)
            wrist = portrait.locator(".avatar-panel__hand")
            # Record the composition at animationstart, even on a slow runner.
            waves = wrist.evaluate_handle("""wrist => {
                const starts = [];
                wrist.addEventListener('animationstart', event => {
                    if (event.target !== wrist || event.animationName !== 'seorin-wave') return;
                    const svg = wrist.closest('svg');
                    starts.push({
                        shirt: svg.querySelector('.hana__raised-sleeve')?.href.baseVal,
                        hand: wrist.querySelector('[data-pose="greeting"] image')?.href.baseVal,
                        running: wrist.getAnimations().some(a => a.playState === 'running'),
                    });
                });
                return starts;
            }""")
            page.get_by_text("표정·동작 미리보기", exact=True).click()
            page.get_by_role("button", name="인사하기", exact=True).click()
        # Deliberate fault duration, beyond the normal 620 ms × 3 animation.
        page.wait_for_timeout(2100)
        assert held, "The wave asset was not intercepted"
        expect(rest).to_be_visible()
        decoded_layers(portrait)
        expect(wrist.locator("image")).to_have_count(0)
        assert waves.json_value() == [], "Wave started before its uniform was ready"
    page.wait_for_function("starts => starts.length > 0", arg=waves, timeout=5000)
    frame = waves.json_value()[0]
    assert frame.get("shirt") and request.value.url.endswith(frame["shirt"]), frame
    assert re.search(r"/wave-hand-[^/]+\.webp$", frame.get("hand", "")) and frame["running"], frame
    expect(rest).to_be_visible()
    expect(wrist.locator("image")).to_have_count(0)
    page.get_by_role("button", name="인사하기", exact=True).click()
    page.wait_for_function("starts => starts.length === 2", arg=waves, timeout=5000)
    assert waves.json_value()[1] == frame, "Repeated greeting did not replay the matched pose"
    expect(rest).to_be_visible()
    expect(wrist.locator("image")).to_have_count(0)
    selector.select_option("builtin")


def check_avatar_cast(page, turns, portraits):
    """Change portraits and send real turns within the current local session."""
    from playwright.sync_api import expect

    selector = page.get_by_label("아바타 종류")
    history = page.get_by_role("log", name="대화 내용").locator("article")
    turn_path = turns[-1]
    cases = [
        (
            "hana",
            "하나",
            ".hana__portrait",
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
        portraits[character] = check_portrait(page, portrait, character, artwork)
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
        mouth_box(portrait, speaking=True)
        portraits[character]["speaking_layers"] = decoded_layers(portrait)
        expect(page.get_by_text("대화 준비됨")).to_be_visible()
        mouth_box(portrait, speaking=False)
        assert turns[count:] == [turn_path], "Avatar selection created a different chat session"
        assert history.all_text_contents()[: len(previous_history)] == previous_history
        expect(history).to_have_count(len(previous_history) + 2)

    page.emulate_media(reduced_motion="reduce")
    expect(portrait.locator(".painted-face__blink").first).to_have_css("animation-name", "none")
    expect(portrait.locator(".anime__listening-head")).to_have_css("animation-name", "none")
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
                    mobile = os.getenv("SMOKE_MOBILE") == "1"
                    profile = playwright.devices["Pixel 7"] if mobile else {}
                    context = browser.new_context(permissions=["microphone"], **profile)
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
                    avatars = page.get_by_label("아바타 종류")
                    for option, role in [
                        ("builtin", "28세 직장인"),
                        ("hana", "17세 고등학생"),
                        ("isol", "22세 대학생"),
                    ]:
                        expect(avatars.locator(f'option[value="{option}"]')).to_contain_text(role)
                    check_cold_portrait(page, avatars)
                    check_delayed_wave(page, avatars)
                    check_expression_profiles(page, avatars)
                    portraits = {
                        "seorin": check_portrait(
                            page, portrait, "seorin", '[data-art="seorin-office-tailoring"]'
                        )
                    }
                    eye_pose = portrait.locator(".painted-face__eye-pose").first
                    neutral_eyes = eye_pose.evaluate("eye => getComputedStyle(eye).transform")
                    expect(portrait.locator(".painted-face__blink").first).not_to_have_css(
                        "animation-name", "none"
                    )
                    hand = portrait.locator(".avatar-panel__hand")
                    mouth_box(portrait, speaking=False)
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
                    expect(eye_pose).not_to_have_css("transform", neutral_eyes)
                    expect(hand).not_to_have_css("animation-name", "none")
                    meter = page.locator("meter")
                    expect(meter).not_to_have_attribute("value", "0")
                    low_mouth = mouth_box(portrait, speaking=True)
                    portraits["seorin"]["speaking_layers"] = decoded_layers(portrait)
                    expect(page.get_by_role("button", name="전송", exact=True)).to_be_disabled()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(meter).to_have_attribute("value", "0")
                    # Measure the same happy expression after the audio ends.
                    closed_mouth = mouth_box(portrait, speaking=False)
                    # The wave and audio have independent durations. Wait for the
                    # arm to relax here, before changing mode can remount the portrait.
                    expect(portrait.locator(".seorin__resting-sleeve")).to_be_visible()
                    avatars.select_option("hana")
                    page.get_by_role("button", name="가상 소개팅", exact=True).click()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(avatars).to_have_value("builtin")
                    expect(avatars.locator('option[value="hana"]')).to_have_count(0)
                    expect(portrait).to_be_visible()
                    expect(
                        page.get_by_role("listitem").filter(has_text="비서 전용 기억")
                    ).to_have_count(0)
                    expect(page.get_by_label("비서 메모", exact=True)).to_have_count(0)
                    page.get_by_role("button", name="마이크로 입력").click()
                    expect(page.get_by_role("button", name="녹음 완료")).to_be_enabled()
                    page.get_by_role("button", name="개인 비서", exact=True).click()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(avatars).to_have_value("hana")
                    expect(page.get_by_role("img", name=re.compile("하나"))).to_be_visible()
                    avatars.select_option("builtin")
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
                    high_mouth = mouth_box(portrait, speaking=True)
                    assert high_mouth["width_svg_units"] > low_mouth["width_svg_units"], (
                        "Bright tone did not widen the mouth opening"
                    )
                    assert high_mouth["lip_width_scale"] > low_mouth["lip_width_scale"], (
                        "Bright tone did not spread the painted lips"
                    )
                    page.get_by_role("button", name="중지", exact=True).click()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(meter).to_have_attribute("value", "0")
                    assert mouth_box(portrait, speaking=False) == closed_mouth
                    check_avatar_cast(page, turns, portraits)
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
                        "browser_profile": "Pixel 7" if mobile else "desktop",
                        "portraits": portraits,
                        "synthetic_stt_tts": True,
                        "real_model_inference": False,
                        "synthetic_local_cloud_switching": True,
                        "windows_microphone_hardware": False,
                        "live2d_rendering": False,
                        "painted_mouth": {
                            "rest": closed_mouth,
                            "220_hz": low_mouth,
                            "2600_hz": high_mouth,
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
                            "cast_role_artwork_and_viewport",
                            "cold_eye_holds_complete_character_until_decode",
                            "cold_wave_starts_after_matched_layers_decode",
                            "repeated_greeting_replays_and_relaxes",
                            "character_specific_painted_eyes_and_acting",
                            "assistant_avatar_restored_after_adult_mode",
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
