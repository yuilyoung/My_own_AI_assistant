# My own AI assistant

Windows 로컬 PC에서 시작해 Mac mini로 이전할 수 있는 **개인 AI 비서 + 가상 소개팅 공통 엔진**입니다. 최종 화면은 2D Live2D 캐릭터를 사용합니다.

> React 화면에서 텍스트 대화, 버튼식 음성 입력·전사 검토, 음성 재생, 모드별 기억과 비서 메모를 사용할 수 있습니다. 실제 Live2D 렌더러는 아직 연결되지 않았습니다. 기본 실행은 고정 응답 demo이며 실제 AI 대화에는 로컬 모델 설치가 필요합니다.

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

React/Vite 화면과 개발용 진단 화면을 제공합니다. 두 화면은 동일한 인증 API와 음성 모듈을 사용하며 HTTP 폴링으로 상태를 확인합니다. Gateway는 React 운영 빌드가 있으면 이를 제공하고, 없으면 진단 화면을 제공합니다.

## Windows에서 실행

구현 커밋이 포함된 브랜치에서 Python 3.11 이상을 사용합니다. 최초 패키지 설치에는 인터넷 연결이 필요합니다.

```powershell
cd My_own_AI_assistant
.\scripts\setup.ps1
```

React 화면을 사용하려면 Node.js 22 이상으로 한 번 빌드한 뒤 Gateway를 시작합니다. 진단 화면만 사용하려면 빌드 없이 `scripts\start.ps1`을 실행할 수 있습니다.

```powershell
cd apps/web
npm ci
npm run build
cd ../..
.\scripts\start.ps1
```

콘솔에 표시되는 `http://127.0.0.1:8765/#token=...` 주소를 열고 **연결**을 누릅니다. React는 주소의 토큰을 즉시 지우고 메모리에만 보관합니다. `ASSISTANT_WEB_DIR=apps/diagnostics`를 지정하면 진단 화면을 선택할 수 있습니다. 토큰을 공유하지 마세요. 기본 모드는 **고정 응답 `demo` / TTS 없음 / STT 없음**입니다.

### Live2D 로컬 모델 사전 검사 (실제 렌더링 아님)

공식 SDK와 캐릭터별 사용권을 직접 확인한 모델 export 전체 폴더를 `apps/web/public/avatar-local/Haru/` 같은 로컬 전용 경로에 넣고 React를 다시 빌드합니다. React 아바타 패널의 **모델 JSON 검사**에 `/avatar-local/Haru/Haru.model3.json`을 입력하면 모델 참조 경로와 LipSync 파라미터 목록을 검사합니다. 이 기능은 실제 Cubism Core/Framework를 실행하거나 모델을 그리지 않습니다. 추가로 **참조 파일 접근 검사**를 누르면 `.model3.json`에 명시된 고유 자산에 동일 출처 `HEAD` 요청(최대 4개 병렬)을 보내 HTTP 실패·빈 파일·HTML fallback을 보고합니다. 이는 현재 서버에서의 접근 가능성만 확인하며 파일 무결성, SDK 호환성, 이용 조건 또는 실제 렌더링을 증명하지 않습니다. [자산 전달·검증 안내](docs/live2d-asset-handoff.md)를 참고하세요.

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

## CI와 산출물

- Python: Ruff formatter/lint, Windows·Linux × Python 3.11·3.13 테스트, Gateway wheel 빌드.
- Web: `npm ci`, Prettier, ESLint, TypeScript, Vitest/React 통합 테스트, Vite 운영 빌드.
- 운영 브라우저: Chromium의 합성 마이크 → AudioWorklet → WAV 업로드 → 합성 STT → 사용자 검토·전송 → 합성 TTS/RMS 재생, 모드 전환과 기억 격리.
- Windows 운영 smoke: GitHub Actions의 Windows 실행기에서 Gateway를 별도 프로세스로 시작해 빌드된 React·AudioWorklet MIME·로컬 API 인증·demo 응답·모드별 기억 격리를 검사합니다. **사용자 PC에서 실제 모델을 검증한 것은 아닙니다.**
- Actions 산출물: `web-dist`, `gateway-wheel`. 캐릭터·모델 가중치·로컬 데이터는 포함하지 않습니다. wheel에는 UI와 외부 모델이 포함되지 않으므로 소스 실행 안내를 함께 사용하세요.

브라우저 검증은 실제 whisper/Ollama/MeloTTS 모델의 인식률·자연스러움·지연을 측정하지 않습니다. 현재 검증 결과와 실행 링크는 [구현 상태](docs/implementation-status.md)에 기록합니다.

## 보안과 배포 범위

Gateway는 `127.0.0.1`에만 바인딩하며 인증과 Host/Origin 검사를 적용합니다. SQLite는 암호화 저장소가 아닙니다. 소개팅 모드에는 비서 도구를 제공하지 않습니다. 전사 임시 파일 삭제는 보안 삭제가 아니며 강제 종료 후 잔여 파일이 남을 수 있습니다. 원격 Mac mini 이전에는 HTTPS와 원격 인증을 추가해야 합니다.

Live2D SDK, 캐릭터, 모델 가중치에는 각각의 사용·배포 조건이 있습니다. 코드 공개가 해당 자산의 재배포 허가를 의미하지 않습니다. 라이선스 문서에서 확정된 사실과 공개 배포 전 확인 사항을 구분합니다.
