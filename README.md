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

### Windows 로컬 준비 상태 점검 (비침습적 검사)

Gateway를 시작하기 전 현재 PC의 준비 상태를 확인할 수 있습니다. 빌드 파일, Ollama 로컬 모델 등록 여부, whisper.cpp 실행 파일·다국어 모델 경로, MeloTTS 인증 라우트를 확인합니다. **모델 추론·합성·마이크 녹음·SDK 로딩을 실행하지 않으며 네트워크는 구성된 loopback 주소로만 연결합니다.**

```powershell
.\scripts\check-readiness.ps1
.\scripts\check-readiness.ps1 -Provider ollama -Voice -Microphone
.\scripts\check-readiness.ps1 -Provider ollama -Voice -Microphone -Json
```

`PASS`는 해당 파일·API 사전 조건만 확인했다는 뜻입니다. `FAIL`은 빌드·설정·인증 등을 수정해야 함을 뜻하고, `SKIP`은 미설치 또는 수동 검증이 필요한 영역입니다. React 빌드가 없으면 FAIL로 표시하고, Live2D 렌더링·실제 한국어 추론·마이크/스피커·장시간 안정성은 **항상 수동 검증 대상으로 남깁니다.** 준비 상태 명령의 종료 코드는 FAIL이 하나라도 있으면 1입니다. 개인 토큰과 프롬프트는 출력하지 않습니다.

### Live2D 로컬 모델 사전 검사 (실제 렌더링 아님)

공식 SDK와 캐릭터별 사용권을 직접 확인한 모델 export 전체 폴더를 `apps/web/public/avatar-local/Haru/` 같은 로컬 전용 경로에 넣고 React를 다시 빌드합니다. React 아바타 패널의 **모델 JSON 검사**에 `/avatar-local/Haru/Haru.model3.json`을 입력하면 모델 참조 경로와 LipSync 파라미터 목록을 검사합니다. 이 기능은 실제 Cubism Core/Framework를 실행하거나 모델을 그리지 않습니다. 추가로 **참조 파일 접근 검사**를 누르면 `.model3.json`에 명시된 고유 자산에 동일 출처 `HEAD` 요청(최대 4개 병렬)을 보내 HTTP 실패·빈 파일·HTML fallback을 보고합니다. 이는 현재 서버에서의 접근 가능성만 확인하며 파일 무결성, SDK 호환성, 이용 조건 또는 실제 렌더링을 증명하지 않습니다. [자산 전달·검증 안내](docs/live2d-asset-handoff.md)를 참고하세요.

> Live2D 진행 상황: React 음성 RMS → SDK 어댑터 브리지와 모델별 표정·모션 이름 확인은 구현했으나, 공식 Cubism Core/렌더러와 캐릭터는 미연결입니다. 실제 렌더링·립싱크는 미완료입니다.
>
> 2026-11-07: 음성 재생을 중지하거나 모드를 전환할 때 `AudioContext.resume()`가 늦게 완료되어도 이전 음성을 디코딩하지 않도록 보호하고, 정상 재생 종료 후 AudioBufferSourceNode 연결을 해제하도록 보완했습니다. 이는 재생 수명주기와 모의 테스트 개선이며 실제 Windows 오디오 장치나 Cubism 화면의 검증 결과는 아닙니다.

### 모델별 표정·모션 매핑 및 수동 동작 시험

모델 참조 파일 접근 검사가 통과하면, 아바타 패널에서 모델 export에 실제로 존재하는 표정과 모션 그룹 이름을 **중립·기쁨·걱정·놀람** 및 **대기·끄덕임·인사**에 직접 대응시킬 수 있습니다. 기본값은 모두 **연결 안 함**이며 모델마다 서로 다른 이름을 임의로 추측하지 않습니다. 선택한 매핑은 로컬 어댑터가 연결될 때 검증되어 전달됩니다. 연결 후 나타나는 **표정 테스트/모션 테스트** 버튼으로 SDK 호출 경로를 직접 시험할 수 있습니다. 다른 매핑을 선택하면 기존 렌더러를 해제하고 다시 연결하도록 하며, 이전 모델의 설정은 유지되지 않습니다.

모의 어댑터를 통한 호출 테스트는 **실제 WebGL 표시나 물리 모션의 시각적 성공을 증명하지 않습니다.** 실제 모델·SDK는 별도 설치해야 하고 검증 결과도 수동으로 확인해야 합니다.

### 로컬 Cubism 어댑터 연결 (실제 SDK 별도 필요)

참조 자산 HEAD 검사가 모두 통과한 경우에만 **로컬 Cubism 어댑터 연결** 버튼이 활성화됩니다. 해당 버튼은 저장소에 포함되지 않은 사용자 설치 모듈 `/avatar-local/runtime/adapter.js`를 명시적으로 불러와 `createAvatarAdapter(canvas)`로 어댑터를 만들고 오디오 RMS 브리지에 부착합니다. 모듈의 `load(modelUrl)`, `setExpression(name)`, `setMotion(group)`, `setLipSync(level)`, `dispose()`가 필요합니다. 설치 모듈을 제공하지 않으면 명확한 오류를 표시하며 가짜 렌더러로 대체하지 않습니다. 자산 경로는 `apps/web/public/avatar-local/runtime/`로 두고 다시 빌드합니다. 이 디렉터리는 Git에서 제외됩니다.

실제 로컬 어댑터가 연결되고 해당 모델에 LipSync 파라미터가 있을 때만 **수동 입모양 테스트 강도** 슬라이더가 나타납니다. 강도를 조절하면 0~1 수치가 어댑터에 전달되며, 포인터·키 조작 종료, 포커스 이동, **입모양 닫기**, 패널 해제 시 0으로 되돌립니다. 입모양이 실제 움직였는지는 직접 화면에서 확인해야 하며 음성 재생 중에는 수동 시험하지 않습니다. **비서/소개팅 모드 전환 시 아바타 패널을 새로 만들고 기존 렌더러를 해제**하므로 새 모드에서는 모델 검사 및 연결을 다시 수행해야 합니다.

SDK 연결 종료·모델 전환 시 로딩 중인 어댑터에 `AbortSignal`을 전달하고 정리를 요청합니다. 외부 어댑터가 이를 무시할 수 있으므로 실제 WebGL 리소스 해제는 수동 검증이 필요합니다.

**현재 저장소에는 이 인터페이스를 구현한 공식 SDK 렌더러가 없습니다.** 어댑터 초기화 성공은 WebGL 표시/동작 성공과 다릅니다. 신뢰하는 로컬 자산만 설치하고 Core·Framework·캐릭터 모델의 이용 조건을 직접 확인하세요. [자세한 연결 계약](docs/live2d-asset-handoff.md)을 참고하세요.

### WebGL 컨텍스트 손실 감지

로컬 Cubism 어댑터가 연결된 상태에서 브라우저가 `webglcontextlost`를 발생시키면 React는 해당 어댑터를 즉시 해제하고 음성 립싱크 전달을 중단합니다. SDK 로딩 중이었다면 늦은 팩토리 응답도 폐기합니다. 컨텍스트가 복구되기 전에는 다시 연결할 수 없으며, `webglcontextrestored` 이후 **로컬 Cubism 어댑터 연결** 버튼을 다시 눌러야 합니다. 복구를 캐릭터 렌더링 성공으로 간주하지 않습니다.

이 보호 기능은 모의 어댑터와 브라우저 이벤트 기반 자동 테스트 대상입니다. 실제 GPU 드라이버 손실·공식 SDK 리소스 재생성·실물 모델 렌더링은 별도로 수동 검증해야 합니다.

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
