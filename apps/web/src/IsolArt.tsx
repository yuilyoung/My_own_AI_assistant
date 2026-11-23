import { memo } from "react";
import type { PaintedFaceRig } from "./PaintedFace";
import library from "./portraits/isol/library.webp";
import body from "./portraits/isol/body.webp";
import head from "./portraits/isol/head.webp";
import fringe from "./portraits/isol/fringe.webp";
import greetingArm from "./portraits/isol/greeting.webp";
import pointingArm from "./portraits/isol/point.webp";
import leftEye from "./portraits/isol/eye-left.webp";
import rightEye from "./portraits/isol/eye-right.webp";
import leftBrow from "./portraits/isol/brow-left.webp";
import rightBrow from "./portraits/isol/brow-right.webp";
import leftLid from "./portraits/isol/lid-left.webp";
import rightLid from "./portraits/isol/lid-right.webp";
import lips from "./portraits/isol/mouth-rest.webp";
import upperLip from "./portraits/isol/mouth-upper.webp";
import lowerLip from "./portraits/isol/mouth-lower.webp";

type ArtProps = { id: string };

// All facial features retain their measured positions in the original 600-unit painting.
const faceRig: PaintedFaceRig = {
  transform: "translate(-15.5 28) scale(.64)",
  eyes: [
    {
      open: { src: leftEye, x: 216, y: 155, width: 48, height: 46 },
      closed: { src: leftLid, x: 216, y: 180, width: 43, height: 15 },
      brow: { src: leftBrow, x: 209, y: 150, width: 42, height: 26 },
      center: [239.2, 183.3],
      blinkY: 188.8,
    },
    {
      open: { src: rightEye, x: 283, y: 152, width: 67, height: 33 },
      closed: { src: rightLid, x: 288, y: 162, width: 60, height: 19 },
      brow: { src: rightBrow, x: 266, y: 138, width: 77, height: 13 },
      center: [317.2, 170.5],
      blinkY: 176.2,
    },
  ],
  mouth: {
    rest: { src: lips, x: 270, y: 223, width: 44, height: 28 },
    upper: { src: upperLip, x: 270, y: 223, width: 43, height: 15 },
    lower: { src: lowerLip, x: 270, y: 228, width: 44, height: 23 },
    center: [292, 234.8],
    angle: -9.4,
    cornerRise: 2.1,
    width: 31.5,
    height: 12.8,
    color: "#85473e",
    tongue: "#d48671",
    teeth: "#f8e6c8",
  },
};

const Backdrop = memo(function IsolLibrary() {
  return <image href={library} width="360" height="360" />;
});

const Wardrobe = memo(function IsolCardigan({
  id,
  greeting,
}: ArtProps & { greeting: boolean }) {
  return (
    <g>
      {greeting && (
        <defs>
          <clipPath id={id + "-isol-torso"}>
            <path d="M0 0H360V241H266Q289 244 298 267Q298 278 294 293Q288 310 290 326Q292 344 298 360H0Z" />
          </clipPath>
        </defs>
      )}
      <image
        className="isol__braid"
        href={body}
        width="360"
        height="360"
        clipPath={greeting ? `url(#${id}-isol-torso)` : undefined}
      />
      {greeting && (
        <path
          d="M294 293Q288 310 290 326Q292 344 298 360"
          fill="none"
          stroke="#8b7257"
          strokeWidth="0.7"
        />
      )}
    </g>
  );
});

// Both the sleeve and its fingers belong to one pose, with the joint at the shoulder.
const Hand = memo(function IsolArm({
  gesture,
}: {
  gesture: "greeting" | "point";
}) {
  return (
    <image
      href={gesture === "greeting" ? greetingArm : pointingArm}
      x="255"
      y="170"
      width="99"
      height="155"
    />
  );
});

const ArmForeground = memo(function IsolBraidOverSleeve({ id }: ArtProps) {
  const clip = id + "-braid-over-sleeve";
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <path d="M237 226H267Q270 235 265 241Q267 245 274 247Q284 250 281 259Q280 266 272 270Q279 275 282 280Q287 283 285 287L282 292Q284 298 282 304H238Z" />
        </clipPath>
      </defs>
      <image href={body} width="360" height="360" clipPath={`url(#${clip})`} />
    </g>
  );
});

const HairBehind = memo(function IsolHair() {
  return <image href={head} width="360" height="360" />;
});

const Fringe = memo(function IsolFringe() {
  return (
    <g className="anime__hair-tip" style={{ transformOrigin: "124px 185px" }}>
      <image href={fringe} width="360" height="360" />
    </g>
  );
});

export const isolArt = {
  Backdrop,
  Wardrobe,
  HairBehind,
  Fringe,
  Hand,
  ArmForeground,
  handPivot: "280px 255px",
  faceRig,
  baseImages: [library, body, head, fringe],
  poseImages: { greeting: [greetingArm], point: [pointingArm] },
};
