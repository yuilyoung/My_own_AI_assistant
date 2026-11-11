# 구현·검증 상태 — React 음성·기억 통합

최종 작업 확인일: 2026-11-10 (한국 시간). 이 문서는 목표 설계와 실제 구현을 구분한다.

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
- React에서 로컬 Cubism model3 JSON의 참조 경로와 LipSync 그룹을 사전 점검할 수 있다. 별도 HEAD 검사로 고유 자산의 HTTP 접근 가능성·빈 응답·HTML fallback도 구분할 수 있다. SDK/Core 렌더러는 없다.

기본 실행은 **demo 고정 응답 / TTS none / STT none**이다. UI는 이를 실제 AI 대화로 표시하지 않는다. API 버전은 0.2.0을 유지하며 이번 작업은 React 통합이다.

## 초기 React 통합 검증 (2026-10-31 당시 기록)

| 검사 | 결과 |
|---|---|
| Python 전체 | 59 passed |
| 기존 Node 음성 모듈 | 21 passed |
| Vitest/React | **36 passed** (2026-10-31 PR CI, 8 files) |
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


## 2026-10-30 확장·검증 완료 (합성 입력 기준)

- `scripts/windows_smoke.py`와 `windows-latest` CI 잡을 추가했다. GitHub의 Windows 실행기에서 실제 Gateway 자식 프로세스를 띄워 React 운영 빌드, JS/AudioWorklet MIME, 인증 거부, demo 턴, 비서·소개팅 기억 격리를 검사했다. **사용자 PC 실기기 검증은 아니다.**
- `apps/web/src/model3.ts`는 공식 `.model3.json` 형식의 Moc/Textures/표정/모션/LipSync 그룹을 분석하고 원격 URL·경로 탈출·위험한 이름을 거부한다. React 아바타 패널의 **모델 JSON 검사**에 연결했고 성공/오류 UI 및 모델 메타데이터 단위 테스트를 추가했다. 실제 파일 존재·라이선스·Core 초기화·WebGL 렌더링·입모양 구동을 확인하지는 않는다.
- [PR #2](https://github.com/yuilyoung/My_own_AI_assistant/pull/2)를 자동 CI 검증 뒤 squash 병합했다. 검증 대상 PR 마지막 코드 SHA는 `c4f2e283b4c15b0e082cb1efb54760c2729a311f`, 병합 SHA는 [`99eb905`](https://github.com/yuilyoung/My_own_AI_assistant/commit/99eb90522da52dd737a8c8a8a44fa1a8f767f19f)이다.
- [Web CI #47](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/40980055255) **성공**: Prettier, ESLint, TypeScript/Vite 빌드, Vitest/React **29 passed (7 files)**, 합성 STT/TTS 기반 Chromium 운영 브라우저 E2E, Windows Gateway 운영 smoke. `web-dist` artifact **80,379 bytes**, artifact ID `12943984130`.
- [Local engine CI #72](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/40980055226) **성공**: Ruff formatter/lint, gateway wheel, Windows·Linux × Python 3.11/3.13 매트릭스. Python 단위 테스트 **59 passed**, upstream 경고 1건은 남는다.
- CI의 음성·브라우저·운영 Windows 검증은 demo 및 합성 공급자를 사용한다. 사용자 PC의 실제 Ollama/MeloTTS/whisper.cpp, 마이크·스피커, 한국어 품질·30분 안정성, 공식 Cubism Core/캐릭터 렌더링은 아직 미검증이다.

## 2026-10-31 추가 구현 및 GitHub Actions 검증

- [PR #3](https://github.com/yuilyoung/My_own_AI_assistant/pull/3)을 최종 CI 성공 뒤 squash 병합했다. 구현 커밋: [b18c30b](https://github.com/yuilyoung/My_own_AI_assistant/commit/b18c30b6d26fc3dec798f70b914215f753f5a671).
- `apps/web/src/model-assets.ts`: 로컬 `.model3.json` 파싱 후 실제 참조 자산에 **동일 출처 HEAD**를 전송한다. 외부 URL·폴더 탈출·리다이렉트를 허용하지 않고, 최대 4개 동시 요청으로 제한한다. HTTP 오류/빈 파일/HTML(SPA fallback) 응답을 문제로 표시하며 중단 신호를 처리한다.
- React `AvatarInspector`에 별도 **참조 파일 접근 검사** 버튼, 정상·실패 자산 수, 최대 10개 오류 표시를 추가했다. 기존 JSON 메타데이터 검사는 그대로 유지한다.
- [Web CI #67](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41152358783) **성공**: Prettier, ESLint, TypeScript/Vite 운영 빌드, Vitest/React **36 passed (8 files)**, Chromium 합성 음성 E2E, Windows Gateway 운영 smoke. `web-dist` artifact ID **13022654704**, **81,122 bytes**, 생성 확인.
- [Local engine CI #95](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41152358736) **성공**: Ruff 검사, Windows·Linux × Python 3.11/3.13 테스트(59 passed), Gateway wheel 산출물 ID **13023801633**, **15,267 bytes**.
- **검증의 한계**: 새 검사에서 성공은 HEAD 응답 상태만 검증한다. 파일 내용, MOC3 무결성, Core/SDK 버전 호환성, 사용권, WebGL 렌더링, RMS 립싱크 동작 및 사용자 PC의 실제 STT/LLM/TTS·마이크/스피커는 미검증이다. 원본 자산은 저장소에 포함하지 않았다.

## 2026-11-01 Windows 로컬 설치 준비도 점검

- [PR #4](https://github.com/yuilyoung/My_own_AI_assistant/pull/4): `gateway.readiness_cli` 및 `scripts/check-readiness.ps1`를 추가했다. React 운영 빌드, Ollama 로컬 모델 목록·메타데이터, whisper.cpp CLI/다국어 모델 파일, MeloTTS 인증된 `/health`를 확인한다. 외부 네트워크 호출, 모델 추론, 합성·녹음, 자산 다운로드는 수행하지 않는다.
- MeloTTS 워커에 인증을 요구하는 `GET /health`를 추가하고 성공·실패·모드 비활성화·토큰 출력 방지·실제 추론 미호출을 모의 테스트한다. Windows CI에서 demo 프로필 CLI를 별도로 실행한다.
- CI 중복 실행을 줄이도록 워크플로별 최신 브랜치 실행만 남기는 concurrency 정책을 추가했다. 단, 이미 대기 중이던 과거 실행까지 소급하여 정리되는 것은 아니다.
- **검증 완료**: [PR #4](https://github.com/yuilyoung/My_own_AI_assistant/pull/4) 코드 SHA `0c54ce8e4a4ed714330dde1f7d814097ccf9dfcc`에서 [Local engine CI #132](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41259268470) **성공**: Ruff 검사·wheel 빌드, Windows/Linux × Python 3.11/3.13 테스트 **64 passed**(Linux 3.11 기준), `gateway-wheel` artifact ID **13064113012**, **18,194 bytes**. [Web CI #95](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41259268428) **성공**: Prettier/ESLint/TypeScript/Vite, Vitest **36 passed**, 합성 음성 Chromium 브라우저 E2E, Windows Gateway 운영 smoke 및 준비도 CLI. `web-dist` artifact ID **13064362738**, **81,122 bytes**. 이 두 실행은 해당 PR 코드 SHA에서 확인했으며 이후 문서 전용 커밋의 실행을 대신하지 않는다.
- 실제 Windows 사용자 PC 모델·마이크·스피커, 한국어 품질, 30분 안정성 및 공식 Live2D 렌더링은 여전히 미검증이다.

## 2026-11-02 오디오 → 아바타 브리지 구현 (SDK 실물 미검증)

- [PR #5](https://github.com/yuilyoung/My_own_AI_assistant/pull/5) 병합 (코드 병합 SHA [`212ebb5`](https://github.com/yuilyoung/My_own_AI_assistant/commit/212ebb589accc6c874d62982211ed10d2bcb7111)): `AvatarMotionBridge`가 React `Player`의 정규화 RMS(0~1)를 `AvatarAdapter.setLipSync()`로 전달하도록 연결했다. 현재 렌더러 어댑터는 **부착되지 않았으며 실제 화면에 캐릭터가 나타나지 않는다.**
- 실제 모델 JSON의 표정·모션 이름에 대해서만 의미별 매핑을 허용한다. LipSync 그룹이 없으면 립싱크를 사용하지 않는다. 중지/언로드에서 입 값을 0으로 초기화하고 지연된 SDK 로딩이 이전 세션을 되살리지 않도록 독립 단위 테스트를 추가했다.
- `AvatarInspector`가 메타데이터의 표정 이름과 유효한 모션 그룹을 표시하도록 변경했다. SDK/Core/모델 파일, 실제 WebGL, PC 마이크·스피커는 이 PR에 포함하지 않았다.
- **PR 코드 SHA `16e63dadb8482bb2283d0a77080b814ef12c3a8c` 검증:** [Web frontend CI #114](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41367987806) 성공 — Prettier, ESLint, TypeScript/Vite, Vitest **41 passed (9 files)**, 합성 STT/TTS Chromium E2E, Windows 운영 Gateway smoke. `web-dist` artifact ID **13107828306**, **81,764 bytes**, 생성 확인. [Local engine tests #156](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41367987821) 성공 — Ruff, wheel, Windows/Linux × Python 3.11/3.13; Linux 3.11에서 **64 passed, upstream 경고 1건**; `gateway-wheel` artifact ID **13108260256**, **18,194 bytes**.
- 이 두 실행은 **PR 코드 SHA 기준**이다. GitHub Actions 자체가 검증한 Windows 실행기는 사용자 PC 실기기와 다르며, 공식 Cubism SDK/Core·모델 렌더링·립싱크 실동작, Ollama/whisper.cpp/MeloTTS 실제 품질은 여전히 미검증이다.

## 남은 필수 작업

**완성된 Live2D MVP가 아니다.** `UnavailableAvatar`는 안전한 대체 안내만 제공하며 실제 캐릭터 모델을 로딩하지 않는다. 현재 음성 레벨 막대는 캐릭터 입모양이 아니다.

공식 Cubism SDK/Core와 사용권을 확인한 모델 export가 필요하다. [자산 전달 안내](live2d-asset-handoff.md)에 파일 목록을 적었다. 확보 후 실제 SDK 어댑터, 모델 렌더링, 표정/모션 매핑, RMS 입모양, 리소스 해제 검증을 수행한다.

사용자 PC의 실제 Ollama/MeloTTS/whisper.cpp 설치·추론, 마이크/스피커·한국어 품질·지연·30분 안정성, macOS/Mac mini는 미검증이다. 인터넷 공개·다중 사용자·외부 API·Codex 자동 연동·VAD/WebSocket은 현재 범위 밖이다.

## 게시 방식

작업을 작은 로컬 커밋으로 나누고, 일반 git push의 자격 증명 부재 때문에 연결된 GitHub Git-data API로 같은 파일 트리를 main에 반영했다. 강제 업데이트 없이 예상 head를 확인했다. 이 방식에서는 로컬/원격 커밋 SHA가 다르며 파일 트리 SHA 일치로 소스 동일성을 검증한다.


## 2026-11-03 사용자 설치 Cubism 어댑터 진입점 (실제 모델 미검증)

- [PR #6](https://github.com/yuilyoung/My_own_AI_assistant/pull/6)을 CI 검증 뒤 squash 병합했다. 구현 병합 SHA: [19723cf](https://github.com/yuilyoung/My_own_AI_assistant/commit/19723cfe444ee9e1b87e6d9eb0225b44ce82a6b3).
- `apps/web/src/licensed-avatar.ts`는 버튼 클릭에 한해 `/avatar-local/runtime/adapter.js`에서 비공개 `createAvatarAdapter(canvas)` 모듈을 가져온다. 필수 메서드를 검증하며 미설치·잘못된 계약은 오류로 처리한다. Core·Framework·모델을 다운로드하거나 리포지토리에 포함하지 않는다.
- React 모델 패널은 JSON/HEAD 점검이 모두 성공한 경우에만 로컬 어댑터 연결을 허용한다. 기존 `AvatarMotionBridge`가 재생 음성 RMS를 어댑터로 전달하며 언로드 시 해제한다. 이 연결부는 **실제 SDK를 구현하지 않으며** 모의 어댑터 테스트로 검증했다. 사용자 신뢰 코드와 라이선스가 확인된 Core·SDK·모델 export가 여전히 필요하다.
- **PR 코드 SHA `31a049b24e6255dc6072376867c37e46c335e1a2`에서 검증**: [Web frontend CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41551784582) **성공** — Prettier·ESLint·TypeScript/Vite 빌드, Vitest **47 passed (10 files)**, Chromium 합성 마이크/STT/TTS E2E, GitHub Windows 운영 Gateway smoke. `web-dist` artifact **82,376 bytes** (ID `13193715673`) 생성 확인.
- [Local engine CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41551784460) **성공** — Ruff 검사 및 wheel, Windows/Linux × Python 3.11·3.13, Linux 3.11에서 **64 passed, upstream 경고 1건**. `gateway-wheel` artifact **18,194 bytes** (ID `13191697569`) 생성 확인.
- **미완료/외부 전제:** 공식 Cubism Web SDK/Core와 사용자 사용권이 확인된 캐릭터 및 실제 WebGL 렌더러 어댑터가 없으므로 아바타가 화면에 나타나거나 움직인다는 증거는 없다. Windows CI는 GitHub 호스팅 테스트 환경이며 사용자 PC의 실제 Ollama·whisper.cpp·MeloTTS·마이크·스피커 검증이 아니다. 실제 품질·지연·장시간 안정성도 미검증이다.


## 2026-11-04 모델별 표정·모션 연결 및 수동 호출 시험

- [PR #7](https://github.com/yuilyoung/My_own_AI_assistant/pull/7)을 CI 검증 후 squash 병합했다. 기능 병합 커밋: [1323095](https://github.com/yuilyoung/My_own_AI_assistant/commit/13230957b13a0144584079fb2ed6156ced8cccba).
- 기존 UI는 로컬 어댑터를 항상 빈 매핑 `{}`으로 부착하므로 실제 export의 표정/모션 그룹을 의미별로 지정할 수 없었다. 이제 모델 JSON과 동일 출처 HEAD 접근 검사를 통과하면, React에서 **중립·기쁨·걱정·놀람 / 대기·끄덕임·인사**를 실제 모델 이름에 명시적으로 연결할 수 있다. 모델에 없는 이름은 선택할 수 없다. 초기 설정은 모두 미연결이다.
- 로컬 어댑터가 성공적으로 부착되었을 때만 표시되는 테스트 버튼이 `AvatarMotionBridge.setExpression/setMotion`을 호출한다. 매핑을 바꾸면 기존 어댑터를 폐기하고 다시 연결하도록 한다. 이 동작은 모의 어댑터 기반 컴포넌트/React 테스트로 검증했으며 **공식 Cubism Core/Framework 또는 실제 모델을 포함하지 않는다.**
- **PR 코드 SHA `7595fe39809d31cf4300c760df65afca138bb046`의 검증:** [Web CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41746757438) 성공 — Prettier, ESLint, TypeScript, Vite build, Vitest **50 passed (11 files)**, Chromium 합성 음성 E2E, Windows demo Gateway smoke. `web-dist` artifact ID `13283698229` (**83,067 bytes**) 생성 확인.
- [Local engine CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41746757431) 성공 — Ruff, wheel 및 Windows/Linux × Python 3.11/3.13 매트릭스, Linux Python 3.11 기준 **64 passed, 1 warning**. `gateway-wheel` artifact ID `13283777562` (**18,194 bytes**) 생성 확인. 검증은 PR head SHA 기준이며 병합 뒤 main의 상태와 구분한다.
- **여전히 미완료:** 공식 Cubism SDK/Core 및 사용권을 확인한 캐릭터 export를 이용한 실제 WebGL 렌더러, 화면 속 표정·모션·RMS 입모양의 육안 동작 확인; 사용자 Windows PC의 Ollama·whisper.cpp·MeloTTS·마이크·스피커 통합과 한국어 품질·지연·장시간 안정성. GitHub의 Windows runner에서 통과한 demo 테스트를 사용자 실기기 검증으로 간주하지 않는다.

## 2026-11-05 로컬 SDK 비동기 로딩 취소·정리 (PR 코드 CI 검증 완료)

- `AvatarMotionBridge.attach`는 `AbortSignal`을 어댑터 `load`에 전달한다. 이전 연결 해제 시 초기화 중단을 요청하고, 늦은 로딩 성공·취소 오류가 준비 완료 상태를 다시 활성화하지 않도록 한다.
- 모델 메타데이터의 표정/모션 이름 검증이 실패해도 전달된 어댑터를 정리하며, 로컬 런타임 팩토리가 불완전한 객체를 반환하면 사용 가능한 `dispose`로 부분 생성 리소스를 정리한다.
- 신규 모의 단위 테스트는 비동기 취소·취소 후 오류·부정확한 계약 정리 경로를 검사한다. 실제 WebGL, 공식 SDK/Core, 캐릭터, 사용자 PC 음성 장치는 이번 변경에서도 미검증이다.
- **PR 코드 SHA [`cf59b91`](https://github.com/yuilyoung/My_own_AI_assistant/commit/cf59b91dbfcad78be8f10310ee736b4c8f9a616b) 기준 검증**: [Web frontend CI #153](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41940995781) **성공** — Prettier, ESLint, TypeScript/Vite 운영 빌드, Vitest/React **52 passed (11 files)**, Chromium 합성 STT/TTS E2E, GitHub Actions Windows demo Gateway smoke. `web-dist` artifact ID `13376138388` (**83,139 bytes**), 생성 확인.
- [Local engine tests #213](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/41940995547) **성공** — Ruff, wheel 패키지, Windows/Linux × Python 3.11/3.13 전체 검사. Python **64 passed**, Starlette/AnyIO 관련 upstream 경고 1건. `gateway-wheel` artifact ID `13376692263` (**18,194 bytes**), 생성 확인.
- 위 자동화는 모의 SDK/합성 음성/demo 기준이며 공식 Cubism Core의 WebGL 출력이나 사용자 소유 Windows PC의 로컬 LLM/STT/TTS·마이크·스피커를 검증하지 않는다. 이후 문서 전용 커밋은 별도 SHA이므로 검증 범위를 구분한다.

## 2026-11-06 수동 립싱크 검사·모드별 SDK 해제 (병합 및 main 검증 완료)

- [PR #9](https://github.com/yuilyoung/My_own_AI_assistant/pull/9)을 squash 병합했다. 구현 병합 커밋: [4081e52](https://github.com/yuilyoung/My_own_AI_assistant/commit/4081e522bd576696155d5efed031116b863c8c89).
- 사용권을 확인하고 **사용자가 별도로 설치한** Cubism 어댑터가 연결되며 model3에 LipSync 그룹이 있는 경우에만 수동 입모양 강도(0~1) 테스트를 제공한다. 강도값은 기존 `AvatarMotionBridge.onAudioLevel`로 전달하며, 조작 종료·포커스 이탈·닫기·언로드 시 0으로 되돌리도록 요청한다. LipSync 그룹이 없으면 해당 슬라이더를 표시하지 않는다.
- 개인 비서↔가상 소개팅 모드 전환 때 `AvatarInspector`를 다시 마운트하여 이전 모드의 어댑터·모델 검사·매핑 상태를 해제한다. 이 경로는 React의 모의 SDK 테스트로만 검증했다. 캐릭터 시각적 변화나 실제 GPU 자원 반환 검증은 **아니다**.
- 최종 PR 코드 SHA `e8772f02ccf9a694dd86167b1c874eab2cd9f979` 기준 [Web frontend CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42137704430) **성공**: Prettier·ESLint·TypeScript/Vite·Vitest **53 passed (11 files)**, Chromium 합성 음성 E2E, GitHub Windows Gateway demo smoke. [Local engine tests](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42137704417) **성공**: Ruff formatter/lint, wheel, Windows/Linux × Python 3.11/3.13, Linux 3.11에서 Python **64 passed**, upstream deprecation warning 1건.
- 병합 SHA `4081e522bd576696155d5efed031116b863c8c89` 기준 [main Web CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42137995991) 및 [main Python CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42137995848) **모두 성공**. main 산출물 `web-dist` **83,374 bytes** (artifact ID `13465398954`), `gateway-wheel` **18,194 bytes** (ID `13466646482`) 생성 확인.
- 기존 Prettier 실패는 포맷 자동 변경 diff를 임시 CI 진단으로 확인하고 **소스에 반영한 후 진단 단계를 제거**했다. 최종 CI는 다시 엄격한 `prettier --check`로 성공했다.
- **차단 요인/미검증:** 공식 Cubism SDK/Core, 사용권 확인된 캐릭터 모델 export 및 실제 `adapter.js` 구현이 저장소에 없다. 따라서 WebGL 캐릭터 실제 렌더링·표정·모션·립싱크 육안 확인, 사용자 Windows PC의 Ollama·whisper.cpp·MeloTTS·마이크/스피커 및 30분 안정성은 여전히 미완료다. 다음 우선순위는 해당 자산·런타임 확보 후 실제 모델로 렌더링과 취소/해제 검증, 이어서 Windows 실기기 음성 품질·성능 확인이다.

## 2026-11-07 오디오 재생 수명주기 보강 (PR #10 병합, PR CI 통과)

- 진단/React가 공유하는 `apps/diagnostics/player.mjs`에서 `AudioContext.resume()`가 대기하는 동안 사용자가 중지·모드 변경을 수행한 경우, 뒤늦은 unlock 이후 오디오를 디코딩하거나 새 소스를 만들지 않도록 generation/current 검사를 추가했다.
- 음성 재생이 자연스럽게 끝난 경우 `AudioBufferSourceNode.disconnect()`를 호출해 오디오 노드 연결을 정리한다. 명시적 중지에서는 `onended`를 해제하고 자체 정리하므로 늦은 이벤트가 상태를 건드리지 않는다.
- Node 회귀 테스트에 *resume 도중 중지*, *재생 종료의 노드 정리 및 입모양 0 복원* 두 시나리오를 추가했다. GitHub Actions의 `Local engine tests` 워크플로에서 Windows/Linux × Python 3.11/3.13 전체 및 Node 테스트가 성공했다.
- [PR #10](https://github.com/yuilyoung/My_own_AI_assistant/pull/10)을 [6162f93](https://github.com/yuilyoung/My_own_AI_assistant/commit/6162f9368eb0518ec23328534ec0296ddababeef)으로 squash 병합했다. PR head `d79d7affdec00b2a2a095b23efee5f85e2fc7652`의 [Web CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42316742803) 성공: frontend(build/formatter/lint/React/Chromium) 및 Windows demo Gateway smoke; `web-dist` 산출물 83,403 bytes (ID `13551700321`). [Local engine CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42316742786) 성공: Python matrix, Ruff, Node diagnostics 테스트; `gateway-wheel` 산출물 18,201 bytes (ID `13551405808`). **이 결과는 PR head 기준이며 병합 후 main의 별도 검증과 구별한다.**
- 이번 변경은 음성 재생 lifecycle에 한정되며 공식 Cubism Core/캐릭터/로컬 `adapter.js`와 실제 WebGL 렌더링을 구현하지 않는다. 사용자 Windows PC의 마이크·스피커와 Ollama·whisper.cpp·MeloTTS 실측도 미완료다.

## 2026-11-08 WebGL 컨텍스트 손실 복구 경계 보강 (PR #11 병합·CI 통과)

- React `AvatarInspector`가 `webglcontextlost` 이벤트에 반응하도록 수정했다. 외부 SDK 어댑터를 해제하고 음성 립싱크 전달을 정지하며, 진행 중인 로컬 런타임 팩토리 작업을 취소한다. 손실 상태에서는 재연결 버튼을 비활성화하고 `webglcontextrestored` 이후 사용자 재연결을 요구한다.
- 모의 SDK 및 브라우저 이벤트 기반 회귀 테스트 **3개**를 추가했다: 연결된 어댑터 정리·입모양 0 복귀·재연결 게이트, 비동기 팩토리의 지연 응답 폐기, GPU 손실로 외부 `dispose()`가 예외를 던져도 복구 UI 유지. 이는 SDK 실제 WebGL 출력 테스트가 아니다.
- [PR #11](https://github.com/yuilyoung/My_own_AI_assistant/pull/11)을 **[8ef35aa](https://github.com/yuilyoung/My_own_AI_assistant/commit/8ef35aafa43564da5689c2ff084b0aa4ae1d222f)**로 squash 병합했다. PR head `a52091ee820dd2cb235189871198196b8b4eed4b` 기준 [Web CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42430834716) 성공: Prettier, ESLint, TypeScript/Vite 빌드, Vitest **56 passed (11 files)**, Chromium 합성 STT/TTS 브라우저 E2E 및 GitHub 호스팅 Windows Gateway demo smoke. `web-dist` 산출물 **83,648 bytes** (artifact ID `13596943110`)를 생성했다.
- 같은 PR head 기준 [Local engine CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42430834784) 성공: Ruff, wheel 및 Windows/Linux × Python 3.11·3.13 매트릭스, Python **64 passed (upstream 경고 1건)**, Node 진단 **23 passed**. `gateway-wheel` 산출물 **18,194 bytes** (artifact ID `13596599153`)를 생성했다. 위 검증 결과는 PR head의 자동 테스트이며 사용자 실기기 검증이나 실제 GPU 강제 손실 검증이 아니다.
- **남은 차단 요인:** 공식 Cubism SDK/Core·사용권 확인된 캐릭터 모델·실제 `adapter.js`는 여전히 미포함. 실제 WebGL 복원·모델 렌더링·GPU 자원 반환, 사용자 Windows PC의 Ollama/whisper.cpp/MeloTTS·마이크·스피커·30분 안정성은 확인하지 않았다.

## 2026-11-09 음성 재생 시작 실패 복구 (PR #12 병합·PR CI 통과)

- `apps/diagnostics/player.mjs`: `AudioBufferSourceNode.start()` 또는 초기 분석 콜백 예외 시 오디오 소스/분석기 연결과 활성 프레임을 정리하고 입모양 레벨을 0으로 반환한다. 실패는 `play()`의 rejection으로 전파되어 React의 기존 텍스트 유지·오류 표시 경로가 작동하도록 한다.
- `apps/diagnostics/tests/player.test.mjs`: 첫 시작 실패 뒤 소스가 정리되고 다음 음성 재생이 가능한지 모의 AudioContext로 검증하는 회귀 테스트를 추가했다.
- [PR #12](https://github.com/yuilyoung/My_own_AI_assistant/pull/12)를 [4aa0a8d](https://github.com/yuilyoung/My_own_AI_assistant/commit/4aa0a8dbb32654f59e23936194952d3b7a769aee)로 squash 병합했다. PR head SHA `2b58c933bcd8dd8068bad78b986de0edcc812dbf` 기준 [Web CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42541109712) **성공**: Prettier, ESLint, TypeScript/Vite 빌드, React/Vitest **56 passed (11 files)**, Chromium 합성 음성 E2E 및 GitHub 호스팅 Windows Gateway demo smoke. `web-dist` artifact **83,704 bytes** (ID `13641472263`) 생성 확인.
- 같은 PR head 기준 [Local engine CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42541109741) **성공**: Ruff formatter/lint, Gateway wheel, Windows/Linux × Python 3.11·3.13 전체 매트릭스 통과. Linux 3.11에서 Python **64 passed, upstream 경고 1건**, Node 진단 **24 passed**. `gateway-wheel` artifact **18,194 bytes** (ID `13641770866`) 생성 확인.
- 이 결과는 CI의 모의 오디오 및 GitHub Windows runner 기준이다. 실제 Windows PC의 AudioContext 시작 실패 재현, Ollama·whisper.cpp·MeloTTS, 실제 마이크·스피커, 30분 안정성과 공식 Cubism WebGL 캐릭터 출력·립싱크는 **아직 미검증**이다.

## 2026-11-10 예기치 않은 마이크 장치 종료 복구 (PR #13 병합·main CI 통과)

- `apps/diagnostics/recorder.mjs`: 녹음 중 오디오 트랙의 `ended` 이벤트를 구독해 USB 장치 분리·입력 중단·권한 철회 등의 경우 녹음과 오디오 리소스를 해제한다. 정상 중지 시에는 이벤트 핸들러도 제거하며, 취소 후 지연된 `AudioContext.resume()`가 끝나도 AudioWorklet을 다시 시작하지 않도록 검사한다.
- `apps/diagnostics/voice-input.mjs`: 예기치 않은 마이크 종료를 세션 단위 취소·오류 표시로 연결하며, 이전 세션에 속한 지연 이벤트가 새 녹음을 중단시키지 않도록 generation으로 보호한다.
- `apps/diagnostics/tests/voice.test.mjs`: 모의 마이크 트랙 종료 후 리소스 반환, UI 상태 복구, 이전 녹음의 뒤늦은 종료 알림 무시, AudioContext 재개 대기 중 취소를 검증하는 Node 회귀 테스트를 추가했다.
- [PR #13](https://github.com/yuilyoung/My_own_AI_assistant/pull/13)을 검증 대상 head `42f274cefdbf0023e8bd412f3ea20e5661c09118`에서 자동 테스트 통과 후 [7a5c601](https://github.com/yuilyoung/My_own_AI_assistant/commit/7a5c601281a3c2947947646a7918656bb067d5e5)으로 squash 병합했다. 초기 Node 테스트에서 중복 `track.stop()` 호출을 발견하고 release를 멱등적으로 수정했으며 React Prettier 오류도 정리했다.
- 병합된 코드 SHA `7a5c601281a3c2947947646a7918656bb067d5e5` 기준 [main Web CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42731083237) **성공**: Prettier·ESLint·TypeScript/Vite 빌드, Vitest **57 passed (11 files)**, Chromium 합성 음성 E2E, GitHub Windows Gateway demo smoke. `web-dist` artifact **83,926 bytes** (ID `13723973885`) 생성 확인.
- 같은 병합 SHA 기준 [main Local engine CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42731083528) **성공**: Ruff formatter/lint, Gateway wheel, Windows/Linux × Python 3.11·3.13 매트릭스 전부 통과. Linux 3.11에서 Python **64 passed**(upstream 경고 1건) 및 Node 진단 **27 passed**. `gateway-wheel` artifact **18,194 bytes** (ID `13725415591`) 생성 확인.
- **검증 경계:** 자동화는 모의 `MediaStreamTrack.ended`와 합성 음성·GitHub 호스팅 Windows runner 기준이다. 실제 Windows USB 마이크 분리·OS 권한 변경·한국어 STT/TTS 품질·30분 사용은 미검증이다. 공식 Cubism SDK/Core·사용권 모델·WebGL 출력·립싱크도 여전히 미완료다. 이 문서 전용 후속 커밋은 위 병합 SHA 이후이므로 CI 증거 범위를 구분해야 한다.


## 2026-11-11 AudioWorklet 비정상 종료·PCM 오류 복구 (PR #14 병합·main CI 통과)

- `apps/diagnostics/recorder.mjs`: 마이크 녹음 중 `AudioWorkletNode.processorerror`를 감지해 활성 녹음을 취소하고 스트림/오디오 컨텍스트를 정리하며 사용자 오류 알림으로 전달한다. 워크릿에서 Float32 PCM 외 데이터를 전달하거나 30초 분량을 초과하면 기존의 조용한 취소 대신 오류를 알리고 음성 입력 UI가 대기로 돌아오도록 한다. 해제 시 프로세서 오류 리스너를 제거하며, 이전 세션에서 늦게 전달된 이벤트는 generation 검사로 무시한다.
- `apps/diagnostics/tests/voice.test.mjs`: 모의 AudioWorklet 처리기 실패의 단일 오류·리소스 정리, 잘못된 PCM 자료형 및 30초 초과 샘플에 대한 복구 테스트 2개 추가. **실제 브라우저 AudioWorklet 크래시나 사용자 PC 마이크를 재현한 테스트는 아니다.**
- [PR #14](https://github.com/yuilyoung/My_own_AI_assistant/pull/14)를 head `65469b0bbb40552ee1a58c1aeeabccf06ec1e000`의 자동 검사 통과 후 [7493d2f](https://github.com/yuilyoung/My_own_AI_assistant/commit/7493d2fb0681a5f32711714d5c582f16163bbd0d)로 squash 병합했다. 병합 코드 SHA 기준 [main Web CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42931948151) **성공**: Prettier, ESLint, TypeScript/Vite, Vitest **57 passed (11 files)**, Chromium 합성 STT/TTS E2E, GitHub 호스팅 Windows Gateway demo smoke. `web-dist` **84,022 bytes** (artifact ID `13816463128`) 생성 확인.
- 병합 코드 SHA 기준 [main Local engine CI](https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/42931948143) **성공**: Ruff 검사/포맷, wheel, Windows/Linux × Python 3.11·3.13 매트릭스. PR 검증 로그의 Ubuntu Python 3.11 실행 기준 Python **64 passed** 및 Node **29 passed**를 확인했다. `gateway-wheel` **18,194 bytes** (artifact ID `13816860853`) 생성 확인. **위 검사 수치는 PR head의 로그에 기반하며 main 실행의 개별 테스트 수를 재인용한 값은 아니다.**
- 실제 SDK/Core·사용권이 확인된 캐릭터 모델 및 `adapter.js` 기반 WebGL 렌더러는 여전히 미구현이며 가짜 렌더러를 제공하지 않는다. 사용자 Windows PC에서 실제 Ollama, whisper.cpp, MeloTTS, 마이크·스피커, 음성 지연·한국어 품질, 30분 안정성, SDK 모델 동작도 미검증이다.
- **다음 작업:** 공식 Cubism 5 SDK for Web의 버전 및 모델 사용 조건을 확인하고 로컬에 원본 SDK/Core와 실행용 모델 export를 설치한 다음, 신뢰할 수 있는 비공개 `adapter.js` 구현과 실제 캐릭터/입모양/모션 시각 시험을 수행한다. 사용자 PC 접근이 가능해지면 Windows 마이크/스피커 및 로컬 STT/TTS/LLM 연동 검증을 실시한다.
