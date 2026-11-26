import { memo } from "react";
import type { MotionCue } from "./avatar-motion";
import { IsolGreetingSleeve, isolRelaxedSleeve } from "./IsolGreetingSleeve";
import {
  PaintedGreetingHand,
  PaintedGreetingWrist,
  type GreetingHandRig,
} from "./PaintedGreetingHand";
import torso from "./portraits/isol/body.webp";
import wavingHand from "./portraits/isol/greeting.webp";
import pointingSleeve from "./portraits/isol/point-sleeve.webp";
import pointingForearm from "./portraits/isol/point-forearm.webp";
import pointingHand from "./portraits/isol/point.webp";

// isol-original.png is 1086 × 1448. Every painted crop uses the same 600 × 800
// drawing grid, including the rolled sleeve, notebook and hem. The bottom 12
// stage units are overscan so the original shirt stays visible during a lean.
// The torso is prefiltered at 3× stage resolution to preserve the narrow ivory
// notebook edge when Chromium samples the moving SVG at phone and desktop sizes.
const scale = 0.46;
const left = 42;
const top = 4;
export const isolProjection = `translate(${left} ${top}) scale(${scale})`;
export function isolPivot(x: number, y: number) {
  return `${left + x * scale}px ${top + y * scale}px`;
}

type ArmGesture = "greeting" | "point";
const poses = {
  greeting: {
    hand: { href: wavingHand, x: 483, y: 272, width: 125, height: 147 },
  },
  point: {
    upper: { href: pointingSleeve, x: 407, y: 339, width: 159, height: 297 },
    forearm: { href: pointingForearm, x: 489, y: 388, width: 116, height: 255 },
    hand: { href: pointingHand, x: 519, y: 275, width: 75, height: 142 },
  },
};

const greetingHand: GreetingHandRig = {
  size: [250, 294],
  palm: "M-2 120H78L82 111H114L117 118H153L158 119H187L192 137L230 129L252 140V296H-2Z",
  wrist: "M94 268Q119 273 147 267L144 286Q121 290 100 287Z",
  fingers: {
    index: { joint: [99, 125], paint: "M80 5H116L118 126L118 147H78Z" },
    middle: {
      joint: [135, 128],
      paint: "M143 -2H176L165 53L151 137H116L119 104L130 32Z",
    },
    ring: {
      joint: [173, 132],
      paint: "M188 13H220V31L191 141H151L163 93L175 53Z",
    },
    little: {
      joint: [207, 144],
      paint: "M225 63H252V100L224 152L187 156L195 131Z",
    },
  },
};

const Wardrobe = memo(function IsolOvershirt({
  id,
  greeting,
  gesture,
}: {
  id: string;
  greeting: boolean;
  gesture: MotionCue;
}) {
  return (
    <g>
      {greeting && gesture === "greeting" && (
        <g className="narration__upper-arm" style={{ transform: "none" }}>
          <g transform={isolProjection}>
            <IsolGreetingSleeve id={id} />
          </g>
        </g>
      )}
      <g transform={isolProjection}>
        {!greeting && <image {...isolRelaxedSleeve} />}
        <image
          className="isol__portrait"
          href={torso}
          x="22"
          y="249"
          width="465"
          height="551"
        />
      </g>
      {greeting && gesture === "point" && (
        <g className="narration__upper-arm">
          <g transform={isolProjection}>
            <image {...poses.point.upper} />
          </g>
        </g>
      )}
    </g>
  );
});

const Forearm = memo(function IsolForearm({
  id,
  gesture,
}: {
  id: string;
  gesture: ArmGesture;
}) {
  return (
    <g transform={isolProjection}>
      {gesture === "point" ? (
        <image {...poses.point.forearm} />
      ) : (
        <PaintedGreetingWrist
          id={id}
          image={poses.greeting.hand}
          rig={greetingHand}
        />
      )}
    </g>
  );
});

const Hand = memo(function IsolHand({
  id,
  gesture,
}: {
  id: string;
  gesture: ArmGesture;
}) {
  return (
    <g transform={isolProjection}>
      {gesture === "greeting" ? (
        <PaintedGreetingHand
          id={id}
          image={poses.greeting.hand}
          rig={greetingHand}
        />
      ) : (
        <image {...poses.point.hand} />
      )}
    </g>
  );
});

export const isolBody = {
  Wardrobe,
  Forearm,
  Hand,
  shoulderPivot: isolPivot(460, 374),
  elbowPivot: isolPivot(522, 606),
  handPivot: isolPivot(544, 412),
  bodyImages: [torso, isolRelaxedSleeve.href],
  poseImages: {
    greeting: [wavingHand],
    point: [pointingSleeve, pointingForearm, pointingHand],
  },
};
