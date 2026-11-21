import { useEffect, useId, useState } from "react";
import { AvatarInspector } from "./AvatarInspector";
import { SeorinAvatar } from "./SeorinAvatar";
import { normalizedLipSync } from "./avatar";
import type {
  AvatarMotionBridge,
  ExpressionCue,
  MotionCue,
} from "./avatar-motion";
import type { Segment } from "./gateway";
import "./avatar-panel.css";

export type AvatarPanelProps = {
  bridge: AvatarMotionBridge;
  level: number;
  brightness?: number;
  cue?: Pick<Segment, "emotion" | "gesture">;
  busy?: boolean;
};

/** A parent key tied to mode/service resets both selection and inspector state. */
export function AvatarPanel({
  bridge,
  level,
  brightness,
  cue,
  busy = false,
}: AvatarPanelProps) {
  const [kind, setKind] = useState<"builtin" | "live2d">("builtin");
  const id = useId();
  const audioLevel = normalizedLipSync(level, 1);
  const emotion: ExpressionCue =
    cue?.emotion === "happy" ||
    cue?.emotion === "concerned" ||
    cue?.emotion === "surprised"
      ? cue.emotion
      : "neutral";
  const gesture: MotionCue =
    cue?.gesture === "nod" || cue?.gesture === "greeting"
      ? cue.gesture
      : "idle";
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
        value={kind}
        onChange={(event) => {
          bridge.detach();
          setKind(event.target.value === "live2d" ? "live2d" : "builtin");
        }}
      >
        <option value="builtin">서린 · 기본 2D 캐릭터</option>
        <option value="live2d">Live2D (사용권 필요)</option>
      </select>
      {kind === "builtin" ? (
        <>
          <div className="avatar-panel__stage">
            <SeorinAvatar
              level={audioLevel}
              brightness={brightness}
              emotion={emotion}
              gesture={gesture}
              cue={cue}
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
            TTS가 켜진 대화에서 서린의 입 모양이 답변 음성을 따라 움직입니다.
          </p>
        </>
      ) : (
        <div className="avatar-panel__licensed">
          <p className="avatar-panel__note">
            Live2D는 사용권이 확인된 모델 자산과 별도로 설치한 Cubism SDK
            어댑터가 필요합니다. SDK와 모델은 포함되어 있지 않습니다.
          </p>
          <p className="avatar-panel__note">
            클라우드에서도 현재 페이지와 같은 출처의 <code>/avatar-local/</code>{" "}
            경로로 서버가 모델 자산을 제공해야 합니다. 여기서 로컬 경로는
            Gateway 서버 기준입니다.
          </p>
          <AvatarInspector bridge={bridge} />
        </div>
      )}
    </section>
  );
}
