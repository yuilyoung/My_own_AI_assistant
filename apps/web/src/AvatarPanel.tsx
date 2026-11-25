import { useEffect, useId, useState } from "react";
import { AvatarInspector } from "./AvatarInspector";
import { MotionAvatar } from "./MotionAvatar";
import {
  avatarNames,
  characterForMode,
  type AvatarCharacter,
} from "./avatar-cast";
import { useNarrationPreview } from "./useNarrationPreview";
import { normalizedLipSync } from "./avatar";
import {
  isExpressionCue,
  isMotionCue,
  type AvatarMotionBridge,
  type ExpressionCue,
  type MotionCue,
} from "./avatar-motion";
import type { Mode, Segment } from "./gateway";
import "./avatar-panel.css";

export type AvatarPanelProps = {
  bridge?: AvatarMotionBridge;
  level: number;
  brightness?: number;
  cue?: Pick<Segment, "emotion" | "gesture">;
  busy?: boolean;
  voiceActive?: boolean;
  mode?: Mode;
  defaultCharacter?: AvatarCharacter;
  onCharacterChange?: (character: AvatarCharacter) => void;
};

const narrationCues = {
  greeting: { emotion: "happy", gesture: "greeting" },
  intro: { emotion: "curious", gesture: "point" },
} as const;
const speechSamples = [
  { sample: "greeting", label: "인사말 듣기" },
  { sample: "intro", label: "내레이션 미리듣기" },
] as const;
const narrationReady = { emotion: "curious", gesture: "idle" } as const;
const previews = [
  { label: "인사하기", emotion: "happy", gesture: "greeting" },
  { label: "갸웃하기", emotion: "curious", gesture: "tilt" },
  { label: "생각하며 끄덕이기", emotion: "thoughtful", gesture: "nod" },
  { label: "가리켜 설명하기", emotion: "curious", gesture: "point" },
] as const satisfies readonly {
  label: string;
  emotion: ExpressionCue;
  gesture: MotionCue;
}[];

export function AvatarPanel({
  bridge,
  level,
  brightness,
  cue,
  busy = false,
  voiceActive = false,
  mode = "assistant",
  defaultCharacter = "seorin",
  onCharacterChange,
}: AvatarPanelProps) {
  const [preferred, setPreferred] = useState<AvatarCharacter | "live2d">(
    defaultCharacter,
  );
  const builtin = preferred === "live2d" ? defaultCharacter : preferred;
  const kind =
    bridge && preferred === "live2d"
      ? "live2d"
      : characterForMode(builtin, mode);
  const [preview, setPreview] = useState<{
    source: AvatarPanelProps["cue"];
    sample: Pick<(typeof previews)[number], "emotion" | "gesture"> | null;
  } | null>(null);
  const id = useId();
  const audioLevel = normalizedLipSync(level, 1);
  const canPreview = !busy && audioLevel === 0;
  const canPlayNarration = canPreview && !voiceActive;
  const narration = useNarrationPreview(
    canPlayNarration && kind !== "live2d",
    kind,
    cue,
  );
  const playback = canPlayNarration ? narration.signal : null;
  const visibleLevel = playback?.level ?? audioLevel;
  const currentPreview = preview?.source === cue ? preview : null;
  const sample = canPreview ? currentPreview?.sample : null;
  if (preview && !currentPreview) setPreview(null);
  else if (currentPreview?.sample && !canPreview)
    setPreview({ source: cue, sample: null });
  const visibleCue = playback
    ? playback.started
      ? narrationCues[playback.sample]
      : narrationReady
    : (sample ?? cue);
  const emotion = isExpressionCue(visibleCue?.emotion)
    ? visibleCue.emotion
    : "neutral";
  // Closing a preview restores the face. Only a new reply replays its gesture.
  const motion =
    !playback && currentPreview && !sample ? "idle" : visibleCue?.gesture;
  const gesture = isMotionCue(motion) ? motion : "idle";
  const status =
    visibleLevel > 0
      ? "말하는 중"
      : busy
        ? "답변 준비 중"
        : bridge
          ? "대화 준비 완료"
          : "미리보기 준비 완료";

  useEffect(() => {
    bridge?.detach();
    return () => bridge?.detach();
  }, [bridge]);

  return (
    <section className="avatar-panel" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>아바타</h2>
      <label className="avatar-panel__label" htmlFor={`${id}-kind`}>
        아바타 종류
      </label>
      <select
        className="avatar-panel__select"
        id={`${id}-kind`}
        value={kind === "seorin" ? "builtin" : kind}
        disabled={busy}
        onChange={(event) => {
          const value = event.target.value;
          const next =
            value === "hana" ||
            value === "isol" ||
            (value === "live2d" && bridge)
              ? value
              : "seorin";
          narration.stop();
          bridge?.detach();
          setPreview(null);
          setPreferred(next);
          if (next !== "live2d") onCharacterChange?.(next);
        }}
      >
        <option value="builtin">{avatarNames.seorin} · 28세 직장인</option>
        {mode === "assistant" && (
          <option value="hana">{avatarNames.hana} · 17세 고등학생</option>
        )}
        <option value="isol">{avatarNames.isol} · 22세 대학생</option>
        {bridge && <option value="live2d">Live2D (사용권 필요)</option>}
      </select>
      {kind !== "live2d" ? (
        <>
          <div className="avatar-panel__stage">
            <MotionAvatar
              character={kind}
              level={visibleLevel}
              brightness={playback?.brightness ?? brightness}
              emotion={emotion}
              gesture={gesture}
              cue={visibleCue}
            />
          </div>
          <p className="avatar-panel__status" role="status" aria-atomic="true">
            <span className="avatar-panel__status-dot" aria-hidden="true" />
            {status}
          </p>
          <meter
            className="avatar-panel__meter"
            aria-label="음성 레벨"
            min="0"
            max="1"
            value={visibleLevel}
          />
          {bridge && (
            <p className="avatar-panel__note">
              TTS가 켜진 대화에서 {avatarNames[kind]}의 입 모양이 답변 음성을
              따라 움직입니다.
            </p>
          )}
          <details
            className="avatar-panel__preview"
            onToggle={(event) => {
              if (!event.currentTarget.open) {
                narration.stop();
                setPreview((last) =>
                  last?.sample ? { source: last.source, sample: null } : last,
                );
              }
            }}
          >
            <summary>표정·동작 미리보기</summary>
            <div>
              {previews.map(({ label, emotion, gesture }) => (
                <button
                  key={gesture}
                  type="button"
                  disabled={!canPreview}
                  onClick={() => {
                    narration.stop();
                    setPreview({ source: cue, sample: { emotion, gesture } });
                  }}
                >
                  {label}
                </button>
              ))}
              {speechSamples.map(({ sample, label }) => (
                <button
                  key={sample}
                  type="button"
                  className="avatar-panel__narration"
                  disabled={!canPlayNarration}
                  onClick={() => {
                    if (playback?.sample === sample) narration.stop();
                    else {
                      setPreview({ source: cue, sample: null });
                      void narration.start(sample);
                    }
                  }}
                >
                  {playback?.sample === sample ? "미리듣기 중지" : label}
                </button>
              ))}
            </div>
            {narration.failed && (
              <p role="alert">
                미리듣기를 재생할 수 없습니다. 다시 시도해 주세요.
              </p>
            )}
          </details>
        </>
      ) : bridge ? (
        <div className="avatar-panel__licensed">
          <p className="avatar-panel__note">
            Live2D는 사용권이 확인된 모델 자산과 별도로 설치한 Cubism SDK
            어댑터가 필요합니다. SDK와 모델은 포함되어 있지 않습니다.
          </p>
          <p className="avatar-panel__note">
            로컬 Gateway: <code>/avatar-local/</code>
          </p>
          <p className="avatar-panel__note">
            공개 서버는 비공개 모델 자산을 제공하지 않습니다.
          </p>
          <AvatarInspector bridge={bridge} />
        </div>
      ) : null}
    </section>
  );
}
