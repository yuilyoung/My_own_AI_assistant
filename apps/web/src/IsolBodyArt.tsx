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

type ArmGesture = "greeting" | "point";
const poses = {
  greeting: {
    upper: { href: wavingSleeve, x: 252, y: 228, width: 58, height: 79 },
    forearm: { href: wavingForearm, x: 286, y: 214, width: 46, height: 96 },
    hand: { href: wavingHand, x: 278, y: 154, width: 66, height: 78 },
  },
  point: {
    upper: { href: pointingSleeve, x: 252, y: 228, width: 58, height: 79 },
    forearm: { href: pointingForearm, x: 286, y: 210, width: 48, height: 100 },
    hand: { href: pointingHand, x: 296, y: 157, width: 41, height: 74 },
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
      {!greeting && (
        <image href={restingSleeve} x="251" y="222" width="67" height="138" />
      )}
      <image className="isol__portrait" href={torso} width="360" height="360" />
      {greeting && (
        <g className="narration__upper-arm">
          <image {...sleeve} />
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
  return <image {...poses[gesture].forearm} />;
});

const Hand = memo(function IsolHand({ gesture }: { gesture: ArmGesture }) {
  return <image {...poses[gesture].hand} />;
});

export const isolBody = {
  Wardrobe,
  Forearm,
  Hand,
  shoulderPivot: "267px 238px",
  elbowPivot: "296px 297px",
  handPivot: "308px 227px",
  bodyImages: [torso, restingSleeve],
  poseImages: {
    greeting: [wavingSleeve, wavingForearm, wavingHand],
    point: [pointingSleeve, pointingForearm, pointingHand],
  },
};
