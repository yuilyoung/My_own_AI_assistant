import { memo } from "react";
import type { PaintedFaceRig } from "./PaintedFace";
import type { MotionCue } from "./avatar-motion";
import office from "./portraits/seorin/office.webp";
import jacket from "./portraits/seorin/jacket.webp";
import raisedJacket from "./portraits/seorin/raised-jacket.webp";
import head from "./portraits/seorin/head-base.webp";
import earring from "./portraits/seorin/earring.webp";
import earringUnderpaint from "./portraits/seorin/earring-underpaint.webp";
import frontLock from "./portraits/seorin/front-sweep.webp";
import leftEye from "./portraits/seorin/eye-l.webp";
import rightEye from "./portraits/seorin/eye-r.webp";
import leftSocket from "./portraits/seorin/socket-left.webp";
import leftIris from "./portraits/seorin/iris-left.webp";
import leftLashes from "./portraits/seorin/lashes-left.webp";
import rightSocket from "./portraits/seorin/socket-right.webp";
import rightIris from "./portraits/seorin/iris-right.webp";
import rightLashes from "./portraits/seorin/lashes-right.webp";
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
      gaze: {
        socket: { src: leftSocket, x: 215, y: 197, width: 52, height: 18 },
        iris: { src: leftIris, x: 230, y: 187, width: 29, height: 29 },
        lid: { src: leftLashes, x: 215, y: 197, width: 52, height: 18 },
        contour:
          "M 218 206.67 Q 222.33 203 227 202.17 Q 231.83 200.33 238.67 200 Q 245.83 198.83 253.5 199.83 Q 259 200 264.83 202.83 Q 264.33 205 259.17 206.67 Q 251.5 208.67 244.5 210.17 Q 238.83 211.5 233.5 212.67 Q 228.17 212.83 223.83 211 Q 220.33 209.33 218 207.5 Z",
        travel: [4.1, 1.45],
      },
      brow: { src: leftBrow, x: 192, y: 169, width: 87, height: 25 },
      closed: { src: leftBlink, x: 197, y: 191, width: 85, height: 34 },
      center: [244, 202],
      blinkY: 211,
    },
    {
      open: { src: rightEye, x: 296, y: 167, width: 80, height: 41 },
      gaze: {
        socket: { src: rightSocket, x: 309, y: 179, width: 51, height: 20 },
        iris: { src: rightIris, x: 319, y: 172, width: 27, height: 28 },
        lid: { src: rightLashes, x: 309, y: 179, width: 51, height: 19 },
        contour:
          "M 311.17 194.67 Q 315.17 189.33 320 187.17 Q 324.67 184.5 330 183.5 Q 337.83 181.17 344.33 182.17 Q 351 182.17 357.33 182.33 Q 356.33 185 353.33 188.5 Q 351 192.17 346.83 193.33 Q 341.17 195 335.33 195 Q 328.33 195.33 322.5 196.17 L 315.5 196.67 Q 312.83 196.17 311.17 195.5 Z",
        travel: [3.8, 1.35],
      },
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

const costume = placement + " translate(35 288)";

const Wardrobe = memo(function SeorinWardrobe({
  id,
  greeting: raised,
}: {
  id: string;
  greeting: boolean;
}) {
  // The two masks follow the shoulder seam in the 560 × 312 costume crop.
  // The stationary panel overlaps the moving sleeve under the armhole.
  return (
    <g data-art="seorin-office-tailoring">
      <g transform={placement}>
        <path
          d="M142 385Q175 375 210 370L243 364L267 428L248 600H138Z"
          fill="#40383b"
        />
        <path
          d="M262 282Q306 303 351 269L356 345Q315 374 261 338Z"
          fill="#bc9079"
        />
      </g>
      {raised ? (
        <>
          <defs>
            <clipPath id={id + "-coat-panel"}>
              <path d="M0 0H423V98Q431 127 421 165Q414 195 426 235Q430 247 438 261L435 312H0Z" />
            </clipPath>
            <clipPath id={id + "-upper-sleeve"}>
              <path d="M419 74Q425 123 417 153Q406 186 414 219Q419 245 428 258Q488 301 516 300Q529 295 537 278Q509 274 484 250Q472 237 469 201Q464 150 444 98L440 75Z" />
            </clipPath>
          </defs>
          <g transform={costume}>
            <image
              href={raisedJacket}
              width="560"
              height="312"
              clipPath={`url(#${id}-coat-panel)`}
            />
          </g>
          <g className="narration__upper-arm seorin__raised-sleeve">
            <g transform={costume}>
              {/* The folded forearm uncovers the far side of the upper sleeve. */}
              <path
                d="M430 117Q453 118 463 145L523 245Q538 264 530 280Q524 295 510 295Q481 293 451 267L427 248Q411 200 430 117Z"
                fill="#4b3e42"
              />
              <path
                d="M430 170Q441 188 455 202Q483 225 516 272Q486 245 468 242Q446 225 430 170Z"
                fill="#3a3034"
              />
              <path
                d="M447 237Q478 268 518 287Q490 285 457 260Z"
                fill="#2e272a"
              />
              <image
                href={raisedJacket}
                width="560"
                height="312"
                clipPath={`url(#${id}-upper-sleeve)`}
              />
            </g>
          </g>
        </>
      ) : (
        <g className="seorin__resting-sleeve" transform={costume}>
          <image href={jacket} width="528" height="312" />
        </g>
      )}
    </g>
  );
});

const Forearm = memo(function SeorinForearm({ id }: { id: string }) {
  return (
    <g transform={costume}>
      <defs>
        {" "}
        <clipPath id={id + "-forearm"}>
          <path d="M435 0H560V312H506Q485 291 474 276Q466 261 467 237Q471 221 469 201Q465 151 451 110L440 86Z" />
        </clipPath>
      </defs>
      <image
        href={raisedJacket}
        width="560"
        height="312"
        clipPath={`url(#${id}-forearm)`}
      />
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
      <image href={earringUnderpaint} x="371" y="236" width="19" height="29" />
    </g>
  );
});

const Accessory = memo(function SeorinGoldDrop() {
  return (
    <g transform={placement}>
      <image href={earring} x="371" y="236" width="19" height="29" />
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
  Accessory,
  Forearm,
  Hand,
  faceRig,
  shoulderPivot: "273px 244px",
  elbowPivot: "327px 344px",
  handPivot: "298px 211px",
  neckPivot: "184px 205px",
  fringePivot: "86.4px 166.2px",
  accessoryPivot: "228px 151.3px",
  baseImages: [office, jacket, head, frontLock, earringUnderpaint, earring],
  poseImages: { greeting: [raisedJacket, wave], point: [raisedJacket, point] },
};
