import { useState } from "react";
import { avatarNames, type AvatarCharacter } from "./avatar-cast";
import type { ExpressionCue, MotionCue } from "./avatar-motion";
import { MotionAvatar } from "./MotionAvatar";
import { useNarrationPreview, type SpeechSample } from "./useNarrationPreview";

type DemoStudioProps = {
  character: AvatarCharacter;
  onCharacterChange: (character: AvatarCharacter) => void;
};

type Cue = { emotion: ExpressionCue; gesture: MotionCue };

const cast = [
  { id: "isol", role: "22세 대학생" },
  { id: "seorin", role: "28세 직장인" },
  { id: "hana", role: "17세 고등학생" },
] as const satisfies readonly { id: AvatarCharacter; role: string }[];

const samples = {
  greeting: {
    label: "인사말 듣기",
    prompt: "안녕하세요!",
    cue: { emotion: "happy", gesture: "greeting" },
  },
  intro: {
    label: "자기소개 듣기",
    prompt: "자기소개해 줄래요?",
    cue: { emotion: "curious", gesture: "point" },
  },
} as const satisfies Record<
  SpeechSample,
  { label: string; prompt: string; cue: Cue }
>;
const sampleOrder = ["greeting", "intro"] as const;

const replies: Record<AvatarCharacter, Record<SpeechSample, string>> = {
  hana: {
    greeting:
      "안녕하세요. 하나예요. 마침 학교 끝나고 쉬려던 참이에요. 오늘 하루 어땠어요? 저랑 잠깐 얘기해요.",
    intro:
      "저는 고등학생 하나예요. 추리 소설 진짜 좋아해요. 책을 읽다가 단서가 나오면 누가 범인일까 생각하는 게 제일 재밌어요.",
  },
  isol: {
    greeting:
      "안녕하세요. 제 이름은 이솔입니다. 수업이 조금 일찍 끝났어요. 저기 나무 그늘에서 잠깐 같이 쉴까요?",
    intro:
      "저는 대학생 이솔입니다. 수업 사이에는 캠퍼스를 천천히 걸어요. 마음에 드는 풍경이 보이면 작은 노트에 그려요.",
  },
  seorin: {
    greeting:
      "안녕하세요. 서린입니다. 만나서 반가워요. 오늘 가장 먼저 하고 싶은 일부터 들려주시겠어요?",
    intro:
      "저는 서린입니다. 회사에서는 프로젝트 일정을 맡고 있어요. 복잡한 일도 차근차근 정리하는 걸 좋아해요.",
  },
};

const motions = [
  { label: "인사하기", emotion: "happy", gesture: "greeting" },
  { label: "끄덕이기", emotion: "thoughtful", gesture: "nod" },
  { label: "갸웃하기", emotion: "curious", gesture: "tilt" },
  { label: "가리키기", emotion: "thoughtful", gesture: "point" },
] as const satisfies readonly (Cue & { label: string })[];
const idle = { emotion: "neutral", gesture: "idle" } as const;
const preparing = { emotion: "curious", gesture: "idle" } as const;

export function DemoStudio({ character, onCharacterChange }: DemoStudioProps) {
  const [sample, setSample] = useState<SpeechSample | null>(null);
  const [motion, setMotion] = useState<Cue | null>(null);
  const narration = useNarrationPreview(true, character);
  const { signal } = narration;
  const selected = sample ?? "greeting";
  const activeCue = signal
    ? signal.started
      ? samples[signal.sample].cue
      : preparing
    : motion;
  const { emotion, gesture } = activeCue ?? idle;
  const level = signal?.level ?? 0;

  return (
    <section className="studio" id="demo" aria-label="캐릭터 데모">
      <div className="studio-portrait" id="characters">
        <div className="studio-cast" role="group" aria-label="캐릭터 선택">
          {cast.map(({ id, role }) => (
            <button
              className="studio-cast-option"
              key={id}
              type="button"
              data-character={id}
              aria-pressed={id === character}
              onClick={() => {
                if (id === character) return;
                narration.stop();
                setMotion(null);
                setSample(null);
                onCharacterChange(id);
              }}
            >
              <span className="studio-cast-name">{avatarNames[id]}</span>
              <span className="studio-cast-role">{role}</span>
            </button>
          ))}
        </div>
        <div className="studio-stage">
          <MotionAvatar
            character={character}
            level={level}
            brightness={signal?.brightness}
            emotion={emotion}
            gesture={gesture}
            cue={activeCue ?? undefined}
          />
        </div>
        <div className="studio-stage-controls">
          <div className="studio-motions" role="group" aria-label="아바타 동작">
            {motions.map(({ label, emotion, gesture }) => (
              <button
                key={gesture}
                type="button"
                data-motion={gesture}
                onClick={() => {
                  narration.stop();
                  setMotion({ emotion, gesture });
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="studio-voice">
            <p className="studio-playback-status" role="status">
              {signal
                ? signal.started
                  ? "재생 중"
                  : "음성 준비 중"
                : "재생 대기"}
            </p>
            <meter aria-label="음성 레벨" min="0" max="1" value={level} />
          </div>
        </div>
      </div>
      <div className="studio-chat">
        <div className="studio-chat-heading">
          <h2>대화 미리보기</h2>
        </div>
        <div className="studio-samples" role="group" aria-label="대화 샘플">
          {sampleOrder.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === selected}
              onClick={() => {
                setMotion(null);
                setSample(id);
                void narration.start(id);
              }}
            >
              {samples[id].label}
            </button>
          ))}
          {signal && (
            <button type="button" onClick={narration.stop}>
              재생 중지
            </button>
          )}
        </div>
        <div className="studio-thread" role="log" aria-label="샘플 대화">
          <article className="studio-message studio-message--user">
            <span className="studio-speaker">나</span>
            <p>{samples[selected].prompt}</p>
          </article>
          <article className="studio-message studio-message--avatar">
            <span className="studio-speaker">{avatarNames[character]}</span>
            <p>{replies[character][selected]}</p>
          </article>
        </div>
        {sample && narration.failed && (
          <p className="studio-error" role="alert">
            음성을 재생할 수 없습니다. 다시 시도해 주세요.
          </p>
        )}
      </div>
    </section>
  );
}
