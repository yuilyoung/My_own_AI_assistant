import { memo } from "react";
import type { MotionCue } from "./avatar-motion";
import torso from "./portraits/isol/body.webp";
import restingSleeve from "./portraits/isol/rest-sleeve.webp";
import wavingSleeve from "./portraits/isol/greeting-sleeve.webp";
import wavingForearm from "./portraits/isol/greeting-forearm.webp";
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
    upper: { href: wavingSleeve, x: 407, y: 338, width: 158, height: 299 },
    forearm: { href: wavingForearm, x: 489, y: 394, width: 112, height: 249 },
    hand: { href: wavingHand, x: 483, y: 272, width: 125, height: 147 },
  },
  point: {
    upper: { href: pointingSleeve, x: 407, y: 339, width: 159, height: 297 },
    forearm: { href: pointingForearm, x: 489, y: 388, width: 116, height: 255 },
    hand: { href: pointingHand, x: 519, y: 275, width: 75, height: 142 },
  },
};

const Wardrobe = memo(function IsolOvershirt({
  greeting,
  gesture,
}: {
  greeting: boolean;
  gesture: MotionCue;
}) {
  const sleeve = poses[gesture === "point" ? "point" : "greeting"].upper;
  return (
    <g>
      <g transform={isolProjection}>
        {!greeting && (
          <image
            href={restingSleeve}
            x="455"
            y="352"
            width="100"
            height="448"
          />
        )}
        <image
          className="isol__portrait"
          href={torso}
          x="22"
          y="249"
          width="465"
          height="551"
        />
      </g>
      {greeting && (
        <g className="narration__upper-arm">
          <g transform={isolProjection}>
            <image {...sleeve} />
          </g>
        </g>
      )}
    </g>
  );
});

const Forearm = memo(function IsolForearm({
  gesture,
}: {
  gesture: ArmGesture;
}) {
  return (
    <g transform={isolProjection}>
      <image {...poses[gesture].forearm} />
    </g>
  );
});

const Hand = memo(function IsolHand({ gesture }: { gesture: ArmGesture }) {
  return (
    <g transform={isolProjection}>
      <image {...poses[gesture].hand} />
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
  bodyImages: [torso, restingSleeve],
  poseImages: {
    greeting: [wavingSleeve, wavingForearm, wavingHand],
    point: [pointingSleeve, pointingForearm, pointingHand],
  },
};
