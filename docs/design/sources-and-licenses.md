# 구성요소 출처와 라이선스 확인 기록

2026-10-29 설계의 출처를 저장소용으로 정리했다. 이 문서는 법률 자문이나 배포 허가서가 아니다. 실제 고정 revision, 모델·부속 사전·목소리·캐릭터의 조건을 배포 전에 다시 확인한다. 이번 구현에는 모델 가중치·Cubism Core·캐릭터 파일을 포함하지 않는다.

## 기본 구성

| 구성요소 | 공식 출처 | 프로젝트의 사용 범위 |
|---|---|---|
| Live2D Cubism SDK | https://www.live2d.com/en/sdk/about/ | 계획한 브라우저 캐릭터 런타임 |
| Cubism Web Framework | https://github.com/Live2D/CubismWebFramework | 공식 구현 참조, Core와 같은 라이선스로 취급하지 않음 |
| whisper.cpp | https://github.com/ggml-org/whisper.cpp | 로컬 STT 실행 파일·다국어 모델 별도 설치 |
| Ollama | https://github.com/ollama/ollama | 로컬 LLM 서버, 모델 라이선스 별도 |
| Qwen3-4B | https://huggingface.co/Qwen/Qwen3-4B | 소형 초기 기준 모델 후보, 성능 미측정 |
| MeloTTS | https://github.com/myshell-ai/MeloTTS | 별도 한국어 TTS 워커 |
| MeloTTS Korean | https://huggingface.co/myshell-ai/MeloTTS-Korean | 실제 가중치/부속 파일의 조건도 확인 |
| Silero VAD | https://github.com/snakers4/silero-vad | 후속 발화 감지 후보 |
| FastAPI | https://github.com/fastapi/fastapi | Gateway |
| Pydantic | https://github.com/pydantic/pydantic | 계약 검증 |
| React | https://github.com/facebook/react | React 대화 UI, 진단 화면과 별도 |
| Vite | https://github.com/vitejs/vite | React UI 개발·운영 빌드 |

whisper.cpp/Ollama/MeloTTS/Silero의 코드 라이선스 및 Qwen/Melo의 모델 카드 검토는 초기 선정의 근거다. 같은 제품 이름 아래 코드·런타임·가중치의 조건이 항상 같지는 않다. 실제 배포 파일 목록과 해시 기반으로 고지를 작성해야 한다.

## Live2D의 별도 배포 관문

- SDK 배포: https://www.live2d.com/en/sdk/license/
- 확장형 애플리케이션 분류: https://www.live2d.com/en/sdk/license/expandable/
- Core: https://docs.live2d.com/en/cubism-sdk-manual/cubism-core/
- 샘플 모델별 조건: https://www.live2d.com/en/learn/sample/
- 립싱크: https://docs.live2d.com/en/cubism-sdk-manual/lipsync/

고정 캐릭터 한 개라고 해서 계약 면제라고 단정하지 않는다. Core·Framework·모델·그림·목소리를 하나의 오픈소스 라이선스로 묶지 않는다. 개인 기술 검증과 공개/상업 배포를 구분한다.

## 참고 프로젝트

Open-LLM-VTuber: https://github.com/Open-LLM-VTuber/Open-LLM-VTuber

프런트엔드 라이선스: https://github.com/Open-LLM-VTuber/Open-LLM-VTuber-Web/blob/main/LICENSE

프로젝트 전체를 일반 MIT/Apache 코드로 가정하지 않는다. 이번 소스는 전체 포크가 아니며 프런트엔드의 상업 이용 조건을 회피하기 위한 복제도 하지 않는다.

## 실행·API 문서

- Ollama 로컬 설정: https://docs.ollama.com/faq
- Ollama chat 계약: https://docs.ollama.com/api/chat
- MeloTTS 설치: https://github.com/myshell-ai/MeloTTS/blob/main/docs/install.md
- 마이크 보안 출처: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- FastAPI WebSocket: https://fastapi.tiangolo.com/advanced/websockets/

설치 문서의 예제가 현재 Windows/macOS 또는 Python 조합에서 검증됐다는 뜻은 아니다. 음성 워커는 Gateway 환경에서 격리하고 실제 호환 revision을 확인한 뒤 고정한다.

## 무료 API와 구독 — 후속 검토, 현재 미구현

Gemini 가격/한도/약관:
https://ai.google.dev/gemini-api/docs/pricing
https://ai.google.dev/gemini-api/docs/rate-limits
https://ai.google.dev/gemini-api/terms

Azure Speech 가격/언어:
https://azure.microsoft.com/pricing/details/speech/
https://learn.microsoft.com/azure/ai-services/speech-service/language-support

Codex 인증/작업 서버:
https://developers.openai.com/codex/auth/
https://developers.openai.com/codex/app-server/

무료 API의 수치·모델명·보존 정책·계정 할당량은 변할 수 있다. 현재 코드에는 외부 API/구독 자동 연동이 없고 개인 데이터를 테스트 공급자로 자동 전송하지 않는다. 활성화 시 당시 공식 문서와 실제 계정을 확인한다. 로컬 프로세스가 반드시 로컬 추론인 것은 아니다.

## 미확정 항목

실기기에서 설치·실행한 SDK/모델 revision과 SHA-256, 캐릭터별 재배포 권리, 모델 부속 사전·목소리 조건, API 계정 한도, 상용 제품의 SDK 분류는 미확정이다. 확인 전에는 완전 무료 상용 앱 또는 모든 자산이 오픈소스라는 표현을 사용하지 않는다.
