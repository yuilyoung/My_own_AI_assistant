"""Exercise the production Gateway and built React assets in a real Windows process.

This is a synthetic demo test; it does not test actual LLM/STT/TTS or Live2D hardware.
Run from the repository root after building apps/web/dist.
"""

import json
import os
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def request(base, path, token=None, payload=None):
    headers = {"Authorization": "Bearer " + token} if token else {}
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=headers)
    with OPENER.open(req, timeout=3) as response:
        return response.status, response.headers, response.read()


def check(base, token):
    status, headers, body = request(base, "/")
    assert status == 200 and "text/html" in headers["Content-Type"]
    html = body.decode("utf-8")
    asset = re.search(r'<script[^>]+src="([^"]+)"', html)
    assert asset and asset.group(1).startswith("/assets/"), "React build not served"
    _, headers, _ = request(base, asset.group(1))
    assert "javascript" in headers["Content-Type"], "Bundle has wrong MIME type"
    worklets = list((ROOT / "apps/web/dist/assets").glob("*.mjs"))
    assert worklets, "AudioWorklet build output missing"
    for worklet in worklets:
        _, headers, _ = request(base, "/assets/" + worklet.name)
        assert "javascript" in headers["Content-Type"], "AudioWorklet MIME regression"
    try:
        request(base, "/api/status")
    except urllib.error.HTTPError as exc:
        assert exc.code == 401, "Unauthenticated API was not rejected"
    else:
        raise AssertionError("Unauthenticated API was accepted")
    code, _, body = request(base, "/api/status", token)
    assert code == 200 and json.loads(body)["llm"] == "demo"

    def api(path, payload=None):
        code, _, response = request(base, "/api" + path, token, payload)
        return code, json.loads(response)

    _, assistant = api("/sessions", {"mode": "assistant"})
    sid = assistant["id"]
    api(f"/sessions/{sid}/memories", {"text": "Windows-only smoke memory"})
    _, companion = api("/sessions", {"mode": "companion"})
    _, memories = api(f"/sessions/{companion['id']}/memories")
    assert memories == [], "Assistant memory leaked to companion"
    _, turn = api(f"/sessions/{sid}/turns", {"text": "hello"})
    for _ in range(100):
        _, result = api(f"/sessions/{sid}/turns/{turn['id']}")
        if result["status"] in ("completed", "cancelled", "error"):
            break
        time.sleep(0.1)
    else:
        raise AssertionError("Demo turn timed out")
    assert result["status"] == "completed", result
    assert any("고정 응답" in segment["text"] for segment in result["segments"])
    print("Windows production smoke passed (demo, memory scope, HTTP, JS/worklet MIME).")


def main():
    if not (ROOT / "apps/web/dist/index.html").is_file():
        raise RuntimeError("Build apps/web first: npm ci && npm run build")
    token = secrets.token_urlsafe(32)
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory() as directory:
        log_path = Path(directory) / "gateway.log"
        env = os.environ.copy()
        env.update(
            PYTHONPATH=str(ROOT / "services"),
            ASSISTANT_DATA_DIR=directory,
            ASSISTANT_WEB_DIR=str(ROOT / "apps/web/dist"),
            ASSISTANT_TOKEN=token,
            ASSISTANT_PORT=str(port),
            LLM_PROVIDER="demo",
            TTS_PROVIDER="none",
            STT_PROVIDER="none",
        )
        with log_path.open("w", encoding="utf-8") as log:
            process = subprocess.Popen(
                [sys.executable, "-m", "gateway.cli"],
                cwd=ROOT,
                env=env,
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                for _ in range(150):
                    if process.poll() is not None:
                        raise RuntimeError("Gateway exited during startup")
                    try:
                        request(base, "/")
                        break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.1)
                else:
                    raise TimeoutError("Gateway startup timed out")
                check(base, token)
            except BaseException:
                log.flush()
                print(log_path.read_text(encoding="utf-8").replace(token, "[REDACTED]"))
                raise
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)


if __name__ == "__main__":
    main()
