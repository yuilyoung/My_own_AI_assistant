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

## Live2D 모델 JSON 사전 검사

React 아바타 패널의 **모델 JSON 검사**는 캐릭터를 렌더링하지 않고 공식 `.model3.json`의 참조 목록·LipSync 그룹 메타데이터를 확인합니다. 사용권을 확인한 모델 export 폴더를 `public/avatar-local/Haru/`에 보관하고 `npm run build` 후 `/avatar-local/Haru/Haru.model3.json`을 입력하세요. 외부 출처·경로 탈출은 거부합니다. Core·SDK가 없어도 이 JSON 점검은 실행할 수 있지만 실제 Cubism 캔버스 렌더링, 입모양 동기화, 자산 존재/라이선스 검증을 대신하지 않습니다. Core·샘플 모델은 Git 저장소에 포함하지 않습니다.

## 검증된 자동 검사

[Web CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/40980055255)에서 formatter, lint, TypeScript, Vitest **29개**, Vite 빌드, 합성 STT/TTS 브라우저 E2E와 Windows Gateway 운영 smoke가 성공했습니다. [Python CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/40980055226)는 Linux/Windows Python 3.11/3.13 조합과 Ruff를 검증했습니다. 이는 검증된 PR 소스 기준 결과로, 사용자 Windows PC에서 실제 Ollama/whisper.cpp/MeloTTS 모델과 마이크를 시험한 결과가 아닙니다.
