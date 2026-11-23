import type { AvatarCharacter } from "./avatar-cast";
import type { ExpressionCue, MotionCue } from "./avatar-motion";

export type NarrationInput = {
  level: number;
  brightness?: number;
  emotion: ExpressionCue;
  gesture: MotionCue;
  cueToken?: unknown;
  armReady?: boolean;
  /** Temporary attention target in stage space: left/top -1, right/bottom +1. */
  focus?: { x: number; y: number };
};

type Arm = "idle" | "point" | "greeting";

export type NarrationPose = {
  level: number;
  brightness: number;
  accent: number;
  breath: number;
  blink: number;
  gazeX: number;
  gazeY: number;
  headX: number;
  headY: number;
  headAngle: number;
  torsoY: number;
  torsoAngle: number;
  fringeAngle: number;
  hairAngle: number;
  lockLeftAngle: number;
  lockRightAngle: number;
  accessoryAngle: number;
  browY: number;
  gestureProgress: number;
  gestureDone: boolean;
  armPose: Arm;
  armLift: number;
  upperArmAngle: number;
  wristAngle: number;
};

const profiles = {
  seorin: { strength: 0.93, tempo: 1.02, tilt: -4.5, seed: 17 },
  hana: { strength: 1.13, tempo: 0.88, tilt: -6.4, seed: 47 },
  isol: { strength: 0.83, tempo: 1.14, tilt: 4.9, seed: 79 },
};
const expressionGaze: Record<ExpressionCue, readonly [number, number]> = {
  neutral: [0, 0],
  happy: [0.23, -0.1],
  curious: [0.75, -0.3],
  thoughtful: [-0.68, -0.45],
  concerned: [-0.39, 0.22],
  surprised: [0.1, -0.3],
};
const duration: Record<MotionCue, number> = {
  idle: 0,
  nod: 0.88,
  tilt: 1.58,
  point: 1.83,
  greeting: 1.95,
};
const step = 1 / 120;

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}
function unit(value: number | undefined, fallback = 0) {
  return value !== undefined && Number.isFinite(value)
    ? clamp(value, 0, 1)
    : fallback;
}
function ease(value: number) {
  const x = clamp(value, 0, 1);
  return x * x * (3 - 2 * x);
}
function follow(value: number, target: number, seconds: number) {
  return value + (target - value) * -Math.expm1(-step / seconds);
}

// A single rise and fall, with an optional held pose between the two shoulders.
function beat(
  t: number,
  start: number,
  peak: number,
  hold: number,
  end: number,
) {
  return (
    ease((t - start) / (peak - start)) * (1 - ease((t - hold) / (end - hold)))
  );
}

class Spring {
  value = 0;
  velocity = 0;
  constructor(
    private readonly frequency: number,
    private readonly damping: number,
  ) {}
  advance(target: number) {
    const force = this.frequency * this.frequency * (target - this.value);
    this.velocity +=
      (force - 2 * this.damping * this.frequency * this.velocity) * step;
    this.value += this.velocity * step;
    return this.value;
  }
}

function randomSource(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Deterministic, fixed-step motion in 360-unit stage coordinates and degrees. */
export function createNarrationMotion(character: AvatarCharacter, seed = 1) {
  const { strength, tempo, tilt, seed: salt } = profiles[character];
  const random = randomSource((Number.isFinite(seed) ? seed : 1) + salt * 977);
  const pose: NarrationPose = {
    level: 0,
    brightness: 0.5,
    accent: 0,
    breath: 0,
    blink: 0,
    gazeX: 0,
    gazeY: 0,
    headX: 0,
    headY: 0,
    headAngle: 0,
    torsoY: 0,
    torsoAngle: 0,
    fringeAngle: 0,
    hairAngle: 0,
    lockLeftAngle: 0,
    lockRightAngle: 0,
    accessoryAngle: 0,
    browY: 0,
    gestureProgress: 0,
    gestureDone: true,
    armPose: "idle",
    armLift: 0,
    upperArmAngle: 0,
    wristAngle: 0,
  };
  const head = new Spring(12 / tempo, 0.81),
    headX = new Spring(10 / tempo, 0.88);
  const headY = new Spring(13 / tempo, 0.81),
    torso = new Spring(5.2 / tempo, 0.91);
  const fringe = new Spring(19, 0.77),
    rearHair = new Spring(6.8, 0.65);
  const leftLock = new Spring(9.2, 0.66),
    rightLock = new Spring(12.2, 0.72);
  const jewelry = new Spring(15, 0.38);

  let remainder = 0,
    slowLevel = 0,
    accentCooldown = 0;
  let breathPhase = 0,
    breathPeriod = (3.7 + random()) * tempo;
  let nextGlance = (1 + random() * 1.6) * tempo,
    gazeTargetX = 0,
    gazeTargetY = 0;
  let lookAway = true;
  let nextBlink = (1.7 + random() * 2) * tempo,
    blinkTime = -1;
  let token: unknown,
    gesture: MotionCue = "idle",
    emotion: ExpressionCue = "neutral";
  let gestureTime = 0;
  let release: {
    arm: Arm;
    lift: number;
    wrist: number;
    upper: number;
    time: number;
  } | null = null;

  function acceptCue(input: NarrationInput) {
    const changed =
      gesture !== input.gesture || !Object.is(token, input.cueToken);
    if (changed) {
      if (!release && pose.armPose !== "idle" && pose.armLift > 0.001) {
        release = {
          arm: pose.armPose,
          lift: pose.armLift,
          wrist: pose.wristAngle,
          upper: pose.upperArmAngle,
          time: 0,
        };
      }
      token = input.cueToken;
      gesture = input.gesture;
      gestureTime = 0;
      pose.gestureProgress = 0;
      pose.gestureDone = gesture === "idle" && !release;
    }
    if (changed || emotion !== input.emotion) {
      emotion = input.emotion;
      [gazeTargetX, gazeTargetY] = expressionGaze[emotion];
      if (gesture === "point") gazeTargetX += 0.23;
      nextGlance = (1.1 + random() * 1.4) * tempo;
      lookAway = true;
    }
  }

  function advanceFace(
    volume: number,
    brightness: number,
    focus?: NarrationInput["focus"],
  ) {
    const previous = pose.level;
    pose.level = follow(previous, volume, volume > previous ? 0.047 : 0.084);
    if (volume === 0 && pose.level < 0.001) pose.level = 0;
    pose.brightness = follow(
      pose.brightness,
      volume > 0.015 ? brightness : 0.5,
      0.065,
    );
    slowLevel = follow(slowLevel, pose.level, 0.38);
    const rise = (pose.level - previous) / step;
    accentCooldown -= step;
    pose.accent *= Math.exp(-step / 0.17);
    // A rising syllable must clear the recent baseline, with room to settle
    // before a second beat. A held vowel cannot retrigger the brow/head pulse.
    if (accentCooldown <= 0 && rise > 0.85 && pose.level - slowLevel > 0.065) {
      pose.accent = clamp(0.28 + 0.11 * rise, 0, 1);
      accentCooldown = 0.32 * tempo;
    }

    nextGlance -= step;
    if (nextGlance <= 0) {
      const [x, y] = expressionGaze[emotion];
      const offset = lookAway
        ? (random() < 0.5 ? -1 : 1) * (0.25 + random() * 0.43)
        : 0;
      gazeTargetX = clamp(x * 0.65 + offset, -1, 1);
      gazeTargetY = y * 0.65 + (lookAway ? (random() - 0.5) * 0.55 : 0);
      nextGlance =
        (lookAway ? 0.55 + random() * 0.95 : 1.8 + random() * 2.3) * tempo;
      lookAway = !lookAway;
    }
    pose.gazeX = follow(
      pose.gazeX,
      focus ? clamp(focus.x, -1, 1) : gazeTargetX,
      0.04,
    );
    pose.gazeY = follow(
      pose.gazeY,
      focus ? clamp(focus.y, -1, 1) : gazeTargetY,
      0.05,
    );

    if (blinkTime < 0) {
      nextBlink -= step;
      if (nextBlink <= 0) blinkTime = 0;
    }
    if (blinkTime >= 0) {
      blinkTime += step;
      pose.blink = beat(blinkTime, 0, 0.062, 0.086, 0.205);
      if (blinkTime >= 0.205) {
        blinkTime = -1;
        nextBlink =
          random() < 0.1
            ? 0.14 + random() * 0.12
            : (2.6 + random() * 3.4) * tempo;
      }
    }

    breathPhase += step / breathPeriod;
    if (breathPhase >= 1) {
      breathPhase -= 1;
      breathPeriod = (3.7 + random() * 1.2) * tempo;
    }
    pose.breath = Math.sin(breathPhase * Math.PI * 2) * (1 - 0.35 * pose.level);
  }

  function advanceGesture(armReady: boolean) {
    if (release) {
      release.time += step;
      const weight = 1 - ease(release.time / 0.215);
      pose.armLift = release.lift * weight;
      pose.wristAngle = release.wrist * weight;
      pose.upperArmAngle = release.upper * weight;
      pose.armPose = weight > 0 ? release.arm : "idle";
      if (weight === 0) release = null;
      return;
    }
    const arm =
      gesture === "greeting" || gesture === "point" ? gesture : "idle";
    const length = duration[gesture] * tempo;
    if (length && (arm === "idle" || armReady))
      gestureTime = Math.min(length, gestureTime + step);
    const t = length ? gestureTime / length : 0;
    pose.gestureProgress = t;
    pose.gestureDone = gesture === "idle" || t >= 1;
    pose.armPose = armReady && t < 1 ? arm : "idle";
    pose.armLift = pose.armPose === "idle" ? 0 : beat(t, 0.015, 0.24, 0.72, 1);
    if (gesture === "greeting") {
      const wave =
        -12 * beat(t, 0.09, 0.23, 0.245, 0.37) +
        10 * beat(t, 0.27, 0.42, 0.44, 0.55) -
        7 * beat(t, 0.48, 0.6, 0.615, 0.76) +
        3 * beat(t, 0.65, 0.76, 0.78, 0.91);
      pose.wristAngle = wave * pose.armLift * strength;
    } else {
      const aim =
        3 * beat(t, 0, 0.1, 0.11, 0.24) - 8 * beat(t, 0.11, 0.32, 0.55, 0.95);
      pose.wristAngle = aim * pose.armLift * strength;
    }
    pose.upperArmAngle =
      pose.armLift * (gesture === "point" ? -2.6 : 2.1) * strength;
  }

  function advanceBody() {
    const t = pose.gestureProgress;
    const nod =
      gesture === "nod"
        ? -0.26 * beat(t, 0, 0.12, 0.14, 0.28) +
          beat(t, 0.16, 0.41, 0.46, 0.76) -
          0.16 * beat(t, 0.64, 0.78, 0.8, 1)
        : 0;
    const lean =
      gesture === "tilt"
        ? -0.1 * beat(t, 0, 0.11, 0.13, 0.24) + beat(t, 0.12, 0.38, 0.62, 1)
        : 0;
    const armLean = pose.armLift * (pose.armPose === "point" ? -1.6 : 0.9);
    pose.headAngle = head.advance(
      pose.gazeX * 2.6 + lean * tilt + armLean + pose.accent * 0.95 * strength,
    );
    pose.headX = headX.advance(pose.gazeX * 2.1 + lean * 0.8 + armLean * 0.35);
    pose.headY = headY.advance(
      pose.gazeY * 1.6 + nod * 4.1 * strength - pose.accent * 1.75 * strength,
    );
    pose.torsoAngle = torso.advance(pose.headAngle * 0.32 + armLean * 0.18);
    pose.torsoY = -pose.breath * 0.8 + pose.headY * 0.22;
    pose.browY = -pose.accent * 1.8 * strength - pose.level * 0.25;
    // Each child follows the moving attachment. The difference between the
    // sprung and driven angle is a local rotation, with opposite initial travel.
    const anchor = pose.headAngle + pose.headX * 0.55;
    const left = anchor + pose.headY * 0.48;
    const right = anchor - pose.headY * 0.48;
    pose.fringeAngle = fringe.advance(anchor) - anchor;
    pose.hairAngle = rearHair.advance(anchor) - anchor;
    pose.lockLeftAngle = leftLock.advance(left) - left;
    pose.lockRightAngle = rightLock.advance(right) - right;
    pose.accessoryAngle = jewelry.advance(right * 1.35) - right * 1.35;
  }

  return {
    advance(dtSeconds: number, input: NarrationInput): NarrationPose {
      acceptCue(input);
      const dt = Number.isFinite(dtSeconds) ? clamp(dtSeconds, 0, 0.25) : 0;
      remainder += dt;
      const ticks = Math.floor(remainder / step + 1e-9);
      remainder -= ticks * step;
      const volume = unit(input.level);
      const brightness = unit(input.brightness, 0.5);
      const focus =
        input.focus &&
        Number.isFinite(input.focus.x) &&
        Number.isFinite(input.focus.y)
          ? input.focus
          : undefined;
      for (let i = 0; i < ticks; i++) {
        advanceFace(volume, brightness, focus);
        advanceGesture(input.armReady === true);
        advanceBody();
      }
      return { ...pose };
    },
  };
}
