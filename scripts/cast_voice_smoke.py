"""Verify the production web cast with the actual local Supertonic 2 worker."""

import argparse
import base64
import hashlib
import importlib.util
import io
import json
import os
import secrets
import socket
import sys
import tempfile
import time
import wave
from contextlib import contextmanager
from pathlib import Path
from threading import Thread

from react_smoke import ROOT, decoded_layers, mouth_box, observe_playback, send_with_voice

CAST = (("seorin", "builtin"), ("hana", "hana"), ("isol", "isol"))


@contextmanager
def loopback_server(create_app):
    import uvicorn

    # Give uvicorn the bound socket so parallel checks cannot claim the same port.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        config = uvicorn.Config(
            create_app(port), log_level="warning", access_log=False, timeout_graceful_shutdown=5
        )
        server = uvicorn.Server(config)
        thread = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        thread.start()
        try:
            deadline = time.monotonic() + 20
            while not server.started:
                if not thread.is_alive() or time.monotonic() >= deadline:
                    raise RuntimeError("The local test server did not start")
                time.sleep(0.05)
            yield f"http://127.0.0.1:{port}"
        finally:
            server.should_exit = True
            thread.join(timeout=10)
            if thread.is_alive() and sys.exc_info()[0] is None:
                raise RuntimeError("The local test server did not shut down")


def load_worker():
    spec = importlib.util.spec_from_file_location(
        "supertonic_smoke_worker", ROOT / "workers/tts-supertonic/server.py"
    )
    worker = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(worker)
    return worker


def check_cast(page, base, token, utterances):
    from playwright.sync_api import expect

    page.goto(f"{base}/#token={token}")
    page.get_by_role("button", name="연결", exact=True).click()
    ready = page.get_by_text("대화 준비됨", exact=True)
    expect(ready).to_be_visible()
    selector = page.get_by_label("아바타 종류")
    history = page.get_by_role("log", name="대화 내용").locator("article")
    meter = page.get_by_role("meter")
    session_url = None
    voices = {}
    with observe_playback(page) as playback:
        for voice, option in CAST:
            previous_history = history.all_text_contents()
            selector.select_option(option)
            portrait = page.locator(f'svg[data-character="{voice}"]')
            expect(portrait).to_be_visible()
            assert decoded_layers(portrait) > 0
            assert history.all_text_contents() == previous_history
            playback.evaluate("probe => { probe.played = null; }")
            before = len(utterances)
            with page.expect_response(
                lambda r: r.ok and "/audio/" in r.url, timeout=100_000
            ) as audio:
                url = send_with_voice(page, "오늘 일정부터 알려 줘.", voice)
                session_url = session_url or url
                assert url == session_url, "Changing the character opened a new session"

            body = audio.value.body()
            digest = hashlib.sha256(body).hexdigest()
            assert utterances[before:] == [(voice, digest)], "Unexpected worker voice or WAV"
            with wave.open(io.BytesIO(body), "rb") as wav:
                assert wav.getnchannels() == 1 and wav.getsampwidth() == 2
                sample_rate = wav.getframerate()
                duration = wav.getnframes() / sample_rate
                assert duration > 0 and any(wav.readframes(wav.getnframes()))

            expect(selector).to_be_disabled()
            expect(meter).not_to_have_attribute("value", "0")
            mouth_box(portrait, speaking=True)
            playback.evaluate(
                """async (probe, encoded) => {
                    const played = probe.played;
                    if (!played?.buffer || played.rate !== 1)
                        throw Error('The live WAV did not play at native speed');
                    if (!played.output)
                        throw Error('The audio source has no route to the browser output');
                    const input = Uint8Array.from(atob(encoded), byte => byte.charCodeAt(0));
                    const decoder = new OfflineAudioContext(1, 1, played.buffer.sampleRate);
                    const expected = await decoder.decodeAudioData(input.buffer);
                    const samples = played.buffer.getChannelData(0);
                    const wanted = expected.getChannelData(0);
                    if (samples.length !== wanted.length) throw Error('Unexpected playback length');
                    for (let i = 0; i < samples.length; i++)
                        if (Math.abs(samples[i] - wanted[i]) > 0.00001)
                            throw Error('Native playback did not use the worker WAV');
                }""",
                base64.b64encode(body).decode("ascii"),
            )

            expect(ready).to_be_visible(timeout=65_000)
            expect(selector).to_be_enabled()
            expect(meter).to_have_attribute("value", "0")
            mouth_box(portrait, speaking=False)
            elapsed = playback.evaluate("probe => probe.played.elapsed")
            assert elapsed is not None and elapsed >= duration - 0.10, (voice, elapsed, duration)
            expect(history).to_have_count(len(previous_history) + 2)
            assert history.all_text_contents()[: len(previous_history)] == previous_history
            expect(page.get_by_role("alert")).to_have_count(0)
            voices[voice] = {
                "wav_sha256": digest,
                "wav_sample_rate_hz": sample_rate,
                "wav_seconds": round(duration, 3),
                "native_playback_and_lip_sync": True,
            }
    assert len({voice["wav_sha256"] for voice in voices.values()}) == len(CAST)
    return voices


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model-dir", required=True, type=Path)
    parser.add_argument("--web-dir", type=Path, default=ROOT / "apps/web/dist")
    parser.add_argument("--mobile", action="store_true", help="Use Chromium's Pixel 7 profile")
    parser.add_argument("--report", type=Path, help="Write the result as JSON")
    args = parser.parse_args()
    web_dir = args.web_dir.resolve()
    if not (web_dir / "index.html").is_file():
        parser.error("Build apps/web first or use --web-dir to point to the production build")

    from playwright.sync_api import sync_playwright

    sys.path.insert(0, str(ROOT / "services"))
    from gateway.api import create_app
    from gateway.config import Settings

    worker = load_worker()
    synthesize = worker.load_synthesizer(args.model_dir.resolve())
    utterances = []

    def tracked_synthesis(text, voice):
        wav = synthesize(text, voice)
        utterances.append((voice, hashlib.sha256(wav).hexdigest()))
        return wav

    token, worker_token = (secrets.token_urlsafe(32) for _ in range(2))

    def make_worker(port):
        return worker.create_app(worker_token, tracked_synthesis, port=port)

    with tempfile.TemporaryDirectory() as data, loopback_server(make_worker) as worker_url:

        def make_gateway(port):
            return create_app(
                Settings(
                    port=port,
                    token=token,
                    data_dir=Path(data),
                    web_dir=web_dir,
                    tts="supertonic",
                    supertonic_token=worker_token,
                    supertonic_url=worker_url,
                )
            )

        with loopback_server(make_gateway) as base, sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=os.getenv("SMOKE_BROWSER_EXECUTABLE"),
            )
            try:
                profile = playwright.devices["Pixel 7"] if args.mobile else {}
                page = browser.new_page(**profile)
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                voices = check_cast(page, base, token, utterances)
                assert not errors, errors
            finally:
                browser.close()

    report = {
        "cast_voice_smoke": "passed",
        "browser_profile": "Pixel 7" if args.mobile else "desktop",
        "llm": "demo",
        "tts": "supertonic-2",
        "characters": voices,
    }
    result = json.dumps(report, ensure_ascii=False, indent=2)
    if args.report:
        args.report.write_text(result + "\n", encoding="utf-8")
    print(result)


if __name__ == "__main__":
    main()
