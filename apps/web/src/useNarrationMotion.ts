import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AvatarCharacter } from "./avatar-cast";
import {
  createNarrationMotion,
  type NarrationInput,
  type NarrationPose,
} from "./narration-motion";

const restingArmAngle = { hana: 5, seorin: 6, isol: 4 };
// The resting forearms hang beside the body. Positive winding takes them
// around the outside shoulder, including when a gesture releases mid-reach.
const foldedElbow = { hana: 188, seorin: 166.72, isol: 171 };
const heldTilt = { hana: -5, seorin: -3.5, isol: 4 };
type Arm = Exclude<NarrationPose["armPose"], "idle">;
type ArmRig = Readonly<{
  upperX: number;
  upperY: number;
  forearmX: number;
  forearmY: number;
}>;
const radians = Math.PI / 180;

function verticalProjection(pitch: number) {
  return Math.cos(pitch * radians);
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
    upperX: ex - sx,
    upperY: ey - sy,
    forearmX: wx - ex,
    forearmY: wy - ey,
  };
}

function keepWristInFrame(
  rig: ArmRig,
  upper: number,
  elbow: number,
  clearance: number,
) {
  const bend = elbow * radians;
  const x =
    rig.upperX + rig.forearmX * Math.cos(bend) - rig.forearmY * Math.sin(bend);
  const y =
    rig.upperY + rig.forearmX * Math.sin(bend) + rig.forearmY * Math.cos(bend);
  const turn = upper * radians;
  const wristX = x * Math.cos(turn) - y * Math.sin(turn);
  const wristY = x * Math.sin(turn) + y * Math.cos(turn);
  if (wristX <= clearance || wristY <= 0) return 0;
  // Turn about the shoulder to bring the wrist inside the safe arc, keeping
  // both limb lengths and the elbow registration fixed.
  const target = Math.acos(clearance / Math.hypot(wristX, wristY));
  return Math.min(45, (target - Math.atan2(wristY, wristX)) / radians);
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
  channel("--head-scale-y", verticalProjection(pose.headPitch));
  channel("--neck-angle", pose.neckAngle, "deg");
  channel("--torso-y", pose.torsoY, "px");
  channel("--torso-angle", pose.torsoAngle, "deg");
  channel("--torso-scale-y", verticalProjection(pose.torsoPitch));
  channel("--fringe-angle", pose.fringeAngle, "deg");
  channel("--hair-angle", pose.hairAngle, "deg");
  channel("--lock-left-angle", pose.lockLeftAngle, "deg");
  channel("--lock-right-angle", pose.lockRightAngle, "deg");
  channel("--accessory-angle", pose.accessoryAngle, "deg");
  channel("--arm-lift", pose.armLift);
  // Only dissolve between two registrations at the very bottom of the reach.
  // The arm stays opaque through the visible arc, including its return.
  channel("--arm-opacity", ease(pose.armLift / 0.065));
  const elbow =
    pose.armPose === "idle"
      ? 0
      : foldedElbow[character] * (1 - pose.elbowOpen) + pose.elbowAngle;
  channel("--elbow-angle", elbow, "deg");
  const lowering =
    pose.armPose === "idle"
      ? 0
      : (1 - pose.armLift) * restingArmAngle[character];
  const upper = pose.upperArmAngle + lowering;
  const reach =
    ease(pose.elbowOpen / 0.19) * (1 - ease((pose.elbowOpen - 0.79) / 0.19));
  const clearance = 23 + 95 * (1 - reach);
  const tuck =
    rig && reach ? keepWristInFrame(rig, upper, elbow, clearance) : 0;
  // Let the palm lead the short arc up, then leave the held wave to the clock.
  const palmLead =
    ease((pose.elbowOpen - 0.22) / 0.23) *
    (1 - ease((pose.elbowOpen - 0.86) / 0.11));
  channel("--upper-arm-angle", upper + tuck, "deg");
  channel(
    "--wrist-angle",
    pose.wristAngle - (rig ? (elbow + tuck) * 0.8 * palmLead : 0),
    "deg",
  );
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
    const rig = character === "seorin" ? undefined : readArmRig(svg);

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
