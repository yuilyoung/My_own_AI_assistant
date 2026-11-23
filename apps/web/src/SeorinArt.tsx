import { memo } from "react";
import type { PaintedFaceRig } from "./PaintedFace";
import type { MotionCue } from "./avatar-motion";
import office from "./portraits/seorin/office.webp";
import jacket from "./portraits/seorin/jacket.webp";
import raisedJacket from "./portraits/seorin/raised-jacket.webp";
import head from "./portraits/seorin/head-base.webp";
import frontLock from "./portraits/seorin/front-sweep.webp";
import leftEye from "./portraits/seorin/eye-l.webp";
import rightEye from "./portraits/seorin/eye-r.webp";
import leftBrow from "./portraits/seorin/brow-l.webp";
import rightBrow from "./portraits/seorin/brow-r.webp";
import leftBlink from "./portraits/seorin/closed-l.webp";
import rightBlink from "./portraits/seorin/closed-r.webp";
import lips from "./portraits/seorin/lip.webp";
import upperLip from "./portraits/seorin/upper-lip.webp";
import lowerLip from "./portraits/seorin/lower-lip.webp";
import wave from "./portraits/seorin/wave.webp";
import point from "./portraits/seorin/point.webp";

type ArmPose = Extract<MotionCue, "greeting" | "point">;

// Every painted crop uses the same 600-unit drawing and uniform stage scale.
const placement = "translate(0 9) scale(.6)";
const faceRig = {
  transform: placement,
  eyes: [
    {
      open: { src: leftEye, x: 198, y: 183, width: 86, height: 38 },
      brow: { src: leftBrow, x: 192, y: 169, width: 87, height: 25 },
      closed: { src: leftBlink, x: 197, y: 191, width: 85, height: 34 },
      center: [244, 202],
      blinkY: 211,
    },
    {
      open: { src: rightEye, x: 296, y: 167, width: 80, height: 41 },
      brow: { src: rightBrow, x: 290, y: 150, width: 79, height: 36 },
      closed: { src: rightBlink, x: 297, y: 175, width: 79, height: 36 },
      center: [334, 188],
      blinkY: 198,
    },
  ],
  mouth: {
    rest: { src: lips, x: 269, y: 257, width: 69, height: 36 },
    upper: { src: upperLip, x: 269, y: 257, width: 69, height: 36 },
    lower: { src: lowerLip, x: 269, y: 257, width: 69, height: 36 },
    center: [304, 274.8],
    width: 52.5,
    height: 19,
    angle: -11.6,
    cornerRise: 3.5,
    color: "#683a40",
    tongue: "#bc7271",
    teeth: "#f9ead5",
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
  greeting: raised,
}: {
  greeting: boolean;
}) {
  return (
    <g data-art="seorin-office-tailoring" transform={placement}>
      {/* Extend the blazer beneath the loose lock and the neck behind the jaw. */}
      <path
        d="M142 385Q175 375 210 370L243 364L267 428L248 600H138Z"
        fill="#40383b"
      />
      <path
        d="M262 282Q306 303 351 269L356 345Q315 374 261 338Z"
        fill="#bc9079"
      />
      {raised ? (
        <g className="seorin__raised-sleeve">
          <image href={raisedJacket} x="35" y="288" width="560" height="312" />
        </g>
      ) : (
        <g className="seorin__resting-sleeve">
          <image href={jacket} x="35" y="288" width="528" height="312" />
        </g>
      )}
    </g>
  );
});

const Hand = memo(function SeorinHand({ gesture }: { gesture: ArmPose }) {
  return (
    <g transform={placement}>
      <image
        href={gesture === "point" ? point : wave}
        x="429"
        y="147"
        width="132"
        height="198"
      />
    </g>
  );
});

const HairBehind = memo(function SeorinHead() {
  return (
    <g transform={placement}>
      <image href={head} x="83" y="0" width="363" height="600" />
    </g>
  );
});

const Fringe = memo(function SeorinLooseLock() {
  return (
    <g transform={placement}>
      <g className="anime__hair-tip" style={{ transformOrigin: "144px 262px" }}>
        <image href={frontLock} x="83" y="249" width="69" height="138" />
      </g>
    </g>
  );
});

export const seorinArt = {
  Backdrop,
  Wardrobe,
  HairBehind,
  Fringe,
  Hand,
  faceRig,
  handPivot: "298px 211px",
  baseImages: [office, jacket, head, frontLock],
  poseImages: { greeting: [raisedJacket, wave], point: [raisedJacket, point] },
};
