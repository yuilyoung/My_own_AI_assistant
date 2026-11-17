# 로컬·클라우드 서비스 전환

같은 웹 앱에서 **데모 / 로컬 Ollama / 클라우드 API**를 선택합니다. 클라우드 API를 설정해도 기존 로컬 기능이 사라지지 않습니다. 서비스 전환 시 진행 중인 생성·녹음·재생은 중지하고 새 대화를 시작합니다. 대화·기억·메모는 서비스별로 분리하며, 로컬에 저장한 내용을 클라우드로 자동 이전하지 않습니다.

## 어디서 실행하는가

| 접속한 웹사이트 | 로컬 Ollama의 위치 | 대화 저장 위치 |
|---|---|---|
| Windows의 `http://127.0.0.1:8765` | 같은 Windows PC | 그 PC의 `ASSISTANT_DATA_DIR` |
| Render의 공개 HTTPS 주소 | Render 서버 내부 | Render의 `ASSISTANT_DATA_DIR` |

Render에서 **로컬**을 선택한다고 집에 있는 PC의 Ollama에 연결되지는 않습니다. PC가 꺼져 있어도 사용하려면 Render에서 **클라우드 API**를 사용하세요. 로컬 PC에서 앱을 실행할 때는 로컬 Ollama와 클라우드 API를 함께 설정하여 화면에서 전환할 수 있습니다. **개인 비서/가상 소개팅**은 대화 모드이고 **로컬/클라우드**는 모델 실행 위치이므로 서로 별개입니다.

## 클라우드 LLM 설정

OpenAI 호환 Chat Completions API를 지원합니다. 키는 브라우저에 입력하지 않고 앱 서버에만 설정합니다.

| 환경 변수 | 값 |
|---|---|
| `CLOUD_API_KEY` | 제공자가 발급한 실제 API 키 |
| `CLOUD_MODEL` | 그 계정에서 사용할 수 있는 정확한 모델 ID |
| `CLOUD_BASE_URL` | 기본 `https://api.openai.com/v1`, 다른 호환 제공자는 해당 HTTPS API 기본 주소 |
| `LLM_PROVIDER` | 기본 선택: `demo`, `ollama`, `cloud` 중 하나 |
| `LOCAL_LLM_ENABLED` | 기본이 demo/cloud여도 같은 서버의 Ollama를 선택하려면 `true` |

현재 제공자 선택은 미정이며, 임의로 유료 요청을 보내지 않습니다. OpenAI를 사용하려면 본인 계정에서 [API 키](https://platform.openai.com/api-keys)를 발급하고 모델 접근/사용 요금을 확인하세요. ChatGPT 로그인이나 구독만으로 이 앱에 API 키가 자동 제공되지는 않습니다. 호환 제공자와 모델은 Chat Completions의 `response_format: json_schema` 엄격한 구조화 출력과 `max_completion_tokens`를 지원해야 합니다. 단순 텍스트 API나 JSON 객체만 지원하는 모델은 현재 지원하지 않습니다.

### Render

1. 서비스 **Environment**에 `CLOUD_API_KEY`, `CLOUD_MODEL`을 추가합니다.
2. OpenAI가 아닌 제공자를 쓰면 `CLOUD_BASE_URL`도 설정합니다.
3. `LLM_PROVIDER=cloud`를 설정하면 접속 직후 클라우드가 기본 선택됩니다. `demo`를 유지해도 키와 모델이 설정되면 화면에서 클라우드를 선택할 수 있습니다.
4. 기존 `ASSISTANT_PUBLIC_ORIGIN`, `ASSISTANT_TOKEN`을 유지하고 저장·재배포합니다.
5. 공개 주소를 열고 연결 토큰으로 접속한 뒤 **LLM 서비스 → 클라우드 API**를 선택하여 대화합니다.

키·모델이 없는 옵션은 비활성화하고 필요한 설정을 표시합니다. 옵션이 활성화되었다고 실제 모델 호출이 검증된 것은 아닙니다. 키의 권한·잔액·모델 ID·제공자 접속 상태에 따라 요청이 실패할 수 있으며, 이 경우 다른 모델이나 데모로 몰래 대체하지 않습니다. API 키/연결 토큰을 Git이나 채팅에 공유하지 마세요.

### Windows 로컬

기존 `scripts/setup.ps1`과 웹 빌드를 마친 뒤 `scripts/start.ps1 -Provider ollama`로 기존 Ollama 실행이 가능합니다. PC에서 클라우드도 사용하려면 위 클라우드 환경 변수를 **실행할 PowerShell 세션**에 설정하고 다음 중 하나를 실행합니다.

```powershell
# Ollama 기본 + 설정된 클라우드 API 선택 가능
.\scripts\start.ps1 -Provider ollama

# 클라우드 기본 + 이 PC의 Ollama도 선택 가능
.\scripts\start.ps1 -Provider cloud -LocalModel
```

Ollama 모델은 먼저 `ollama pull qwen3:4b` 등으로 준비해야 합니다. 모델 변경은 `OLLAMA_MODEL`을 사용합니다. `config/.env.example`은 예제이며 자동으로 읽히지 않습니다. 클라우드 키는 OS/서버의 환경 변수로 직접 전달하세요.

## 아바타

**기본 아바타**는 앱에 포함된 SVG 캐릭터입니다. 별도 모델 파일 없이 로컬·Render에서 보이며 답변의 표정·동작 신호와 재생되는 음성 레벨에 반응합니다. 이것은 Live2D 렌더러가 아닙니다. 음성이 비활성화된 경우 실제 음성에 맞춘 입모양 동기화는 발생하지 않습니다.

**Live2D**를 선택하면 기존 모델 검사와 SDK 어댑터 연결 화면을 사용합니다. 사용 가능한 캐릭터 export 전체 폴더, Cubism Core/Framework, 실제 렌더러를 구현한 `runtime/adapter.js`가 필요합니다. 이 저장소는 해당 비공개 파일이나 완성된 공식 SDK 렌더러를 포함하지 않습니다. 로컬·클라우드 모두 동일 출처 `/avatar-local/` 경로로 자산을 제공해야 합니다.

배포 서버에서 파일을 제공하려면 `ASSISTANT_AVATAR_DIR`을 다음 구조의 **서버 디렉터리 절대 경로**로 지정합니다.

```text
private-avatar-assets/
  Haru/
    Haru.model3.json
    ...모델이 참조하는 moc3, 텍스처, 표정, 모션 파일 전체
  runtime/
    adapter.js
    ...어댑터가 사용하는 SDK/Core 파일
```

예를 들어 `ASSISTANT_AVATAR_DIR=/var/data/private-avatar-assets`라면 웹 화면에는 `/avatar-local/Haru/Haru.model3.json`을 입력합니다. 폴더는 실제로 존재하고 앱 실행 계정이 읽을 수 있어야 합니다. 설정한 디렉터리 전체는 웹에 공개되므로 키·대화 DB·개인 문서를 넣지 마세요. 자산의 웹 제공이 허용되는 이용 조건인지 확인해야 합니다.

로컬은 본인 PC의 폴더를 지정합니다. Render는 지원되는 영구 디스크나 비공개 자산 공급 절차로 서버에 파일을 설치한 뒤 경로를 설정해야 합니다. 본인 PC의 폴더 경로를 Render 환경 변수에 넣어도 파일이 업로드되지는 않습니다. 캐릭터/SDK 파일은 Git과 기본 Docker 빌드에 포함하지 않습니다. 추가 자산이 없을 때도 기본 아바타는 사용할 수 있습니다.

자세한 SDK 어댑터 계약은 [Live2D 자산 연결 안내](live2d-asset-handoff.md)를 참고하세요. 실제 Live2D 표시는 본인 자산으로 별도 확인해야 합니다.

## 저장·음성·검증 범위

클라우드의 대화 DB는 Render 서버에 있습니다. 재시작 후 보존하려면 해당 플랜의 영구 저장소와 `ASSISTANT_DATA_DIR`을 설정하세요. 로컬의 `local_private`, 클라우드의 `cloud_private`, 데모의 `demo` 데이터는 서로 섞지 않습니다.

기존 whisper.cpp/MeloTTS는 앱 서버 쪽에 설치한 경우에만 사용할 수 있습니다. 이번 변경은 클라우드 음성 API를 추가하지 않습니다. 자동 테스트의 클라우드 응답은 가짜 HTTP 제공자로 검증하며, 실제 유료 API와 실제 Live2D 자산을 사용한 검증과 구분합니다.
