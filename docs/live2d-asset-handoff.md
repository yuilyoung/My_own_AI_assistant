# Live2D 연결에 필요한 자산

현재 UI·API·음성 흐름은 구현되어 있지만 `UnavailableAvatar`가 실제 SDK를 대신하고 있다. 완성된 캐릭터 대화를 검증하려면 아래 자산이 필요하다.

## 전달할 파일

- 공식 **Cubism SDK for Web** 원본 압축파일: 버전/revision, Core, Framework, 포함된 라이선스·고지 파일을 유지한다.
- 사용할 캐릭터의 **실행용 export 전체 폴더**: `.model3.json`, 참조된 `.moc3`, 텍스처, 표정·모션, physics/pose 등 모델 JSON이 참조하는 부속 파일. `.cmo3` 원본만으로 브라우저 실행을 대신할 수 없다.
- 캐릭터 출처, 버전, 개인 로컬 테스트에 사용할 수 있는 조건. 사용 조건을 별도로 수락해야 하는 경우 사용자가 직접 확인한다.

기존 파일을 제공하거나, 공식 SDK와 선택한 공식 샘플 모델을 개인 로컬 검증에 사용하도록 지정할 수 있다. 확인된 자산은 비공개 로컬 경로에서 읽고 임의로 공개 저장소에 재배포하지 않는다. `.gitignore`는 SDK/모델 로컬 디렉터리를 제외한다.

## 확보한 뒤 진행할 작업

파일 목록·SHA-256·revision을 기록하고 실제 SDK API에 맞는 어댑터를 구현한다. 실제 모델의 파라미터/표정/모션 목록을 읽어 허용된 neutral/happy/concerned/surprised, idle/nod/greeting을 매핑한다. 없는 표정/모션을 임의로 성공 처리하지 않는다. 실제 렌더링, 음성 입모양, 취소·언로드, 오류 및 누락 자산 테스트를 수행한다.

`assets/manifest.example.json`은 기록 양식이며 현재 자동 로더가 아니다. 파일을 복사하는 것만으로 Live2D가 활성화되지 않는다. 실제 LLM/STT/TTS 가중치와 Windows 실기기 검증도 별도로 필요하다.

## 로컬 모델 JSON 사전 검사 (새 기능, 렌더링 아님)

1. 공식 SDK/Core 및 사용할 캐릭터의 이용 조건을 확인한다. Core·모델을 공개 Git 저장소에 커밋하지 않는다.
2. 내보낸 캐릭터 전체 폴더를 `apps/web/public/avatar-local/Haru/`처럼 사용자 PC에 둔다. 이 경로는 `.gitignore` 대상이다.
3. `cd apps/web; npm ci; npm run build`로 정적 자산을 포함해 빌드하고 로컬 Gateway를 시작한다.
4. React 화면의 **모델 JSON 검사**에 `/avatar-local/Haru/Haru.model3.json`처럼 실제 파일명을 입력한다.

**모델 JSON 검사**는 model3 메타데이터의 Moc·Textures·Expressions·Motions·LipSync 그룹을 읽고 안전한 상대 경로만 허용한다. 이후 **참조 파일 접근 검사**를 누르면 모든 고유 참조 파일에 동일 출처 `HEAD` 요청을 보내 서버의 접근 가능성을 확인한다. 파일이 없으면 HTTP 오류, SPA의 HTML fallback, 비어 있는 파일을 문제로 표시한다. `HEAD` 미지원 서버도 실패로 보고된다. **이 검사는 실제 파일 내용·MOC3 무결성, SDK/모델 버전 호환성, 사용권 충족, 실제 캔버스 렌더링, 표정·모션·립싱크 구동을 검사하지 않는다.** 두 검사 모두 통과하더라도 앱 완성으로 표시하지 않는다.

공식 Cubism Web Samples의 model3 예시: https://github.com/Live2D/CubismWebSamples/blob/develop/Samples/Resources/Haru/Haru.model3.json
공식 Core 안내: https://docs.live2d.com/en/cubism-sdk-manual/cubism-sdk-for-web/
