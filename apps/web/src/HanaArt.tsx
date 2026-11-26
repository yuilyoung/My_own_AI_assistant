import { memo } from "react";
import type { PaintedFaceRig } from "./PaintedFace";
import { hanaBody } from "./HanaBodyArt";
import classroom from "./portraits/hana/classroom.webp";
import eyeLeft from "./portraits/hana/eye-left.webp";
import eyeRight from "./portraits/hana/eye-right.webp";
import browLeft from "./portraits/hana/brow-left.webp";
import browRight from "./portraits/hana/brow-right.webp";
import lips from "./portraits/hana/lips.webp";
import lipUpper from "./portraits/hana/lip-upper.webp";
import lipLower from "./portraits/hana/lip-lower.webp";
import irisLeft from "./portraits/hana/iris-left.webp";
import socketLeft from "./portraits/hana/socket-left.webp";
import lashLeft from "./portraits/hana/lash-left.webp";
import irisRight from "./portraits/hana/iris-right.webp";
import socketRight from "./portraits/hana/socket-right.webp";
import lashRight from "./portraits/hana/lash-right.webp";
import lidLeft from "./portraits/hana/lid-left.webp";
import lidRight from "./portraits/hana/lid-right.webp";
import head from "./portraits/hana/head.webp";
import hairRear from "./portraits/hana/hair-rear.webp";
import fringe from "./portraits/hana/fringe.webp";
import lockLeft from "./portraits/hana/lock-left.webp";
import lockRight from "./portraits/hana/lock-right.webp";

// The complete 1024×1536 master is sampled uniformly at 684×1026.
// No crop is applied. Original pixel (x,y) maps to (57+.24046875x, 5+.24046875y).
const placement = "translate(57 5) scale(.36)";

const Backdrop = memo(function HanaClassroom() {
  return (
    <image
      className="hana__classroom"
      href={classroom}
      width="360"
      height="360"
    />
  );
});
const RearHair = memo(function HanaRearHair() {
  return (
    <g transform={placement}>
      <image
        className="hana__rear-hair"
        href={hairRear}
        x="22"
        y="235"
        width="632"
        height="611"
      />
    </g>
  );
});
const HairBehind = memo(function HanaHead() {
  return (
    <g transform={placement}>
      <image
        className="hana__portrait"
        href={head}
        x="162"
        y="0"
        width="347"
        height="336"
      />
    </g>
  );
});
const Fringe = memo(function HanaLooseHair() {
  return (
    <>
      <g
        className="hana__lock-left"
        style={{
          transformOrigin: "132px 98px",
          transform: "rotate(calc(.75 * var(--lock-left-angle, 0deg)))",
        }}
      >
        <g transform={placement}>
          <image href={lockLeft} x="156" y="223" width="75" height="507" />
        </g>
      </g>
      <g
        className="hana__lock-right"
        style={{
          transformOrigin: "215px 96px",
          transform: "rotate(calc(.75 * var(--lock-right-angle, 0deg)))",
        }}
      >
        <g transform={placement}>
          <image href={lockRight} x="430" y="225" width="100" height="498" />
        </g>
      </g>
      <g transform={placement}>
        <image
          className="hana__fringe"
          href={fringe}
          x="288"
          y="39"
          width="96"
          height="176"
        />
      </g>
    </>
  );
});

const faceRig: PaintedFaceRig = {
  transform: placement,
  eyes: [
    {
      open: { src: eyeLeft, x: 259, y: 186, width: 63, height: 34 },
      brow: { src: browLeft, x: 260, y: 168, width: 64, height: 15 },
      closed: { src: lidLeft, x: 259, y: 199, width: 56, height: 15 },
      center: [296.6, 201.2],
      blinkY: 208.2,
      gaze: {
        socket: { src: socketLeft, x: 269, y: 192, width: 49, height: 25 },
        iris: { src: irisLeft, x: 284, y: 187, width: 27, height: 29 },
        lid: { src: lashLeft, x: 259, y: 186, width: 63, height: 34 },
        contour:
          "M270.6 202.0Q275.2 197.7 282.3 196Q291 191.7 299.1 193.5Q308.1 193.9 315.8 201.6Q310.9 208.8 305.7 211.4Q298 216 286.9 214.4Q275.3 212 270.6 206.3Z",
        travel: [3.1, 1.2],
      },
    },
    {
      open: { src: eyeRight, x: 366, y: 179, width: 63, height: 34 },
      brow: { src: browRight, x: 357, y: 158, width: 63, height: 23 },
      closed: { src: lidRight, x: 366, y: 188, width: 61, height: 22 },
      center: [390.6, 195.6],
      blinkY: 202.8,
      gaze: {
        socket: { src: socketRight, x: 369, y: 183, width: 50, height: 27 },
        iris: { src: irisRight, x: 378, y: 181, width: 26, height: 30 },
        lid: { src: lashRight, x: 366, y: 179, width: 63, height: 34 },
        contour:
          "M370.1 198.3Q376.0 190.6 382.4 187.7Q392 183.4 402.2 185.2Q409.1 185.5 416.8 191.3Q415 199.7 405 203.9Q397.8 208.1 386.2 207Q375.3 206.6 370.1 201.2Z",
        travel: [3.1, 1.2],
      },
    },
  ],
  mouth: {
    rest: { src: lips, x: 323, y: 264, width: 56, height: 26 },
    upper: { src: lipUpper, x: 323, y: 264, width: 55, height: 13 },
    lower: { src: lipLower, x: 324, y: 267, width: 55, height: 23 },
    center: [349.4, 274.3],
    width: 42.4,
    height: 15.9,
    angle: -5.0,
    cornerRise: 2.35,
    color: "#824754",
    tongue: "#d98993",
    teeth: "#ffefdf",
  },
};

export const hanaArt = {
  ...hanaBody,
  Backdrop,
  RearHair,
  HairBehind,
  Fringe,
  faceRig,
  neckPivot: "182px 124px",
  rearHairPivot: "180px 83px",
  fringePivot: "170px 30px",
  baseImages: [
    classroom,
    head,
    hairRear,
    lockLeft,
    lockRight,
    fringe,
    ...hanaBody.bodyImages,
  ],
};
