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

이미 열린 탭에 **설정 필요**가 표시되면 Render가 새 설정으로 시작한 뒤 **서비스 설정 다시 확인**을 누르세요. 인증에 실패했다면 같은 탭에서 올바른 토큰 링크를 열고 **연결**을 누르세요.

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

Windows에서 `.\scripts\check-readiness.ps1 -Provider cloud`를 실행하면 같은 PowerShell 환경의 키와 모델 ID 설정을 검사합니다. 둘 중 하나라도 빠지면 `Cloud API` 항목에 `FAIL`을 표시하고 종료 코드 1을 반환합니다. `PASS`는 두 값이 설정되었다는 뜻입니다. 키의 권한과 실제 답변은 웹에서 대화를 보내 확인하세요.

`-Provider cloud -LocalModel`로 서버를 시작할 예정이라면 점검 전에 `$env:LOCAL_LLM_ENABLED = "true"`를 설정하세요. 그러면 같은 명령으로 클라우드 설정과 Ollama 모델을 함께 점검합니다. `OLLAMA_MODEL`에 태그를 생략하면 Ollama의 기본 태그인 `latest`를 확인합니다.

## 아바타

**아바타 종류**에서 서린·하나·이솔 중 한 명을 선택하세요. 세 캐릭터의 원화와 인사·자기소개 음원이 웹 앱에 들어 있어 로컬과 Render에서 바로 보고 들을 수 있습니다. 하나는 개인 비서에서, 서린과 이솔은 개인 비서와 가상 소개팅에서 선택할 수 있습니다. 답변을 생성하거나 음성으로 읽는 동안에는 아바타 선택이 잠깁니다. 답변이 끝나거나 중지된 뒤에는 대화 기록을 유지하면서 다음 인물을 선택할 수 있습니다. 연결된 화면에서 서비스나 대화 모드를 바꾸면 마지막으로 선택한 내장 캐릭터로 새 대화를 시작합니다. [캐릭터와 모션 가이드](design/motion-characters.md)

**Live2D**는 현재 **loopback Gateway로 실행하는 사용자 PC 전용**입니다. 사용권이 확인된 모델 export 전체 폴더와 사용자가 직접 설치한 Cubism Core/Framework 및 `runtime/adapter.js`가 필요합니다. 이 저장소에는 완성된 공식 SDK 렌더러나 비공개 자산이 포함되지 않습니다. Render 같은 **공개 HTTPS 배포에서는 SVG로 원화 레이어를 합성하는 내장 캐릭터를 제공**하며, API 토큰이 있더라도 정적 모델 파일은 인증되지 않으므로 공개 제공하지 않습니다.

로컬 PC에서는 **웹 빌드·공개 저장소 밖의 폴더**를 `ASSISTANT_AVATAR_DIR`에 지정합니다.

```text
private-avatar-assets/
  Haru/
    Haru.model3.json
    ...모델이 참조하는 moc3, 텍스처, 표정, 모션 파일
  runtime/
    adapter.js
    ...어댑터가 사용하는 SDK/Core 파일
```

예를 들어 PC에서 `ASSISTANT_AVATAR_DIR=C:\\private-avatar-assets`로 지정하면 화면에는 `/avatar-local/Haru/Haru.model3.json`을 입력합니다. 파일은 현재 Gateway 컴퓨터에 있어야 합니다. **`apps/web/public/avatar-local/`에 넣으면 Vite 빌드시 `dist/`로 복사**되어 배포 산출물에 포함될 수 있으므로 권장하지 않습니다. Git 무시 설정만으로 빌드·배포 자산 유출을 막을 수 없습니다.

공개 배포에서 `ASSISTANT_PUBLIC_ORIGIN`과 `ASSISTANT_AVATAR_DIR`을 함께 설정하면 서버가 시작을 거부합니다. 또한 공개 Gateway는 번들된 웹 디렉터리에 `/avatar-local/` 파일이 존재하더라도 해당 URL에 HTTP 404를 반환합니다. 단, 이미 배포 산출물이나 외부 CDN에 자산 파일을 포함시켰다면 **서버의 URL 차단만으로 파일 복사본이 삭제되지는 않습니다.** 실제 자산을 공개하려면 모델·SDK의 재배포 허가와 인증된 자산 전달 방식을 별도 설계해야 합니다.

자세한 SDK 어댑터 계약은 [Live2D 자산 연결 안내](live2d-asset-handoff.md)를 참고하세요. 실제 Live2D 표시는 본인 자산으로 별도 확인해야 합니다.

## 저장·음성·검증 범위

클라우드의 대화 DB는 Render 서버에 있습니다. 재시작 후 보존하려면 해당 플랜의 영구 저장소와 `ASSISTANT_DATA_DIR`을 설정하세요. 로컬의 `local_private`, 클라우드의 `cloud_private`, 데모의 `demo` 데이터는 서로 섞지 않습니다.

자유롭게 입력한 대화 답변을 캐릭터별 목소리로 읽으려면 Gateway가 실행되는 컴퓨터에 Supertonic 2 모델과 워커를 설치하고 `TTS_PROVIDER=supertonic`을 설정하세요. MeloTTS 워커는 단일 한국어 목소리를 제공합니다. 마이크로 말한 질문을 글로 바꾸는 기능은 별도의 whisper.cpp와 다국어 모델을 사용합니다. Render에서도 로컬 음성 기능을 쓰려면 해당 서버에 실행 파일·모델과 워커가 있어야 합니다. [음성 워커 설치](../workers/tts-supertonic/README.md) · [한국어 음성 입력](../README.md#버튼식-한국어-음성-입력)
