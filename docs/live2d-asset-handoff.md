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

## 2026-11-02: 오디오/표정 브리지 (실제 렌더러는 미연결)

`apps/web/src/avatar-motion.ts`에 테스트 가능한 `AvatarMotionBridge`를 추가했다. 기존 `Player`의 정규화된 0~1 음성 레벨은 React에서 이 브리지로 전달된다. 현재 브리지에는 **렌더러가 부착되지 않았으므로 캐릭터 입모양이 움직이지 않는다.**

공식 SDK로 작성할 실제 `AvatarAdapter`는 `load(modelUrl)`, `setLipSync(level)`, `setExpression(name)`, `setMotion(group)`, `dispose()`를 구현해야 한다. `attach()`가 성공한 뒤에만 RMS 값을 전송하고, 중지·언로드 시 입 파라미터를 0으로 복구한다. 모션/표정은 검사한 모델의 실제 이름을 명시적으로 매핑해야 하며 임의의 `F01` 또는 `Idle`을 보편적인 이름으로 가정해서는 안 된다. 모델에 LipSync 그룹이 없으면 RMS 립싱크를 활성화하지 않는다. SDK 로딩이 취소되거나 뒤늦게 끝나도 상태가 되살아나지 않도록 단위 테스트한다.

React의 **모델 JSON 검사**는 이제 이 매핑에 필요한 표정 이름과 유효한 모션 그룹 이름도 표시한다. 이는 메타데이터 표시일 뿐 표정·모션 재생 또는 WebGL 렌더링 성공을 뜻하지 않는다.

공식 SDK 다운로드: https://www.live2d.com/en/sdk/download/web/ . 다운로드 시 공식 Proprietary/Open Software License Agreement를 직접 확인해야 한다. Cubism Core는 GitHub에 포함되지 않고 공식 SDK 다운로드 패키지에 동봉된다: https://docs.live2d.com/en/cubism-sdk-manual/cubism-core/ . SDK/모델 파일은 로컬 비공개 경로에 보관하고, 별도 허가 없이 GitHub에 푸시하지 않는다. 공식 SDK/Core/모델의 실제 버전·사용 조건을 확정한 후, 해당 버전의 샘플 API로 렌더러를 구현하고 Windows 실기기에서 검증한다.


## 2026-11-04: 모델별 의미 매핑 및 수동 동작 시험

참조 자산 HEAD 검사를 통과한 다음 React 아바타 패널에서 실제 `.model3.json`에 기록된 표정 이름과 비어 있지 않은 모션 그룹을 선택할 수 있다. 매핑의 기본값은 미연결이며, 사용자가 선택한 `neutral/happy/concerned/surprised`, `idle/nod/greeting`만 `AvatarMotionBridge.attach()`로 전달된다. 기존 연결 중 매핑을 바꾸면 먼저 렌더러를 정리하므로 새 설정을 적용하려면 재연결해야 한다. SDK 어댑터가 부착된 뒤에만 수동 표정·모션 테스트 버튼이 나타난다.

이 기능은 애니메이션 이름을 정확하게 전달하기 위한 **UI/계약 검증 경로**이다. SDK, 캐릭터, 실제 WebGL/표정/모션 시각적 검증을 대체하지 않는다.

## 2026-11-03: 비공개 Cubism 어댑터 연결 진입점

`apps/web/src/licensed-avatar.ts`에서 별도 설치한 ES 모듈 `/avatar-local/runtime/adapter.js`의 `createAvatarAdapter(canvas)`를 **사용자 버튼 클릭 시에만** 가져오는 진입점을 제공한다. 디스크 경로는 `apps/web/public/avatar-local/runtime/adapter.js`이며 `.gitignore`에 의해 Git 커밋에서 제외된다. React의 **참조 파일 접근 검사**에서 모든 참조 자산이 접근 가능해야 **로컬 Cubism 어댑터 연결** 버튼이 활성화된다. 모델 JSON·HEAD 검사 자체는 이 모듈을 실행하지 않는다.

모듈은 공식 Cubism Web SDK/Core에 맞춰 사용자가 별도로 제작해야 한다. `createAvatarAdapter(canvas)`가 반환하는 객체에는 `load(modelUrl): Promise<void>`, `setExpression(name): void`, `setMotion(group): void`, `setLipSync(level): void`, `dispose(): void`가 필요하다. `setLipSync` 입력은 0~1이고 실제 파라미터 ID는 모델의 LipSync 그룹에 맞춰야 한다. 표정/모션도 실제 모델 export에 있는 이름에만 매핑한다. UI 언로드/모드 전환 시 브리지를 해제하여 `dispose()`를 호출한다.

**이 연결 지점은 SDK 자체나 범용 Cubism WebGL 렌더러가 아니다.** Core, Framework, 모델, 실제 어댑터 구현은 아직 미제공이다. 로컬 모듈은 브라우저에서 실행되는 신뢰 코드이므로 출처·라이선스를 검증해야 한다. 성공 메시지는 `load()` 완료만 의미하고 WebGL 실제 화면, 립싱크·모션 및 사용자 PC 성능은 수동 검증이 필요하다.

## 2026-11-05: SDK 로딩 취소·부분 초기화 정리

로컬 어댑터의 `load(modelUrl, signal?)` 두 번째 매개변수로 표준 `AbortSignal`을 전달한다. 패널 언로드·모드 전환·기존 모델 교체 시 브리지가 먼저 `abort()`를 호출하고 `dispose()`로 리소스를 정리한다. 이미 취소된 비동기 로드가 늦게 완료되거나 취소 오류를 던져도 현재 모델을 준비 완료로 표시하지 않는다. 지원되는 SDK 로더는 `signal.aborted`를 검사하고 파일 가져오기·텍스처/모델 초기화 과정에서도 가능한 한 조기에 중단해야 한다.

기존 1인자 `load(modelUrl)` 어댑터는 호출 호환성을 유지하지만, AbortSignal을 무시하면 비동기 리소스 생성까지 중단된다는 보장은 없다. 이 경우 로컬 런타임의 `dispose()`와 자체적인 생성 토큰 검사가 반드시 필요하다. 모듈이 잘못된 메서드 집합을 반환하더라도 `dispose`가 있으면 정리를 시도한다. **이는 모의 단위 테스트 대상이며 실제 Cubism Core의 취소·리소스 해제 성공으로 볼 수 없다.**
