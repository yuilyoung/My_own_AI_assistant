# React 로컬 대화 화면

Node.js 22 이상을 사용합니다.

```sh
npm ci
npm run format:check
npm run lint
npm test
npm run build
```

저장소 루트에서 Gateway를 시작하면 `apps/web/dist/index.html`이 있을 때 React 화면을 제공합니다. 콘솔의 토큰 주소를 열고 연결을 누르세요. 토큰은 React 메모리에만 유지됩니다.

화면: 비서/소개팅 모드, 채팅, PTT 녹음과 전사 검토, WAV 재생/RMS, 모드별 기억 저장·삭제, 비서 메모. 음성 기능은 Gateway의 STT/TTS 설정에 따라 활성화됩니다. 기본 demo는 고정 응답입니다.

개발 서버는 `npm run dev`로 실행하며 Gateway도 별도 실행해야 합니다. 포트 5173을 고정하고 같은 개발 출처의 Origin만 Gateway 출처로 변환합니다. 운영에서는 Gateway의 동일 출처 제공을 사용합니다.

공식 Cubism Framework 기반 렌더러와 React 연결을 제공합니다. SDK/Core/모델이 없으면 설치 안내가 표시됩니다. [공식 SDK·Haru 설치](../../docs/live2d-local-install.md)를 따라 `npm run avatar:install -- /path/to/sdk` 후 빌드하세요. 실제 Core 렌더링은 아직 검증하지 않았습니다. `assets/manifest.example.json`은 이전 기록 양식이며, 런타임 설정은 설치 도구가 생성하는 `public/avatar-local/manifest.json`입니다.
