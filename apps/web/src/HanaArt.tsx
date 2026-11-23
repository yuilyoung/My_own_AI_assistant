import { memo } from "react";
import type { MotionCue } from "./avatar-motion";
import classroom from "./portraits/hana/classroom.webp";
import head from "./portraits/hana/head.webp";
import leftEye from "./portraits/hana/eye-left.webp";
import rightEye from "./portraits/hana/eye-right.webp";
import leftBrow from "./portraits/hana/brow-left.webp";
import rightBrow from "./portraits/hana/brow-right.webp";
import leftLid from "./portraits/hana/lid-left.webp";
import rightLid from "./portraits/hana/lid-right.webp";
import lips from "./portraits/hana/lips.webp";
import upperLip from "./portraits/hana/lip-upper.webp";
import lowerLip from "./portraits/hana/lip-lower.webp";
import type { PaintedFaceRig } from "./PaintedFace";
import relaxed from "./portraits/hana/relaxed.webp";
import waving from "./portraits/hana/waving.webp";
import pointing from "./portraits/hana/pointing.webp";
import waveHand from "./portraits/hana/wave-hand.webp";
import pointHand from "./portraits/hana/point-hand.webp";

type ArtProps = { id: string };
type ArmGesture = "greeting" | "point";

// The face and costume have separate source coordinate systems. Each cropped
// image keeps its original offset, including the cuffs under the rotating hands.
const headPlacement = "translate(52 -1.6) scale(.32)";
const uniformPlacement = "translate(-2.9 156) scale(.54)";

const Backdrop = memo(function Backdrop(_props: ArtProps) {
  return (
    <image
      className="hana__classroom"
      href={classroom}
      width="360"
      height="360"
    />
  );
});

const Wardrobe = memo(function Wardrobe({
  greeting,
  gesture,
}: ArtProps & {
  greeting: boolean;
  gesture?: MotionCue;
}) {
  const shirt = !greeting ? relaxed : gesture === "point" ? pointing : waving;
  return (
    <g transform={uniformPlacement}>
      <image
        className={greeting ? "hana__raised-sleeve" : "seorin__resting-sleeve"}
        href={shirt}
        x="62"
        y="54"
        width="500"
        height="350"
      />
    </g>
  );
});

const Hand = memo(function Hand({
  gesture,
}: ArtProps & { gesture: ArmGesture }) {
  return (
    <g transform={uniformPlacement}>
      {gesture === "point" ? (
        <image href={pointHand} x="466" y="64" width="90" height="164" />
      ) : (
        <image href={waveHand} x="450" y="52" width="140" height="163" />
      )}
    </g>
  );
});

// All coordinates below come from Hana’s original 700 × 700 painted cel.
// Only the eye, brow and lip strokes were lifted. Her jaw, nose, cheek shading,
// fringe and hair clips retain the proportions and lighting of the illustration.
const HairBehind = memo(function HairBehind(_props: ArtProps) {
  return (
    <g transform={headPlacement}>
      <image className="hana__portrait" href={head} width="700" height="700" />
    </g>
  );
});

const faceRig: PaintedFaceRig = {
  transform: headPlacement,
  eyes: [
    {
      open: { src: leftEye, x: 172, y: 379, width: 129, height: 88 },
      brow: { src: leftBrow, x: 180, y: 336, width: 118, height: 33 },
      center: [246, 429],
      blinkY: 438,
      closed: { src: leftLid, x: 174, y: 417, width: 120, height: 32 },
    },
    {
      open: { src: rightEye, x: 395, y: 374, width: 123, height: 89 },
      brow: { src: rightBrow, x: 377, y: 330, width: 133, height: 35 },
      center: [450, 424],
      blinkY: 436,
      closed: { src: rightLid, x: 396, y: 413, width: 120, height: 34 },
    },
  ],
  mouth: {
    rest: { src: lips, x: 305, y: 563, width: 99, height: 39 },
    upper: { src: upperLip, x: 306, y: 564, width: 97, height: 18 },
    lower: { src: lowerLip, x: 306, y: 571, width: 97, height: 30 },
    center: [354, 580.5],
    width: 86,
    height: 29,
    angle: -2.3,
    cornerRise: 8.3,
    color: "#733f3a",
    tongue: "#d98e7f",
    teeth: "#fff0df",
  },
};

export const hanaArt = {
  Backdrop,
  Wardrobe,
  HairBehind,
  Hand,
  faceRig,
  baseImages: [classroom, relaxed, head],
  poseImages: { greeting: [waving, waveHand], point: [pointing, pointHand] },
  handPivot: "264px 270px",
};
