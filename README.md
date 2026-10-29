# My own AI assistant

Windows 로컬 PC에서 시작해 Mac mini로 이전할 수 있는 **개인 AI 비서 + 가상 소개팅 공통 엔진**입니다. 최종 화면은 2D Live2D 캐릭터를 사용합니다.

> 개발 중인 프로젝트입니다. 현재 준비된 구현은 FastAPI 공통 엔진, 개발용 진단 화면, 버튼식 음성 입력입니다. React/Live2D 캐릭터 렌더링은 아직 구현되지 않았습니다. 문서를 먼저 커밋하고 공통 엔진과 음성 입력을 별도 구현 커밋으로 반영합니다.

## 목표와 원칙

- 현재는 Windows 로컬 1인용으로 실행하고, Mac mini는 향후 서버 이전 대상입니다.
- 비서와 소개팅은 엔진 코드를 공유하지만 대화 기억과 도구 권한은 서버에서 분리합니다.
- 로컬 LLM/Ollama, whisper.cpp STT, MeloTTS 한국어 음성을 단계적으로 연결합니다.
- 기본 진단 모드의 고정 응답을 실제 AI 응답으로 표시하지 않습니다.
- 유료 API, API 키, 캐릭터 구매는 기본 진단 실행의 필수 조건이 아닙니다.
- 마이크는 사용자가 버튼으로 시작하며, 전사 결과를 확인한 뒤 직접 전송합니다.
- API 키, 대화 데이터, 모델 가중치, Cubism Core와 캐릭터 자산은 저장소에 포함하지 않습니다.
- 인터넷 공개·다중 사용자 서비스·상용 배포는 이번 로컬 MVP의 범위가 아닙니다.

## 문서

- [상세 기술 설계](docs/design/technical-design.md)
- [오픈소스와 라이선스 검토](docs/design/sources-and-licenses.md)
- [구현 백로그](docs/design/implementation-backlog.md)
- [현재 구현·검증 상태](docs/implementation-status.md)
- [음성 입력 계약과 수동 검증](docs/voice-input.md)

설계서는 전체 목표를 설명합니다. 실제 구현 여부와 검증 범위는 구현 상태 문서를 기준으로 확인하세요.

## 시스템 구조

```text
브라우저: 대화 UI / 마이크 / 음성 재생 / 향후 Live2D
                    |
        인증된 로컬 HTTP Gateway
                    |
  모드 정책 / 대화 취소 / 기억 / 제한된 비서 도구
          |          |          |          |
        SQLite     Ollama   whisper.cpp   MeloTTS
```

현재 진단 UI는 별도 npm 의존성이 없는 HTML/JavaScript이고, HTTP 폴링을 사용합니다. React/Vite 화면과 WebSocket은 후속 구현입니다.

## Windows에서 실행

구현 커밋이 포함된 브랜치에서 Python 3.11 이상을 사용합니다. 최초 패키지 설치에는 인터넷 연결이 필요합니다.

```powershell
cd My_own_AI_assistant
.\scripts\setup.ps1
.\scripts\start.ps1
```

콘솔에 표시되는 `http://127.0.0.1:8765/#token=...` 주소를 엽니다. 토큰을 공유하지 마세요. 기본 모드는 **고정 응답 `demo` / TTS 없음 / STT 없음**입니다.

### 로컬 대화 모델

Ollama와 모델을 별도 설치하고 Ollama 서버에 `OLLAMA_NO_CLOUD=1`을 적용한 뒤 시작합니다. Gateway 설정만 바꿔도 이미 실행 중인 Ollama가 바뀌는 것은 아닙니다.

```powershell
ollama pull qwen3:4b
.\scripts\start.ps1 -Provider ollama
```

### 버튼식 한국어 음성 입력

공식 whisper.cpp 실행 파일과 다국어 모델을 별도 설치합니다. 실제 마이크·한국어 모델의 품질과 지연은 아직 검증하지 않았습니다.

```powershell
$env:WHISPER_CLI = 'C:\tools\whisper.cpp\build\bin\Release\whisper-cli.exe'
$env:WHISPER_MODEL = 'C:\tools\whisper.cpp\models\ggml-small.bin'
.\scripts\start.ps1 -Provider ollama -Microphone
```

마이크로 입력 → 녹음 완료 → 전사 결과 확인·수정 → 전송 순서입니다. 자동 전송과 상시 청취는 하지 않습니다.

### 한국어 TTS

`workers/tts-melo/server.py`를 MeloTTS가 설치된 별도 환경에서 실행합니다. 워커와 Gateway에 동일한 32자 이상 임의의 `MELO_TOKEN`을 설정한 뒤 `start.ps1 -Provider ollama -Voice`로 연결합니다. Gateway 설치가 MeloTTS·PyTorch·가중치를 자동 설치하지는 않습니다. OS/모델 호환성은 실기기 검증이 필요합니다.

## 테스트

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
node --test apps/diagnostics/tests/*.test.mjs
```

공급자 테스트는 모의 HTTP/프로세스를 사용합니다. 테스트 통과를 실제 모델 품질, 마이크 동작, Windows/macOS 실기기 실행의 증거로 해석하지 마세요.

## 보안과 배포 범위

Gateway는 `127.0.0.1`에만 바인딩하며 인증과 Host/Origin 검사를 적용합니다. SQLite는 암호화 저장소가 아닙니다. 소개팅 모드에는 비서 도구를 제공하지 않습니다. 전사 임시 파일 삭제는 보안 삭제가 아니며 강제 종료 후 잔여 파일이 남을 수 있습니다. 원격 Mac mini 이전에는 HTTPS와 원격 인증을 추가해야 합니다.

Live2D SDK, 캐릭터, 모델 가중치에는 각각의 사용·배포 조건이 있습니다. 코드 공개가 해당 자산의 재배포 허가를 의미하지 않습니다. 라이선스 문서에서 확정된 사실과 공개 배포 전 확인 사항을 구분합니다.

## CI/CD

Ruff/Prettier 포맷 검사, Ruff/ESLint 린트, mypy 타입 검사, Bandit 보안 정적 분석을 실행합니다. Windows·Ubuntu 및 Python 3.11·3.13에서 테스트하고, 생성한 패키지를 깨끗한 환경에 설치해 HTTP로 검증합니다.

검증을 통과한 wheel·소스 배포 파일·로컬 실행 ZIP과 SHA-256 체크섬을 GitHub Actions Artifact로 보관합니다. ZIP은 Python과 인터넷 연결이 필요한 설치 묶음이며 단독 실행 EXE가 아닙니다. 버전 태그는 검증 후 초안 Release만 생성하며 서버 자동 배포는 하지 않습니다.

[CI/CD 구조, 산출물, 로컬 검사 명령](docs/ci-cd.md)
