"""Read-only local prerequisites check; never downloads models or claims inference quality."""

import argparse
import importlib.metadata
import json
import os
import re
import sys

from .config import Settings

SHADERS = (
    "vertshadersrc.vert",
    "vertshadersrcmasked.vert",
    "vertshadersrcsetupmask.vert",
    "fragshadersrcsetupmask.frag",
    "fragshadersrcpremultipliedalpha.frag",
    "fragshadersrcmaskpremultipliedalpha.frag",
    "fragshadersrcmaskinvertedpremultipliedalpha.frag",
    "vertshadersrccopy.vert",
    "fragshadersrccopy.frag",
    "fragshadersrccolorblend.frag",
    "fragshadersrcalphablend.frag",
    "vertshadersrcblend.vert",
    "fragshadersrcpremultipliedalphablend.frag",
)


def _check(name, status, message, required=True):
    return {"name": name, "status": status, "message": message, "required": required}


def _json_file(path):
    if path.stat().st_size > 2_000_000:
        raise ValueError("Oversized configuration")
    return json.loads(path.read_text(encoding="utf-8"))


def _asset(root, relative):
    if (
        not isinstance(relative, str)
        or not relative
        or any(c in relative for c in "\\%?#:")
        or relative.startswith("/")
        or any(part in (".", "..", "") for part in relative.split("/"))
    ):
        raise ValueError("Invalid local asset path")
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError("Asset escapes local root")
    if not target.is_file() or target.stat().st_size == 0:
        raise FileNotFoundError("Missing asset")
    return target


def _avatar(web):
    manifest = web / "avatar-local" / "manifest.json"
    if not manifest.is_file():
        return _check("avatar", "missing", "선택 사항: 공식 SDK·Haru 자산을 설치하세요.", False)
    try:
        config = _json_file(_asset(web, "avatar-local/manifest.json"))
        url = config.get("modelUrl", "")
        if config.get("version") != 1 or not re.fullmatch(
            r"/avatar-local/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_.-]+\.model3\.json", url
        ):
            raise ValueError("Invalid model configuration")
        emotions, gestures = config["emotionMappings"], config["gestureMappings"]
        if not isinstance(emotions, dict) or not isinstance(gestures, dict):
            raise ValueError("Invalid mappings")
        for name, value in emotions.items():
            if name not in {"neutral", "happy", "concerned", "surprised"} or not (
                isinstance(value, str) and 0 < len(value) <= 100
            ):
                raise ValueError("Invalid expression mapping")
        for name, value in gestures.items():
            if name not in {"idle", "nod", "greeting"} or not isinstance(value, dict):
                raise ValueError("Invalid motion mapping")
            if not (
                isinstance(value.get("group"), str)
                and 0 < len(value["group"]) <= 100
                and type(value.get("index")) is int
                and value["index"] >= 0
            ):
                raise ValueError("Invalid motion mapping")
        model_path = _asset(web / "avatar-local", url.removeprefix("/avatar-local/"))
        model = _json_file(model_path)
        refs = model["FileReferences"]
        if model.get("Version") != 3 or not isinstance(refs["Textures"], list):
            raise ValueError("Invalid model manifest")
        files = [refs["Moc"], *refs["Textures"]]
        files.extend(refs[key] for key in ("Physics", "Pose") if refs.get(key))
        files.extend(item["File"] for item in refs.get("Expressions", []))
        for motions in refs.get("Motions", {}).values():
            files.extend(item["File"] for item in motions)
        for file in files:
            _asset(model_path.parent, file)
        for file in ("cubism-runtime.js", "live2dcubismcore.min.js"):
            _asset(web, "avatar-runtime/" + file)
        for shader in SHADERS:
            _asset(web, "avatar-runtime/shaders/" + shader)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return _check(
            "avatar",
            "error",
            "선택 사항: 캐릭터 설정 또는 참조 파일이 잘못됐거나 누락됐습니다.",
            False,
        )
    return _check("avatar", "ok", "캐릭터 참조 파일 존재 확인. 실제 렌더링은 미검증입니다.", False)


def _request_json(client, method, url, **kwargs):
    with client.stream(method, url, **kwargs) as response:
        response.raise_for_status()
        data = bytearray()
        for chunk in response.iter_bytes():
            data.extend(chunk)
            if len(data) > 2_000_000:
                raise ValueError("Oversized provider response")
    value = json.loads(data)
    if not isinstance(value, dict):
        raise ValueError("Invalid provider response")
    return value


def diagnose(settings: Settings, transport=None):
    """Return safe, JSON-serializable prerequisite results without starting inference."""
    checks = []
    missing = []
    for package in ("fastapi", "uvicorn", "httpx", "pydantic"):
        try:
            importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            missing.append(package)
    checks.append(
        _check(
            "python",
            "ok" if sys.version_info >= (3, 11) and not missing else "missing",
            "Python 및 Gateway 패키지 설치 확인."
            if not missing and sys.version_info >= (3, 11)
            else "Python 3.11 이상과 requirements.txt 패키지를 설치하세요.",
        )
    )
    checks.append(
        _check(
            "web",
            "ok" if (settings.web_dir / "index.html").is_file() else "missing",
            "화면 진입 파일 확인."
            if (settings.web_dir / "index.html").is_file()
            else "apps/web에서 npm ci와 npm run build를 실행하세요.",
        )
    )
    if settings.llm == "demo":
        checks.append(
            _check("llm", "disabled", "DEMO 고정 응답입니다. 실제 AI 생성이 아닙니다.", False)
        )
    if settings.tts == "none":
        checks.append(_check("tts", "disabled", "음성 출력이 비활성화되어 있습니다.", False))
    if settings.llm == "ollama" or settings.tts == "melo":
        if "httpx" in missing:
            for name, enabled in (
                ("llm", settings.llm == "ollama"),
                ("tts", settings.tts == "melo"),
            ):
                if enabled:
                    checks.append(
                        _check(name, "missing", "httpx 설치 후 로컬 공급자를 확인하세요.")
                    )
        else:
            import httpx

            with httpx.Client(
                timeout=5, trust_env=False, follow_redirects=False, transport=transport
            ) as client:
                if settings.llm == "ollama":
                    try:
                        value = _request_json(
                            client,
                            "POST",
                            settings.ollama_url + "/api/show",
                            json={"model": settings.model},
                        )
                        if value.get("remote_host") or value.get("remote_model"):
                            raise ValueError("Remote model")
                        if not isinstance(value.get("model_info"), dict) or not value["model_info"]:
                            raise ValueError("Invalid model metadata")
                        capabilities = value.get("capabilities")
                        if capabilities is not None and (
                            not isinstance(capabilities, list)
                            or not all(isinstance(item, str) for item in capabilities)
                            or "completion" not in capabilities
                        ):
                            raise ValueError("Not a text generation model")
                        checks.append(
                            _check(
                                "llm",
                                "ok",
                                "지정된 로컬 Ollama 모델 확인. 추론 품질은 미검증입니다.",
                            )
                        )
                    except (httpx.HTTPError, ValueError, TypeError):
                        checks.append(
                            _check(
                                "llm",
                                "error",
                                "Ollama 서버와 OLLAMA_MODEL을 확인하세요. 모델이 없으면 ollama pull로 "
                                "설치하세요. 원격 모델은 사용할 수 없습니다.",
                            )
                        )
                if settings.tts == "melo":
                    try:
                        value = _request_json(
                            client,
                            "GET",
                            settings.melo_url + "/health",
                            headers={"Authorization": "Bearer " + settings.melo_token},
                        )
                        if value.get("status") != "ready" or value.get("provider") != "melo":
                            raise ValueError("Unexpected worker")
                        checks.append(
                            _check(
                                "tts",
                                "ok",
                                "Melo 워커 연결·인증 확인. 실제 음성 품질은 미검증입니다.",
                            )
                        )
                    except (httpx.HTTPError, ValueError, TypeError):
                        checks.append(
                            _check(
                                "tts",
                                "error",
                                "Melo 워커 실행과 동일한 MELO_TOKEN 설정을 확인하세요.",
                            )
                        )
    if settings.stt == "none":
        checks.append(_check("stt", "disabled", "음성 입력이 비활성화되어 있습니다.", False))
    else:
        usable = bool(
            settings.whisper_cli
            and settings.whisper_model
            and settings.whisper_cli.is_file()
            and settings.whisper_model.is_file()
            and settings.whisper_model.stat().st_size > 0
            and os.access(settings.whisper_model, os.R_OK)
            and (os.name == "nt" or os.access(settings.whisper_cli, os.X_OK))
        )
        checks.append(
            _check(
                "stt",
                "ok" if usable else "error",
                "whisper.cpp 실행 파일·모델 파일 확인. 실제 전사 품질은 미검증입니다."
                if usable
                else "WHISPER_CLI 실행 권한과 WHISPER_MODEL 파일을 확인하세요.",
            )
        )
    checks.append(_avatar(settings.web_dir))
    return {
        "profile": "demo" if settings.llm == "demo" else "local_private",
        "configured_ready": all(c["status"] == "ok" for c in checks if c["required"]),
        "inference_verified": False,
        "checks": checks,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="JSON 결과 출력")
    args = parser.parse_args(argv)
    try:
        report = diagnose(Settings.from_env())
    except (ValueError, OSError):
        report = {
            "profile": "unknown",
            "configured_ready": False,
            "inference_verified": False,
            "checks": [
                _check(
                    "configuration",
                    "error",
                    "환경 설정이 잘못됐습니다. config/.env.example을 참고해 공급자 이름, "
                    "로컬 URL, 포트, 토큰 길이, whisper.cpp 파일 설정을 확인하세요.",
                )
            ],
        }
    if args.json:
        print(json.dumps(report, ensure_ascii=False))
    else:
        print("Prerequisites: " + ("ready" if report["configured_ready"] else "needs attention"))
        for item in report["checks"]:
            print(f"[{item['status']}] {item['name']}: {item['message']}")
        print("실제 모델 추론·마이크·렌더링 검증은 별도로 수행하세요.")
    return 0 if report["configured_ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
