# React / Live2D 프런트엔드 구현 계약 (v0.3)

## 범위
- 기존 FastAPI Gateway와 진단 UI를 유지하며 별도 `apps/web` React/Vite 프런트엔드를 추가한다.
- 공식 Live2D Cubism SDK for Web 및 사용권이 확인된 모델을 사용한다. SDK/Core/모델을 저장소에 복사하거나 임의 URL에서 다운로드하지 않는다.
- SDK 또는 모델이 없으면 명확한 설치 안내를 표시하고 가짜 캐릭터 렌더링을 성공으로 표시하지 않는다.

## 구성
- `apps/web`: React + TypeScript + Vite, 인증된 Gateway 클라이언트, 모드 선택, 채팅, PTT, 전사 검토, 음성 재생, 아바타 캔버스.
- `avatar`: SDK adapter 인터페이스 (load, expression, motion, lipSync, dispose)와 오류 상태. React 컴포넌트는 Cubism 객체를 직접 소유하지 않는다.
- `audio`: 재생 clock/RMS를 렌더 프레임에 전달. 음성 종료·취소·모드 변경 시 lipSync=0.
- 서버의 scope/권한 정책은 변경하지 않으며 UI 모드 선택만으로 권한을 획득할 수 없다.

## 인수 기준
1. SDK/모델 누락 시 안전한 오류와 설정 가이드 표시.
2. 지원 모델의 expression/motion 그룹을 읽어 allowlist 매핑, 미지원 값은 무시.
3. 음성 재생 시 RMS 기반 lipSync, stop/dispose 후 0 및 이벤트/리소스 해제.
4. 마이크는 명시적 사용자 동작으로만 활성화, 전사 검토 후 전송.
5. Vitest: 모드 전환/취소, SDK 실패, 리소스 해제, 오래된 응답 무시.
6. CI: prettier check, eslint, TypeScript check, unit tests, Vite production build, 빌드 산출물 artifact.

## 단계
- F1: React/Vite 기본 앱과 API 계약/테스트.
- F2: 공식 Cubism SDK adapter 및 로컬 모델 설치 안내.
- F3: 실제 모델 렌더링, 모션/표정, 음성 RMS 립싱크.
- F4: Windows 실기기 음성/마이크 통합 시험과 성능 측정.

## 보안·라이선스
토큰을 localStorage나 로그에 영구 저장하지 않는다. SDK/캐릭터 사용 조건을 별도로 확인하고 배포 전에 라이선스 점검을 수행한다. 원격 공개는 현재 범위 밖이다.

작성 시점: 2026-10-29. 이 문서는 구현 계약이며 완료 보고가 아니다.
