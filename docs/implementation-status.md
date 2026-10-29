# 구현·검증 상태 — 공통 엔진 + 음성 입력 v0.2

기준일: 2026-10-29. 이 문서는 목표 설계와 실제 구현을 구분한다.

## GitHub 반영 순서

| 순서 | 내용 | 원격 커밋 |
|---|---|---|
| 1 | README 초기화 | a9a03e21bcab2a7669a6729a08577ea21ab94014 |
| 2 | Read.md·기술 설계·출처·백로그 | c091965605a0b1e20cc68cbbb382c19b854df0ce |
| 3 | 공통 엔진·진단 UI·테스트 | 4e57373fc247b58ffe9b80f9ba05606f365d98f9 |
| 4 | 버튼식 한국어 음성 입력 | 이 문서를 포함하는 feat 커밋 |

문서를 먼저 main에 게시한 뒤 구현을 두 커밋으로 나눴다. GitHub 연결의 저장소 접근 대상이 추가되어 쓰기에 성공했다. 과거 HTTP 403은 현재 차단 사유가 아니다. 변경은 GitHub Git-data API를 통해 커밋과 main ref에 직접 반영하며 강제 업데이트하지 않는다.

원본 로컬 구현은 7410ec7(공통 엔진), cc869bd44a0a603f4abcefffdd94c420393eb0fc(음성 입력)이다. 문서 우선 이력을 만들면서 원격 커밋 SHA는 바뀌었다. README/Read.md/docs는 저장소용 통합 문서로 정리했고, 코드·테스트·설정·워크플로의 모든 파일은 원본과 Git blob/tree 해시가 일치함을 확인했다. 검증 기록은 [validation/publish-v0.2.json](validation/publish-v0.2.json)에 남겼다.

## 포함한 구현

- FastAPI Gateway, loopback 바인딩, 인증 토큰, Host/Origin·입력 크기 검사.
- SQLite 세션·기억·메모, 서버가 결정하는 비서/소개팅 scope, 소개팅의 비서 도구 접근 차단.
- 턴/generation 취소, 오래된 응답·오디오 폐기, 모드 전환 시 입력창 초기화.
- Ollama 구조화 응답 어댑터, 별도 MeloTTS 워커 및 HTTP 어댑터.
- 개발용 HTML/JavaScript 진단 화면, Web Audio 재생·RMS·중지.
- 명시적인 버튼식 마이크 입력, AudioWorklet PCM 수집, 16kHz 모노 PCM16 WAV 변환.
- whisper.cpp 자식 프로세스 연결, 세션별 전사 작업·취소·시간초과·임시 파일 정리.
- 전사 결과를 사용자에게 보여주고 확인 후 직접 전송하는 흐름. 자동 채팅 제출 없음.
- Windows/Unix 실행 스크립트와 Windows/Linux GitHub Actions 정의.

기본은 demo 고정 응답, TTS none, STT none이다. 실제 AI가 대화하거나 Live2D 캐릭터가 연결된 것처럼 표시하지 않는다. 모델 가중치·캐릭터·Cubism Core·API 키는 포함하지 않는다.

## 이번 게시 작업의 재검증

| 검사 | 결과 |
|---|---|
| 공통 엔진 v0.1 Python | 40 passed |
| 공통 엔진 v0.1 Node | 9 passed |
| 음성 입력 포함 v0.2 Python | 56 passed |
| 음성 입력 포함 v0.2 Node | 21 passed |
| Python compileall | 성공 |
| 원격·로컬 소스 동일성 | 문서 제외 11개 루트 항목과 모든 하위 소스 해시 일치 |
| 공통 엔진 GitHub Actions | 성공: https://github.com/yuilyoung/My_own_AI_assistant/actions/runs/40829345874 |
| 음성 입력 GitHub Actions | 이 커밋 게시 후 확인 필요 |

로컬 검증 환경은 Linux / Python 3.13 / Node 22이다. 자동 테스트에서 외부 모델 HTTP, whisper 프로세스, 마이크 등은 모의 객체를 사용한다. GitHub CI의 Windows 실행도 실제 마이크·모델·음성 품질 시험은 아니다.

실제 whisper 한국어 모델·Ollama·MeloTTS 추론, 브라우저 마이크, Windows/macOS 실기기 품질·지연은 미검증이다. 이전 브라우저 E2E는 관리자 정책 오류로 차단됐으며 이번에 통과한 것으로 기록하지 않는다. 이전 HTTP smoke 수치를 이번 게시 작업에서 새로 실행한 테스트로 합산하지 않는다.

## 남은 범위

React 화면과 실제 Live2D 모델 로딩·표정·모션·입모양 연결이 아직 없다. 지금 화면의 원형 AI 표시와 RMS 막대는 진단용이며 캐릭터 렌더러가 아니다. 자동 발화 감지/VAD, WebSocket, 상주 STT 워커, Codex·외부 API·일반 PC 제어, Mac mini 이전·HTTPS·원격 인증, 공개 서비스/다중 사용자도 후속이다.

다음 구현 단위는 권리를 확인한 고정 모델 한 개와 공식 Cubism Web 런타임을 연결하고, 실제 음성 재생 시각/RMS로 입 파라미터를 제어하는 화면이다. 실제 장치·모델 테스트 전에는 완성된 Live2D MVP 또는 배포 가능 제품으로 판단하지 않는다.
