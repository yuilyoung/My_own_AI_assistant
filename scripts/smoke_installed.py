"""Exercise a wheel-installed demo server outside the checkout, without exposing tokens."""

import argparse
import http.client
import json
import os
import secrets
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path


def smoke(python: str) -> dict:
    checks = []
    with tempfile.TemporaryDirectory(prefix="assistant-install-smoke-") as temp:
        cwd = Path(temp)
        probe = subprocess.run(
            [python, "-I", "-c", "import gateway,gateway_ui; print(gateway.__file__); print(gateway_ui.__file__)"],
            cwd=cwd, capture_output=True, text=True, timeout=15, check=True,
        )
        if not all("site-packages" in line or "dist-packages" in line for line in probe.stdout.splitlines()):
            raise RuntimeError("Smoke test must use an installed wheel, not source imports")
        checks.append("installed imports outside checkout")
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        token = secrets.token_urlsafe(32)
        env = os.environ.copy()
        env.pop("PYTHONPATH", None)
        env.pop("PYTHONHOME", None)
        env.update({
            "ASSISTANT_TOKEN": token, "ASSISTANT_PORT": str(port),
            "ASSISTANT_DATA_DIR": str(cwd / "data"), "LLM_PROVIDER": "demo",
            "TTS_PROVIDER": "none", "STT_PROVIDER": "none",
            "OLLAMA_URL": "http://127.0.0.1:11434", "MELO_URL": "http://127.0.0.1:8766",
            "OLLAMA_MODEL": "qwen3:4b", "MELO_TOKEN": "",
        })

        def request(path: str, method: str = "GET", body=None, expected: int = 200, auth: bool = True):
            connection = http.client.HTTPConnection("127.0.0.1", port, timeout=3)
            headers = {"Authorization": f"Bearer {token}"} if auth else {}
            encoded = None
            if body is not None:
                headers["Content-Type"] = "application/json"
                encoded = json.dumps(body).encode()
            try:
                connection.request(method, path, body=encoded, headers=headers)
                response = connection.getresponse()
                data = response.read()
                if response.status != expected:
                    raise RuntimeError(f"{method} {path}: expected {expected}, got {response.status}")
                return data
            finally:
                connection.close()

        # CLI prints a pairing token: suppress output rather than uploading it to CI logs.
        process = subprocess.Popen(
            [python, "-I", "-m", "gateway.cli"], cwd=cwd, env=env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        try:
            deadline = time.monotonic() + 30
            while True:
                if process.poll() is not None:
                    raise RuntimeError(f"Installed server exited with code {process.returncode}")
                try:
                    status = json.loads(request("/api/status"))
                    break
                except (OSError, http.client.HTTPException):
                    if time.monotonic() >= deadline:
                        raise RuntimeError("Installed server startup timed out") from None
                    time.sleep(0.1)
            if status["llm"] != "demo" or status["cloud_enabled"] or status["stt_enabled"]:
                raise RuntimeError("Smoke test must never use real inference or cloud services")
            checks.append("demo-only startup")
            request("/api/status", expected=401, auth=False)
            checks.append("API authentication enforced")
            for path in ("/", "/app.mjs", "/style.css", "/capture-worklet.mjs"):
                if not request(path, auth=False):
                    raise RuntimeError(f"Empty packaged UI resource: {path}")
                checks.append(f"packaged resource {path}")
            session = json.loads(request("/api/sessions", "POST", {"mode": "assistant"}, 201))
            sid = session["id"]
            turn = json.loads(request(f"/api/sessions/{sid}/turns", "POST", {"text": "hello"}, 202))
            deadline = time.monotonic() + 10
            while True:
                turn = json.loads(request(f"/api/sessions/{sid}/turns/{turn['id']}"))
                if turn["status"] == "completed":
                    break
                if turn["status"] == "error" or time.monotonic() > deadline:
                    raise RuntimeError("Demo conversation did not complete")
                time.sleep(0.05)
            if not turn["segments"]:
                raise RuntimeError("Demo reply is missing")
            checks.append("demo conversation over HTTP")
            request(f"/api/sessions/{sid}/memories", "POST", {"text": "smoke memory"}, 201)
            companion = json.loads(request("/api/sessions", "POST", {"mode": "companion"}, 201))
            other = companion["id"]
            if json.loads(request(f"/api/sessions/{other}/memories")):
                raise RuntimeError("Memory leaked between modes")
            checks.append("memory isolation")
            request(f"/api/sessions/{other}/notes", "POST", {"text": "blocked"}, 403)
            checks.append("companion tools denied")
            request(f"/api/sessions/{sid}/transcriptions", "POST", {}, 503)
            checks.append("STT disabled by default")
            return {"status": "passed", "version": status["version"], "checks": checks}
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--python", default=sys.executable)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = smoke(os.path.abspath(args.python))
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
