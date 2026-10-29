# 한국어 MeloTTS CPU 워커

Gateway의 `.venv`와 분리한 **Python 3.11** 환경을 사용한다. 공식 MeloTTS 소스는 `209145371cff8fc3bd60d7be902ea69cbdb7965a`로 고정한다. 이 안내의 Linux x86_64 의존성 설치는 검증했지만 실제 한국어 모델 추론은 다운로드 차단 때문에 아직 검증하지 않았다. Windows·macOS 실행은 별도 검증 대상이다.

## 별도 환경 설치

저장소 루트에서 실행한다. 가상환경은 checkout 밖에 두어 실수로 커밋하지 않는다.

```sh
python3.11 -m venv ../my-assistant-melo-env
../my-assistant-melo-env/bin/python -m pip install -r workers/tts-melo/requirements-cpu.txt
../my-assistant-melo-env/bin/python -m pip check
../my-assistant-melo-env/bin/python -m unidic download
```

MeloTTS 0.1.2가 고정한 Transformers 4.27.4는 Tokenizers 0.13.x를 사용한다. 해당 Tokenizers에는 Python 3.12 휠이 없으므로 Gateway가 Python 3.12더라도 TTS는 Python 3.11로 분리한다. 구형 Librosa 호환을 위해 NumPy/SciPy/Numba를 고정하고, `pkg_resources`가 필요한 코드 때문에 Setuptools 80.9.0을 사용한다. CPU Torch/Torchaudio 2.5.1을 명시하여 CUDA 의존성 설치를 피하고, upstream의 `torch.load` 호출과 Torch 2.6 이후 기본값 변경 문제를 분리한다. 저장된 체크포인트는 공식 출처만 사용한다.

이 파일은 검증한 직접 의존성의 버전 제약이며 전체 전이 의존성의 해시 잠금은 아니다. 멀티언어 라이브러리가 요구하는 Gradio 등도 설치되지만 이 워커는 Gradio 웹 서버를 실행하지 않는다.

## 다운로드 경로

한국어만 선택해도 upstream `melo.api`가 여러 언어의 텍스트 모듈을 미리 import하므로 일본어 UniDic 사전과 여러 토크나이저가 필요하다.

- `raw.githubusercontent.com`: UniDic 다운로드 메타데이터 및 NLTK 자료.
- `cotonoha-dic.s3-ap-northeast-1.amazonaws.com`: 공식 UniDic 3.1.0 사전 ZIP.
- `huggingface.co`: `myshell-ai/MeloTTS-Korean` 설정/체크포인트, `kykim/bert-kor-base` 및 언어별 토크나이저.
- `us.aws.cdn.hf.co`: 확인된 대형 모델 파일 리디렉션 호스트. 다른 공식 리디렉션이 나타나면 실제 요청을 확인해 환경 정책을 추가한다.
- `download.pytorch.org`, `pypi.org`, `files.pythonhosted.org`: 설치 패키지.

TLS/체크섬 검증과 환경 프록시를 유지한다. 403은 반복 요청이나 검증 해제로 해결하지 않는다.

## 실행

워커와 Gateway 프로세스에 같은 32자 이상의 무작위 `MELO_TOKEN`을 설정한다. 값은 로컬에서 생성하며 저장소·로그·채팅에 붙여 넣지 않는다. 두 프로세스를 동일한 부모 터미널에서 시작하면 환경변수를 상속할 수 있다.

```sh
export MELO_TOKEN="$(../my-assistant-melo-env/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export HF_HOME="$(pwd)/../my-assistant-models/huggingface"
export TRANSFORMERS_CACHE="$HF_HOME/hub"
export NLTK_DATA="$(pwd)/../my-assistant-models/nltk"
export MELO_DEVICE=cpu
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
../my-assistant-melo-env/bin/python workers/tts-melo/server.py
```

Gateway는 동일한 토큰 환경에서 `bash scripts/start.sh --provider ollama --voice`로 시작한다. 별도 터미널은 토큰 환경을 자동 상속하지 않으므로 로컬 보안 설정을 통해 같은 값을 전달해야 한다. 워커는 `127.0.0.1:8766`에 바인딩하며 브라우저가 직접 호출할 수 없다.

`GET /health`는 Bearer 인증 후 `{"status":"ready","provider":"melo"}`를 반환한다. 실제 KR 모델 초기화가 끝나야 워커 서버가 시작되지만 이 응답만으로 한국어 합성 품질을 판정하지 않는다. `POST /synthesize`에 짧은 한국어 문장을 보내 PCM16 WAV 형식·유한 샘플·길이와 실제 재생을 확인해야 한다.

## 이 클라우드에서 확인한 결과

2026-10-30 한국 시간 기준:

- `/workspace/shared/melo-env`: Python 3.11.17, CPU Torch 2.5.1, 고정 수치·토크나이저 패키지 및 공식 MeloTTS 설치 완료. 설치된 143개 패키지의 의존성 검사 통과.
- 한국어 BERT 토크나이저와 Melo 설정 JSON 다운로드 완료.
- 실제 `melo.api` import는 UniDic 사전 누락으로 중단. 공식 사전 다운로드는 위 S3 호스트에서 프록시 403.
- 한국어 체크포인트는 HF CDN으로 리디렉션되며 아직 다운로드 완료를 확인하지 못함. 한국어 WAV 생성·워커 가동·실제 오디오 검증은 **미완료**.
- 환경 네트워크 변경 적용 후 UniDic 다운로드, KR 체크포인트 로딩, 한국어 WAV 생성 순서로 재개한다. 설치 성공을 합성 성공으로 표시하지 않는다.

### 클라우드의 Python 3.11 준비 명령

기존 `uv`를 사용해 다음 경로로 격리 설치했다. `UV_SYSTEM_CERTS=true`는 시스템 CA 검증을 사용하며 검증을 끄지 않는다.

```sh
UV_PYTHON_INSTALL_DIR=/workspace/shared/python UV_CACHE_DIR=/workspace/shared/uv-cache UV_SYSTEM_CERTS=true uv python install 3.11.17
UV_PYTHON_INSTALL_DIR=/workspace/shared/python UV_CACHE_DIR=/workspace/shared/uv-cache UV_SYSTEM_CERTS=true uv venv --python 3.11.17 /workspace/shared/melo-env
UV_CACHE_DIR=/workspace/shared/uv-cache UV_SYSTEM_CERTS=true uv pip install --python /workspace/shared/melo-env/bin/python -r workers/tts-melo/requirements-cpu.txt
UV_CACHE_DIR=/workspace/shared/uv-cache uv pip check --python /workspace/shared/melo-env/bin/python
```

설치된 인터프리터는 `/workspace/shared/python/cpython-3.11.17-linux-x86_64-gnu/bin/python3.11`이다. 기존 `/workspace/shared/melo-env`가 있으면 가상환경 생성 단계를 반복하지 않고 패키지 설치·검사를 실행한다. 다운로드 검증에 사용한 캐시는 `HF_HOME=/workspace/shared/models/huggingface`, `TRANSFORMERS_CACHE=/workspace/shared/models/huggingface/hub`, `NLTK_DATA=/workspace/shared/models/nltk`를 사용한다. 이미 받은 한국어 토크나이저와 설정은 해당 HF hub 캐시에 있다. NLTK 자료 설치 완료는 아직 확인하지 않았다.

고정 requirements 파일로 실제 `uv pip install`을 실행해 142개 패키지를 해결하고 editable MeloTTS를 같은 SHA의 Git 고정 설치로 교체했다. 설치 환경의 `uv pip check`는 143개 패키지에서 충돌이 없음을 확인했다. Librosa는 Setuptools의 `pkg_resources` 사용 중단 예정 경고를 출력하지만 수치·CPU Torch·Transformers/Librosa import는 통과했다.
