import { memo } from "react";
import {
  PaintedGreetingHand,
  PaintedGreetingWrist,
  type GreetingHandRig,
} from "./PaintedGreetingHand";
import bodice from "./portraits/hana/bodice.webp";
import restingSleeve from "./portraits/hana/relaxed.webp";
import ribbon from "./portraits/hana/ribbon.webp";
import raisedSleeve from "./portraits/hana/waving.webp";
import wavingForearm from "./portraits/hana/forearm-wave.webp";
import wavingHand from "./portraits/hana/wave-hand.webp";
import pointingForearm from "./portraits/hana/forearm-point.webp";
import pointingHand from "./portraits/hana/point-hand.webp";

type ArmGesture = "greeting" | "point";

const poses = {
  greeting: {
    forearm: {
      href: wavingForearm,
      x: 262,
      y: 152.333,
      width: 42.333,
      height: 102.333,
    },
    hand: { href: wavingHand, x: 244, y: 82, width: 59.667, height: 78 },
  },
  point: {
    forearm: {
      href: pointingForearm,
      x: 262,
      y: 152.333,
      width: 41,
      height: 102.333,
    },
    hand: {
      href: pointingHand,
      x: 259.667,
      y: 86.667,
      width: 32.333,
      height: 73.333,
    },
  },
};

const greetingHand: GreetingHandRig = {
  size: [179, 234],
  palm: "M-2 105H49L52 84H81L84 90H109L113 87H132L136 98L164 90L181 105V236H-2Z",
  wrist: "M77 213Q99 215 123 213L122 228H78Z",
  fingers: {
    index: { joint: [69, 91], paint: "M46 -2H79L86 95L84 110H58Z" },
    middle: { joint: [98, 93], paint: "M83 -2H112L112 105L85 107Z" },
    ring: {
      joint: [120, 97],
      paint: "M117 0H149L145 62L133 111L109 106L112 66Z",
    },
    little: {
      joint: [143, 105],
      paint: "M160 44H181V64L161 109L133 114L136 92L151 57Z",
    },
  },
};

const Wardrobe = memo(function HanaBlazer({ greeting }: { greeting: boolean }) {
  return (
    <>
      {!greeting && (
        <image
          className="seorin__resting-sleeve"
          href={restingSleeve}
          x="220.8"
          y="149.72"
          width="55.08"
          height="224.64"
        />
      )}
      <image
        className="hana__uniform"
        href={bodice}
        x="69.6"
        y="107.24"
        width="185.4"
        height="267.12"
      />
      {greeting && (
        <g className="narration__upper-arm">
          <image
            className="hana__raised-sleeve"
            href={raisedSleeve}
            x="238.667"
            y="149.667"
            width="61.667"
            height="107"
          />
        </g>
      )}
      <g
        className="hana__ribbon narration__torso-accessory"
        style={{
          transformOrigin: "181.56px 158px",
          transform: "rotate(var(--accessory-angle, 0deg))",
        }}
      >
        <image href={ribbon} x="174.36" y="157.28" width="18" height="33.48" />
      </g>
    </>
  );
});

const Forearm = memo(function HanaForearm({
  id,
  gesture,
}: {
  id: string;
  gesture: ArmGesture;
}) {
  return (
    <>
      <image className="hana__forearm" {...poses[gesture].forearm} />
      {gesture === "greeting" && (
        <PaintedGreetingWrist
          id={id}
          image={poses.greeting.hand}
          rig={greetingHand}
        />
      )}
    </>
  );
});

const Hand = memo(function HanaHand({
  id,
  gesture,
}: {
  id: string;
  gesture: ArmGesture;
}) {
  return gesture === "greeting" ? (
    <PaintedGreetingHand
      id={id}
      image={poses.greeting.hand}
      rig={greetingHand}
    />
  ) : (
    <image {...poses.point.hand} />
  );
});

export const hanaBody = {
  Wardrobe,
  Forearm,
  Hand,
  shoulderPivot: "247.8px 158.36px",
  elbowPivot: "281px 241.2px",
  handPivot: "277px 156.4px",
  bodyImages: [bodice, restingSleeve, ribbon],
  poseImages: {
    greeting: [raisedSleeve, wavingForearm, wavingHand],
    point: [raisedSleeve, pointingForearm, pointingHand],
  },
};
