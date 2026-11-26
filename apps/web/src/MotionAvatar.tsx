import {
  useId,
  useMemo,
  useRef,
  type CSSProperties,
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
import { useNarrationMotion } from "./useNarrationMotion";
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
  transparent?: boolean;
};

type ArmPose = "greeting" | "point";
type Art = Record<"Backdrop" | "HairBehind", ComponentType<{ id: string }>> & {
  RearHair?: ComponentType<{ id: string }>;
  Fringe?: ComponentType<{ id: string }>;
  Accessory?: ComponentType<{ id: string }>;
  shoulderPivot?: string;
  elbowPivot?: string;
  neckPivot?: string;
  rearHairPivot?: string;
  fringePivot?: string;
  accessoryPivot?: string;
  baseImages: readonly string[];
  faceRig: PaintedFaceRig;
  ArmForeground?: ComponentType<{ id: string }>;
  Wardrobe: ComponentType<{
    id: string;
    greeting: boolean;
    gesture: MotionCue;
  }>;
  Forearm: ComponentType<{ id: string; gesture: ArmPose }>;
  Hand: ComponentType<{ id: string; gesture: ArmPose }>;
  handPivot: string;
  poseImages: Record<ArmPose, readonly string[]>;
};
const artwork: Record<AvatarCharacter, Art> = {
  seorin: seorinArt,
  hana: hanaArt,
  isol: isolArt,
};
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
  transparent = false,
}: MotionAvatarProps) {
  const {
    Backdrop,
    Wardrobe,
    HairBehind,
    RearHair,
    Accessory,
    shoulderPivot,
    elbowPivot,
    neckPivot,
    rearHairPivot,
    fringePivot,
    accessoryPivot,
    ArmForeground,
    Fringe,
    Forearm,
    Hand,
    faceRig,
    baseImages,
    handPivot,
    poseImages,
  } = artwork[character];
  const status = usePortraitReady(baseImages, faceRig);
  const id = useId();
  const stage = useRef<SVGSVGElement>(null);
  const arm =
    gesture === "point" || gesture === "greeting" ? gesture : undefined;
  const armReady = usePortraitPose(
    arm ? poseImages[arm] : undefined,
    status === "ready" && arm !== undefined,
    cue,
  );
  const amplitude = normalizedLipSync(level, 1);
  const tone = normalizedLipSync(brightness, 1);
  const input = useMemo(
    () => ({
      level: amplitude,
      brightness: tone,
      emotion,
      gesture,
      cueToken: cue,
      armReady,
    }),
    [amplitude, tone, emotion, gesture, cue, armReady],
  );
  const activeArm = useNarrationMotion(
    stage,
    character,
    status === "ready",
    input,
  );
  return (
    <svg
      ref={stage}
      className="avatar-panel__svg seorin"
      style={
        {
          background: transparent ? "transparent" : undefined,
          "--shoulder-pivot": shoulderPivot,
          "--elbow-pivot": elbowPivot,
          "--neck-pivot": neckPivot,
          "--rear-hair-pivot": rearHairPivot,
          "--fringe-pivot": fringePivot,
          "--accessory-pivot": accessoryPivot,
        } as CSSProperties
      }
      data-character={character}
      viewBox="0 0 360 360"
      role="img"
      aria-labelledby={id + "-title"}
      aria-describedby={status === "ready" ? undefined : id + "-status"}
    >
      <title id={id + "-title"}>
        {`기본 아바타 · ${expressionLabels[emotion]} · ${motionLabels[gesture]} · ${avatarNames[character]}`}
      </title>
      {!transparent && (
        <g aria-hidden="true">
          <Backdrop id={id} />
        </g>
      )}
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
            <g className="narration__torso">
              {RearHair && (
                <g className="narration__neck">
                  <g className="narration__hair-anchor">
                    <g className="narration__rear-hair">
                      <RearHair id={id} />
                    </g>
                  </g>
                </g>
              )}
              <g className="narration__costume">
                <g className="narration__rest-outfit">
                  <Wardrobe id={id + "-rest"} greeting={false} gesture="idle" />
                </g>
                {activeArm && (
                  <g className="narration__raised-outfit">
                    <Wardrobe
                      id={id + "-raised"}
                      greeting
                      gesture={activeArm}
                    />
                  </g>
                )}
              </g>
              {activeArm && ArmForeground && (
                <g className="narration__arm-foreground">
                  <ArmForeground id={id} />
                </g>
              )}
              <g className="narration__neck">
                <g className="avatar-panel__head">
                  <HairBehind id={id} />
                  <PaintedFace
                    id={id}
                    rig={faceRig}
                    character={character}
                    level={amplitude}
                    brightness={tone}
                    emotion={emotion}
                  />
                  {Fringe && (
                    <g className="narration__fringe">
                      <Fringe id={id} />
                    </g>
                  )}
                  {Accessory && (
                    <g className="narration__accessory">
                      <Accessory id={id} />
                    </g>
                  )}
                </g>
              </g>
              <g className="narration__arm">
                <g className="narration__forearm">
                  {activeArm && <Forearm id={id} gesture={activeArm} />}
                  <g
                    className="avatar-panel__hand"
                    style={{ transformOrigin: handPivot }}
                  >
                    {activeArm && (
                      <g data-pose={activeArm}>
                        <Hand id={id} gesture={activeArm} />
                      </g>
                    )}
                  </g>
                </g>
              </g>
            </g>
          </g>
        </g>
      )}
    </svg>
  );
}
