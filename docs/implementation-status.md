# 구현·검증 상태

2026-10-29 문서 우선 커밋 단계.

## 원격 상태

저장소 접근 대상 추가 후 README 원격 생성에 성공했다. 과거 HTTP 403으로 업로드하지 못했던 설명은 현재 차단 사유가 아니다. 이 문서 커밋은 설계·안내 문서만 포함한다. 구현 코드는 다음 기능별 커밋으로 가져온다.

## 준비된 소스와 재검증

이전 산출물 Git bundle에서 7410ec7(공통 엔진), cc869bd(음성 입력)를 복원했다. 이번 작업 환경에서 v0.2 전체 테스트를 다시 실행했다.

- `python -m pytest -q`: 56 passed.
- `node --test apps/diagnostics/tests/*.test.mjs`: 21 passed.

이는 Linux 작업 환경의 자동 테스트 결과다. HTTP/모델 공급자와 일부 장치 동작은 모의 객체를 사용한다. 실제 한국어 모델 추론, 브라우저 마이크, Windows/macOS, Mac mini의 동작·품질을 입증하지 않는다.

## 구현 범위

FastAPI 공통 엔진, 모드별 기억/권한, Ollama/Melo 어댑터, 개발용 진단 화면, WAV 재생/RMS/취소, 버튼식 음성 입력, whisper.cpp CLI 계약.

## 미완료

React/Live2D 실제 렌더링, VAD/WebSocket, 실제 Ollama/Melo/whisper 품질·지연, Windows/macOS 장치 시험, Codex·외부 API·일반 PC 제어, 공개 배포/다중 사용자.

이전 환경에서 브라우저 E2E는 관리자 정책 오류로 차단됐다. 이번 문서 단계에서 브라우저 E2E를 다시 통과한 것은 아니다. GitHub CI도 아직 결과를 확인하지 않았다.
