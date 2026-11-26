# 캐릭터별 한국어 음성

Supertonic 2는 CPU에서 하나(F4), 서린(F1), 이솔(F2)의 목소리로 한국어 답변을 읽습니다. 하나는 경쾌하게 말하고, 이솔은 밝고 부드럽게 답하며, 서린은 차분하고 또렷하게 전달합니다. 질문은 캐릭터에 맞춰 조금 여유 있게 읽습니다. 미리듣기와 답변에는 같은 캐릭터별 음성 설정을 사용합니다. 음성 워커를 연결하기 전에도 웹 앱에 포함된 인사말과 자기소개를 들을 수 있습니다.

## 말의 속도와 쉼

워커는 문맥과 문장부호를 모델에 한 번에 전달해 단어 사이의 흐름과 억양을 살립니다. 말의 속도는 합성할 때 조율합니다. 합성 뒤에는 캐릭터별로 음높이를 조금 조정하고, 긴 무음의 가운데만 줄입니다. 짧은 쉼은 유지하고, 프레임의 최대 음량으로 무음을 판단해 작은 소리로 끝나는 발음을 보존합니다. 큰 피크가 있는 발화는 WAV가 잘리지 않도록 같은 비율로 전체 음량을 낮춥니다.

한국어 대화와 즉흥 발화의 공개 음성 예시에서 말의 빠르기와 쉼의 길이를 확인했습니다. 예를 들어 대화 세 편은 짧은 내부 쉼이 약 100–250ms였고, 망설임에는 더 긴 쉼도 나왔습니다. 인터넷 영상에서 수집한 Emilia의 한국어 공개 예시 두 편에서는 약 210–380ms의 구절 사이 쉼을 확인했습니다. 사람의 예시 음성은 발화 타이밍을 검토할 때 참고했고, 캐릭터 음성은 Supertonic 2 기본 스타일에서 합성했습니다. [한국어 대화 음성 예시](https://github.com/Nexdata-AI/500-Hours-Korean-Conversational-Speech-Data-by-Mobile-Phone) · [한국어 즉흥 발화 예시](https://github.com/Nexdata-AI/396-Hours-Korean-Spontaneous-Speech-Data) · [Emilia 데이터 미리듣기](https://github.com/Emilia-Dataset/Emilia-Demo-Page/blob/public/index.html#L208) · [Supertonic 음성 설명](https://github.com/supertone-oss-archive/supertonic-py/blob/main/docs/voices.md)

웹에 담긴 여섯 MP3는 같은 워커로 생성했습니다. 44.1kHz 모노 음원으로, 디코딩한 길이는 6.38–7.94초입니다. 다국어 Whisper small로 전사했을 때 공백과 문장부호를 제외한 한글 음절이 여섯 대본과 일치했습니다. 16kHz 모노 변환 후 10ms 프레임의 RMS로 측정한 클립별 최장 내부 쉼은 기존 610–1,070ms에서 300–540ms로 줄었습니다.

같은 설정으로 샘플을 다시 합성할 때는 웹 대화 미리보기의 대본을 `load_synthesizer(model_dir, seed=...)`가 돌려주는 함수에 전달합니다. 하나 인사말은 시드 2722, 다른 다섯 편은 2718로 생성했습니다. WAV를 FFmpeg의 `libmp3lame -q:a 3`으로 변환했습니다.

## 설치 전 준비

저장소를 받은 뒤 루트에서 아래의 해당 운영체제 절차를 실행합니다. Python 3.11 이상이 필요합니다. Node.js 22 LTS는 22.22.2 이상, 24 LTS는 24.15.0 이상을 사용합니다. Windows에서는 x64 Python을 사용합니다. 게이트웨이와 음성 워커는 같은 컴퓨터에서 실행합니다. 워커용 가상 환경과 모델은 Git에서 제외되는 `.local-data/supertonic/`에 저장합니다. [Supertonic 2 모델 사용 조건](https://huggingface.co/supertone-oss-archive/supertonic-2/blob/main/LICENSE)

운영 웹 빌드 ZIP이 있으면 압축을 풀고 `index.html`이 있는 폴더의 절대 경로를 `ASSISTANT_WEB_DIR` 환경 변수로 지정합니다. 이 경우 아래의 웹 빌드 단계는 압축을 푼 파일로 대체할 수 있습니다. 음성 워커는 같은 설치 절차를 사용합니다.

## Windows x64

PowerShell에서 게이트웨이를 설치하고 운영 웹 앱을 빌드합니다.

```powershell
.\scripts\setup.ps1
npm --prefix apps/web ci
npm --prefix apps/web run build
```

워커 의존성을 설치하고 모델 압축 파일의 SHA-256을 확인한 뒤 압축을 풉니다.

```powershell
$work = '.local-data\supertonic'
$model = 'sherpa-onnx-supertonic-tts-int8-2026-03-06'
$archive = Join-Path $work "$model.tar.bz2"
$hash = '8c74359f63edd5045d47747f65331f0f6dbcbc91d7e898dd756d631295fe3259'
New-Item -ItemType Directory -Force $work | Out-Null
python -m venv (Join-Path $work 'venv')
& .\.local-data\supertonic\venv\Scripts\python.exe -m pip install -r workers/tts-supertonic/requirements.txt
Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$model.tar.bz2" -OutFile $archive
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $hash) { throw 'Supertonic 2 checksum mismatch' }
tar.exe -xf $archive -C $work
```

같은 PowerShell에서 토큰을 생성합니다. 새 PowerShell 창은 토큰을 환경 변수로 전달받습니다. 첫 창은 워커 로그를 확인할 수 있도록 열어 둡니다.

```powershell
$env:SUPERTONIC_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(32))"
$env:SUPERTONIC_MODEL_DIR = (Resolve-Path (Join-Path $work $model)).Path
Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList '-NoExit' -WorkingDirectory (Get-Location).Path
& .\.local-data\supertonic\venv\Scripts\python.exe .\workers\tts-supertonic\server.py
```

첫 창에 `Uvicorn running on http://127.0.0.1:8767`이 표시되면 새 창에서 준비 상태를 확인합니다. 점검을 통과하면 게이트웨이가 시작됩니다.

```powershell
.\scripts\check-readiness.ps1 -Provider demo -TtsProvider supertonic
if ($LASTEXITCODE -eq 0) { .\scripts\start.ps1 -Provider demo -TtsProvider supertonic }
```

## Linux

저장소 루트의 Bash에서 게이트웨이를 설치하고 운영 웹 앱을 빌드합니다. Python에 `venv` 모듈이 있어야 합니다. 모델 다운로드와 검증에는 `curl`, `tar`, `sha256sum`을 사용합니다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm --prefix apps/web ci
npm --prefix apps/web run build
```

워커 의존성을 설치하고 모델 압축 파일의 SHA-256을 확인한 뒤 압축을 풉니다.

```bash
work=.local-data/supertonic
model=sherpa-onnx-supertonic-tts-int8-2026-03-06
archive="$work/$model.tar.bz2"
hash=8c74359f63edd5045d47747f65331f0f6dbcbc91d7e898dd756d631295fe3259
mkdir -p "$work"
python3 -m venv "$work/venv"
"$work/venv/bin/python" -m pip install -r workers/tts-supertonic/requirements.txt
curl --fail --location --output "$archive" "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/$model.tar.bz2"
printf '%s  %s\n' "$hash" "$archive" | sha256sum --check - && tar -xf "$archive" -C "$work"
```

첫 터미널에서 토큰을 만들고 워커를 실행합니다. 출력된 토큰은 두 번째 터미널에 입력할 때 사용합니다.

```bash
export SUPERTONIC_TOKEN="$(.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export SUPERTONIC_MODEL_DIR="$PWD/$work/$model"
printf 'SUPERTONIC_TOKEN=%s\n' "$SUPERTONIC_TOKEN"
"$work/venv/bin/python" workers/tts-supertonic/server.py
```

워커 로그에 `Uvicorn running on http://127.0.0.1:8767`이 표시되면 두 번째 Bash 터미널에서 저장소 루트로 이동합니다. 프롬프트에 첫 터미널에서 생성한 `SUPERTONIC_TOKEN`의 값만 입력합니다. 입력값은 화면이나 셸 명령 기록에 남지 않습니다.

```bash
read -rsp 'Supertonic token: ' SUPERTONIC_TOKEN
printf '\n'
export SUPERTONIC_TOKEN
PYTHONPATH="$PWD/services" .venv/bin/python -m gateway.readiness_cli --provider demo --tts-provider supertonic &&
  LLM_PROVIDER=demo TTS_PROVIDER=supertonic ./scripts/start.sh
```

## 세 목소리 확인

게이트웨이 콘솔에 표시되는 주소를 브라우저에서 열고 **연결**을 누릅니다. **개인 비서 → 아바타 종류**에서 하나, 서린, 이솔을 차례로 골라 메시지를 보내고 각 목소리로 데모 답변을 읽는지 확인합니다. 데모는 고정 응답을 사용하므로 별도 대화 모델 없이 음성을 확인할 수 있습니다. 가상 소개팅에서는 서린과 이솔을 선택할 수 있습니다. API 요청에 음성을 지정하지 않으면 서린으로 합성합니다. 브라우저는 44.1 kHz, 16비트 모노 WAV를 받아 재생합니다. 워커가 중지되면 대화 답변은 텍스트로 표시되고 음성 생성 실패 안내가 나타납니다.

로컬 Ollama로 대화하려면 모델을 준비한 뒤 Windows의 두 명령에서 `-Provider demo`를 `-Provider ollama`로 바꿉니다. Linux에서는 점검 명령에 `--provider ollama`를, 시작 명령에 `LLM_PROVIDER=ollama`를 사용합니다. [Ollama 모델 준비](../../README.md#로컬-대화-모델)

PowerShell의 `-Voice`는 활성 TTS 설정 없이 실행할 때 `SUPERTONIC_TOKEN`이 있으면 Supertonic 2를 선택하고, 토큰이 없으면 MeloTTS를 선택합니다. 위 예시처럼 `-TtsProvider`에 적은 값이 우선합니다.

마이크 입력은 별도의 whisper.cpp와 다국어 모델을 사용합니다. `WHISPER_CLI`와 `WHISPER_MODEL`을 지정하고 Windows 실행 명령에 `-Microphone`을 더하거나 Linux에서 `STT_PROVIDER=whisper_cpp`를 설정합니다. [한국어 음성 입력](../../README.md#버튼식-한국어-음성-입력)

## 브라우저 자동 검증

웹 빌드와 모델을 준비한 뒤 아래 명령을 실행하면 Chromium에서 세 캐릭터의 실제 음성 합성, 재생, 입 모양 반응을 확인합니다. 검증 스크립트는 별도 포트에서 게이트웨이와 워커를 실행합니다. Chromium의 Pixel 7 화면으로 확인하려면 마지막 명령에 `--mobile`을 추가합니다. 압축을 푼 운영 웹 빌드는 `--web-dir`로 지정할 수 있습니다.

```powershell
$workerPython = '.\.local-data\supertonic\venv\Scripts\python.exe'
& $workerPython -m pip install playwright==1.64.1
& $workerPython -m playwright install chromium
& $workerPython scripts/cast_voice_smoke.py --model-dir .local-data/supertonic/sherpa-onnx-supertonic-tts-int8-2026-03-06
```

```bash
worker_python=.local-data/supertonic/venv/bin/python
"$worker_python" -m pip install playwright==1.64.1
"$worker_python" -m playwright install --with-deps chromium
"$worker_python" scripts/cast_voice_smoke.py --model-dir .local-data/supertonic/sherpa-onnx-supertonic-tts-int8-2026-03-06
```
