# 캐릭터별 한국어 음성

Supertonic 2는 CPU에서 응답의 한국어 문장을 읽습니다. 하나는 F4의 또렷한 발음에 밝은 음색과 리듬을 살렸습니다. 이솔은 F2의 맑은 음색으로 부드럽게 말하고, 서린은 F1으로 차분하게 말합니다. 미리듣기와 실제 대화는 같은 캐릭터별 음성 설정을 사용합니다. 모델은 사용자가 준비하고 워커를 실행할 때 한 번 불러옵니다. 게이트웨이 기본 설정은 `TTS_PROVIDER=none`입니다.

## 설치

1. 저장소 루트에서 Python 3.11 이상으로 전용 가상 환경을 만들고 워커 의존성을 설치합니다.

   ```powershell
   python -m venv .venv-supertonic
   .\.venv-supertonic\Scripts\python.exe -m pip install -r workers/tts-supertonic/requirements.txt
   ```

2. [Supertonic 2 INT8 모델 압축 파일](https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-tts-int8-2026-03-06.tar.bz2)을 다운로드합니다. 배포본의 SHA-256은 `8c74359f63edd5045d47747f65331f0f6dbcbc91d7e898dd756d631295fe3259`입니다. 가중치 사용 조건은 [OpenRAIL-M 모델 카드](https://huggingface.co/Supertone/supertonic-2)에서 확인할 수 있습니다.

   ```powershell
   Get-FileHash .\sherpa-onnx-supertonic-tts-int8-2026-03-06.tar.bz2 -Algorithm SHA256
   tar -xf .\sherpa-onnx-supertonic-tts-int8-2026-03-06.tar.bz2
   ```

3. 저장소 루트의 PowerShell에서 토큰을 생성하고 워커를 별도 프로세스로 실행합니다. 워커와 게이트웨이는 이 셸의 동일한 토큰을 사용합니다.

   ```powershell
   $env:SUPERTONIC_TOKEN = python -c "import secrets; print(secrets.token_urlsafe(32))"
   $env:SUPERTONIC_MODEL_DIR = (Resolve-Path .\sherpa-onnx-supertonic-tts-int8-2026-03-06).Path
   Start-Process .\.venv-supertonic\Scripts\python.exe -ArgumentList 'workers/tts-supertonic/server.py'
   .\scripts\check-readiness.ps1 -TtsProvider supertonic
   .\scripts\start.ps1 -TtsProvider supertonic
   ```

   Linux/macOS에서는 가상 환경의 `bin/python`으로 같은 의존성을 설치합니다. 저장소 루트에서 다음과 같이 모델 디렉터리와 토큰을 두 프로세스에 전달합니다.

   ```sh
   export SUPERTONIC_MODEL_DIR="$PWD/sherpa-onnx-supertonic-tts-int8-2026-03-06"
   export SUPERTONIC_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
   .venv-supertonic/bin/python workers/tts-supertonic/server.py &
   TTS_PROVIDER=supertonic ./scripts/start.sh
   ```

PowerShell의 `-Voice`도 사용할 수 있습니다. 명시한 `-TtsProvider`나 활성 `TTS_PROVIDER`가 우선합니다. 활성 설정이 없을 때 `-Voice`는 `SUPERTONIC_TOKEN`이 있으면 Supertonic을, 그 외에는 기존 Melo 워커를 선택합니다.

모델이 준비되면 워커가 로컬 8767 포트에서 요청을 받습니다. 게이트웨이는 각 대화 요청의 `voice` 값에 따라 같은 캐릭터 음성으로 응답의 모든 구간을 합성합니다. 생략하면 서린을 사용합니다. 하나는 도우미 모드에서 선택할 수 있습니다. 브라우저는 게이트웨이에서 44.1 kHz, 16비트 모노 WAV를 받아 재생합니다.

마이크 입력은 별도의 `whisper.cpp` 한국어 인식을 사용합니다. `WHISPER_CLI`와 다국어 `WHISPER_MODEL`을 지정하고 Windows 실행 명령에 `-Microphone`을 더하거나 Linux/macOS에서 `STT_PROVIDER=whisper_cpp`를 설정합니다. [기존 설치 및 검증 안내](../../README.md)
