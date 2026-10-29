# 구현·검증 상태 — 공통 엔진 v0.1

2026-10-29. README/Read.md·기술 설계를 먼저 게시하고 원본 로컬 커밋 7410ec7의 구현을 반영한다. 문서 우선 이력을 만들었으므로 원격 커밋 SHA는 원본과 다르다.

## 포함한 구현

FastAPI 공통 엔진, 서버가 정한 모드별 기억 범위, 비서 메모 권한, 턴/generation 취소와 늦은 응답 폐기, Ollama 구조화 응답 및 MeloTTS HTTP 어댑터, SQLite, 개발용 진단 화면, WAV 재생·RMS 계산·중지, Windows/Unix 시작 스크립트, Windows/Linux CI 정의.

기본 demo는 고정 응답이며 TTS는 none이다. React/Live2D 캐릭터가 구현된 것으로 표시하지 않는다. 음성 입력 v0.2는 다음 기능 커밋이다.

## 이번 작업에서 재실행한 검증

- v0.1: `python -m pytest -q` → 40 passed.
- v0.1: `node --test apps/diagnostics/tests/*.test.mjs` → 9 passed.
- 후속 v0.2 원본도 별도로 실행: Python 56 passed, Node 21 passed. 아직 이 커밋의 기능은 아니다.

실제 한국어 모델·마이크·Windows/macOS 실기기 시험이 아니라 Linux 작업 환경의 자동 테스트다. 공급자 HTTP 및 장치 동작 일부는 모의 객체다. 이전 브라우저 E2E는 관리자 정책으로 차단됐으며 이번에 통과했다고 계산하지 않는다. CI 정의와 실제 GitHub Actions 결과는 별개다.

## 남은 범위

버튼식 STT 반영, React/Live2D 실제 렌더링, VAD/WebSocket, 실제 Ollama/Melo/whisper 품질·지연, Windows/macOS 장치 시험, Codex·외부 API·일반 PC 제어, 공개 배포/다중 사용자. 로컬 부분 구현이지 완성된 Live2D 앱이나 서비스 출시판이 아니다.
