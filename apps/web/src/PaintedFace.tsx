import { memo, type CSSProperties } from "react";
import type { AvatarCharacter } from "./avatar-cast";
import type { ExpressionCue } from "./avatar-motion";

type Registration = {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
type Point = readonly [number, number];
type PaintedEye = {
  open: Registration;
  brow: Registration;
  closed: Registration;
  center: Point;
  blinkY: number;
};
type PaintedMouth = {
  rest: Registration;
  upper: Registration;
  lower: Registration;
  center: Point;
  width: number;
  height: number;
  angle?: number;
  cornerRise?: number;
  color: string;
  tongue: string;
  teeth: string;
};

/** All coordinates are measured in the artist's original painting. */
export type PaintedFaceRig = {
  transform?: string;
  eyes: readonly [PaintedEye, PaintedEye];
  mouth: PaintedMouth;
};

export function paintedFeatureImages(rig: PaintedFaceRig): string[] {
  const pieces = [
    ...rig.eyes.flatMap((eye) => [eye.open, eye.brow, eye.closed]),
    rig.mouth.rest,
    rig.mouth.upper,
    rig.mouth.lower,
  ];
  return [...new Set(pieces.map((piece) => piece.src))];
}

function Texture({
  area,
  ...attributes
}: {
  area: Registration;
  className?: string;
  opacity?: number;
}) {
  const { src, ...bounds } = area;
  return <image href={src} {...bounds} {...attributes} />;
}

// Eyelids and brows retain the line work and asymmetry of each painting.
// Height, brow elevation and brow tilt describe movement relative to that eye.
const eyePoses = {
  neutral: { lid: 1, brow: 0, slope: 0 },
  happy: { lid: 0.78, brow: -0.06, slope: 3 },
  concerned: { lid: 0.88, brow: -0.08, slope: -9 },
  surprised: { lid: 1.13, brow: -0.23, slope: -2 },
  curious: { lid: 1.06, brow: -0.18, slope: -4 },
  thoughtful: { lid: 0.84, brow: 0.035, slope: 5 },
};
const expressionStrength = { hana: 1.06, isol: 0.86, seorin: 0.76 };

function anchored([x, y]: Point, height: number, angle: number, lift = 0) {
  return `translate(${x} ${y + lift}) rotate(${angle}) scale(1 ${height}) translate(${-x} ${-y})`;
}

const Eye = memo(function Eye({
  eye,
  emotion,
  character,
  right,
}: {
  eye: PaintedEye;
  emotion: ExpressionCue;
  character: AvatarCharacter;
  right: boolean;
}) {
  const strength = expressionStrength[character];
  const pose = eyePoses[emotion];
  const rest = emotion === "neutral";
  const asymmetric = emotion === "curious" && right;
  const eyeHeight = 1 + ((asymmetric ? 0.94 : pose.lid) - 1) * strength;
  const browCenter: Point = [
    eye.brow.x + eye.brow.width / 2,
    eye.brow.y + eye.brow.height / 2,
  ];
  const rise = (asymmetric ? -0.02 : pose.brow) * eye.open.height * strength;
  const slope = (asymmetric ? 2 : pose.slope) * (right ? -1 : 1) * strength;
  return (
    <>
      <g
        className="painted-face__eye-pose"
        transform={
          rest ? undefined : anchored([eye.center[0], eye.blinkY], eyeHeight, 0)
        }
      >
        <g
          className="painted-face__blink"
          style={{ transformOrigin: `${eye.center[0]}px ${eye.blinkY}px` }}
        >
          <Texture area={eye.open} className="painted-face__eye-open" />
        </g>
        <Texture area={eye.closed} className="painted-face__closed" />
      </g>
      <g
        className="painted-face__brow-pose"
        transform={rest ? undefined : anchored(browCenter, 1, slope, rise)}
      >
        <g
          className="seorin__speech-brows"
          style={{
            transform: `translateY(calc(var(--voice-level) * ${-eye.open.height * 0.045 * strength}px))`,
          }}
        >
          <Texture area={eye.brow} className="painted-face__brow" />
        </g>
      </g>
    </>
  );
});

const aperture = {
  neutral: 1,
  happy: 0.92,
  concerned: 0.79,
  surprised: 1.12,
  curious: 0.94,
  thoughtful: 0.74,
};

// The complete painted lips carry the expression both before and after a word.
const restingLips = {
  neutral: { width: 1, height: 1, angle: 0 },
  happy: { width: 1.08, height: 1.2, angle: -1 },
  concerned: { width: 0.89, height: 0.62, angle: 2.5 },
  surprised: { width: 0.78, height: 1.16, angle: 0 },
  curious: { width: 0.97, height: 1.05, angle: -3.5 },
  thoughtful: { width: 0.91, height: 0.78, angle: 1 },
};

// Bend the original painted lip around its two corners. Each adjacent pair
// has identical displacement at the join so the artwork stays continuous.
const lipKnots = [-0.5, -0.29, 0, 0.29, 0.5];
const lipLift = [0, 0.74, 1, 0.74, 0];

const LipPaint = memo(function LipPaint({
  prefix,
  mouth,
  upper,
}: {
  prefix: string;
  mouth: PaintedMouth;
  upper: boolean;
}) {
  const {
    width,
    center: [cx, cy],
    angle = 0,
  } = mouth;
  const outside = width * 2;
  return (
    <defs>
      <g
        id={prefix + "-paint"}
        transform={`rotate(${-angle}) translate(${-cx} ${-cy})`}
      >
        <Texture area={upper ? mouth.upper : mouth.lower} />
      </g>
      {lipKnots.slice(0, -1).map((k, i) => {
        // The first and last strips include the painted corners' faded edges.
        const start = i === 0 ? -outside : k * width;
        const end =
          i === lipKnots.length - 2 ? outside : lipKnots[i + 1] * width;
        return (
          <clipPath key={k} id={prefix + "-strip-" + i}>
            <rect
              x={start}
              y={-outside}
              width={end - start + 0.08}
              height={outside * 2}
            />
          </clipPath>
        );
      })}
    </defs>
  );
});

function Lips({
  id,
  mouth,
  upper,
  opening,
  spread,
}: {
  id: string;
  mouth: PaintedMouth;
  upper: boolean;
  opening: number;
  spread: number;
}) {
  const prefix = id + (upper ? "-upper" : "-lower");
  return (
    <g className="painted-face__lip">
      <LipPaint prefix={prefix} mouth={mouth} upper={upper} />
      {lipKnots.slice(0, -1).map((k, i) => {
        const left = k * mouth.width;
        const right = lipKnots[i + 1] * mouth.width;
        const slope =
          (opening * (lipLift[i + 1] - lipLift[i])) / (right - left);
        const intercept = opening * lipLift[i] - slope * left;
        return (
          <g
            key={k}
            transform={`matrix(${spread} ${slope} 0 1 0 ${intercept})`}
          >
            <use
              href={"#" + prefix + "-paint"}
              clipPath={`url(#${prefix}-strip-${i})`}
            />
          </g>
        );
      })}
    </g>
  );
}

function Mouth({
  id,
  mouth,
  level,
  brightness,
  emotion,
}: {
  id: string;
  mouth: PaintedMouth;
  level: number;
  brightness: number;
  emotion: ExpressionCue;
}) {
  const [cx, cy] = mouth.center;
  const speaking = level > 0;
  const spread = 1 + level * (0.54 * brightness - 0.25);
  const half = (mouth.width * spread) / 2;
  const opening =
    level * mouth.height * aperture[emotion] * (1.16 - 0.44 * brightness);
  const upper = -0.28 * opening;
  const lower = 0.72 * opening;
  const corner = -(mouth.cornerRise ?? 0);
  const cavity = speaking
    ? `M${-half} ${corner} Q${-half * 0.61} ${upper} 0 ${upper} Q${half * 0.61} ${upper} ${half} ${corner} Q${half * 0.63} ${lower} 0 ${lower} Q${-half * 0.63} ${lower} ${-half} ${corner}Z`
    : `M${-half} 0H${half}Z`;
  const details = id + "-inside";
  const rest = restingLips[emotion];
  const angle = mouth.angle ?? 0;
  const expressionPose =
    emotion === "neutral"
      ? undefined
      : `translate(${cx} ${cy}) rotate(${angle + rest.angle}) scale(${rest.width} ${rest.height}) rotate(${-angle}) translate(${-cx} ${-cy})`;
  return (
    <g className="painted-face__mouth-pose" transform={expressionPose}>
      <g
        transform={`translate(${cx} ${cy}) rotate(${mouth.angle ?? 0})`}
        opacity={speaking ? 1 : 0}
      >
        <defs>
          <clipPath id={details}>
            <path d={cavity} />
          </clipPath>
        </defs>
        <path data-testid="avatar-mouth" d={cavity} fill={mouth.color} />
        <g clipPath={`url(#${details})`}>
          <path
            d={`M${-half * 0.76} ${upper} Q0 ${upper + opening * 0.25} ${half * 0.68} ${upper} V${upper - opening} H${-half * 0.76}Z`}
            fill={mouth.teeth}
            opacity={Math.min(0.85, level * brightness)}
          />
          <ellipse
            cx={half * 0.06}
            cy={lower + opening * 0.16}
            rx={half * 0.72}
            ry={opening * 0.32}
            fill={mouth.tongue}
          />
        </g>
        <Lips id={id} mouth={mouth} upper opening={upper} spread={spread} />
        <Lips
          id={id}
          mouth={mouth}
          upper={false}
          opening={lower}
          spread={spread}
        />
      </g>
      <Texture
        className="painted-face__mouth-rest"
        area={mouth.rest}
        opacity={speaking ? 0 : 1}
      />
    </g>
  );
}

export function PaintedFace({
  id,
  rig,
  character,
  emotion,
  level,
  brightness,
}: {
  id: string;
  rig: PaintedFaceRig;
  character: AvatarCharacter;
  emotion: ExpressionCue;
  level: number;
  brightness: number;
}) {
  return (
    <g
      data-testid="avatar-features"
      transform={rig.transform}
      style={{ "--voice-level": level } as CSSProperties}
    >
      {rig.eyes.map((eye, i) => (
        <Eye
          key={i}
          eye={eye}
          character={character}
          emotion={emotion}
          right={i === 1}
        />
      ))}
      <Mouth
        id={id}
        mouth={rig.mouth}
        emotion={emotion}
        level={level}
        brightness={brightness}
      />
    </g>
  );
}
