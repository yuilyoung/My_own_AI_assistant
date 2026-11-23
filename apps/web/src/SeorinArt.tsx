import { memo } from "react";
import type { PaintedFaceRig } from "./PaintedFace";
import type { MotionCue } from "./avatar-motion";
import office from "./portraits/seorin/office.webp";
import eyeL from "./portraits/seorin/eye-l.webp";
import eyeR from "./portraits/seorin/eye-r.webp";
import browL from "./portraits/seorin/brow-l.webp";
import browR from "./portraits/seorin/brow-r.webp";
import lip from "./portraits/seorin/lip.webp";
import upperLip from "./portraits/seorin/upper-lip.webp";
import lowerLip from "./portraits/seorin/lower-lip.webp";
import socketLeft from "./portraits/seorin/socket-left.webp";
import irisLeft from "./portraits/seorin/iris-left.webp";
import lashesLeft from "./portraits/seorin/lashes-left.webp";
import closedL from "./portraits/seorin/closed-l.webp";
import socketRight from "./portraits/seorin/socket-right.webp";
import irisRight from "./portraits/seorin/iris-right.webp";
import lashesRight from "./portraits/seorin/lashes-right.webp";
import closedR from "./portraits/seorin/closed-r.webp";
import frontSweep from "./portraits/seorin/front-sweep.webp";
import earring from "./portraits/seorin/earring.webp";
import headBase from "./portraits/seorin/head-base.webp";
import restSleeve from "./portraits/seorin/rest-sleeve.webp";
import jacket from "./portraits/seorin/jacket.webp";
import raisedJacket from "./portraits/seorin/raised-jacket.webp";
import waveForearm from "./portraits/seorin/wave-forearm.webp";
import wave from "./portraits/seorin/wave.webp";
import pointForearm from "./portraits/seorin/point-forearm.webp";
import point from "./portraits/seorin/point.webp";

type ArmPose = Extract<MotionCue, "greeting" | "point">;

// All crops use the coordinates of the 1024 × 1536 portfolio portrait.
const scale = 354 / 1536;
const placement = `translate(62 6) scale(${scale})`;
function stagePoint(x: number, y: number) {
  return `${62 + x * scale}px ${6 + y * scale}px`;
}

const faceRig = {
  transform: placement,
  eyes: [
    {
      open: { src: eyeL, x: 392, y: 276, width: 98, height: 36 },
      gaze: {
        socket: { src: socketLeft, x: 413, y: 286, width: 72, height: 21 },
        iris: { src: irisLeft, x: 438, y: 277, width: 33, height: 32 },
        lid: { src: lashesLeft, x: 392, y: 276, width: 98, height: 36 },
        contour:
          "M414 298.4 Q421 293 437 290 Q456 285.4 468 288.5 Q478 289.6 483.4 294.6 Q462 300.4 452 302.1 Q436 306.7 427 305.3 Q421 304.2 414 298.4Z",
        travel: [5.2, 1.7],
      },
      brow: { src: browL, x: 394, y: 255, width: 96, height: 21 },
      closed: { src: closedL, x: 401, y: 295, width: 83, height: 17 },
      center: [453.7, 292.6],
      blinkY: 305,
    },
    {
      open: { src: eyeR, x: 532, y: 250, width: 100, height: 45 },
      gaze: {
        socket: { src: socketRight, x: 540, y: 267, width: 68, height: 25 },
        iris: { src: irisRight, x: 558, y: 263, width: 33, height: 33 },
        lid: { src: lashesRight, x: 532, y: 250, width: 100, height: 45 },
        contour:
          "M541.5 287.8 Q550 277.6 563.6 275 Q577.5 270 595.6 270.7 L606.2 268.3 Q602.5 279.5 592.6 284.2 Q575.7 289.4 556.1 290.4 L541.5 290.5Z",
        travel: [5.2, 1.7],
      },
      brow: { src: browR, x: 518, y: 232, width: 99, height: 35 },
      closed: { src: closedR, x: 540, y: 264, width: 80, height: 30 },
      center: [574.3, 278.8],
      blinkY: 290,
    },
  ],
  mouth: {
    rest: { src: lip, x: 494, y: 376, width: 82, height: 38 },
    upper: { src: upperLip, x: 494, y: 376, width: 81, height: 23 },
    lower: { src: lowerLip, x: 494, y: 381, width: 82, height: 33 },
    center: [534, 394.5],
    width: 72,
    height: 29,
    angle: -10.4,
    cornerRise: 4.7,
    color: "#713d42",
    tongue: "#c87878",
    teeth: "#f7e6d5",
  },
} satisfies PaintedFaceRig;

const Backdrop = memo(function SeorinBackdrop() {
  return (
    <g data-art="seorin-city-office">
      <image href={office} width="360" height="360" />
    </g>
  );
});

const Wardrobe = memo(function SeorinWardrobe({
  greeting,
}: {
  greeting: boolean;
}) {
  return (
    <g data-art="seorin-office-tailoring">
      <g transform={placement}>
        <image href={jacket} x="96" y="419" width="730" height="1117" />{" "}
        {greeting ? null : (
          <image
            className="seorin__resting-sleeve"
            href={restSleeve}
            x="692"
            y="574"
            width="255"
            height="962"
          />
        )}
      </g>
      {greeting && (
        <g className="narration__upper-arm seorin__raised-sleeve">
          <g transform={placement}>
            <image
              href={raisedJacket}
              x="759"
              y="574"
              width="174"
              height="483"
            />
          </g>
        </g>
      )}
    </g>
  );
});
const Hand = memo(function SeorinHand({ gesture }: { gesture: ArmPose }) {
  return (
    <g transform={placement}>
      {gesture === "point" ? (
        <image href={point} x="772" y="431" width="151" height="253" />
      ) : (
        <image href={wave} x="754" y="393" width="177" height="276" />
      )}
    </g>
  );
});
const Forearm = memo(function SeorinForearm({ gesture }: { gesture: ArmPose }) {
  return (
    <g transform={placement}>
      {gesture === "point" ? (
        <image href={pointForearm} x="759" y="661" width="205" height="399" />
      ) : (
        <image href={waveForearm} x="759" y="646" width="204" height="411" />
      )}
    </g>
  );
});
const HairBehind = memo(function SeorinHead() {
  return (
    <g transform={placement}>
      <image href={headBase} x="122" y="2" width="863" height="968" />
    </g>
  );
});
const Accessory = memo(function SeorinGoldDrop() {
  return (
    <g transform={placement}>
      <image href={earring} x="630" y="322" width="19" height="57" />
    </g>
  );
});
const Fringe = memo(function SeorinLooseLock() {
  return (
    <g transform={placement}>
      <image href={frontSweep} x="228" y="710" width="162" height="253" />
    </g>
  );
});
export const seorinArt = {
  Backdrop,
  Wardrobe,
  HairBehind,
  Fringe,
  Accessory,
  Forearm,
  Hand,
  faceRig,
  shoulderPivot: stagePoint(820, 578),
  elbowPivot: stagePoint(831, 1020),
  handPivot: stagePoint(829, 657),
  neckPivot: stagePoint(541, 516),
  fringePivot: stagePoint(294, 745),
  accessoryPivot: stagePoint(639, 329),
  baseImages: [office, jacket, restSleeve, headBase, frontSweep, earring],
  poseImages: {
    greeting: [raisedJacket, waveForearm, wave],
    point: [raisedJacket, pointForearm, point],
  },
};
