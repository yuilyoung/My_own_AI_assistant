# 구현·검증 상태 — React 음성·기억 통합

기준일: 2026-10-29 (한국 시간). 이 문서는 목표 설계와 실제 구현을 구분한다.


## 이번 작업: 공식 Live2D 연동 코드 (2026-10-29)

사용자가 공식 SDK·샘플 모델 진행을 선택했다. 공식 Cubism Web 5-r.5 Framework 어댑터, React 캔버스 수명주기, 로컬 설치 도구, 응답 표정/모션 전달, 음성 RMS 립싱크 연결을 구현했다. 샘플은 Haru이며 기본 매핑은 확인 가능한 Idle[0]만 사용한다. 실제 표정의 의미를 확인하기 전 감정/인사 매핑을 임의로 채우지 않는다.

- 공식 소스: Samples `ed1e0b714826d92469b9e51cacc3346f4e393f03`, Framework `d4da0aa07e47d2c1e4f5fa7ea6047861ea5e5d0b`.
- 현재 변경 기준 Python 59, 진단 음성 21, 웹/설치 도구 29, SDK 경계 모의 테스트 12 통과. 총 121개.
- 웹 lint/format/타입 검사/운영 빌드, Python lint/format, 실제 Framework 대상 런타임 번들 컴파일 통과.
- 설치된 Chromium으로 운영 React 합성 음성 E2E 통과. 자산 미설치 안내와 기존 대화/기억/전사 검토/음성 재생/RMS/모드 취소 검증. 404 자산 요청은 미설치 상태에서 예상된 결과다.
- **Core는 미설치이며 실제 캐릭터 렌더링·표정·입모양은 아직 미검증이다.** Core 없는 공식 GitHub 체크아웃으로 설치를 시도하면 누락 파일을 명시하고 중단하는 것을 확인했다. SDK 전체 설치 경로의 타입 검사는 Core 선언 파일이 확보된 뒤 실행된다.
- Core 공식 다운로드 사이트는 현재 프록시 정책에서 403이다. [로컬 설치 안내](live2d-local-install.md)의 SDK 전체 압축파일이 필요하다.

아래 React 음성 통합 CI 기록은 이전 커밋의 증거다. 이번 Live2D 변경의 원격 CI 또는 실제 모델 검증 결과로 해석하지 않는다.

## 현재 구현

- FastAPI Gateway: loopback 바인딩, 토큰, Host/Origin, 입력 크기와 세션별 리소스 소유권 검사.
- SQLite: 대화·기억·비서 메모. 비서/소개팅 scope를 서버에서 결정하고 소개팅의 비서 도구 접근을 차단한다.
- React/TypeScript: 공급자 상태와 demo 고지, 모드 선택·채팅·중지, 승인한 기억 저장·삭제, 비서 메모.
- 기존 음성 모듈을 React에서도 공유한다. 명시적 PTT, AudioWorklet PCM 수집, 16kHz 모노 PCM16 WAV, 최대 30초, 전사 검토 후 직접 전송.
- 인증 WAV 재생, RMS 레벨 표시, 재생 중지, 모드 전환·페이지 이탈·연결 해제 시 녹음·전사·응답·오디오 취소.
- 지연된 턴 생성 ID를 받아 서버에 취소 요청하며, 폴링 오류에서도 실행 중인 추론을 취소한다. 오래된 응답·기억 목록은 새 모드에 반영하지 않는다.
- Ollama 구조화 응답, 별도 MeloTTS 워커, whisper.cpp 실행 어댑터. 실제 모델 가중치는 포함하지 않는다.
- Gateway가 운영 React 빌드를 우선 제공한다. 빌드가 없으면 진단 UI로 실행하며 `ASSISTANT_WEB_DIR`로 명시적 경로를 지정할 수 있다.
- Windows의 레지스트리 MIME 설정과 무관하게 `.mjs`를 JavaScript로 제공한다.

기본 실행은 **demo 고정 응답 / TTS none / STT none**이다. UI는 이를 실제 AI 대화로 표시하지 않는다. API 버전은 0.2.0을 유지하며 이번 작업은 React 통합이다.

## 검증

| 검사 | 결과 |
|---|---|
| Python 전체 | 59 passed |
| 기존 Node 음성 모듈 | 21 passed |
| Vitest/React | 14 passed |
| Prettier / ESLint / TypeScript | 통과 |
| Ruff formatter / lint | 통과 |
| Vite 운영 빌드 | 통과, 별도 capture-worklet `.mjs` 생성 |
| Gateway wheel 빌드 | 통과 |
| Windows·Linux × Python 3.11·3.13 CI | 통과: [40874171930](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/40874171930) |
| Chromium 운영 음성 E2E | 통과: [40874172006](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/40874172006) |

로컬 검증 환경: Linux / Python 3.12 / Node 22. Starlette/AnyIO의 upstream deprecation warning 1건은 남아 있다. 로컬 Chromium 다운로드는 실패했으며 브라우저 검증은 GitHub Actions에서 수행한다.

브라우저 테스트는 테스트 전용 서버의 합성 STT/TTS와 명시적인 비무음 WAV 마이크 입력을 사용한다. 실제 AudioWorklet·업로드·전사 검토·사용자 전송·WAV 재생/RMS·모드별 기억을 검사하지만 실제 한국어 인식 품질과 모델 추론은 검사하지 않는다. 운영 Gateway에는 이 합성 공급자를 추가하지 않았다.

코드 기준 SHA: `bf6b545051a03deb1d1e38d09735e651ed601337`. 두 워크플로 모두 성공했고, `web-dist`(78,873 bytes), `gateway-wheel`(15,268 bytes) artifact가 만료되지 않은 상태로 생성됨을 API로 확인했다. 상세 실행·artifact digest는 [CI 증거 JSON](validation/react-voice-ci.json)에 기록했다. 이후 문서 전용 커밋의 검증 결과는 해당 커밋의 Actions에서 확인한다.

## 수정한 문제와 검증 방법

1. 지연 생성/모드 전환: Vitest에서 늦은 턴과 기억 응답을 반환하고 새 모드에 반영되지 않으며 턴이 취소되는지 확인했다.
2. 폴링 실패의 고아 추론: 실패 회귀 테스트를 먼저 확인하고 서버 취소 요청을 추가해 전체 14개 웹 테스트를 통과했다.
3. Windows worklet MIME: CI에서 `text/plain` 실패를 확인했다. Linux에서도 MIME 맵을 잘못된 값으로 설정해 재현한 뒤 명시적인 JavaScript 매핑으로 수정했다.
4. E2E 기억 선택자: 삭제 버튼 텍스트가 합쳐져 정확한 문자열 선택이 실패했다. 기억 listitem으로 검사 범위를 지정했다.
5. E2E 음성 입력: 422 실패를 진단 로그로 업로드 경계까지 추적했다. 기본 가상 마이크 대신 고정 WAV를 지정했고 16kHz, 7,523 frames, 비무음 PCM 업로드와 전사 검토를 확인했다.
6. E2E 재생 검사: 문자열 JavaScript 평가가 운영 CSP에 차단되어 DOM 속성 assertion으로 변경했다. 운영 CSP를 완화하지 않고 RMS 상승·0 복귀와 전체 브라우저 검증이 통과했다.

## 남은 필수 작업

**완성된 Live2D MVP가 아니다.** 선택형 공식 Framework 렌더러 코드는 추가했지만 실제 Core와 모델을 설치해 화면을 검증하지 못했다. 자산 미설치 상태의 안내와 음성 레벨 막대는 캐릭터 렌더링 증거가 아니다.

공식 Cubism SDK/Core와 사용권을 확인한 모델 export가 필요하다. [자산 전달 안내](live2d-asset-handoff.md)에 파일 목록을 적었다. 확보 후 구현한 SDK 어댑터의 실제 렌더링, 표정/모션 매핑, RMS 입모양, 리소스 해제를 검증한다.

사용자 PC의 실제 Ollama/MeloTTS/whisper.cpp 설치·추론, 마이크/스피커·한국어 품질·지연·30분 안정성, macOS/Mac mini는 미검증이다. 인터넷 공개·다중 사용자·외부 API·Codex 자동 연동·VAD/WebSocket은 현재 범위 밖이다.

## 게시 방식

작업을 작은 로컬 커밋으로 나누고, 일반 git push의 자격 증명 부재 때문에 연결된 GitHub Git-data API로 같은 파일 트리를 main에 반영했다. 강제 업데이트 없이 예상 head를 확인했다. 이 방식에서는 로컬/원격 커밋 SHA가 다르며 파일 트리 SHA 일치로 소스 동일성을 검증한다.
