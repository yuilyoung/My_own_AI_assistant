import { memo } from "react";
import type { PaintedFaceRig } from "./PaintedFace";
import { isolBody, isolProjection, isolPivot } from "./IsolBodyArt";
import campus from "./portraits/isol/campus.webp";
import head from "./portraits/isol/head.webp";
import fringe from "./portraits/isol/fringe.webp";
import bobLeft from "./portraits/isol/bob-left.webp";
import bobRight from "./portraits/isol/bob-right.webp";
import eyeLeft from "./portraits/isol/eye-left.webp";
import eyeRight from "./portraits/isol/eye-right.webp";
import browLeft from "./portraits/isol/brow-left.webp";
import browRight from "./portraits/isol/brow-right.webp";
import mouthRest from "./portraits/isol/mouth-rest.webp";
import mouthUpper from "./portraits/isol/mouth-upper.webp";
import mouthLower from "./portraits/isol/mouth-lower.webp";
import irisLeft from "./portraits/isol/iris-left.webp";
import socketLeft from "./portraits/isol/socket-left.webp";
import lashesLeft from "./portraits/isol/lashes-left.webp";
import irisRight from "./portraits/isol/iris-right.webp";
import socketRight from "./portraits/isol/socket-right.webp";
import lashesRight from "./portraits/isol/lashes-right.webp";
import lidLeft from "./portraits/isol/lid-left.webp";
import lidRight from "./portraits/isol/lid-right.webp";

const Backdrop = memo(function IsolCampus() {
  return (
    <image className="isol__campus" href={campus} width="360" height="360" />
  );
});

const HairBehind = memo(function IsolHead() {
  return (
    <g transform={isolProjection}>
      <image
        className="isol__head"
        href={head}
        x="153"
        y="0"
        width="294"
        height="338"
      />
    </g>
  );
});

const Fringe = memo(function IsolBob() {
  return (
    <>
      <g
        className="isol__bob-left"
        style={{
          transformOrigin: isolPivot(190, 160),
          transform: "rotate(calc(.75 * var(--lock-left-angle, 0deg)))",
        }}
      >
        <g transform={isolProjection}>
          <image
            className="isol__lock-left"
            href={bobLeft}
            x="153"
            y="148"
            width="87"
            height="185"
          />
        </g>
      </g>
      <g
        className="isol__bob-right"
        style={{
          transformOrigin: isolPivot(394, 158),
          transform: "rotate(calc(.75 * var(--lock-right-angle, 0deg)))",
        }}
      >
        <g transform={isolProjection}>
          <image
            className="isol__lock-right"
            href={bobRight}
            x="339"
            y="146"
            width="106"
            height="192"
          />
        </g>
      </g>
      <g transform={isolProjection}>
        <image
          className="isol__fringe"
          href={fringe}
          x="264"
          y="49"
          width="75"
          height="121"
        />
      </g>
    </>
  );
});

const faceRig: PaintedFaceRig = {
  transform: isolProjection,
  eyes: [
    {
      open: { src: eyeLeft, x: 227, y: 152, width: 55, height: 39 },
      brow: { src: browLeft, x: 230, y: 133, width: 44, height: 19 },
      closed: { src: lidLeft, x: 227, y: 172, width: 48, height: 15 },
      center: [257.3, 173.8],
      blinkY: 181,
      gaze: {
        socket: { src: socketLeft, x: 234, y: 163, width: 43, height: 25 },
        iris: { src: irisLeft, x: 245, y: 160, width: 26, height: 28 },
        lid: { src: lashesLeft, x: 227, y: 152, width: 55, height: 39 },
        contour:
          "M235.7 176.6Q239.4 170.5 246.7 167.4Q254.7 163.2 261.8 164.6Q270 165.1 275.1 171.5Q273.6 179.4 268.3 182.4Q263.8 185.5 256.8 185.1Q244.3 186.2 238 180.9Z",
        travel: [2.8, 1.1],
      },
    },
    {
      open: { src: eyeRight, x: 321, y: 149, width: 53, height: 37 },
      brow: { src: browRight, x: 327, y: 134, width: 6, height: 4 },
      closed: { src: lidRight, x: 325, y: 167, width: 48, height: 16 },
      center: [342.6, 169.8],
      blinkY: 177.6,
      gaze: {
        socket: { src: socketRight, x: 325, y: 159, width: 43, height: 24 },
        iris: { src: irisRight, x: 330, y: 157, width: 26, height: 27 },
        lid: { src: lashesRight, x: 321, y: 149, width: 53, height: 37 },
        contour:
          "M326.9 170.4Q331.3 163.6 338.3 162Q346 159.6 351.7 161.8Q360.9 164.1 365.7 171Q363.8 177.8 355 180Q344 182.2 335.2 179.5Q328.7 177.5 326.9 174.2Z",
        travel: [2.8, 1.1],
      },
    },
  ],
  mouth: {
    rest: { src: mouthRest, x: 277, y: 230, width: 53, height: 23 },
    upper: { src: mouthUpper, x: 277, y: 230, width: 53, height: 11 },
    lower: { src: mouthLower, x: 278, y: 235, width: 52, height: 18 },
    center: [303.5, 239.35],
    width: 40.2,
    height: 15.1,
    angle: -2.7,
    cornerRise: 1.6,
    color: "#884d44",
    tongue: "#dc8c7f",
    teeth: "#fae9d8",
  },
};

export const isolArt = {
  ...isolBody,
  Backdrop,
  HairBehind,
  Fringe,
  faceRig,
  neckPivot: isolPivot(302, 313),
  fringePivot: isolPivot(274, 73),
  baseImages: [campus, head, bobLeft, bobRight, fringe, ...isolBody.bodyImages],
};
