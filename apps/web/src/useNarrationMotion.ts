import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { AvatarCharacter } from "./avatar-cast";
import {
  createNarrationMotion,
  type NarrationInput,
  type NarrationPose,
} from "./narration-motion";

const restingArmAngle = { hana: 5, seorin: 6, isol: 4 };
// At rest the forearm folds across the waist. Its elbow stays attached as the
// hand travels into the painted wave, including for a cue interrupted mid-reach.
const foldedElbow = { hana: -98, seorin: -195, isol: -112 };
const heldTilt = { hana: -5, seorin: -3.5, isol: 4 };
type Arm = Exclude<NarrationPose["armPose"], "idle">;

function draw(
  svg: SVGSVGElement,
  previous: Map<string, string>,
  character: AvatarCharacter,
  pose: NarrationPose,
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
  channel("--brow-lift", Math.min(1, Math.max(0, -pose.browY / 2)));
  channel("--head-x", pose.headX, "px");
  channel("--head-y", pose.headY, "px");
  channel("--head-angle", pose.headAngle, "deg");
  channel("--torso-y", pose.torsoY, "px");
  channel("--torso-angle", pose.torsoAngle, "deg");
  channel("--fringe-angle", pose.fringeAngle, "deg");
  channel("--hair-angle", pose.hairAngle, "deg");
  channel("--lock-left-angle", pose.lockLeftAngle, "deg");
  channel("--lock-right-angle", pose.lockRightAngle, "deg");
  channel("--accessory-angle", pose.accessoryAngle, "deg");
  channel("--arm-lift", pose.armLift);
  // Only dissolve between two registrations at the very bottom of the reach.
  // The arm stays opaque through the visible arc, including its return.
  const entrance = Math.min(1, pose.armLift / 0.065);
  channel("--arm-opacity", entrance * entrance * (3 - 2 * entrance));
  channel(
    "--elbow-angle",
    pose.armPose === "idle" ? 0 : foldedElbow[character] * (1 - pose.armLift),
    "deg",
  );
  const lowering =
    pose.armPose === "idle"
      ? 0
      : (1 - pose.armLift) * restingArmAngle[character];
  channel("--upper-arm-angle", pose.upperArmAngle + lowering, "deg");
  channel("--wrist-angle", pose.wristAngle, "deg");
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
          armPose: held,
          armLift: held === "idle" ? 0 : 1,
        };
      } else {
        pose = model.advance(dt, { ...current, focus });
      }
      draw(svg, previous, character, pose);
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
