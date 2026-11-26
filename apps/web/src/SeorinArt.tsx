import { memo } from "react";
import {
  PaintedGreetingHand,
  PaintedGreetingWrist,
  type GreetingHandRig,
} from "./PaintedGreetingHand";
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
import bobLeft from "./portraits/seorin/bob-left.webp";
import bobRight from "./portraits/seorin/bob-right.webp";
import shirtAndSkirt from "./portraits/seorin/shirt-and-skirt.webp";
import restSleeve from "./portraits/seorin/rest-sleeve.webp";
import raisedSleeve from "./portraits/seorin/raised-jacket.webp";
import waveForearm from "./portraits/seorin/wave-forearm.webp";
import wave from "./portraits/seorin/wave.webp";
import pointForearm from "./portraits/seorin/point-forearm.webp";
import point from "./portraits/seorin/point.webp";

type ArmPose = Extract<MotionCue, "greeting" | "point">;

const greetingPaint = { href: wave, x: 689, y: 319, width: 160, height: 237 };
const greetingHand: GreetingHandRig = {
  size: [160, 237],
  palm: "M-2 68H41L47 80H78L81 77H105L108 78L124 82L127 88L153 83L162 96V239H-2Z",
  wrist: "M50 214Q74 218 97 214L96 230Q77 235 53 230Z",
  fingers: {
    index: { joint: [65, 87], paint: "M58 2H84L80 88L77 99H53L55 56Z" },
    middle: { joint: [92, 86], paint: "M96 -2H122L114 49L103 94H78L83 61Z" },
    ring: { joint: [113, 91], paint: "M124 12H145L140 36L124 98H101L106 73Z" },
    little: {
      joint: [133, 101],
      paint: "M139 52H163V80L145 109L121 111L123 99Z",
    },
  },
};

// All crops use the coordinates of the 1024 × 1536 wavy-bob office portrait.
const scale = 354 / 1536;
const placement = `translate(62 6) scale(${scale})`;
function stagePoint(x: number, y: number) {
  return `${62 + x * scale}px ${6 + y * scale}px`;
}

const faceRig = {
  transform: placement,
  eyes: [
    {
      open: { src: eyeL, x: 435, y: 198, width: 79, height: 48 },
      gaze: {
        socket: { src: socketLeft, x: 454, y: 210, width: 51, height: 30 },
        iris: { src: irisLeft, x: 468, y: 207, width: 31, height: 35 },
        lid: { src: lashesLeft, x: 435, y: 198, width: 79, height: 48 },
        contour:
          "M455.17 224.67Q458.00 219.17 465.33 215.17Q472.50 211.50 479.33 211.67Q490.50 211.33 497.33 217.67L503.67 222.67Q503.17 230.83 496.83 236.17Q487.33 238.83 477.50 238.67Q469.50 238.67 464.17 237.00Q454.83 232.50 455.17 224.67Z",
        travel: [4.3, 1.35],
      },
      brow: { src: browL, x: 465, y: 170, width: 52, height: 32 },
      browPivot: [482.9, 182.6],
      browClip:
        "M494.61 139.52L522.87 139.52L525.04 201.70L459.39 201.26Q475.04 184.74 494.61 139.52Z",
      closed: { src: closedL, x: 443, y: 223, width: 58, height: 20 },
      center: [483.25, 223.65],
      blinkY: 239,
    },
    {
      open: { src: eyeR, x: 550, y: 188, width: 70, height: 52 },
      gaze: {
        socket: { src: socketRight, x: 561, y: 204, width: 51, height: 30 },
        iris: { src: irisRight, x: 568, y: 202, width: 31, height: 35 },
        lid: { src: lashesRight, x: 550, y: 188, width: 70, height: 52 },
        contour:
          "M562.67 219.17Q566.00 214.50 570.83 210.67Q575.67 207.00 580.67 206.33Q589.67 205.17 595.83 207.67Q603.83 210.33 610.17 216.17Q608.17 223.17 602.67 227.67Q597.33 232.50 592.17 232.33Q582.33 232.33 574.33 232.00Q566.83 231.83 563.83 227.00Q562.33 224.33 562.67 219.17Z",
        travel: [4.3, 1.35],
      },
      brow: { src: browR, x: 542, y: 163, width: 72, height: 31 },
      browPivot: [596.3, 176.5],
      browClip:
        "M542.43 160.39L603.30 159.96Q607.65 169.52 610.26 178.22Q614.17 195.17 616.78 210.39L540.70 212.57Z",
      closed: { src: closedR, x: 559, y: 216, width: 60, height: 21 },
      center: [583.3, 218.8],
      blinkY: 232,
    },
  ],
  mouth: {
    rest: { src: lip, x: 508, y: 291, width: 61, height: 20 },
    upper: { src: upperLip, x: 508, y: 291, width: 60, height: 11 },
    lower: { src: lowerLip, x: 509, y: 293, width: 60, height: 18 },
    center: [538.0, 299.4],
    width: 55,
    height: 20,
    angle: -3.1,
    cornerRise: 2.8,
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
        <image href={shirtAndSkirt} x="0" y="326" width="907" height="1210" />
        {greeting ? null : (
          <image
            className="seorin__resting-sleeve"
            href={restSleeve}
            x="674"
            y="444"
            width="146"
            height="835"
          />
        )}
      </g>
      {greeting && (
        <g className="narration__upper-arm seorin__raised-sleeve">
          <g transform={placement}>
            <image
              href={raisedSleeve}
              x="693"
              y="444"
              width="140"
              height="399"
            />
          </g>
        </g>
      )}
    </g>
  );
});
const Hand = memo(function SeorinHand({
  id,
  gesture,
}: {
  id: string;
  gesture: ArmPose;
}) {
  return (
    <g transform={placement}>
      {gesture === "point" ? (
        <image href={point} x="713" y="345" width="115" height="214" />
      ) : (
        <PaintedGreetingHand id={id} image={greetingPaint} rig={greetingHand} />
      )}
    </g>
  );
});
const Forearm = memo(function SeorinForearm({
  id,
  gesture,
}: {
  id: string;
  gesture: ArmPose;
}) {
  return (
    <g transform={placement}>
      {gesture === "point" ? (
        <image href={pointForearm} x="700" y="527" width="129" height="334" />
      ) : (
        <>
          <image href={waveForearm} x="702" y="527" width="130" height="334" />
          <PaintedGreetingWrist
            id={id}
            image={greetingPaint}
            rig={greetingHand}
          />
        </>
      )}
    </g>
  );
});
const HairBehind = memo(function SeorinHead() {
  return (
    <g transform={placement}>
      <image href={headBase} x="86" y="5" width="891" height="370" />
    </g>
  );
});
const Fringe = memo(function SeorinBob() {
  return (
    <>
      <g
        className="seorin__bob-left"
        style={{
          transformOrigin: stagePoint(392, 258),
          transform: "rotate(calc(.72 * var(--lock-left-angle, 0deg)))",
        }}
      >
        <g transform={placement}>
          <image href={bobLeft} x="332" y="243" width="134" height="127" />
        </g>
      </g>
      <g
        className="seorin__bob-right"
        style={{
          transformOrigin: stagePoint(649, 254),
          transform: "rotate(calc(.72 * var(--lock-right-angle, 0deg)))",
        }}
      >
        <g transform={placement}>
          <image href={bobRight} x="590" y="233" width="115" height="137" />
        </g>
      </g>
    </>
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
  shoulderPivot: stagePoint(724, 470),
  elbowPivot: stagePoint(767.49, 826.41),
  handPivot: stagePoint(762.8, 547.56),
  neckPivot: stagePoint(539, 382),
  fringePivot: stagePoint(535, 143),
  baseImages: [office, shirtAndSkirt, restSleeve, headBase, bobLeft, bobRight],
  poseImages: {
    greeting: [raisedSleeve, waveForearm, wave],
    point: [raisedSleeve, pointForearm, point],
  },
};
