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
import headBase from "./portraits/seorin/head-base.webp";
import frontSweep from "./portraits/seorin/front-sweep.webp";
import jacket from "./portraits/seorin/jacket.webp";
import restSleeve from "./portraits/seorin/rest-sleeve.webp";
import raisedJacket from "./portraits/seorin/raised-jacket.webp";
import waveForearm from "./portraits/seorin/wave-forearm.webp";
import wave from "./portraits/seorin/wave.webp";
import pointForearm from "./portraits/seorin/point-forearm.webp";
import point from "./portraits/seorin/point.webp";

type ArmPose = Extract<MotionCue, "greeting" | "point">;

// All crops use the coordinates of the 1024 × 1536 district-office portrait.
const scale = 354 / 1536;
const placement = `translate(62 6) scale(${scale})`;
function stagePoint(x: number, y: number) {
  return `${62 + x * scale}px ${6 + y * scale}px`;
}

const faceRig = {
  transform: placement,
  eyes: [
    {
      open: { src: eyeL, x: 400, y: 237, width: 89, height: 52 },
      gaze: {
        socket: { src: socketLeft, x: 418, y: 248, width: 63, height: 38 },
        iris: { src: irisLeft, x: 436, y: 247, width: 37, height: 40 },
        lid: { src: lashesLeft, x: 400, y: 237, width: 89, height: 52 },
        contour:
          "M419.6 268.3Q425.4 257.2 437.6 253.4Q448.1 248.8 458.1 249.7Q470.7 251.7 479.8 263.6Q480.6 272.5 474.6 279.6Q463.8 284.4 445 284Q430.3 285.2 423.6 279.1Q419.5 274.4 419.6 268.3Z",
        travel: [5.2, 1.7],
      },
      brow: { src: browL, x: 434, y: 199, width: 63, height: 32 },
      browPivot: [454, 214],
      browClip: "M471 174H512V253H412Q424 241 436.3 224.4Q454.1 201 471 174Z",
      closed: { src: closedL, x: 403, y: 268, width: 77, height: 24 },
      center: [454.3, 266.6],
      blinkY: 285,
    },
    {
      open: { src: eyeR, x: 545, y: 230, width: 79, height: 52 },
      gaze: {
        socket: { src: socketRight, x: 551, y: 241, width: 63, height: 38 },
        iris: { src: irisRight, x: 561, y: 236, width: 37, height: 43 },
        lid: { src: lashesRight, x: 545, y: 230, width: 79, height: 52 },
        contour:
          "M552.6 257.8Q558.6 248.4 567.5 245.6Q577.4 241.7 585.6 243.3Q601.5 246 612.5 254.6Q611.7 265.6 603.3 272.9Q592.9 278.4 578.9 276.8Q564.1 277.8 555.9 273.5Q552.3 266.3 552.6 257.8Z",
        travel: [5.2, 1.7],
      },
      brow: { src: browR, x: 531, y: 193, width: 86, height: 35 },
      browPivot: [596, 207],
      browClip:
        "M512 174H606.5Q611.3 191.3 613.1 205.9Q616.2 224.5 621.4 249.6H512Z",
      closed: { src: closedR, x: 551, y: 260, width: 75, height: 25 },
      center: [578.9, 257.1],
      blinkY: 278,
    },
  ],
  mouth: {
    rest: { src: lip, x: 484, y: 348, width: 83, height: 27 },
    upper: { src: upperLip, x: 484, y: 348, width: 83, height: 17 },
    lower: { src: lowerLip, x: 484, y: 352, width: 83, height: 23 },
    center: [526, 362],
    width: 75,
    height: 27,
    angle: -3.6,
    cornerRise: 4.0,
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
        <image href={jacket} x="0" y="393" width="925" height="1143" />{" "}
        {greeting ? null : (
          <image
            className="seorin__resting-sleeve"
            href={restSleeve}
            x="689"
            y="526"
            width="240"
            height="1010"
          />
        )}
      </g>
      {greeting && (
        <g className="narration__upper-arm seorin__raised-sleeve">
          <g transform={placement}>
            <image
              href={raisedJacket}
              x="724"
              y="529"
              width="155"
              height="502"
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
        <image href={point} x="723" y="419" width="140" height="287" />
      ) : (
        <image href={wave} x="721" y="416" width="195" height="287" />
      )}
    </g>
  );
});
const Forearm = memo(function SeorinForearm({ gesture }: { gesture: ArmPose }) {
  return (
    <g transform={placement}>
      {gesture === "point" ? (
        <image href={pointForearm} x="740" y="664" width="165" height="380" />
      ) : (
        <image href={waveForearm} x="727" y="663" width="175" height="379" />
      )}
    </g>
  );
});
const HairBehind = memo(function SeorinHead() {
  return (
    <g transform={placement}>
      <image href={headBase} x="64" y="0" width="935" height="495" />
    </g>
  );
});
const Fringe = memo(function SeorinPonytail() {
  return (
    <g transform={placement}>
      <image href={frontSweep} x="304" y="354" width="140" height="140" />
    </g>
  );
});
export const seorinArt = {
  Backdrop,
  Wardrobe,
  HairBehind,
  Fringe,
  Forearm,
  Hand,
  faceRig,
  shoulderPivot: stagePoint(757, 573),
  elbowPivot: stagePoint(816.81, 1008.13),
  handPivot: stagePoint(796.38, 689.14),
  neckPivot: stagePoint(526, 465),
  fringePivot: stagePoint(367, 368),
  baseImages: [office, jacket, restSleeve, headBase, frontSweep],
  poseImages: {
    greeting: [raisedJacket, waveForearm, wave],
    point: [raisedJacket, pointForearm, point],
  },
};
