// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AvatarPanel } from "./AvatarPanel";
import { AvatarMotionBridge } from "./avatar-motion";
import { MotionAvatar } from "./MotionAvatar";

afterEach(cleanup);

it("draws distinct eyelids, gazes and catchlights for all six reply expressions", () => {
  const bridge = new AvatarMotionBridge();
  const frame = (emotion: string) => (
    <AvatarPanel bridge={bridge} level={0.4} cue={{ emotion }} />
  );
  const { container, rerender } = render(frame("neutral"));
  const shapes = new Set<string | null>(),
    glances = new Set<string | null>(),
    pupilLight = new Set<string | null>();
  for (const emotion of [
    "neutral",
    "happy",
    "concerned",
    "surprised",
    "curious",
    "thoughtful",
  ]) {
    rerender(frame(emotion));
    const eye = container.querySelector(".seorin__eyes")!;
    shapes.add(eye.querySelector("clipPath path")!.getAttribute("d"));
    const gaze = eye.querySelector(".seorin__gaze")!;
    glances.add(gaze.getAttribute("transform"));
    pupilLight.add(gaze.querySelector("circle")!.getAttribute("r"));
  }
  expect(shapes.size).toBe(6);
  expect(glances.size).toBe(6);
  expect(pupilLight.size).toBeGreaterThan(2);
});

it("keeps the speaker and expression visible in the articulated lip contour", () => {
  const frame = (
    character: "seorin" | "hana" | "isol",
    emotion: "neutral" | "happy",
  ) => (
    <MotionAvatar
      character={character}
      emotion={emotion}
      gesture="idle"
      level={0.8}
      brightness={0.4}
    />
  );
  const { container, rerender } = render(frame("seorin", "neutral"));
  const contour = () =>
    container.querySelector(".seorin__lip-contour")?.getAttribute("d");
  const neutral = contour();
  rerender(frame("seorin", "happy"));
  expect(contour()).toBeTruthy();
  expect(contour()).not.toBe(neutral);
  const smiles = [contour()];
  for (const person of ["hana", "isol"] as const) {
    rerender(frame(person, "happy"));
    smiles.push(contour());
  }
  expect(new Set(smiles).size).toBe(3);
});

it("shows an index finger, rests at the end, and replays without interrupting speech", () => {
  const cue = { gesture: "point" as const };
  const frame = (current: typeof cue) => (
    <MotionAvatar
      character="seorin"
      emotion="happy"
      gesture={current.gesture}
      cue={current}
      level={0.65}
    />
  );
  const { container, rerender } = render(frame(cue));
  const hand = container.querySelector(".avatar-panel__hand")!;
  const mouth = screen.getByTestId("avatar-mouth");
  const finger = () => hand.querySelector('[data-pose="point"] path');
  expect(finger()).toBeTruthy();
  expect(hand.querySelector('[data-pose="greeting"]')).toBeNull();
  const finish = (animationName: string) =>
    fireEvent(
      hand,
      Object.assign(new Event("animationend", { bubbles: true }), {
        animationName,
      }),
    );
  finish("seorin-wave");
  expect(finger()).toBeTruthy();
  finish("avatar-point");
  expect(finger()).toBeNull();
  rerender(frame(cue));
  expect(finger()).toBeNull();
  rerender(frame({ ...cue }));
  expect(finger()).toBeTruthy();
  expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
});

it("discards the previous character's animation end while the new speaker uses its own pose", () => {
  const cue = { gesture: "greeting" as const };
  const frame = (character: "hana" | "isol") => (
    <MotionAvatar
      character={character}
      emotion="happy"
      gesture="greeting"
      cue={cue}
      level={0.65}
    />
  );
  const { container, rerender } = render(frame("hana"));
  const oldHand = container.querySelector(".avatar-panel__hand")!;
  rerender(frame("isol"));
  fireEvent(
    oldHand,
    Object.assign(new Event("animationend", { bubbles: true }), {
      animationName: "seorin-wave",
    }),
  );
  const hand = container.querySelector(".avatar-panel__hand")!;
  expect(hand.querySelector("path")).toBeTruthy();
  expect(screen.getByRole("img", { name: /이솔/ })).toBeTruthy();
  expect(
    Number(screen.getByTestId("avatar-mouth").getAttribute("ry")),
  ).toBeGreaterThan(2);
});

it("uses a relaxed sleeve for idle and nod cues", () => {
  const bridge = new AvatarMotionBridge();
  const frame = (gesture: string) => (
    <AvatarPanel bridge={bridge} level={0} cue={{ gesture }} />
  );
  const { container, rerender } = render(frame("idle"));
  const palm = () => container.querySelector(".avatar-panel__hand path");
  expect(palm()).toBeNull();
  rerender(frame("greeting"));
  expect(palm()).toBeTruthy();
  rerender(frame("nod"));
  expect(palm()).toBeNull();
  expect(container.querySelector(".seorin__resting-sleeve")).toBeTruthy();
});

it("rests after the wave ends and raises the arm again for the next greeting during speech", () => {
  const bridge = new AvatarMotionBridge();
  const cue = { gesture: "greeting" };
  const frame = (current: typeof cue, level: number) => (
    <AvatarPanel bridge={bridge} level={level} cue={current} />
  );
  const { container, rerender } = render(frame(cue, 0.6));
  const hand = container.querySelector(".avatar-panel__hand")!;
  const mouth = screen.getByTestId("avatar-mouth");
  expect(hand.querySelector("path")).toBeTruthy();
  const end = Object.assign(new Event("animationend", { bubbles: true }), {
    animationName: "seorin-wave",
  });
  fireEvent(hand, end);
  expect(hand.querySelector("path")).toBeNull();
  expect(container.querySelector(".seorin__resting-sleeve")).toBeTruthy();
  rerender(frame(cue, 0.8));
  expect(hand.querySelector("path")).toBeNull();
  const speaking = mouth.getAttribute("ry");
  rerender(frame({ ...cue }, 0.8));
  expect(hand.querySelector("path")).toBeTruthy();
  expect(container.querySelector(".seorin__resting-sleeve")).toBeNull();
  expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
  expect(mouth.getAttribute("ry")).toBe(speaking);
});

it("turns both pupils toward the same side for a concerned glance", () => {
  const bridge = new AvatarMotionBridge();
  const frame = (emotion: string) => (
    <AvatarPanel bridge={bridge} level={0} cue={{ emotion }} />
  );
  const { container, rerender } = render(frame("neutral"));
  const offsets = () =>
    Array.from(container.querySelectorAll(".seorin__gaze"), (gaze) => {
      const move = gaze.getAttribute("transform")!.match(/[-\d.]+/g)!;
      return move.map(Number);
    });
  const neutral = offsets();
  rerender(frame("concerned"));
  const glance = offsets();
  expect(glance).toHaveLength(2);
  // The right eye is mirrored around its outer corner.
  expect(glance[0][0]).toBeLessThan(neutral[0][0]);
  expect(glance[1][0]).toBeGreaterThan(neutral[1][0]);
  expect(glance[0][1]).toBeGreaterThan(neutral[0][1]);
  expect(glance[1][1]).toBeGreaterThan(neutral[1][1]);
});

it("rounds low, dark sounds and spreads bright sounds at the same volume", () => {
  const bridge = new AvatarMotionBridge();
  const frame = (level: number, brightness: number) => (
    <AvatarPanel {...{ bridge, level, brightness }} />
  );
  const { rerender } = render(frame(0.8, 0));
  const mouth = screen.getByTestId("avatar-mouth");
  const radius = (axis: string) => Number(mouth.getAttribute(axis));
  const rounded = { width: radius("rx"), height: radius("ry") };
  rerender(frame(0.8, 1));
  expect(radius("rx")).toBeGreaterThan(rounded.width);
  expect(radius("ry")).toBeLessThan(rounded.height);
  rerender(frame(0, 1));
  const closed = mouth.outerHTML;
  rerender(frame(0, 0));
  expect(mouth.outerHTML).toBe(closed);
});

it("accents speech in the brow and head without replaying a semantic cue", () => {
  const bridge = new AvatarMotionBridge();
  const frame = (level: number) => (
    <AvatarPanel bridge={bridge} level={level} />
  );
  const { rerender } = render(frame(0));
  const face = screen.getByTestId("avatar-character");
  const head = face.querySelector(".seorin__speech-head")!;
  const brows = face.querySelector(".seorin__speech-brows")!;
  const pose = () => [head.getAttribute("style"), brows.getAttribute("style")];
  const rest = pose();
  rerender(frame(0.8));
  const speaking = pose();
  expect(speaking[0]).not.toBe(rest[0]);
  expect(speaking[1]).not.toBe(rest[1]);
  rerender(frame(0));
  expect(pose()).toEqual(rest);
});
