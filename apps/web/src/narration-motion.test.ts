import { describe, expect, it } from "vitest";
import { createNarrationMotion, type NarrationInput } from "./narration-motion";

const idle: NarrationInput = {
  level: 0,
  emotion: "neutral",
  gesture: "idle",
};
type Model = ReturnType<typeof createNarrationMotion>;

function sample(
  model: Model,
  seconds: number,
  input: NarrationInput,
  fps = 60,
) {
  let pose = model.advance(0, input);
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    pose = model.advance(1 / fps, input);
  }
  return pose;
}

describe("narrator motion", () => {
  it("accents a new attack, lets a sustained vowel settle and articulates the next phrase", () => {
    const model = createNarrationMotion("seorin", 17);
    const sound = { ...idle, level: 0.8, brightness: 0.9 };
    const attack = sample(model, 0.1, sound);
    const held = sample(model, 1.3, sound);
    expect(held.level).toBeCloseTo(0.8, 2);
    expect(attack.accent).toBeGreaterThan(held.accent + 0.2);
    const pause = sample(model, 1, idle);
    expect(pause.level).toBe(0);
    expect(pause.brightness).toBeCloseTo(0.5, 2);
    expect(sample(model, 0.1, sound).accent).toBeGreaterThan(0.2);
  });

  it("moves the eyes before the head and torso, with counter-rotation in the loose hair", () => {
    const model = createNarrationMotion("isol", 31);
    const focus = { ...idle, emotion: "curious" as const, cueToken: {} };
    model.advance(0, idle);
    const first = sample(model, 0.05, focus);
    const following = sample(model, 0.2, focus);
    expect(Math.abs(first.gazeX)).toBeGreaterThan(0.15);
    expect(Math.abs(following.headAngle)).toBeGreaterThan(
      Math.abs(first.headAngle) + 0.1,
    );
    expect(Math.abs(following.torsoAngle)).toBeLessThan(
      Math.abs(following.headAngle),
    );
    expect(following.hairAngle * following.headAngle).toBeLessThan(0);
    expect(Math.abs(following.hairAngle)).toBeGreaterThan(
      Math.abs(following.fringeAngle),
    );
  });

  it("follows a stage target eyes first, then settles back when the pointer leaves", () => {
    const model = createNarrationMotion("seorin", 5);
    const target = { ...idle, focus: { x: 2, y: -2 } };
    const first = model.advance(1 / 60, target);
    expect(first.gazeX).toBeGreaterThan(0.2);
    expect(first.gazeY).toBeLessThan(-0.2);
    expect(Math.abs(first.headAngle)).toBeLessThan(0.05);
    expect(Math.abs(first.torsoAngle)).toBeLessThan(0.01);
    const turning = sample(model, 0.2, target);
    expect(turning.headAngle).toBeGreaterThan(1);
    expect(turning.hairAngle).toBeLessThan(-0.3);
    const looking = sample(model, 0.55, target);
    expect(looking.gazeX).toBeLessThanOrEqual(1);
    expect(looking.gazeY).toBeGreaterThanOrEqual(-1);
    expect(looking.torsoAngle).toBeGreaterThan(0.4);
    const left = sample(model, 0.2, idle);
    expect(Math.abs(left.gazeX)).toBeLessThan(0.03);
    expect(left.headAngle).toBeGreaterThan(0.3);
  });

  it("anticipates a nod, holds a tilt, and distinguishes a waving wrist from a pointing one", () => {
    const nod = createNarrationMotion("hana");
    const agree: NarrationInput = { ...idle, gesture: "nod" };
    expect(sample(nod, 0.16, agree).headY).toBeLessThan(-0.25);
    expect(sample(nod, 0.28, agree).headY).toBeGreaterThan(2);
    expect(Math.abs(sample(nod, 0.66, agree).headY)).toBeLessThan(0.1);
    const tilt = createNarrationMotion("hana");
    const lean: NarrationInput = { ...idle, gesture: "tilt" };
    expect(sample(tilt, 0.7, lean).headAngle).toBeLessThan(-4);
    expect(sample(tilt, 0.16, lean).headAngle).toBeLessThan(-4);
    const wrist = (gesture: "point" | "greeting") => {
      const model = createNarrationMotion("hana");
      const request = { ...idle, gesture, armReady: true };
      return [0.4, 0.34, 0.27].map(
        (time) => sample(model, time, request).wristAngle,
      );
    };
    const [firstSwing, waveBack, waveOut] = wrist("greeting");
    expect(firstSwing).toBeLessThan(-8);
    expect(waveBack).toBeGreaterThan(5);
    expect(waveOut).toBeLessThan(-4);
    expect(wrist("point").every((angle) => angle < -2)).toBe(true);
  });

  it("holds an arm gesture for its decoded pose and runs once per cue", () => {
    const model = createNarrationMotion("hana", 9);
    const request: NarrationInput = {
      ...idle,
      gesture: "point",
      cueToken: {},
      armReady: false,
    };
    const waiting = sample(model, 2, request);
    expect(waiting.armPose).toBe("idle");
    expect(waiting.gestureProgress).toBe(0);
    expect(waiting.gestureDone).toBe(false);
    const ready = { ...request, armReady: true };
    const reach = sample(model, 0.65, ready);
    expect(reach.armPose).toBe("point");
    expect(reach.armLift).toBeGreaterThan(0.6);
    expect(Math.abs(reach.wristAngle)).toBeGreaterThan(1);
    const finished = sample(model, 3, ready);
    expect(finished.armPose).toBe("idle");
    expect(finished.armLift).toBe(0);
    expect(finished.gestureDone).toBe(true);
    expect(sample(model, 0.2, ready).gestureDone).toBe(true);
    const next = sample(model, 0.3, { ...ready, cueToken: {} });
    expect(next.armPose).toBe("point");
    expect(next.gestureProgress).toBeLessThan(0.5);
  });

  it("produces the same trajectory at 30 and 120 fps and on replay", () => {
    const run = (fps: number) => {
      const model = createNarrationMotion("hana", 3);
      sample(model, 0.5, idle, fps);
      sample(
        model,
        1.5,
        { ...idle, gesture: "nod", level: 0.65, cueToken: 1 },
        fps,
      );
      return sample(
        model,
        2.5,
        { ...idle, emotion: "thoughtful", cueToken: 2 },
        fps,
      );
    };
    expect(run(30)).toEqual(run(120));
    expect(run(60)).toEqual(run(60));
  });

  it("lowers an interrupted arm before replacing its painted hand", () => {
    const model = createNarrationMotion("seorin", 4);
    const wave = sample(model, 0.5, {
      ...idle,
      gesture: "greeting",
      armReady: true,
    });
    const point: NarrationInput = { ...idle, gesture: "point", armReady: true };
    const releasing = sample(model, 0.1, point);
    expect(releasing.armPose).toBe("greeting");
    expect(releasing.armLift).toBeGreaterThan(0);
    expect(releasing.armLift).toBeLessThan(wave.armLift);
    const replaced = sample(model, 0.3, point);
    expect(replaced.armPose).toBe("point");
  });

  it("schedules blinks at varying intervals and varies gaze timing between characters", () => {
    const events = (character: "hana" | "isol") => {
      const model = createNarrationMotion(character, 41);
      const blinks: number[] = [];
      let closed = false;
      let firstGlance = -1;
      for (let i = 0; i < 60 * 40; i++) {
        const p = model.advance(1 / 60, idle);
        if (p.blink > 0.7 && !closed) blinks.push(i);
        closed = p.blink > 0.7;
        if (firstGlance === -1 && Math.abs(p.gazeX) > 0.1) firstGlance = i;
      }
      return { blinks, firstGlance };
    };
    const lively = events("hana");
    expect(lively.blinks.length).toBeGreaterThanOrEqual(4);
    const gaps = lively.blinks
      .slice(1)
      .map((frame, i) => frame - lively.blinks[i]);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(15);
    expect(lively.firstGlance).toBeGreaterThan(0);
    expect(lively.firstGlance).not.toBe(events("isol").firstGlance);
  });

  it("keeps malformed audio and suspended-tab deltas finite and bounded", () => {
    const model = createNarrationMotion("seorin", Number.NaN);
    for (const value of [NaN, Infinity, -Infinity, -10, 500]) {
      const pose = model.advance(value, {
        ...idle,
        level: value,
        brightness: value,
        focus: { x: value, y: value },
      });
      expect(
        Object.values(pose)
          .filter((v) => typeof v === "number")
          .every(Number.isFinite),
      ).toBe(true);
      for (const channel of [
        pose.level,
        pose.brightness,
        pose.blink,
        pose.armLift,
      ]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});
