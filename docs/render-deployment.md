# Render에서 외부 브라우저로 접속

첫 배포는 demo 고정 응답이며 실제 Ollama, 음성, 비공개 아바타 자산은 포함하지 않습니다.

1. 이 변경 사항을 GitHub에 반영하고 Render에서 해당 브랜치를 선택합니다.
2. Web Service의 Language/Runtime은 Docker, Root Directory는 비워 두고 Dockerfile Path는 `./Dockerfile`로 지정합니다. 빌드·시작 명령은 Dockerfile을 사용합니다.
3. Environment에서 다음 값을 설정합니다.
   - `ASSISTANT_PUBLIC_ORIGIN`: Render가 서비스에 지정한 정확한 `https://서비스명.onrender.com` 주소. 끝에 `/`를 넣지 않습니다. 이름만으로 주소를 추측하지 말고 Render 표시 주소를 확인합니다.
   - `ASSISTANT_TOKEN`: 비밀번호 관리자로 생성한 무작위 64자리 영숫자. 채팅이나 Git에 저장하지 않습니다.
   - `LLM_PROVIDER`: `demo`
   - `TTS_PROVIDER`: `none`
   - `STT_PROVIDER`: `none`
   - `PORT`: `10000`
4. 테스트에 사용할 플랜의 비용을 확인하고 배포합니다. Health Check Path를 지정한다면 `/`를 사용합니다. `/api/status`는 인증이 필요합니다.
5. 외부 브라우저 주소창에 `https://실제주소/#token=설정한토큰`을 직접 입력하고 연결합니다. 토큰은 배포 로그에 출력하지 않습니다.

첫 배포 뒤 주소를 확인할 수 있는 UI라면 환경 변수에 실제 주소를 넣고 다시 배포해야 합니다. 주소를 변경할 때도 이 값을 함께 바꿉니다.

기본 디스크는 임시 저장소입니다. 재시작·재배포 시 대화가 사라질 수 있습니다. 계속 사용하려면 Render 영구 디스크를 `/app/.local-data`에 연결하고 비용을 확인하세요. 실제 AI 응답은 Ollama를 같은 서버에 설치하거나 별도 API 제공자를 지원하도록 추가 개발해야 합니다.
