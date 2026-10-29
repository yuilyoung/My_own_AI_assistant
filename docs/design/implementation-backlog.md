# 구현 백로그와 인수 기준

기준일: 2026-10-29. 최신 코드·CI 결과는 [구현 상태](../implementation-status.md)를 기준으로 확인한다.

## 구현한 범위

| 영역 | 구현·검증 |
|---|---|
| 계약·정책 | 엄격한 JSON/감정/동작 계약, 서버가 결정하는 scope, 소개팅 비서 도구 차단 |
| 로컬 API | 토큰, loopback, Host/Origin, 입력 크기, 세션별 오디오·전사 소유권 |
| 공통 엔진 | SQLite 기억·메모·대화, Ollama/MeloTTS/whisper.cpp 어댑터 |
| React | 모드 선택, 채팅, 취소, 기억 저장·삭제, 비서 메모, 공급자 상태와 오류 표시 |
| 음성 | 명시적 녹음, 최대 30초, PCM16 WAV, 전사 검토 후 직접 전송, 인증 오디오 재생/RMS |
| 취소 | 지연 응답·전사·오디오 폐기, 모드 전환·페이지 이탈·연결 해제, 폴링 오류 시 추론 취소 |
| 실행 | 운영 React 빌드 우선 제공, 진단 화면 override, Windows worklet MIME 지정 |
| CI | Python/Web formatter·lint, 타입 검사, 테스트, 빌드, 브라우저 통합, wheel/web 산출물 |

## 완성 전에 남은 필수 범위

1. 공식 Cubism SDK/Core와 사용할 모델 export 및 사용 조건을 확보한다. 필요한 파일은 [자산 전달 안내](../live2d-asset-handoff.md)에 정리했다.
2. 고정 모델 1개를 실제 렌더링하는 SDK 어댑터를 구현하고 모델의 motion/expression/LipSync 그룹을 허용 코드에 매핑한다.
3. 음성 RMS를 실제 입 파라미터에 연결하고 중지·모드 변경·언로드에서 0으로 복구한다.
4. 사용자 PC에서 실제 Ollama/MeloTTS/whisper.cpp 추론·마이크·스피커로 한국어 품질, 지연, 30분 대화, 워커 재시작·리소스 해제를 검증한다.

현재 아바타 영역의 안내와 음성 레벨은 실제 캐릭터 렌더러가 아니다. 합성 STT/TTS 브라우저 검증은 실제 모델 품질 검증을 대체하지 않는다.

## MVP 이후

VAD, WebSocket/문장 스트리밍, 상주 STT 워커, 할 일 관리, 데이터 삭제·백업, Codex 작업별 승인, Mac mini ARM64 이전·HTTPS·원격 인증. 인터넷 공개·다중 사용자 서비스는 현재 로컬 MVP 범위 밖이다.
