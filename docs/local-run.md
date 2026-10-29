# 로컬 실행과 준비 상태 확인

이 앱은 사용자 PC의 Python Gateway와 브라우저 화면으로 실행한다. 기본 demo는 고정 응답이며 실제 AI 대화를 위해 Ollama 모델이 필요하다. 캐릭터와 음성은 별도 로컬 구성요소다.

## 1. 설치와 기본 화면

Python 3.11 이상, Node.js 22 이상을 설치한 뒤 저장소 루트에서 실행한다.

Windows PowerShell:

```powershell
.\scripts\setup.ps1
.\scripts\start.ps1 -Check
.\scripts\start.ps1
```

Linux:

```sh
bash scripts/setup.sh
bash scripts/start.sh --check
bash scripts/start.sh
```

setup은 Python 패키지, 잠금 파일 기준 웹 의존성, 테스트, React 빌드를 처리한다. 데이터와 기존 가상환경을 보존하며 다른 OS에서 만든 가상환경은 명확한 오류로 중단한다. 진단 HTML만 필요하면 `-DiagnosticsOnly` / `--diagnostics-only`, 테스트 생략은 `-SkipTests` / `--skip-tests`를 사용한다.

시작 콘솔의 개인 연결 주소를 같은 PC의 브라우저에서 연다. 주소와 토큰은 공유하지 않는다. 시작 전에 준비 상태 검사를 실행하며 설정한 공급자가 실패하면 구체적인 조치와 함께 중단한다. `-Check` / `--check`는 서버를 띄우지 않는다. `config/.env.example`은 설명용이며 자동으로 읽지 않는다.

## 2. 실제 텍스트 AI

공식 Ollama를 설치하고 **Ollama 서버 프로세스**에 `OLLAMA_NO_CLOUD=1`을 적용한다. 기존 실행 중인 서버는 이 설정으로 재시작해야 한다. Gateway의 환경만 바꾸면 기존 Ollama 서버 설정이 바뀌지 않는다.

Windows의 별도 터미널:

```powershell
$env:OLLAMA_NO_CLOUD = '1'
ollama serve
```

모델 다운로드와 앱 시작:

```powershell
ollama pull qwen3:4b
.\scripts\start.ps1 -Provider ollama -Check
.\scripts\start.ps1 -Provider ollama
```

Linux는 `OLLAMA_NO_CLOUD=1 ollama serve`, 모델 설치 후 `bash scripts/start.sh --provider ollama --check` 및 `bash scripts/start.sh --provider ollama`를 사용한다. 다른 로컬 모델은 `OLLAMA_MODEL` 환경변수로 지정한다. 모드·모델 관련 기존 환경변수는 명시적 시작 옵션이 있을 때만 덮어쓴다.

검사는 `/api/show`로 지정 모델의 로컬 설치와 텍스트 생성 기능을 확인한다. 추론 시간·한국어 품질·구조화 응답 성공은 첫 실제 대화로 검증해야 한다. 실패 시 demo로 자동 전환하지 않는다.

## 3. 캐릭터·한국어 음성

- 캐릭터: [공식 SDK·Haru 설치](live2d-local-install.md). Core 없는 GitHub Framework만으로 실제 렌더링할 수 없다.
- 입력: 공식 whisper.cpp 실행 파일과 다국어 모델을 준비하고 `WHISPER_CLI`, `WHISPER_MODEL`을 설정한다. Windows는 `-Microphone`, Linux는 `--microphone`을 추가한다. 영어 전용 `.en` 모델을 쓰지 않는다.
- 출력: 별도 MeloTTS 환경에서 `workers/tts-melo/server.py`를 실행하고 워커와 Gateway에 같은 32자 이상 무작위 `MELO_TOKEN`을 설정한다. Windows는 `-Voice`, Linux는 `--voice`를 추가한다. Gateway용 Python 환경에 ML 패키지를 섞지 않는다. MeloTTS 설치·모델·한국어 품질은 현재 실검증하지 않았다.

Melo 워커의 인증된 `GET /health`는 실제 음성 합성을 실행하지 않고 연결·인증·프로세스 초기화 완료를 확인한다. STT 진단 역시 파일 존재·실행 권한을 확인할 뿐 전사 품질을 보증하지 않는다.

## 진단 결과

저장소 루트에서 `PYTHONPATH=services .venv/bin/python -m gateway.doctor --json`으로 자동화용 JSON을 얻는다. Windows에서는 먼저 `$env:PYTHONPATH='services'`를 설정하고 `.venv\Scripts\python.exe -m gateway.doctor --json`을 실행한다.

- `configured_ready`: 현재 선택한 구성의 필수 실행 조건. 실패 시 종료 코드 1.
- `inference_verified`: 항상 false. 이 진단은 모델 추론을 실행하지 않는다.
- `demo`: 선택 가능한 고정 응답 모드. 전체 앱 완성 또는 실제 AI 준비를 의미하지 않는다.
- 누락된 Live2D 자산은 선택 사항 경고로 보고하여 텍스트 대화를 사용할 수 있게 한다.

## 현재 검증과 남은 조건

Linux에서 전체 setup 재실행·빌드·새 launcher의 인증 API/React/demo 대화를 확인했다. Python 74개, 웹/설치 29개, SDK 경계 모의 12개, 기존 음성 21개가 통과했다. Windows 스크립트는 정적 검토만 했으며 실제 Windows 실행은 미검증이다.

클라우드에는 공식 Ollama 0.40.13(공식 SHA-256 확인)과 CPU whisper.cpp v1.8.7 실행 파일을 설치했다. Ollama 서버의 버전 응답을 확인했지만 `qwen3:4b` 다운로드는 네트워크 403으로 실패했다. Whisper/Melo 모델과 Cubism Core도 확보하지 못했다. 실제 AI 응답·한국어 STT/TTS·Haru 표시·사용자 PC 장시간 검증이 남아 있다.
