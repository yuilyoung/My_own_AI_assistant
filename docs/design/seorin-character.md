# 서린 캐릭터 가이드

서린은 팀의 프로젝트 일정을 맡은 28세 직장인이다. 턱선을 감싸는 웨이브 단발에, 흰 칼라 셔츠를 무릎까지 오는 차콜 펜슬스커트 안에 넣어 입었다. 셔츠 왼쪽 가슴에는 사원증을 달고 한 손에는 크림색 서류철을 끼었다. 사무실 창가에서 말을 걸면 갈색 눈으로 상대를 바라본다.

[서린 원화](seorin-original.webp) · [같은 인사말에서 이전·현재 눈썹 움직임 비교](seorin-brow-motion.mp4) · [세 캐릭터의 대기·인사·가리키기](portrait-proportions.webp)

서린의 인사에서는 일정을 시작할 때처럼 먼저 하고 싶은 일을 묻는다. 자기소개에서는 회사의 프로젝트 일정을 맡고 있다고 이야기한다. 두 영상 모두 F1의 차분한 음높이와 문장 억양을 살려 기존보다 1.2배 빠르게 말한다. 눈썹 비교 영상은 이전 장면의 발화 속도도 현재 인사말에 맞춰 같은 음절에서 움직임을 비교할 수 있다. [인사 영상](seorin-greeting.mp4) · [자기소개 영상](seorin-intro.mp4)

## 표정과 움직임

![대화 화면에서 본 서린의 눈썹과 표정 변화](seorin-expressions.png)

| 대화 신호 | 그림과 동작 |
|---|---|
| 차분함 · 기쁨 | 차분할 때는 눈과 입꼬리에 힘을 뺀다. 기쁠 때는 눈가와 입꼬리를 함께 올려 소리를 꺼도 미소가 보이게 한다. |
| 걱정 · 놀람 | 걱정할 때는 눈썹 안쪽을 들어 올린다. 놀랄 때는 눈을 크게 떠 두 표정이 작은 화면에서도 구별되게 한다. |
| 끄덕임 · 인사 | 끄덕일 때는 고개, 인사할 때는 손이 움직임의 중심이다. 제스처 도중에도 눈과 입은 답변에 계속 반응한다. |
| 대기 | 눈 깜박임과 가벼운 호흡으로 기다리는 모습을 표현한다. 동작 줄이기 설정에서는 반복 움직임을 멈추고 정적인 표정과 상태 문구로 대화 상태를 전한다. |

고개를 돌리면 웨이브 단발의 양쪽 끝이 각자의 뿌리를 중심으로 뒤따라 흔들리다 멈춘다. 양쪽 눈썹은 표정에 따라 각자의 원화 위치에서 움직인다. 한 구절을 말하면 처음에만 눈썹이 살짝 들리고, 이어지는 소리의 크기(RMS)는 입이 벌어지는 정도에 반영한다. 비슷한 음량에서도 소리가 상대적으로 밝거나 어두운 정도에 따라 입의 가로 모양을 조금 달리할 수 있다. 두 신호는 발화의 느낌을 표현하며 음소를 판별하지 않는다. 무음 구간과 재생 종료·취소 뒤에는 말하는 입모양을 풀어 원래 표정으로 돌아간다.

**표정·동작 미리보기**에서 서린의 인사말과 자기소개를 바로 들을 수 있다. 실제 채팅 답변을 같은 목소리로 들으려면 Supertonic 2 워커와 Gateway의 토큰을 설정한 뒤 Windows에서 `.\scripts\start.ps1 -TtsProvider supertonic`으로 실행한다. [실행 안내](../../workers/tts-supertonic/README.md)

## 구현과 참고 모델

서린의 원화는 새로 제작했다. 표정과 제스처의 작화 참고 자료는 캐릭터 가이드에 정리했다. 눈 깜박임과 발화가 독립적으로 움직이는 구조는 Cubism 공식 샘플도 참고했다. [세 캐릭터의 작화 참고](motion-characters.md#작화-참고)

- 히요리(Hiyori)는 눈 깜박임에 `ParamEyeLOpen`과 `ParamEyeROpen`, 립싱크에 `ParamMouthOpenY`를 지정한다. 표정 데이터에는 입술 모양용 `ParamMouthForm`도 있어 입의 형태와 벌어짐을 따로 설계할 때 참고할 수 있다. [모델 설정](https://github.com/Live2D/CubismWebSamples/blob/b1de66b0b1f1cb881d95fb6158622aeb6a2827bd/Samples/Resources/Hiyori/Hiyori.model3.json) · [파라미터 목록](https://github.com/Live2D/CubismWebSamples/blob/b1de66b0b1f1cb881d95fb6158622aeb6a2827bd/Samples/Resources/Hiyori/Hiyori.cdi3.json)
- 마오(Mao)는 같은 눈 파라미터를 쓰지만 립싱크에는 `ParamA`를 지정한다. Cubism 모델을 연결할 때는 해당 모델의 `.model3.json`에 선언된 `LipSync` 그룹을 읽어야 한다. [모델 설정](https://github.com/Live2D/CubismWebSamples/blob/b1de66b0b1f1cb881d95fb6158622aeb6a2827bd/Samples/Resources/Mao/Mao.model3.json) · [공식 샘플의 립싱크 연결 코드](https://github.com/Live2D/CubismWebSamples/blob/b1de66b0b1f1cb881d95fb6158622aeb6a2827bd/Samples/TypeScript/Demo/src/lappmodel.ts#L399-L415)

선택형 Live2D 화면에는 사용권을 확보한 모델, Cubism Core·Framework와 렌더링 어댑터가 필요하다. 공식 샘플에도 Core 라이선스, 소재 라이선스와 모델별 이용 조건이 별도로 적용된다. [공식 저장소의 라이선스 안내](https://github.com/Live2D/CubismWebSamples/blob/b1de66b0b1f1cb881d95fb6158622aeb6a2827bd/LICENSE.md) · [이 앱의 Live2D 자산 연결 안내](../live2d-asset-handoff.md)
