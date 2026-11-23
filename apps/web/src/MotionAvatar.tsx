import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { normalizedLipSync } from "./avatar";
import {
  expressionLabels,
  motionLabels,
  type ExpressionCue,
  type MotionCue,
} from "./avatar-motion";
import { avatarNames, type AvatarCharacter } from "./avatar-cast";
import { seorinArt } from "./SeorinArt";
import { hanaArt } from "./HanaArt";
import { isolArt } from "./IsolArt";
import type { Segment } from "./gateway";
import { PaintedFace, type PaintedFaceRig } from "./PaintedFace";
import { usePortraitReady } from "./usePortraitReady";
import { usePortraitPose } from "./usePortraitPose";
import "./seorin-avatar.css";

export type { AvatarCharacter } from "./avatar-cast";
export type MotionAvatarProps = {
  character: AvatarCharacter;
  level: number;
  brightness?: number;
  emotion: ExpressionCue;
  gesture: MotionCue;
  cue?: Pick<Segment, "emotion" | "gesture">;
};

type ArmPose = "greeting" | "point";
type Art = Record<"Backdrop" | "HairBehind", ComponentType<{ id: string }>> & {
  Fringe?: ComponentType<{ id: string }>;
  baseImages: readonly string[];
  faceRig: PaintedFaceRig;
  ArmForeground?: ComponentType<{ id: string }>;
  Wardrobe: ComponentType<{
    id: string;
    greeting: boolean;
    gesture: MotionCue;
  }>;
  Hand: ComponentType<{ id: string; gesture: ArmPose }>;
  handPivot: string;
  poseImages: Record<ArmPose, readonly string[]>;
};
const artwork: Record<AvatarCharacter, Art> = {
  seorin: seorinArt,
  hana: hanaArt,
  isol: isolArt,
};
const speechAccent = { seorin: 0.77, hana: 1.1, isol: 0.68 };

export function MotionAvatar(props: MotionAvatarProps) {
  // Each character owns its animation listeners and SVG definitions. Audio
  // frames and new semantic cues keep the same mouth and head mounted.
  return <Portrait key={props.character} {...props} />;
}

function Portrait({
  character,
  level,
  brightness = 0.5,
  emotion,
  gesture,
  cue,
}: MotionAvatarProps) {
  const {
    Backdrop,
    Wardrobe,
    HairBehind,
    ArmForeground,
    Fringe,
    Hand,
    faceRig,
    baseImages,
    handPivot,
    poseImages,
  } = artwork[character];
  const status = usePortraitReady(baseImages, faceRig);
  const id = useId();
  const head = useRef<SVGGElement>(null);
  const hand = useRef<SVGGElement>(null);
  const gestureRun = useMemo(() => ({ cue, gesture }), [cue, gesture]);
  const [finishedArm, setFinishedArm] = useState<typeof gestureRun | null>(
    null,
  );
  const arm =
    gesture === "greeting" || gesture === "point" ? gesture : undefined;
  const requested =
    status === "ready" && arm !== undefined && finishedArm !== gestureRun;
  const ready = usePortraitPose(
    arm ? poseImages[arm] : undefined,
    requested,
    gestureRun,
  );
  const activeArm = requested && ready ? arm : undefined;
  useLayoutEffect(() => {
    const motion = gestureRun.gesture;
    if (status !== "ready" || motion === "idle") return;
    const isArm = motion === "greeting" || motion === "point";
    if (isArm && !activeArm) return;
    const target = isArm ? hand.current : head.current;
    if (!target) return;
    target.style.animation = "none";
    target.getBoundingClientRect();
    target.style.removeProperty("animation");
    if (!isArm) return;
    const animation = motion === "point" ? "avatar-point" : "seorin-wave";
    const restArm = (event: AnimationEvent) => {
      if (event.target === target && event.animationName === animation)
        setFinishedArm(gestureRun);
    };
    target.addEventListener("animationend", restArm);
    return () => target.removeEventListener("animationend", restArm);
  }, [gestureRun, activeArm, status]);

  const amplitude = normalizedLipSync(level, 1);
  const tone = normalizedLipSync(brightness, 1);
  return (
    <svg
      className="avatar-panel__svg seorin"
      data-character={character}
      viewBox="0 0 360 360"
      role="img"
      aria-labelledby={id + "-title"}
      aria-describedby={status === "ready" ? undefined : id + "-status"}
    >
      <title id={id + "-title"}>
        {`기본 아바타 · ${expressionLabels[emotion]} · ${motionLabels[gesture]} · ${avatarNames[character]}`}
      </title>
      <g aria-hidden="true">
        <Backdrop id={id} />
      </g>
      {status !== "ready" ? (
        <g role="status" className="painted-face__status">
          <rect
            x="31"
            y="157"
            width="298"
            height="44"
            rx="8"
            fill="#fffaf4"
            opacity="0.94"
          />
          <text
            id={id + "-status"}
            x="180"
            y="183"
            textAnchor="middle"
            fill="#382f38"
            fontSize="12"
          >
            {status === "loading"
              ? "캐릭터 그림을 불러오는 중"
              : "그림을 불러오지 못했습니다. 다시 선택해 주세요."}
          </text>
        </g>
      ) : (
        <g aria-hidden="true">
          <g
            className="seorin__character"
            data-testid="avatar-character"
            data-gesture={gesture}
            data-arm-pose={activeArm}
          >
            <Wardrobe
              id={id}
              greeting={activeArm !== undefined}
              gesture={activeArm ?? "idle"}
            />
            <g
              className="avatar-panel__hand"
              ref={hand}
              style={{ transformOrigin: handPivot }}
            >
              {activeArm && (
                <g data-pose={activeArm}>
                  <Hand id={id} gesture={activeArm} />
                </g>
              )}
            </g>
            {activeArm && ArmForeground && <ArmForeground id={id} />}
            <g className="avatar-panel__head" ref={head}>
              <g className="anime__listening-head">
                <g
                  className="seorin__speech-head"
                  style={{
                    transform: `translateY(${-1.25 * amplitude * speechAccent[character]}px) rotate(${-1.05 * amplitude * speechAccent[character]}deg)`,
                  }}
                >
                  <HairBehind id={id} />
                  <PaintedFace
                    id={id}
                    rig={faceRig}
                    character={character}
                    level={amplitude}
                    brightness={tone}
                    emotion={emotion}
                  />
                  {Fringe && <Fringe id={id} />}
                </g>
              </g>
            </g>
          </g>
        </g>
      )}
    </svg>
  );
}
