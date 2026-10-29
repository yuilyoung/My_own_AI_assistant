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

Live2D SDK와 캐릭터가 없어 현재 아바타 영역에는 설치 안내가 표시됩니다. 실제 모델 렌더링·표정·모션·립싱크는 미구현입니다. `assets/manifest.example.json`은 설치 계약 예시이며 활성화 기능이 아닙니다.
