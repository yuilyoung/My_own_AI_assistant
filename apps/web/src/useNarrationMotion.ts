import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { isolGreetingPose } from "./isol-greeting-pose";
import { paintIsolGreetingSleeve } from "./IsolGreetingSleeve";
import type { AvatarCharacter } from "./avatar-cast";
import {
  createNarrationMotion,
  type NarrationInput,
  type NarrationPose,
} from "./narration-motion";

const heldTilt = { hana: -5, seorin: -3.5, isol: 4 };
const armDepth = {
  hana: { forearm: 0.46, hand: 0.46, shoulder: 10, opened: 11 },
  seorin: { forearm: 0.25, hand: 0.24, shoulder: 4, opened: 19 },
  isol: { forearm: 0.48, hand: 0.43, shoulder: 13, opened: 12 },
};
type Arm = Exclude<NarrationPose["armPose"], "idle">;
type ArmRig = Readonly<{
  upperAngle: number;
  forearmX: number;
  forearmY: number;
}>;
const radians = Math.PI / 180;

function projectedScale(angle: number) {
  return Math.cos(angle * radians);
}

function ease(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function readArmRig(svg: SVGSVGElement): ArmRig | undefined {
  const coordinates = (value: string) => value.split(" ").map(parseFloat);
  const [sx, sy] = coordinates(svg.style.getPropertyValue("--shoulder-pivot"));
  const [ex, ey] = coordinates(svg.style.getPropertyValue("--elbow-pivot"));
  const wrist = svg.querySelector<SVGGElement>(".avatar-panel__hand");
  const [wx, wy] = coordinates(wrist?.style.transformOrigin ?? "");
  if (![sx, sy, ex, ey, wx, wy].every(Number.isFinite)) return undefined;
  return {
    upperAngle: Math.atan2(ey - sy, ex - sx) / radians,
    forearmX: wx - ex,
    forearmY: wy - ey,
  };
}

function signedBend(upper: number, forearm: number) {
  return ((forearm - upper + 540) % 360) - 180;
}

function draw(
  svg: SVGSVGElement,
  previous: Map<string, string>,
  character: AvatarCharacter,
  pose: NarrationPose,
  rig: ArmRig | undefined,
) {
  function channel(name: string, value: number, unit = "") {
    const next = Math.round(value * 10000) / 10000 + unit;
    if (previous.get(name) !== next) {
      svg.style.setProperty(name, next);
      previous.set(name, next);
    }
  }
  channel("--accent", pose.accent);
  channel("--blink", pose.blink);
  channel("--gaze-x", pose.gazeX);
  channel("--gaze-y", pose.gazeY);
  channel("--brow-lift", pose.browLift);
  channel("--head-x", pose.headX, "px");
  channel("--head-y", pose.headY, "px");
  channel("--head-angle", pose.headAngle, "deg");
  channel("--head-scale-y", projectedScale(pose.headPitch));
  channel("--head-scale-x", projectedScale(pose.headYaw));
  channel("--head-yaw-skew", pose.headYaw * 0.11, "deg");
  channel("--neck-angle", pose.neckAngle, "deg");
  channel("--torso-x", pose.torsoX, "px");
  channel("--torso-y", pose.torsoY, "px");
  channel("--torso-angle", pose.torsoAngle, "deg");
  channel("--torso-scale-y", projectedScale(pose.torsoPitch));
  channel("--fringe-angle", pose.fringeAngle, "deg");
  channel("--hair-angle", pose.hairAngle, "deg");
  channel("--lock-left-angle", pose.lockLeftAngle, "deg");
  channel("--lock-right-angle", pose.lockRightAngle, "deg");
  channel("--accessory-angle", pose.accessoryAngle, "deg");
  channel("--arm-lift", pose.armLift);
  channel("--elbow-open", pose.elbowOpen);
  // Only dissolve between two registrations at the very bottom of the reach.
  // The arm stays opaque through the visible arc, including its return.
  channel("--arm-opacity", ease(pose.armLift / 0.065));
  const profile = armDepth[character];
  const open = pose.elbowOpen;
  const close =
    character === "isol" && pose.armPose === "greeting" && rig?.forearmY
      ? isolGreetingPose(open)
      : undefined;
  if (close) paintIsolGreetingSleeve(svg, close.upperPaint, close.forearmPaint);
  const transit = ease(open / 0.27) * (1 - ease((open - 0.87) / 0.115));
  const forearmScale = close?.forearmScale ?? 1 - profile.forearm * transit;
  const forearmAngle = rig
    ? Math.atan2(rig.forearmY, rig.forearmX) / radians
    : -90;
  const basis = signedBend(rig?.upperAngle ?? 75, forearmAngle);
  const projectedAngle = rig
    ? Math.atan2(rig.forearmY * forearmScale, rig.forearmX) / radians
    : forearmAngle;
  const projectedBend = signedBend(rig?.upperAngle ?? 75, projectedAngle);
  const closed = -basis - 6;
  const flex = closed * (1 - open) + profile.opened * open + pose.elbowAngle;
  // Stay on the painted elbow's bend side all the way to the resting pose.
  // Scaling the forearm in depth can alter its projected line of action.
  const elbow =
    close?.elbow ??
    (pose.armPose === "idle" ? 0 : Math.min(flex, -projectedBend - 4));
  const hanging = Math.max(0, 89 - (rig?.upperAngle ?? 75));
  const shoulder =
    close?.shoulder ??
    (pose.armPose === "idle"
      ? 0
      : hanging * (1 - pose.armLift) +
        profile.shoulder * transit +
        pose.upperArmAngle);
  const wristGuide = close
    ? 10 * Math.sin(Math.PI * open)
    : Math.min(28, Math.max(0, elbow - profile.opened) * 0.28) * transit;
  channel("--upper-arm-angle", shoulder, "deg");
  channel("--upper-arm-scale-y", close?.upperScale ?? 1);
  channel("--forearm-counter-scale-y", 1 / (close?.upperScale ?? 1));
  channel("--elbow-angle", elbow, "deg");
  channel("--forearm-scale-y", forearmScale);
  channel("--hand-counter-scale-y", 1 / forearmScale);
  channel("--wrist-angle", pose.wristAngle - wristGuide, "deg");
  channel("--palm-scale-x", projectedScale(pose.palmYaw));
  channel(
    "--palm-scale-y",
    1 - profile.hand * (close ? 1 - forearmScale : transit),
  );
  channel("--palm-skew-y", pose.palmYaw * 0.09, "deg");
  channel("--finger-curl", pose.fingerCurl);
  channel("--finger-splay", pose.fingerSplay, "deg");
}

/** The painted hand changes twice per gesture; inter-frame motion stays on the SVG. */
export function useNarrationMotion(
  stage: RefObject<SVGSVGElement | null>,
  character: AvatarCharacter,
  ready: boolean,
  input: NarrationInput,
) {
  const latest = useRef(input);
  const refresh = useRef<(() => void) | undefined>(undefined);
  const [arm, setArm] = useState<Arm>();
  useLayoutEffect(() => {
    if (arm === "greeting" && character === "isol") refresh.current?.();
  }, [arm, character]);
  useLayoutEffect(() => {
    latest.current = input;
    refresh.current?.();
  }, [input]);

  useLayoutEffect(() => {
    const svg = stage.current;
    if (!svg || !ready) return;
    let model = createNarrationMotion(character);
    const neutral = model.advance(0, {
      level: 0,
      emotion: "neutral",
      gesture: "idle",
    });
    const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let reduced = preference?.matches ?? false;
    let frame: number | undefined;
    let previousTime: number | undefined;
    let paintedArm: NarrationPose["armPose"] | undefined;
    let focus: { x: number; y: number } | undefined;
    const previous = new Map<string, string>();
    const rig = readArmRig(svg);

    function paint(dt: number) {
      if (!svg) return;
      const current = latest.current;
      let pose: NarrationPose;
      if (preference?.matches || !window.requestAnimationFrame) {
        const held =
          current.armReady &&
          (current.gesture === "greeting" || current.gesture === "point")
            ? current.gesture
            : "idle";
        pose = {
          ...neutral,
          headAngle: current.gesture === "tilt" ? heldTilt[character] : 0,
          headY: current.gesture === "nod" ? 1.5 : 0,
          headPitch: current.gesture === "nod" ? 5 : 0,
          armPose: held,
          armLift: held === "idle" ? 0 : 1,
          elbowOpen: held === "idle" ? 0 : 1,
        };
      } else {
        pose = model.advance(dt, { ...current, focus });
      }
      draw(svg, previous, character, pose, rig);
      if (paintedArm !== pose.armPose) {
        paintedArm = pose.armPose;
        setArm(paintedArm === "idle" ? undefined : paintedArm);
      }
    }
    function tick(now: number) {
      frame = undefined;
      if (document.hidden) return;
      paint(previousTime === undefined ? 0 : (now - previousTime) / 1000);
      previousTime = now;
      frame = window.requestAnimationFrame(tick);
    }
    function sync() {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      frame = undefined;
      previousTime = undefined;
      if (document.hidden) {
        focus = undefined;
        return;
      }
      if (reduced !== (preference?.matches ?? false)) {
        reduced = !reduced;
        focus = undefined;
        model = createNarrationMotion(character);
      }
      paint(0);
      if (!preference?.matches && window.requestAnimationFrame)
        frame = window.requestAnimationFrame(tick);
    }
    function pointer(event: PointerEvent) {
      if (preference?.matches || event.pointerType === "touch" || !svg) return;
      const bounds = svg.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const coordinate = (position: number, start: number, size: number) =>
        Math.max(-1, Math.min(1, (2 * (position - start)) / size - 1));
      focus = {
        x: coordinate(event.clientX, bounds.left, bounds.width),
        y: coordinate(event.clientY, bounds.top, bounds.height),
      };
    }
    function clearFocus() {
      focus = undefined;
    }
    // Input changes update the simulation target without resetting its frame clock.
    refresh.current = () => {
      if (document.hidden) return;
      if (preference?.matches || !window.requestAnimationFrame) paint(0);
    };
    svg.addEventListener("pointermove", pointer);
    svg.addEventListener("pointerleave", clearFocus);
    svg.addEventListener("pointercancel", clearFocus);
    if (preference?.addEventListener)
      preference.addEventListener("change", sync);
    else preference?.addListener?.(sync);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      refresh.current = undefined;
      svg.removeEventListener("pointermove", pointer);
      svg.removeEventListener("pointerleave", clearFocus);
      svg.removeEventListener("pointercancel", clearFocus);
      if (preference?.removeEventListener)
        preference.removeEventListener("change", sync);
      else preference?.removeListener?.(sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [stage, character, ready]);
  return arm;
}
