import { useEffect, useId, useState } from "react";
import { AvatarInspector } from "./AvatarInspector";
import { MotionAvatar } from "./MotionAvatar";
import { avatarNames, type AvatarCharacter } from "./avatar-cast";
import { normalizedLipSync } from "./avatar";
import {
  isExpressionCue,
  isMotionCue,
  type AvatarMotionBridge,
  type ExpressionCue,
  type MotionCue,
} from "./avatar-motion";
import type { Segment } from "./gateway";
import "./avatar-panel.css";

export type AvatarPanelProps = {
  bridge: AvatarMotionBridge;
  level: number;
  brightness?: number;
  cue?: Pick<Segment, "emotion" | "gesture">;
  busy?: boolean;
  defaultCharacter?: AvatarCharacter;
  onCharacterChange?: (character: AvatarCharacter) => void;
};

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
  defaultCharacter = "seorin",
  onCharacterChange,
}: AvatarPanelProps) {
  const [kind, setKind] = useState<AvatarCharacter | "live2d">(
    defaultCharacter,
  );
  const [preview, setPreview] = useState<{
    source: AvatarPanelProps["cue"];
    sample: Pick<(typeof previews)[number], "emotion" | "gesture"> | null;
  } | null>(null);
  const id = useId();
  const audioLevel = normalizedLipSync(level, 1);
  const canPreview = !busy && audioLevel === 0;
  const currentPreview = preview?.source === cue ? preview : null;
  const sample = canPreview ? currentPreview?.sample : null;
  if (preview && !currentPreview) setPreview(null);
  else if (currentPreview?.sample && !canPreview)
    setPreview({ source: cue, sample: null });
  const visibleCue = sample ?? cue;
  const emotion = isExpressionCue(visibleCue?.emotion)
    ? visibleCue.emotion
    : "neutral";
  // Closing a preview restores the face. Only a new reply replays its gesture.
  const motion = currentPreview && !sample ? "idle" : visibleCue?.gesture;
  const gesture = isMotionCue(motion) ? motion : "idle";
  const status =
    audioLevel > 0 ? "말하는 중" : busy ? "답변 준비 중" : "대화 준비 완료";

  useEffect(() => {
    bridge.detach();
    return () => bridge.detach();
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
        onChange={(event) => {
          const value = event.target.value;
          const next =
            value === "hana" || value === "isol" || value === "live2d"
              ? value
              : "seorin";
          bridge.detach();
          setPreview(null);
          setKind(next);
          if (next !== "live2d") onCharacterChange?.(next);
        }}
      >
        <option value="builtin">{avatarNames.seorin} · 비서</option>
        <option value="hana">{avatarNames.hana} · 도예가</option>
        <option value="isol">{avatarNames.isol} · 천문학자</option>
        <option value="live2d">Live2D (사용권 필요)</option>
      </select>
      {kind !== "live2d" ? (
        <>
          <div className="avatar-panel__stage">
            <MotionAvatar
              character={kind}
              level={audioLevel}
              brightness={brightness}
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
            value={audioLevel}
          />
          <p className="avatar-panel__note">
            TTS가 켜진 대화에서 {avatarNames[kind]}의 입 모양이 답변 음성을 따라
            움직입니다.
          </p>
          <details
            className="avatar-panel__preview"
            onToggle={(event) => {
              if (!event.currentTarget.open)
                setPreview((last) =>
                  last?.sample ? { source: last.source, sample: null } : last,
                );
            }}
          >
            <summary>표정·동작 미리보기</summary>
            <div>
              {previews.map(({ label, emotion, gesture }) => (
                <button
                  key={gesture}
                  type="button"
                  disabled={!canPreview}
                  onClick={() =>
                    setPreview({ source: cue, sample: { emotion, gesture } })
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </details>
        </>
      ) : (
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
      )}
    </section>
  );
}
