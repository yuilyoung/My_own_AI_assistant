import { memo } from "react";
import type { MotionCue } from "./avatar-motion";
import type { PaintedFaceRig } from "./PaintedFace";
import classroom from "./portraits/hana/classroom.webp";
import head from "./portraits/hana/head.webp";
import hairRear from "./portraits/hana/hair-rear.webp";
import lockLeft from "./portraits/hana/lock-left.webp";
import lockRight from "./portraits/hana/lock-right.webp";
import fringe from "./portraits/hana/fringe.webp";
import bodice from "./portraits/hana/bodice.webp";
import ribbon from "./portraits/hana/ribbon.webp";
import relaxed from "./portraits/hana/relaxed.webp";
import waving from "./portraits/hana/waving.webp";
import pointing from "./portraits/hana/pointing.webp";
import forearmWave from "./portraits/hana/forearm-wave.webp";
import forearmPoint from "./portraits/hana/forearm-point.webp";
import waveHand from "./portraits/hana/wave-hand.webp";
import pointHand from "./portraits/hana/point-hand.webp";
import eyeLeft from "./portraits/hana/eye-left.webp";
import eyeRight from "./portraits/hana/eye-right.webp";
import browLeft from "./portraits/hana/brow-left.webp";
import browRight from "./portraits/hana/brow-right.webp";
import lidLeft from "./portraits/hana/lid-left.webp";
import lidRight from "./portraits/hana/lid-right.webp";
import socketLeft from "./portraits/hana/socket-left.webp";
import socketRight from "./portraits/hana/socket-right.webp";
import irisLeft from "./portraits/hana/iris-left.webp";
import irisRight from "./portraits/hana/iris-right.webp";
import lashLeft from "./portraits/hana/lash-left.webp";
import lashRight from "./portraits/hana/lash-right.webp";
import lips from "./portraits/hana/lips.webp";
import lipUpper from "./portraits/hana/lip-upper.webp";
import lipLower from "./portraits/hana/lip-lower.webp";

type ArtProps = { id: string };
type ArmGesture = "greeting" | "point";

const headPlacement = "translate(13.4 5.85) scale(.55)";
const uniformPlacement = "translate(-2.9 156) scale(.54)";
const shoulderPivot = "240px 229px";

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

// Each piece retains the crop coordinates from its source cel. The posing groups
// above these placements turn in the same 360-unit coordinate system as the hand.
const Wardrobe = memo(function Wardrobe({
  greeting,
  gesture,
}: ArtProps & { greeting: boolean; gesture?: MotionCue }) {
  return (
    <>
      <g transform={uniformPlacement}>
        <image href={bodice} x="62" y="54" width="396" height="350" />
        {!greeting && (
          <image
            className="seorin__resting-sleeve"
            href={relaxed}
            x="427"
            y="121"
            width="109"
            height="283"
          />
        )}
      </g>
      {greeting && (
        <g
          className="narration__upper-arm"
          style={{ transformOrigin: shoulderPivot }}
        >
          <g transform={uniformPlacement}>
            {gesture === "point" ? (
              <image
                className="hana__raised-sleeve"
                href={pointing}
                x="426"
                y="119"
                width="146"
                height="320"
              />
            ) : (
              <image
                className="hana__raised-sleeve"
                href={waving}
                x="426"
                y="120"
                width="176"
                height="331"
              />
            )}
          </g>
        </g>
      )}
      <g
        className="hana__ribbon narration__torso-accessory"
        style={{
          transformOrigin: "167px 276px",
          transform: "rotate(var(--accessory-angle, 0deg))",
        }}
      >
        <g transform={uniformPlacement}>
          <image href={ribbon} x="241" y="210" width="156" height="133" />
        </g>
      </g>
    </>
  );
});

const Forearm = memo(function Forearm({
  gesture,
}: ArtProps & { gesture: ArmGesture }) {
  return (
    <g transform={uniformPlacement}>
      {gesture === "point" ? (
        <image
          className="hana__forearm"
          href={forearmPoint}
          x="429"
          y="187"
          width="119"
          height="249"
        />
      ) : (
        <image
          className="hana__forearm"
          href={forearmWave}
          x="426"
          y="174"
          width="126"
          height="277"
        />
      )}
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

const RearHair = memo(function RearHair(_props: ArtProps) {
  return (
    <g transform={headPlacement}>
      <image
        className="hana__rear-hair"
        href={hairRear}
        x="8"
        y="185"
        width="520"
        height="515"
      />
    </g>
  );
});

const HairBehind = memo(function HairBehind(_props: ArtProps) {
  return (
    <g transform={headPlacement}>
      <image
        className="hana__portrait"
        href={head}
        x="52"
        y="0"
        width="434"
        height="385"
      />
    </g>
  );
});

const Fringe = memo(function Fringe(_props: ArtProps) {
  return (
    <>
      <g
        className="hana__lock-left"
        style={{
          transformOrigin: "97px 132px",
          transform: "rotate(calc(.8 * var(--lock-left-angle, 0deg)))",
        }}
      >
        <g transform={headPlacement}>
          <image href={lockLeft} x="91" y="207" width="123" height="477" />
        </g>
      </g>
      <g
        className="hana__lock-right"
        style={{
          transformOrigin: "214px 128px",
          transform: "rotate(calc(.8 * var(--lock-right-angle, 0deg)))",
        }}
      >
        <g transform={headPlacement}>
          <image href={lockRight} x="306" y="198" width="112" height="445" />
        </g>
      </g>
      <g transform={headPlacement}>
        <image
          className="hana__fringe"
          href={fringe}
          x="224"
          y="47"
          width="82"
          height="206"
        />
      </g>
    </>
  );
});

// Each eye has its own original socket, iris and overlying lashes. Measured
// eyelid openings keep the moving lilac irises tucked under the painted lids.
const faceRig: PaintedFaceRig = {
  transform: headPlacement,
  eyes: [
    {
      open: { src: eyeLeft, x: 173, y: 214, width: 80, height: 49 },
      brow: { src: browLeft, x: 182, y: 192, width: 71, height: 18 },
      closed: { src: lidLeft, x: 176, y: 235, width: 68, height: 19 },
      center: [214.75, 240],
      blinkY: 248,
      gaze: {
        socket: { src: socketLeft, x: 182, y: 227, width: 63, height: 31 },
        iris: { src: irisLeft, x: 199, y: 221, width: 33, height: 39 },
        lid: { src: lashLeft, x: 173, y: 214, width: 80, height: 49 },
        contour:
          "M183.4 238.0Q190.3 232.2 201.3 230.0Q214.9 226.9 226.4 231.0Q236.2 234.7 242.7 242.5Q237.4 250.8 228.5 253.5Q214.5 258.1 202.0 253.3Q189.2 249.7 183.4 238.0Z",
        travel: [3.2, 1.35],
      },
    },
    {
      open: { src: eyeRight, x: 296, y: 214, width: 76, height: 51 },
      brow: { src: browRight, x: 296, y: 192, width: 49, height: 20 },
      closed: { src: lidRight, x: 301, y: 233, width: 71, height: 22 },
      center: [330.3, 239.9],
      blinkY: 247,
      gaze: {
        socket: { src: socketRight, x: 302, y: 226, width: 64, height: 33 },
        iris: { src: irisRight, x: 314, y: 221, width: 33, height: 38 },
        lid: { src: lashRight, x: 296, y: 214, width: 76, height: 51 },
        contour:
          "M303.0 241.8Q310 231.1 321.5 229.0Q332 226.0 343.8 229.4Q356.2 230.2 363.1 236.9Q359.2 245.2 351.5 250.2Q341.9 257.7 329.3 256.0Q310 257.2 303.0 247.1Z",
        travel: [3.2, 1.35],
      },
    },
  ],
  mouth: {
    rest: { src: lips, x: 247, y: 321, width: 52, height: 26 },
    upper: { src: lipUpper, x: 247, y: 321, width: 52, height: 12 },
    lower: { src: lipLower, x: 247, y: 328, width: 52, height: 19 },
    center: [273, 329.65],
    width: 36,
    height: 15.2,
    angle: 0.85,
    cornerRise: -0.6,
    color: "#723e49",
    tongue: "#d59193",
    teeth: "#ffefe8",
  },
};

export const hanaArt = {
  Backdrop,
  RearHair,
  HairBehind,
  Fringe,
  Wardrobe,
  Forearm,
  Hand,
  faceRig,
  baseImages: [
    classroom,
    hairRear,
    bodice,
    relaxed,
    ribbon,
    head,
    lockLeft,
    lockRight,
    fringe,
  ],
  poseImages: {
    greeting: [waving, forearmWave, waveHand],
    point: [pointing, forearmPoint, pointHand],
  },
  handPivot: "264px 270px",
  shoulderPivot,
  elbowPivot: "253px 374px",
  neckPivot: "164px 215px",
  rearHairPivot: "162px 111px",
  fringePivot: "151px 48px",
};
