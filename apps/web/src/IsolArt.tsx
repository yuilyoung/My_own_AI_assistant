import { memo } from "react";
import type { MotionCue } from "./avatar-motion";
import type { PaintedFaceRig } from "./PaintedFace";
import library from "./portraits/isol/library.webp";
import body from "./portraits/isol/body.webp";
import head from "./portraits/isol/head.webp";
import fringe from "./portraits/isol/fringe.webp";
import ribbonTails from "./portraits/isol/ribbon-tails.webp";
import ribbonUnderpaint from "./portraits/isol/ribbon-underpaint.webp";
import greetingArm from "./portraits/isol/greeting.webp";
import pointingArm from "./portraits/isol/point.webp";
import greetingSleeve from "./portraits/isol/greeting-sleeve.webp";
import pointingSleeve from "./portraits/isol/point-sleeve.webp";
import greetingForearm from "./portraits/isol/greeting-forearm.webp";
import pointingForearm from "./portraits/isol/point-forearm.webp";
import leftEye from "./portraits/isol/eye-left.webp";
import rightEye from "./portraits/isol/eye-right.webp";
import leftSocket from "./portraits/isol/socket-left.webp";
import leftIris from "./portraits/isol/iris-left.webp";
import leftLashes from "./portraits/isol/lashes-left.webp";
import rightSocket from "./portraits/isol/socket-right.webp";
import rightIris from "./portraits/isol/iris-right.webp";
import rightLashes from "./portraits/isol/lashes-right.webp";
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
      gaze: {
        socket: { src: leftSocket, x: 227, y: 173, width: 33, height: 24 },
        iris: { src: leftIris, x: 235, y: 168, width: 25, height: 31 },
        lid: { src: leftLashes, x: 227, y: 173, width: 32, height: 24 },
        contour:
          "M 229.17 187.83 Q 229.33 183.33 232.33 180.5 Q 235 178 239 177.17 Q 246 174.67 251.5 176.83 Q 255.17 178 256.67 181.17 Q 258 185.5 257 189.83 Q 252 191.33 246.67 193.33 Q 241.83 195 238.5 194.83 Q 234.33 194.5 231.33 191.67 Q 229.67 190.17 229.17 187.83 Z",
        travel: [2.9, 1.15],
      },
      closed: { src: leftLid, x: 216, y: 180, width: 43, height: 15 },
      brow: { src: leftBrow, x: 209, y: 150, width: 42, height: 26 },
      center: [239.2, 183.3],
      blinkY: 188.8,
    },
    {
      open: { src: rightEye, x: 283, y: 152, width: 67, height: 33 },
      gaze: {
        socket: { src: rightSocket, x: 296, y: 161, width: 42, height: 23 },
        iris: { src: rightIris, x: 306, y: 155, width: 27, height: 30 },
        lid: { src: rightLashes, x: 296, y: 161, width: 42, height: 22 },
        contour:
          "M 298.83 170.17 Q 299 167.17 303.5 165.5 Q 307.83 163.5 313.67 163.5 Q 319.83 162.33 327.33 164.67 Q 333.17 165.83 335.17 169 Q 336.17 173 332.67 176.83 Q 329.83 179.33 326 180.33 Q 318.67 180.83 310.83 181 L 306.17 181 Q 302.17 179.5 300.17 176 Q 299 173.5 298.83 170.17 Z",
        travel: [3.8, 1.35],
      },
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
  gesture,
}: ArtProps & { greeting: boolean; gesture: MotionCue }) {
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
      <image href={ribbonUnderpaint} x="241" y="322" width="47" height="34" />
      <g
        className="isol__ribbon-tails"
        style={{
          transformOrigin: "269px 323px",
          transform: "rotate(calc(var(--accessory-angle, 0deg) * 1.25))",
        }}
      >
        <image href={ribbonTails} x="241" y="322" width="47" height="34" />
      </g>
      {greeting && (
        <g className="narration__upper-arm">
          {gesture === "point" ? (
            <image
              href={pointingSleeve}
              x="264"
              y="243"
              width="49"
              height="70"
            />
          ) : (
            <image
              href={greetingSleeve}
              x="264"
              y="246"
              width="47"
              height="67"
            />
          )}
        </g>
      )}
    </g>
  );
});

const Forearm = memo(function IsolKnittedForearm({
  gesture,
}: {
  gesture: "greeting" | "point";
}) {
  return gesture === "point" ? (
    <image href={pointingForearm} x="292" y="237" width="39" height="81" />
  ) : (
    <image href={greetingForearm} x="292" y="241" width="33" height="76" />
  );
});

// The painted wrist extends just under its matching turned-back cuff.
const Hand = memo(function IsolArm({
  gesture,
}: {
  gesture: "greeting" | "point";
}) {
  return gesture === "greeting" ? (
    <image href={greetingArm} x="298" y="179" width="50" height="68" />
  ) : (
    <image href={pointingArm} x="308" y="179" width="38" height="64" />
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
  return <image href={fringe} width="360" height="360" />;
});

export const isolArt = {
  Backdrop,
  Wardrobe,
  Forearm,
  HairBehind,
  Fringe,
  Hand,
  ArmForeground,
  shoulderPivot: "280px 255px",
  elbowPivot: "302px 300px",
  handPivot: "316px 243px",
  neckPivot: "174px 205px",
  fringePivot: "124px 185px",
  faceRig,
  baseImages: [library, body, head, fringe, ribbonTails, ribbonUnderpaint],
  poseImages: {
    greeting: [greetingArm, greetingSleeve, greetingForearm],
    point: [pointingArm, pointingSleeve, pointingForearm],
  },
};
