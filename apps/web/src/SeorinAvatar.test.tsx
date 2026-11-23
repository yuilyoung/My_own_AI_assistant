// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AvatarPanel } from "./AvatarPanel";
import { AvatarMotionBridge } from "./avatar-motion";
import { MotionAvatar } from "./MotionAvatar";

const { poseReady, portraitReady } = vi.hoisted(() => ({
  poseReady: vi.fn(() => true),
  portraitReady: vi.fn(() => "ready"),
}));
vi.mock("./usePortraitReady", () => ({ usePortraitReady: portraitReady }));
vi.mock("./usePortraitPose", () => ({ usePortraitPose: poseReady }));
afterEach(() => {
  cleanup();
  poseReady.mockReturnValue(true);
  portraitReady.mockReturnValue("ready");
});

it("keeps the idle sleeve while artwork loads, then starts the requested gesture at full duration", () => {
  poseReady.mockReturnValue(false);
  const cue = { gesture: "greeting" as const };
  const frame = (level: number) => (
    <MotionAvatar
      character="hana"
      emotion="happy"
      gesture={cue.gesture}
      cue={cue}
      level={level}
    />
  );
  const { container, rerender } = render(frame(0.4));
  const wrist = container.querySelector<SVGGElement>(".avatar-panel__hand")!;
  const mouth = screen.getByTestId("avatar-mouth");
  expect(wrist.querySelector("image")).toBeNull();
  expect(container.querySelector(".seorin__resting-sleeve")).toBeTruthy();
  const restart = vi.spyOn(wrist, "getBoundingClientRect");
  rerender(frame(0.65));
  expect(restart).not.toHaveBeenCalled();
  poseReady.mockReturnValue(true);
  rerender(frame(0.65));
  expect(restart).toHaveBeenCalledOnce();
  expect(wrist.querySelector('[data-pose="greeting"] image')).toBeTruthy();
  expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
});

it.each(["hana", "seorin", "isol"] as const)(
  "matches %s's waving and pointing hands to the painted sleeve",
  (character) => {
    const frame = (gesture: "idle" | "greeting" | "point") => (
      <MotionAvatar
        character={character}
        emotion="neutral"
        gesture={gesture}
        level={0}
      />
    );
    const { container, rerender } = render(frame("idle"));
    const wrist = container.querySelector<SVGGElement>(".avatar-panel__hand")!;
    expect(wrist.querySelector("image")).toBeNull();
    rerender(frame("greeting"));
    const palm = wrist
      .querySelector('[data-pose="greeting"] image')
      ?.getAttribute("href");
    expect(palm).toBeTruthy();
    expect(wrist.style.transformOrigin).toBeTruthy();
    rerender(frame("point"));
    const indexFinger = wrist
      .querySelector('[data-pose="point"] image')
      ?.getAttribute("href");
    expect(indexFinger).toBeTruthy();
    expect(indexFinger).not.toBe(palm);
    rerender(frame("idle"));
    expect(wrist.querySelector("image")).toBeNull();
  },
);

it("rests on each artist's original eyes, brows and closed lips", () => {
  const frame = (character: "seorin" | "hana" | "isol") => (
    <MotionAvatar
      character={character}
      emotion="neutral"
      gesture="idle"
      level={0}
    />
  );
  const { container, rerender } = render(frame("seorin"));
  const originals = new Set<string>();
  for (const character of ["seorin", "hana", "isol"] as const) {
    rerender(frame(character));
    const eyes = Array.from(
      container.querySelectorAll("image.painted-face__eye-open"),
    );
    const brows = Array.from(
      container.querySelectorAll("image.painted-face__brow"),
    );
    expect(eyes).toHaveLength(2);
    expect(brows).toHaveLength(2);
    const lips = container.querySelector("image.painted-face__mouth-rest")!;
    expect(lips.getAttribute("opacity")).toBe("1");
    for (const image of [...eyes, ...brows, lips]) {
      expect(Number(image.getAttribute("width"))).toBeGreaterThan(0);
      expect(Number(image.getAttribute("height"))).toBeGreaterThan(0);
      const asset = image.getAttribute("href");
      expect(asset).toBeTruthy();
      originals.add(asset!);
    }
    expect(
      container
        .querySelector(".painted-face__eye-pose")!
        .hasAttribute("transform"),
    ).toBe(false);
    expect(
      container
        .querySelector(".painted-face__brow-pose")!
        .hasAttribute("transform"),
    ).toBe(false);
  }
  expect(originals.size).toBe(15);
});

it("uses the same painted eyes and brows for each expression and restores their neutral registration", () => {
  const bridge = new AvatarMotionBridge();
  const frame = (emotion: string) => (
    <AvatarPanel bridge={bridge} level={0} cue={{ emotion }} />
  );
  const { container, rerender } = render(frame("neutral"));
  const eye = container.querySelector("image.painted-face__eye-open");
  const brow = container.querySelector("image.painted-face__brow");
  const pose = () =>
    container
      .querySelector(".painted-face__eye-pose")
      ?.getAttribute("transform");
  const shapes = new Set();
  for (const emotion of [
    "neutral",
    "happy",
    "curious",
    "concerned",
    "thoughtful",
    "surprised",
  ]) {
    rerender(frame(emotion));
    expect(container.querySelector("image.painted-face__eye-open")).toBe(eye);
    expect(container.querySelector("image.painted-face__brow")).toBe(brow);
    shapes.add(pose());
  }
  expect(shapes.size).toBe(6);
  rerender(frame("neutral"));
  expect(pose()).toBeNull();
});

it("reveals the cavity between painted lips only during audio, then restores the original mouth", () => {
  const frame = (level: number, brightness: number) => (
    <MotionAvatar
      character="seorin"
      emotion="happy"
      gesture="idle"
      level={level}
      brightness={brightness}
    />
  );
  const { container, rerender } = render(frame(0, 0));
  const mouth = screen.getByTestId("avatar-mouth");
  const original = container.querySelector("image.painted-face__mouth-rest")!;
  const silent = mouth.getAttribute("d");
  expect(mouth.tagName.toLowerCase()).toBe("path");
  expect(original.getAttribute("opacity")).toBe("1");
  rerender(frame(0.75, 0));
  const rounded = mouth.getAttribute("d");
  expect(rounded).not.toBe(silent);
  expect(original.getAttribute("opacity")).toBe("0");
  expect(container.querySelectorAll(".painted-face__lip image")).toHaveLength(
    2,
  );
  rerender(frame(0.75, 1));
  expect(mouth.getAttribute("d")).not.toBe(rounded);
  rerender(frame(0, 1));
  expect(mouth.getAttribute("d")).toBe(silent);
  expect(original.getAttribute("opacity")).toBe("1");
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
  const finger = () => hand.querySelector('[data-pose="point"] image');
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
  expect(hand.querySelector("[data-pose] image")).toBeTruthy();
  expect(screen.getByRole("img", { name: /이솔/ })).toBeTruthy();
  expect(
    container
      .querySelector(".painted-face__mouth-rest")
      ?.getAttribute("opacity"),
  ).toBe("0");
});

it("uses a relaxed sleeve for idle and nod cues", () => {
  const bridge = new AvatarMotionBridge();
  const frame = (gesture: string) => (
    <AvatarPanel bridge={bridge} level={0} cue={{ gesture }} />
  );
  const { container, rerender } = render(frame("idle"));
  const palm = () =>
    container.querySelector(".avatar-panel__hand [data-pose] image");
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
  expect(hand.querySelector("[data-pose] image")).toBeTruthy();
  const end = Object.assign(new Event("animationend", { bubbles: true }), {
    animationName: "seorin-wave",
  });
  fireEvent(hand, end);
  expect(hand.querySelector("[data-pose] image")).toBeNull();
  expect(container.querySelector(".seorin__resting-sleeve")).toBeTruthy();
  rerender(frame(cue, 0.8));
  expect(hand.querySelector("[data-pose] image")).toBeNull();
  const speaking = mouth.getAttribute("d");
  rerender(frame({ ...cue }, 0.8));
  expect(hand.querySelector("[data-pose] image")).toBeTruthy();
  expect(container.querySelector(".seorin__resting-sleeve")).toBeNull();
  expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
  expect(mouth.getAttribute("d")).toBe(speaking);
});

it("keeps both eyes anchored to their own painted lid during a blink", () => {
  const { container } = render(
    <MotionAvatar
      character="isol"
      emotion="concerned"
      gesture="idle"
      level={0}
    />,
  );
  const eyes = Array.from(
    container.querySelectorAll<SVGGElement>(".painted-face__blink"),
  );
  expect(eyes).toHaveLength(2);
  for (const eye of eyes) {
    const image = eye.querySelector("image")!;
    const [cx, cy] = eye.style.transformOrigin.split(" ").map(parseFloat);
    expect(cx).toBeGreaterThan(Number(image.getAttribute("x")));
    expect(cx).toBeLessThan(
      Number(image.getAttribute("x")) + Number(image.getAttribute("width")),
    );
    expect(cy).toBeGreaterThan(Number(image.getAttribute("y")));
    expect(cy).toBeLessThan(
      Number(image.getAttribute("y")) + Number(image.getAttribute("height")),
    );
  }
  expect(eyes[0].style.transformOrigin).not.toBe(eyes[1].style.transformOrigin);
});

it("shows the whole portrait together after its original face and costume decode", () => {
  portraitReady.mockReturnValue("loading");
  const frame = () => (
    <MotionAvatar
      character="hana"
      emotion="curious"
      gesture="point"
      level={0.45}
    />
  );
  const { container, rerender } = render(frame());
  expect(screen.queryByTestId("avatar-character")).toBeNull();
  expect(screen.getByText("캐릭터 그림을 불러오는 중")).toBeTruthy();
  portraitReady.mockReturnValue("error");
  rerender(frame());
  expect(screen.queryByTestId("avatar-features")).toBeNull();
  expect(screen.getByText(/다시 선택/)).toBeTruthy();
  portraitReady.mockReturnValue("ready");
  rerender(frame());
  expect(container.querySelector("image.painted-face__eye-open")).toBeTruthy();
  expect(container.querySelector('[data-pose="point"] image')).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
});

it("changes the resting painted mouth with emotion, and returns it to its original neutral registration", () => {
  const frame = (
    emotion: "neutral" | "happy" | "concerned" | "surprised",
    level = 0,
  ) => (
    <MotionAvatar
      character="hana"
      emotion={emotion}
      gesture="idle"
      level={level}
    />
  );
  const { container, rerender } = render(frame("neutral"));
  const rest = container.querySelector("image.painted-face__mouth-rest")!;
  const pose = () => rest.parentElement!.getAttribute("transform");
  expect(pose()).toBeNull();
  const poses = new Set<string>();
  for (const emotion of ["happy", "concerned", "surprised"] as const) {
    rerender(frame(emotion));
    expect(rest.getAttribute("opacity")).toBe("1");
    const expression = pose();
    expect(expression).toBeTruthy();
    poses.add(expression!);
    rerender(frame(emotion, 0.6));
    rerender(frame(emotion));
    expect(pose()).toBe(expression);
    expect(rest.getAttribute("opacity")).toBe("1");
  }
  expect(poses.size).toBe(3);
  rerender(frame("neutral"));
  expect(pose()).toBeNull();
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
  expect(brows.getAttribute("style")).toContain("var(--voice-level)");
  const features = screen.getByTestId("avatar-features");
  const pose = () => [
    head.getAttribute("style"),
    features.style.getPropertyValue("--voice-level"),
  ];
  const rest = pose();
  rerender(frame(0.8));
  const speaking = pose();
  expect(speaking[0]).not.toBe(rest[0]);
  expect(speaking[1]).not.toBe(rest[1]);
  rerender(frame(0));
  expect(pose()).toEqual(rest);
});
