"""Production React browser check with synthetic STT/TTS, never external models.

Run after npm ci && npm run build in apps/web. Requires playwright + Chromium.
Set SMOKE_MOBILE=1 to run the same flow with a touch/mobile viewport.
The fixture server is private to this script and never used by gateway.cli.
"""

import base64
import io
import itertools
import json
import math
import os
import re
import secrets
import socket
import statistics
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
NEWS_QUESTION = "오늘의 뉴스를 읽어 줘"
NEWS_REPLY = "첫 소식입니다. 오후에는 비가 그치겠습니다."


def tone_wav(frequency=220, *, narration=False):
    # Two accented phrases and a real PCM pause exercise the complete player.
    segments = (
        [(0.32, 5500), (0.35, 1800), (0.45, 8500), (1.15, 0), (0.4, 3800), (0.65, 7200)]
        if narration
        else [(1.5, 9000)]
    )
    result = io.BytesIO()
    with wave.open(result, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(
            b"".join(
                struct.pack("<h", int(amplitude * math.sin(2 * math.pi * frequency * n / 16000)))
                for seconds, amplitude in segments
                for n in range(round(16000 * seconds))
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
            return tone_wav(self.frequency, narration=text == NEWS_REPLY)

    class FixtureLLM:
        def __init__(self, service):
            self.service = service

        async def reply(self, messages):
            if self.service == "cloud":
                assert "로컬 전용 기억" not in json.dumps(messages, ensure_ascii=False)
            question = messages[-1]["content"]
            emotion, gesture = {
                "어떤 점이 궁금해?": ("curious", "tilt"),
                "어디를 가리키는 거야?": ("thoughtful", "point"),
                "클라우드 질문": ("surprised", "idle"),
                NEWS_QUESTION: ("curious", "tilt"),
            }.get(question, ("happy", "greeting"))
            return Reply.model_validate(
                {
                    "segments": [
                        {
                            "text": NEWS_REPLY
                            if question == NEWS_QUESTION
                            else self.service + " 모의 응답입니다.",
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
    path = portrait.locator('path[data-testid="avatar-mouth"]')
    state = path.evaluate(
        """async (path, speaking) => {
        const rest = path.closest('svg').querySelector('image.painted-face__mouth-rest');
        const deadline = performance.now() + 5000;
        // A real syllable can end between two Playwright calls. Check and measure
        // the requested painted state on the same frame.
        while (Number(getComputedStyle(rest).opacity) !== (speaking ? 0 : 1)
               || (speaking && path.getBBox().height <= 0)) {
            if (performance.now() >= deadline) throw Error('Timed out waiting for painted lip state');
            await new Promise(requestAnimationFrame);
        }
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
    }""",
        speaking,
    )
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
    from portrait_proportions import check_breathing

    eye_art, curious_poses, breathing = set(), set(), {}
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
        breathing[value] = check_breathing(portrait.locator(".narration__torso"))
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
    return breathing


def check_surprised_mouth(page, avatars):
    """The painted lips narrow around their attachment throughout the transition."""
    from playwright.sync_api import expect

    avatars.select_option("isol")
    portrait = page.get_by_role("img", name=re.compile("차분함.*이솔"))
    mouth = portrait.locator(".painted-face__mouth-pose")
    trace = mouth.evaluate_handle("""mouth => {
        const samples = [];
        mouth.addEventListener('transitionrun', event => {
            if (event.target !== mouth || event.propertyName !== 'transform') return;
            const animation = mouth.getAnimations().find(a => a.transitionProperty === 'transform');
            const cavity = mouth.querySelector('[data-testid="avatar-mouth"]').parentElement;
            const local = mouth.getScreenCTM().inverse().multiply(cavity.getScreenCTM());
            const pivot = new DOMPoint().matrixTransform(local);
            const toStage = mouth.ownerSVGElement.getScreenCTM().inverse();
            const reference = pivot.matrixTransform(mouth.parentElement.getScreenCTM()).matrixTransform(toStage);
            const before = animation.currentTime;
            for (const fraction of [0, .25, .5, .75, .999]) {
                animation.currentTime = fraction * animation.effect.getTiming().duration;
                const rendered = pivot.matrixTransform(mouth.getScreenCTM()).matrixTransform(toStage);
                const pose = mouth.parentElement.getScreenCTM().inverse().multiply(mouth.getScreenCTM());
                samples.push([Math.hypot(rendered.x - reference.x, rendered.y - reference.y), pose.a]);
            }
            animation.currentTime = before;
        }, {once:true});
        return samples;
    }""")
    page.get_by_label("메시지", exact=True).fill("클라우드 질문")
    page.get_by_role("button", name="전송", exact=True).click()
    expect(page.get_by_role("img", name=re.compile("놀람.*이솔"))).to_be_visible()
    page.wait_for_function("samples => samples.length === 5", arg=trace)
    samples = trace.json_value()
    trace.dispose()
    assert samples[0][1] - samples[-1][1] > 0.1, ("Surprised lips never narrowed", samples)
    drift = max(distance for distance, _width in samples)
    assert drift <= 1, ("Mouth slipped off its attachment in stage units", drift)
    return round(drift, 4)


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


@contextmanager
def painted_motion(portrait):
    """Sample the artwork and live audio meter on the same browser paint frames."""
    trace = portrait.evaluate_handle("""svg => {
        const frames = [];
        let raf;
        const matrix = selector => {
            const node = svg.querySelector(selector);
            const value = node && getComputedStyle(node).transform;
            return new DOMMatrixReadOnly(value && value !== 'none' ? value : undefined);
        };
        const angle = selector => {
            const m = matrix(selector);
            return Math.atan2(m.b, m.a) * 180 / Math.PI;
        };
        const sample = time => {
            const gaze = matrix('.painted-face__gaze-iris');
            const outfit = svg.querySelector('.narration__raised-outfit');
            frames.push({
                time, meter: document.querySelector('meter').value,
                mouth: svg.querySelector('[data-testid="avatar-mouth"]').getBBox().height,
                gesture: svg.querySelector('[data-testid="avatar-character"]').dataset.gesture,
                gaze: gaze.e, gazeY: gaze.f,
                neck: angle('.avatar-panel__head'), torso: angle('.narration__torso'),
                hair: angle('.narration__fringe'), rear: angle('.narration__rear-hair'),
                shoulder: angle('.narration__arm'), elbow: angle('.narration__arm .narration__forearm'),
                wrist: angle('.avatar-panel__hand'),
                shirt: svg.querySelector('.hana__raised-sleeve')?.href.baseVal ?? null,
                hand: svg.querySelector('.avatar-panel__hand [data-pose] image')?.href.baseVal ?? null,
                lift: outfit ? Number(getComputedStyle(outfit).opacity) : 0,
            });
            raf = requestAnimationFrame(sample);
        };
        sample(performance.now());
        return {frames, stop: () => cancelAnimationFrame(raf)};
    }""")
    try:
        yield trace
    finally:
        trace.evaluate("trace => trace.stop()")
        trace.dispose()


def check_cold_portrait(page, selector):
    """A slow eye must not expose a head without its painted features."""
    from playwright.sync_api import expect

    resource = "**/assets/socket-left-*.webp"
    with hold_asset(page, resource) as held:
        with (
            page.expect_request(resource),
            page.expect_response("**/assets/socket-right-*.webp") as eye,
        ):
            selector.select_option("isol")
        assert eye.value.ok and eye.value.body().startswith(b"RIFF")
        assert held, "The eye asset was not intercepted"
        portrait = page.get_by_role("img", name=re.compile("이솔"))
        expect(portrait.get_by_text("캐릭터 그림을 불러오는 중")).to_be_visible()
        expect(portrait.get_by_test_id("avatar-character")).to_have_count(0)
        expect(
            portrait.locator("image.isol__portrait, image.painted-face__eye-open")
        ).to_have_count(0)
    expect(portrait.get_by_test_id("avatar-character")).to_be_visible()
    for artwork in (
        ".isol__campus",
        "image.isol__portrait",
        "image.isol__head",
        "image.isol__fringe",
    ):
        expect(portrait.locator(artwork)).to_be_visible()
    expect(portrait.locator("image.painted-face__eye-open")).to_have_count(2)
    decoded_layers(portrait)
    selector.select_option("builtin")


def check_delayed_wave(page, selector):
    """Keep a complete resting pose until the requested hand and shirt can move together."""
    from playwright.sync_api import expect

    resource = "**/assets/waving-*.webp"
    selector.select_option("hana")
    portrait = page.get_by_role("img", name=re.compile("하나"))
    rest = portrait.locator(".narration__rest-outfit")
    expect(rest).to_be_visible()
    decoded_layers(portrait)
    greeting = page.get_by_role("button", name="인사하기", exact=True)
    page.get_by_text("표정·동작 미리보기", exact=True).click()
    with painted_motion(portrait) as trace:
        with hold_asset(page, resource) as held:
            with page.expect_request(resource) as request:
                greeting.click()
            # Keep the asset unavailable across a complete gesture on the render timeline.
            page.wait_for_function("t => t.frames.at(-1).time - t.frames[0].time > 2300", arg=trace)
            assert held and trace.evaluate("t => t.frames.every(f => !f.hand && f.lift === 0)")
            expect(rest).to_have_css("opacity", "1")
            decoded_layers(portrait)
        for replay in range(2):
            if replay:
                trace.evaluate("t => { t.frames.length = 0 }")
                greeting.click()
            page.wait_for_function(
                "t => t.frames.some(f => f.lift > 0.5 && Math.abs(f.wrist) > 1) && !t.frames.at(-1).hand",
                arg=trace,
                timeout=8000,
            )
            active = trace.evaluate("t => t.frames.filter(f => f.lift > 0.5)")
            assert all(
                frame["shirt"] and request.value.url.endswith(frame["shirt"]) for frame in active
            )
            assert all(re.search(r"/wave-hand-[^/]+\.webp$", f["hand"] or "") for f in active)
            assert max(f["wrist"] for f in active) - min(f["wrist"] for f in active) > 2
            assert max(abs(f["shoulder"]) for f in active) > 0.5
            assert max(f["elbow"] for f in active) - min(f["elbow"] for f in active) > 1
            expect(rest).to_have_css("opacity", "1")
            assert trace.evaluate(
                "t => ['shoulder', 'elbow', 'wrist'].every(joint => Math.abs(t.frames.at(-1)[joint]) < 0.01)"
            )
    selector.select_option("builtin")


def send_with_voice(page, question, voice):
    page.get_by_label("메시지", exact=True).fill(question)
    with page.expect_request(lambda r: r.method == "POST" and r.url.endswith("/turns")) as turn:
        page.get_by_role("button", name="전송", exact=True).click()
    assert turn.value.post_data_json == {"text": question, "voice": voice}
    return turn.value.url


def check_landing_cast(browser, profile, base, token):
    """Exercise the sample chat, voice and motion before sending a paired turn."""
    from playwright.sync_api import expect
    from portrait_proportions import (
        stop_arm_trace,
        trace_arm_transitions,
        verify_isol_greeting_lift,
    )

    context = browser.new_context(**profile)
    try:
        page = context.new_page()
        api_requests = []
        page.on("request", lambda req: api_requests.append(req) if "/api/" in req.url else None)
        page.goto(base + "/")
        demo = page.locator("#demo")
        cast = demo.get_by_role("group", name="캐릭터 선택", exact=True)
        expect(cast.get_by_role("button")).to_have_count(3)
        thread = demo.get_by_role("log", name="샘플 대화")
        rows = thread.locator("article")
        meter = demo.get_by_role("meter", name="음성 레벨")
        stop = demo.get_by_role("button", name="재생 중지", exact=True)
        covers = set()
        for voice, name, role in (
            ("isol", "이솔", "대학생"),
            ("seorin", "서린", "직장인"),
            ("hana", "하나", "고등학생"),
        ):
            choice = cast.get_by_role("button", name=re.compile(f"{name}.*{role}"))
            cover = choice.locator('img[alt=""]')
            expect(cover).to_be_visible()
            choice.click()
            covers.add(
                cover.evaluate("async image => { await image.decode(); return image.currentSrc; }")
            )
            expect(choice).to_have_attribute("aria-pressed", "true")
            expect(cast.get_by_role("button", pressed=True)).to_have_count(1)
            expect(demo.get_by_role("heading", name="대화 미리보기")).to_be_focused()
            portrait = demo.locator(f'svg[data-character="{voice}"]')
            expect(portrait.get_by_test_id("avatar-features")).to_be_visible()
            expect(rows.last.get_by_text(name, exact=True)).to_be_visible()
            expect(meter).to_have_attribute("value", "0")
            expect(stop).to_have_count(0)
            if voice == "isol":
                trace = trace_arm_transitions(portrait)
                try:
                    with page.expect_response(re.compile(r"/isol-greeting-[\w-]+\.mp3$")) as sound:
                        demo.get_by_role("button", name="인사말 듣기", exact=True).click()
                    assert sound.value.ok
                    assert (
                        sound.value.body()
                        == (ROOT / "apps/web/src/audio/isol-greeting.mp3").read_bytes()
                    )
                    page.wait_for_function(
                        "trace => trace.samples.some(frame => frame.open >= 0.98)",
                        arg=trace,
                        timeout=8_000,
                    )
                finally:
                    frames, sleeve_problems = stop_arm_trace(trace)
                assert not sleeve_problems, sleeve_problems[:6]
                verify_isol_greeting_lift(frames)
                stop.click()
                expect(meter).to_have_attribute("value", "0")
        assert len(covers) == 3, "Each character card should have its own decoded portrait"
        expect(rows).to_have_count(2)
        first_exchange = rows.all_text_contents()
        with painted_motion(portrait) as trace:
            demo.get_by_role("button", name="인사하기", exact=True).click()
            page.wait_for_function(
                "t => t.frames.some(f => f.gesture === 'greeting' && f.hand && f.lift > 0.5)",
                arg=trace,
                timeout=8000,
            )
        expect(meter).to_have_attribute("value", "0")

        with observe_playback(page) as probe:
            with page.expect_response(re.compile(r"/hana-intro-[\w-]+\.mp3$")) as preview:
                demo.get_by_role("button", name="자기소개 듣기", exact=True).click()
            response = preview.value
            assert response.ok, response.status
            audio = response.body()
            assert audio == (ROOT / "apps/web/src/audio/hana-intro.mp3").read_bytes()
            expect(rows).to_have_count(2)
            assert rows.all_text_contents() != first_exchange
            expect(stop).to_be_visible()
            expect(meter).not_to_have_attribute("value", "0")
            mouth_box(portrait, speaking=True)
            duration = played_mp3_duration(probe, audio)
            expect(stop).to_have_count(0, timeout=12_000)
            expect(meter).to_have_attribute("value", "0")
            mouth_box(portrait, speaking=False)
            elapsed = probe.evaluate("p => p.played.elapsed")
            assert elapsed is not None and elapsed >= duration - 0.10, (elapsed, duration)

            page.get_by_label("연결 토큰").fill(token)
            probe.evaluate("p => { p.played = null; }")
            with page.expect_response(re.compile(r"/hana-greeting-[\w-]+\.mp3$")) as greeting:
                demo.get_by_role("button", name="인사말 듣기", exact=True).click()
            assert greeting.value.ok
            assert rows.all_text_contents() == first_exchange
            expect(meter).not_to_have_attribute("value", "0")
            assert not api_requests, "The landing page queried the Gateway before pairing"
            page.get_by_role("button", name="연결", exact=True).click()
            expect(page.get_by_text("대화 준비됨", exact=True)).to_be_visible()
            page.wait_for_function("p => p.played?.context.state === 'closed'", arg=probe)
        expect(thread).to_have_count(0)
        expect(page.get_by_role("log", name="대화 내용").locator("article")).to_have_count(0)
        expect(page.get_by_label("아바타 종류")).to_have_value("hana")
        expect(page.get_by_role("meter")).to_have_attribute("value", "0")
        send_with_voice(page, "첫 인사", "hana")
        expect(page.get_by_text("대화 준비됨", exact=True)).to_be_visible()
    finally:
        context.close()


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
            "image.isol__portrait",
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
        send_with_voice(page, question, character)
        expect(portrait).to_have_accessible_name(re.compile(cue_label))
        expect(portrait.get_by_test_id("avatar-character")).to_have_attribute(
            "data-gesture", gesture
        )
        page.wait_for_function(
            """joint => {
                const value = getComputedStyle(joint).transform;
                if (value === 'none') return false;
                const matrix = new DOMMatrixReadOnly(value);
                return Math.abs(matrix.b) > 0.003 || Math.abs(matrix.f) > 0.15;
            }""",
            arg=portrait.locator(joint).element_handle(),
        )
        if gesture == "point":
            expect(
                portrait.locator('.avatar-panel__hand [data-pose="point"] image')
            ).to_be_visible()
        expect(page.get_by_role("meter")).not_to_have_attribute("value", "0")
        mouth_box(portrait, speaking=True)
        portraits[character]["speaking_layers"] = decoded_layers(portrait)
        expect(page.get_by_text("대화 준비됨")).to_be_visible()
        mouth_box(portrait, speaking=False)
        assert turns[count:] == [turn_path], "Avatar selection created a different chat session"
        assert history.all_text_contents()[: len(previous_history)] == previous_history
        expect(history).to_have_count(len(previous_history) + 2)

    selector.select_option("builtin")
    expect(page.get_by_role("img", name=re.compile("서린"))).to_be_visible()


def check_news_reading(page, *, reduced):
    """Observe both phrases, the silent break, and each part of the painted portrait."""
    from playwright.sync_api import expect

    page.emulate_media(reduced_motion="reduce" if reduced else "no-preference")
    avatars = page.get_by_label("아바타 종류")
    avatars.select_option("hana")
    portrait = page.get_by_role("img", name=re.compile("하나"))
    for selector in (
        ".painted-face__gaze-iris",
        ".avatar-panel__head",
        ".narration__torso",
        ".narration__fringe",
        ".narration__rear-hair",
    ):
        expect(portrait.locator(selector).first).to_be_attached()
    page.get_by_label("메시지", exact=True).fill(NEWS_QUESTION)
    with painted_motion(portrait) as trace:
        page.get_by_role("button", name="전송", exact=True).click()
        expect(page.get_by_role("log").get_by_text(NEWS_REPLY, exact=True).last).to_be_visible()
        page.wait_for_function("t => t.frames.some(f => f.meter > 0.1 && f.mouth > 0)", arg=trace)
        expect(page.get_by_text("대화 준비됨")).to_be_visible(timeout=15000)
        mouth_box(portrait, speaking=False)
        frames = trace.evaluate("t => t.frames")
    voiced = [i for i, frame in enumerate(frames) if frame["meter"] > 0.05]
    spoken = frames[voiced[0] : voiced[-1] + 1]
    pauses = [
        list(rows)
        for silent, rows in itertools.groupby(spoken, key=lambda f: f["meter"] < 0.01)
        if silent
    ]
    assert pauses, "The live meter never fell silent between the two phrases"
    pause = max(pauses, key=lambda rows: rows[-1]["time"] - rows[0]["time"])
    pause_ms = pause[-1]["time"] - pause[0]["time"]
    assert pause_ms > 400 and min(f["mouth"] for f in pause[len(pause) // 2 :]) < 0.01, pause
    assert any(f["mouth"] > 1 for f in spoken if f["time"] < pause[0]["time"])
    assert any(f["mouth"] > 1 for f in spoken if f["time"] > pause[-1]["time"])

    channels = ("gaze", "gazeY", "neck", "torso", "hair", "rear")
    ranges = {key: max(f[key] for f in spoken) - min(f[key] for f in spoken) for key in channels}
    profile = {
        "pcm_pause_ms": round(pause_ms),
        "rendered_motion_range": {k: round(v, 3) for k, v in ranges.items()},
    }
    if reduced:
        assert max(ranges.values()) < 0.01, ("Reduced-motion reading moved the portrait", ranges)
    else:
        assert max(ranges["gaze"], ranges["gazeY"]) > 0.05, ranges
        assert all(ranges[key] > 0.05 for key in ("neck", "torso", "hair", "rear")), ranges
        # Independent secondary motion must lag or recoil while the head turns.
        assert any(f["rear"] * f["neck"] < -0.01 for f in spoken), ranges
        onset = next(i for i, f in enumerate(frames) if f["gesture"] == "tilt")
        baseline = frames[max(0, onset - 1)]
        reaction = [f for f in frames[onset:] if f["time"] < pause[0]["time"]]
        # Compare progress relative to the observed excursion of each joint.
        # Perfectly coupled copies reach all fractions on the same paint frame.
        halfway = {}
        for key in ("gaze", "neck", "torso", "rear"):
            excursion = max(abs(f[key] - baseline[key]) for f in reaction)
            crossing = next(f for f in reaction if abs(f[key] - baseline[key]) >= excursion * 0.5)
            halfway[key] = round(crossing["time"] - baseline["time"])
        frame_ms = statistics.median(b["time"] - a["time"] for a, b in itertools.pairwise(reaction))
        assert halfway["gaze"] <= halfway["neck"] + frame_ms, halfway
        assert halfway["neck"] <= halfway["torso"] + frame_ms, halfway
        assert halfway["gaze"] < halfway["torso"], ("Gaze and shoulders moved in lockstep", halfway)
        profile["first_phrase_half_excursion_ms"] = halfway
    avatars.select_option("builtin")
    page.emulate_media(reduced_motion="no-preference")
    return profile


@contextmanager
def observe_playback(page):
    # Observe the native node without replacing its playback or the player's clock.
    probe = page.evaluate_handle("""() => {
        const proto = AudioBufferSourceNode.prototype, start = proto.start;
        const audio = AudioNode.prototype, connect = audio.connect;
        const routes = new WeakMap();
        audio.connect = function(destination, ...args) {
            const result = connect.call(this, destination, ...args);
            if (destination instanceof AudioNode)
                routes.set(this, [...(routes.get(this) ?? []), destination]);
            return result;
        };
        const reachesOutput = (node, output, visited = new Set()) => {
            if (node === output) return true;
            if (visited.has(node)) return false;
            visited.add(node);
            return (routes.get(node) ?? []).some(next => reachesOutput(next, output, visited));
        };
        const probe = {restore: () => { proto.start = start; audio.connect = connect; }};
        proto.start = function(...args) {
            const result = start.apply(this, args);
            const started = this.context.currentTime;
            const played = {
                buffer: this.buffer, rate: this.playbackRate.value,
                context: this.context,
                output: reachesOutput(this, this.context.destination),
            };
            this.addEventListener('ended', () => { played.elapsed = this.context.currentTime - started; },
                                  {once: true});
            probe.played = played;
            return result;
        };
        return probe;
    }""")
    try:
        yield probe
    finally:
        probe.evaluate("p => p.restore()")
        probe.dispose()


def played_mp3_duration(probe, body):
    """Verify the live browser node decoded and routed the supplied MP3."""
    return probe.evaluate(
        """async (p, encoded) => {
            if (!p.played?.buffer || p.played.rate !== 1 || !p.played.output)
                throw Error('Unexpected preview playback');
            const played = p.played.buffer;
            const decoder = new OfflineAudioContext(1, 1, played.sampleRate);
            const bytes = Uint8Array.from(atob(encoded), byte => byte.charCodeAt(0));
            const expected = await decoder.decodeAudioData(bytes.buffer);
            if (played.length !== expected.length || played.numberOfChannels !== expected.numberOfChannels)
                throw Error('Wrong preview format');
            for (let channel = 0; channel < played.numberOfChannels; channel++) {
                const samples = played.getChannelData(channel), wanted = expected.getChannelData(channel);
                for (let i = 0; i < samples.length; i++)
                    if (Math.abs(samples[i] - wanted[i]) > 0.00001) throw Error('Wrong preview audio');
            }
            return played.duration;
        }""",
        base64.b64encode(body).decode("ascii"),
    )


def check_cast_previews(page, avatars):
    """Play both shipped recordings through each character's normal preview buttons."""
    from playwright.sync_api import expect

    preview = page.locator("details.avatar-panel__preview")
    if preview.get_attribute("open") is None:
        preview.locator("summary").click()
    durations = {}
    with observe_playback(page) as probe:
        for character, option in [("hana", "hana"), ("isol", "isol"), ("seorin", "builtin")]:
            avatars.select_option(option)
            portrait = page.locator(f'svg[data-character="{character}"]')
            expect(portrait.get_by_test_id("avatar-features")).to_be_visible()
            for kind, label in [("greeting", "인사말 듣기"), ("intro", "내레이션 미리듣기")]:
                key = f"{character}-{kind}"
                probe.evaluate("p => { p.played = null; }")
                with page.expect_response(re.compile(r"\.mp3$")) as fetched:
                    preview.get_by_role("button", name=label, exact=True).click()
                response = fetched.value
                assert response.ok and re.search(rf"/{key}-[\w-]+\.mp3$", response.url), (
                    response.url
                )
                stop = preview.get_by_role("button", name="미리듣기 중지", exact=True)
                expect(stop).to_be_visible()
                mouth_box(portrait, speaking=True)
                duration = played_mp3_duration(probe, response.body())
                # Guard against empty or truncated samples while allowing different delivery.
                assert 6.0 < duration < 9.0, (key, duration)
                durations[key] = round(duration, 3)
                if kind == "intro":
                    stop.click()
                expect(stop).to_have_count(0, timeout=12_000)
                if kind == "greeting":
                    elapsed = probe.evaluate("p => p.played.elapsed")
                    assert elapsed is not None and elapsed >= duration - 0.10, (key, elapsed)
                expect(page.get_by_role("meter")).to_have_attribute("value", "0")
                mouth_box(portrait, speaking=False)
    preview.locator("summary").click()
    return durations


def check_preview_and_microphone(page, portrait):
    """A real recording interrupts the offline narration, and playback can resume afterward."""
    from playwright.sync_api import expect

    preview = page.locator("details.avatar-panel__preview")
    if preview.get_attribute("open") is None:
        preview.locator("summary").click()
    audio = page.context.new_cdp_session(page)
    sources, closed, disconnected = [], set(), set()

    def source_created(event):
        node = event["node"]
        if node["nodeType"] == "AudioBufferSource":
            sources.append((node["nodeId"], node["contextId"]))

    def context_changed(event):
        context = event["context"]
        if context["contextState"] == "closed":
            closed.add(context["contextId"])

    audio.on("WebAudio.audioNodeCreated", source_created)
    audio.on("WebAudio.contextChanged", context_changed)
    audio.on("WebAudio.nodesDisconnected", lambda event: disconnected.add(event["sourceId"]))
    audio.send("WebAudio.enable")
    play = preview.get_by_role("button", name="내레이션 미리듣기", exact=True)
    play.click()
    stop = preview.get_by_role("button", name="미리듣기 중지", exact=True)
    expect(stop).to_be_visible()
    expect(page.get_by_role("meter")).not_to_have_attribute("value", "0")
    mouth_box(portrait, speaking=True)
    assert sources, "The sample did not start a native audio source"
    source, context = sources[-1]
    page.get_by_role("button", name="마이크로 입력").click()
    finish = page.get_by_role("button", name="녹음 완료")
    expect(finish).to_be_enabled()
    expect(play).to_be_disabled()
    expect(stop).to_have_count(0)
    expect(page.get_by_role("meter")).to_have_attribute("value", "0")
    mouth_box(portrait, speaking=False)
    assert source in disconnected or context in closed, "The sample is still routed to the speaker"
    audio.detach()
    # Capture enough of the virtual microphone for the Worklet/WAV assertion.
    page.wait_for_timeout(400)
    finish.click()
    expect(play).to_be_enabled()
    play.click()
    expect(stop).to_be_visible()
    expect(page.get_by_role("meter")).not_to_have_attribute("value", "0")
    mouth_box(portrait, speaking=True)
    stop.click()
    expect(play).to_be_visible()
    expect(page.get_by_role("meter")).to_have_attribute("value", "0")
    mouth_box(portrait, speaking=False)
    preview.locator("summary").click()


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
                    check_landing_cast(browser, profile, base, token)
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
                    expect(portrait.get_by_test_id("avatar-character")).to_be_visible()
                    expect(portrait).to_have_accessible_name(re.compile("기본 아바타"))
                    avatars = page.get_by_label("아바타 종류")
                    for option, role in [
                        ("builtin", "30대 직장인"),
                        ("hana", "17세 고등학생"),
                        ("isol", "20대 대학생 새내기"),
                    ]:
                        expect(avatars.locator(f'option[value="{option}"]')).to_contain_text(role)
                    check_cold_portrait(page, avatars)
                    check_delayed_wave(page, avatars)
                    breathing = check_expression_profiles(page, avatars)
                    portraits = {
                        "seorin": check_portrait(
                            page, portrait, "seorin", '[data-art="seorin-office-tailoring"]'
                        )
                    }
                    eye_pose = portrait.locator(".painted-face__eye-pose").first
                    neutral_eyes = eye_pose.evaluate("eye => getComputedStyle(eye).transform")
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
                    preview_durations = check_cast_previews(page, avatars)
                    check_preview_and_microphone(page, portrait)
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
                    expect(hand.locator('[data-pose="greeting"] image')).to_be_visible()
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
                    expect(portrait.locator(".narration__rest-outfit")).to_have_css("opacity", "1")
                    expect(hand.locator("[data-pose]")).to_have_count(0)
                    avatars.select_option("hana")
                    page.get_by_role("button", name="가상 소개팅", exact=True).click()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(avatars).to_have_value("builtin")
                    expect(avatars.locator('option[value="hana"]')).to_have_count(0)
                    expect(portrait).to_be_visible()
                    send_with_voice(page, "소개팅 인사", "seorin")
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
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
                    news = {
                        motion: check_news_reading(page, reduced=motion == "reduced")
                        for motion in ("normal", "reduced")
                    }
                    selector.select_option("cloud")
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    expect(
                        page.get_by_role("listitem").filter(has_text="로컬 전용 기억")
                    ).to_have_count(0)
                    expect(page.get_by_text("local 모의 응답입니다.", exact=True)).to_have_count(0)
                    mouth_drift = check_surprised_mouth(page, avatars)
                    expect(page.get_by_text("cloud 모의 응답입니다.", exact=True)).to_be_visible()
                    expect(page.get_by_text("대화 준비됨")).to_be_visible()
                    avatars.select_option("builtin")
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
                    from portrait_proportions import check_proportions

                    proof_context = browser.new_context(**profile)
                    proportions = check_proportions(proof_context.new_page(), base, token)
                    proof_context.close()
                    browser.close()
                    report = {
                        "react_browser": "passed",
                        "browser_profile": "Pixel 7" if mobile else "desktop",
                        "portraits": portraits,
                        "portrait_proportions": proportions,
                        "max_breathing_scale_error": breathing,
                        "synthetic_stt_tts": True,
                        "real_model_inference": False,
                        "synthetic_local_cloud_switching": True,
                        "windows_microphone_hardware": False,
                        "live2d_rendering": False,
                        "painted_mouth": {
                            "expression_anchor_drift_stage_units": mouth_drift,
                            "rest": closed_mouth,
                            "220_hz": low_mouth,
                            "2600_hz": high_mouth,
                        },
                        "narration": news,
                        "cast_preview_seconds": preview_durations,
                        "checks": [
                            "pairing",
                            "landing_cast_preview_and_first_turn_selection",
                            "landing_scripted_chat_bundled_audio_and_manual_motion",
                            "isol_greeting_audio_drives_continuous_rise",
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
                            "bundled_korean_preview_plays_and_stops",
                            "six_bundled_korean_previews_decode_play_and_settle",
                            "microphone_interrupts_preview_until_recording_finishes",
                            "character_specific_painted_eyes_and_acting",
                            "cast_breathing_preserves_anatomical_scale",
                            "original_plate_face_and_clothing_registration",
                            "painted_neck_shoulder_wrist_and_elbow_at_mid_and_full_reach",
                            "cast_arm_bend_and_wrist_through_interrupted_motion",
                            "surprised_mouth_keeps_its_anchor_during_transition",
                            "assistant_avatar_restored_after_adult_mode",
                            "turn_posts_selected_hana_isol_and_companion_seorin_voices",
                            "hana_tilt_isol_point_and_speech",
                            "narrated_phrases_follow_audio_and_settle_in_pause",
                            "narrated_gaze_head_torso_and_secondary_hair",
                            "cast_reduced_motion_during_real_audio",
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
