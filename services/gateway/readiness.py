"""Non-invasive checks for a user-owned Windows local MVP installation.

The checker never starts model inference, downloads assets, or sends requests
outside configured literal-loopback addresses.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import httpx

from .config import Settings


@dataclass(frozen=True)
class Check:
    component: str
    status: Literal["PASS", "FAIL", "SKIP"]
    detail: str


def inspect_local_readiness(
    settings: Settings, client: httpx.Client, repository: Path
) -> list[Check]:
    """Report local readiness; PASS never implies speech or rendering quality."""
    checks: list[Check] = []
    react = repository / "apps" / "web" / "dist" / "index.html"
    checks.append(
        Check(
            "React",
            "PASS" if react.is_file() else "FAIL",
            "운영 빌드 파일 확인 (브라우저 실행은 미검증)"
            if react.is_file()
            else "apps/web에서 npm ci && npm run build 실행 필요",
        )
    )

    if settings.llm == "demo":
        checks.append(Check("Ollama", "SKIP", "demo 고정 응답; 실제 모델 추론 미사용"))
    else:
        try:
            tags = client.get(settings.ollama_url + "/api/tags")
            tags.raise_for_status()
            models = tags.json()["models"]
            installed = {
                model["name"]
                for model in models
                if isinstance(model, dict) and isinstance(model.get("name"), str)
            }
            if settings.model not in installed:
                checks.append(
                    Check("Ollama", "FAIL", "설정된 로컬 모델 태그를 찾지 못했습니다")
                )
            else:
                details = client.post(
                    settings.ollama_url + "/api/show", json={"model": settings.model}
                )
                details.raise_for_status()
                info = details.json()
                if info.get("remote_host") or info.get("remote_model"):
                    checks.append(Check("Ollama", "FAIL", "원격 모델 사용은 허용되지 않습니다"))
                else:
                    checks.append(
                        Check("Ollama", "PASS", "로컬 모델 등록 확인 (실제 추론은 미검증)")
                    )
        except (httpx.HTTPError, KeyError, TypeError, ValueError, AttributeError):
            checks.append(Check("Ollama", "FAIL", "로컬 API 연결 또는 모델 메타데이터 검사 실패"))

    if settings.stt == "none":
        checks.append(Check("whisper.cpp", "SKIP", "STT 비활성화"))
    else:
        available = (
            settings.whisper_cli is not None
            and settings.whisper_model is not None
            and settings.whisper_cli.is_file()
            and settings.whisper_model.is_file()
            and ".en." not in settings.whisper_model.name.lower()
        )
        checks.append(
            Check(
                "whisper.cpp",
                "PASS" if available else "FAIL",
                "CLI·다국어 모델 파일 확인 (한국어 인식은 미검증)"
                if available
                else "WHISPER_CLI와 다국어 WHISPER_MODEL 파일을 확인하세요",
            )
        )

    if settings.tts == "none":
        checks.append(Check("MeloTTS", "SKIP", "TTS 비활성화"))
    else:
        try:
            # GET cannot trigger synthesis; the worker returns 405 for authenticated
            # requests to the POST-only synthesis endpoint.
            response = client.get(
                settings.melo_url + "/synthesize",
                headers={"Authorization": "Bearer " + settings.melo_token},
            )
            valid = response.status_code == 405
        except httpx.HTTPError:
            valid = False
        checks.append(
            Check(
                "MeloTTS",
                "PASS" if valid else "FAIL",
                "인증된 워커 라우트 접근 확인 (실제 합성은 미검증)"
                if valid
                else "MeloTTS 워커 실행 상태·주소·인증 토큰을 확인하세요",
            )
        )

    checks.append(
        Check("Live2D", "SKIP", "공식 SDK/Core와 사용권이 확인된 모델 렌더링 수동 검증 필요")
    )
    checks.append(
        Check("기기", "SKIP", "실제 마이크·스피커, 한국어 품질과 장시간 안정성 수동 검증 필요")
    )
    return checks
