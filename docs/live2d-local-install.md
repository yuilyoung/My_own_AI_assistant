# 공식 Cubism SDK / Haru 로컬 설치

연동 대상은 **Cubism SDK for Web 5-r.5**와 포함된 **Haru** 샘플이다. 앱의 코드는 실제 Framework API에 연결되지만, Core 없는 환경에서는 실제 렌더링 완료를 검증할 수 없다.

## 설치

1. [공식 SDK 다운로드](https://www.live2d.com/download/cubism-sdk/download-web/)에서 SDK 및 샘플 모델 사용 조건을 확인하고 Web 5-r.5 전체 압축파일을 받는다. 압축을 풀고 `Core/live2dcubismcore.min.js`, `Core/live2dcubismcore.d.ts`, `Framework/src`, `Framework/Shaders/WebGL`, `Samples/Resources/Haru`가 있는지 확인한다. GitHub Samples 저장소만 받으면 Core가 없다.
2. `apps/web`에서 다음을 실행한다. 경로에 공백이 있으면 따옴표로 감싼다.

   ```sh
   npm ci
   npm run avatar:install -- /path/to/CubismSdkForWeb-5-r.5
   npm run build
   ```

3. 저장소 루트에서 기존 Gateway를 재시작한다. Linux: `bash scripts/start.sh`, Windows: `scripts/start.ps1`. 연결 후 캐릭터가 실제로 표시되는지 확인한다.

설치 도구는 전체 SDK를 받거나 약관에 동의하는 작업을 대신하지 않는다. 공식 출처에서 받은 로컬 파일만 읽으며, 파일 누락 시 설치를 중단한다. 기존 설치 폴더가 있으면 덮어쓰지 않는다. 재설치 전 `apps/web/public/avatar-runtime`, `apps/web/public/avatar-local`을 별도 위치에 보관/이동한다.

생성된 두 폴더 및 빌드 산출물은 Git에서 제외된다. 설치된 Core·Framework 고지와 샘플 라이선스 고지를 함께 보존하며, `avatar-local/installation.json`에 설치 파일 SHA-256을 기록한다. 해시는 설치 파일 식별용이며 출처의 서명이나 권리 확인을 대체하지 않는다. 빌드 결과에는 설치한 자산이 포함되므로 공개 artifact로 업로드하기 전 배포 조건을 확인한다. 기본 CI에는 SDK/모델이 없으므로 포함되지 않는다.

## 표정·모션 매핑

`apps/web/public/avatar-local/manifest.json`은 설치 후 사용하는 설정이다. 기본은 검증 가능한 `idle → Idle[0]`만 연결한다. Haru의 F01~F08을 감정으로 임의 분류하지 않으며, nod/greeting에 대응하는 이름의 모션도 없다.

실제 렌더링으로 확인한 후 `emotionMappings`에 `neutral/happy/concerned/surprised → 모델 표정 이름`, `gestureMappings`에 `idle/nod/greeting → {"group": "그룹명", "index": 0}`을 추가하고 다시 빌드한다. 모델에 없는 매핑은 무시한다. neutral은 기존 표정 상태를 해제하고, idle은 이전 동작을 중단한다. 런타임은 모델의 LipSync 그룹에 선언된 파라미터만 제어한다.

## 검증 범위

- `npm test`: React/대화/설정 테스트와 별도의 SDK 경계 모의 테스트. 모의 테스트 통과는 실제 Core 렌더링의 증거가 아니다.
- `npm run avatar:install -- /path/to/sdk --compile-only`: 실제 Framework 소스로 런타임 번들만 컴파일한다. Core/모델 설치나 렌더링 검증을 수행하지 않는다. 전체 설치에서는 Core 선언 파일과 Framework를 함께 사용해 런타임 타입 검사도 수행한다.
- `npm run build`: React 타입 검사 및 운영 빌드. 선택형 런타임 소스는 설치 시 별도 번들링한다.
- 실제 설치 후: 캐릭터 표시, 리사이즈, idle, 확인한 표정·모션, 음성 입모양, 중지/모드 전환의 입 닫힘, 연결 해제와 재연결, 그래픽 컨텍스트 상실 후 재시도, 누락 텍스처 오류를 확인한다.
- 기존 브라우저 음성 검증: 루트에서 `.venv/bin/python scripts/react_smoke.py`. Playwright Chromium 대신 설치된 Chromium을 쓸 경우 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`에 실행 파일 경로를 지정한다. 이 검사는 자산 미설치 상태를 전제로 하며 실제 모델은 검증하지 않는다.

현재 클라우드에서는 공식 Core 다운로드 사이트가 네트워크 정책으로 차단되어 Core가 없다. 실제 Haru 렌더링/표정 확인은 보류 상태다. 공식 SDK 파일을 사용할 수 있게 되면 설치부터 이어서 검증한다.
