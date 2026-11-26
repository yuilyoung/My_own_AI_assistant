// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AvatarPanel } from "./AvatarPanel";
import { AvatarMotionBridge } from "./avatar-motion";
import { MotionAvatar } from "./MotionAvatar";
import { motionClock } from "./motion-clock.test-support";

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
  vi.unstubAllGlobals();
});

function stageValue(svg: SVGSVGElement, name: string) {
  return parseFloat(svg.style.getPropertyValue(name));
}

it.each(["hana", "seorin", "isol"] as const)(
  "can overlay %s without a backdrop while keeping its stage and articulation",
  (character) => {
    const frame = (transparent = false) => (
      <MotionAvatar
        character={character}
        emotion="neutral"
        gesture="idle"
        level={0}
        transparent={transparent}
      />
    );
    const { container, rerender } = render(frame());
    const svg = container.querySelector("svg")!;
    const artworkGroups = () =>
      Array.from(svg.children).filter((node) => node.tagName === "g");
    expect(artworkGroups()).toHaveLength(2);
    rerender(frame(true));
    expect(svg.getAttribute("viewBox")).toBe("0 0 360 360");
    expect(svg.style.background).toBe("transparent");
    expect(artworkGroups()).toHaveLength(1);
    expect(
      svg.querySelector(".narration__torso .avatar-panel__head"),
    ).toBeTruthy();
  },
);

it("keeps the idle sleeve while assets load, then lifts the arm over several frames", () => {
  const clock = motionClock();
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
  const svg = container.querySelector("svg")!;
  const mouth = screen.getByTestId("avatar-mouth");
  clock.step(2500);
  expect(container.querySelector("[data-pose] image")).toBeNull();
  expect(stageValue(svg, "--arm-lift")).toBe(0);
  poseReady.mockReturnValue(true);
  rerender(frame(0.65));
  clock.step(110);
  const lift = stageValue(svg, "--arm-lift");
  expect(lift).toBeGreaterThan(0);
  expect(lift).toBeLessThan(1);
  clock.step(65);
  expect(stageValue(svg, "--arm-opacity")).toBe(1);
  expect(stageValue(svg, "--elbow-angle")).toBeGreaterThan(35);
  expect(
    container.querySelector(
      ".narration__arm > .narration__forearm > .avatar-panel__hand",
    ),
  ).toBeTruthy();
  const hand = container.querySelector(
    '.narration__arm .avatar-panel__hand [data-pose="greeting"] image',
  );
  expect(hand).toBeTruthy();
  clock.step(320);
  expect(stageValue(svg, "--arm-lift")).toBeGreaterThan(lift);
  expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
});

it.each(["hana", "seorin", "isol"] as const)(
  "moves %s's raised forearm outside the torso on ascent and descent",
  (character) => {
    const clock = motionClock();
    const { container } = render(
      <MotionAvatar
        character={character}
        emotion="happy"
        gesture="greeting"
        level={0}
      />,
    );
    const stage = container.querySelector("svg")!;
    let raised = false;
    const ascent: number[] = [];
    const descent: number[] = [];
    for (let i = 0; i < 80; i++) {
      clock.step(32);
      const lift = stageValue(stage, "--arm-lift");
      if (lift >= 0.99) raised = true;
      if (lift >= 0.3 && lift <= 0.7) {
        (raised ? descent : ascent).push(stageValue(stage, "--elbow-angle"));
      }
    }
    expect(ascent.length).toBeGreaterThan(0);
    expect(descent.length).toBeGreaterThan(0);
    expect(Math.min(...ascent, ...descent)).toBeGreaterThan(20);
  },
);

it.each(["hana", "isol"] as const)(
  "projects %s's arm through a reach without wrenching its wrist",
  (character) => {
    const clock = motionClock();
    const pose = (gesture: "greeting" | "point" | "idle") => (
      <MotionAvatar
        character={character}
        emotion="happy"
        gesture={gesture}
        level={0}
      />
    );
    const { container, rerender } = render(pose("greeting"));
    const stage = container.querySelector("svg")!;
    const frames: number[][] = [];
    for (let i = 0; i < 180; i++) {
      if (i === 46) rerender(pose("point"));
      if (i === 126) rerender(pose("idle"));
      clock.step(16);
      frames.push([
        stageValue(stage, "--arm-opacity"),
        stageValue(stage, "--wrist-angle"),
        stageValue(stage, "--upper-arm-angle"),
        stageValue(stage, "--forearm-scale-y"),
        stageValue(stage, "--palm-scale-x"),
      ]);
    }
    const visible = frames.filter(([opacity]) => opacity > 0.6);
    expect(visible.length).toBeGreaterThan(70);
    expect(
      Math.max(...visible.map((frame) => Math.abs(frame[1]))),
    ).toBeLessThan(42);
    expect(
      Math.max(...visible.map((frame) => Math.abs(frame[2]))),
    ).toBeLessThan(29);
    expect(Math.min(...visible.map((frame) => frame[3]))).toBeLessThan(0.8);
    expect(Math.min(...visible.map((frame) => frame[4]))).toBeLessThan(0.96);
    for (let i = 1; i < frames.length; i++) {
      if (Math.min(frames[i - 1][0], frames[i][0]) > 0.6) {
        expect(Math.abs(frames[i][1] - frames[i - 1][1])).toBeLessThan(11);
      }
    }
    expect(frames.at(-1)).toEqual([0, 0, 0, 1, 1]);
  },
);

it.each(["hana", "seorin", "isol"] as const)(
  "holds %s's painted gesture for an active reduced-motion cue without starting a frame loop",
  (character) => {
    const clock = motionClock(true);
    const frame = (gesture: "idle" | "greeting" | "point") => (
      <MotionAvatar
        character={character}
        emotion="happy"
        gesture={gesture}
        level={0.4}
      />
    );
    const { container, rerender } = render(frame("idle"));
    const wrist = container.querySelector(".avatar-panel__hand")!;
    rerender(frame("greeting"));
    const wave = wrist
      .querySelector('[data-pose="greeting"] image')
      ?.getAttribute("href");
    expect(wave).toBeTruthy();
    const head = container.querySelector(".avatar-panel__head")!;
    expect(
      head.compareDocumentPosition(wrist) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const sleeve = container.querySelector(
      ".narration__raised-outfit .narration__upper-arm image",
    );
    expect(sleeve).toBeTruthy();
    // An independently drawn sleeve can pivot around the shoulder while the
    // hand turns at the cuff without distorting the torso.
    expect(
      container
        .querySelector("svg")!
        .style.getPropertyValue("--shoulder-pivot"),
    ).not.toBe((wrist as SVGGElement).style.transformOrigin);
    rerender(frame("point"));
    const index = wrist
      .querySelector('[data-pose="point"] image')
      ?.getAttribute("href");
    expect(index).toBeTruthy();
    expect(index).not.toBe(wave);
    expect(clock.pending()).toBe(0);
    expect(stageValue(container.querySelector("svg")!, "--blink")).toBe(0);
    rerender(frame("idle"));
    expect(wrist.querySelector("[data-pose]")).toBeNull();
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

it("lowers a completed gesture and replays only for a fresh cue, keeping the same speaking mouth", () => {
  const clock = motionClock();
  const cue = { gesture: "point" as const };
  const frame = (current: typeof cue, level = 0.65) => (
    <MotionAvatar
      character="seorin"
      emotion="thoughtful"
      gesture={current.gesture}
      cue={current}
      level={level}
    />
  );
  const { container, rerender } = render(frame(cue));
  const mouth = screen.getByTestId("avatar-mouth");
  const hand = () => container.querySelector('[data-pose="point"] image');
  clock.step(460);
  expect(hand()).toBeTruthy();
  clock.step(3800);
  expect(hand()).toBeNull();
  rerender(frame(cue, 0.85));
  clock.step(200);
  expect(hand()).toBeNull();
  rerender(frame({ ...cue }, 0.85));
  clock.step(440);
  expect(hand()).toBeTruthy();
  expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
});

it("moves the neck, shoulders and hair through distinct angles without rerendering the mouth", () => {
  const clock = motionClock();
  const { container, unmount } = render(
    <MotionAvatar
      character="seorin"
      emotion="curious"
      gesture="tilt"
      level={0.8}
    />,
  );
  const svg = container.querySelector("svg")!;
  const mouth = screen.getByTestId("avatar-mouth");
  clock.step(290);
  const angles = ["--head-angle", "--torso-angle", "--fringe-angle"].map(
    (name) => stageValue(svg, name),
  );
  expect(angles.every(Number.isFinite)).toBe(true);
  expect(new Set(angles).size).toBe(3);
  expect(
    container.querySelector(
      ".narration__torso .avatar-panel__head .narration__fringe image",
    ),
  ).toBeTruthy();
  expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
  expect(clock.pending()).toBe(1);
  unmount();
  expect(clock.pending()).toBe(0);
});

it("pauses hidden pages and resumes from the last pose with one active clock", () => {
  const clock = motionClock();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  try {
    const { container } = render(
      <MotionAvatar
        character="hana"
        emotion="happy"
        gesture="greeting"
        level={0.4}
      />,
    );
    clock.step(350);
    const svg = container.querySelector("svg")!;
    const lifted = stageValue(svg, "--arm-lift");
    expect(lifted).toBeGreaterThan(0);
    act(() => {
      hidden.mockReturnValue(true);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(clock.pending()).toBe(0);
    clock.step(9000);
    expect(stageValue(svg, "--arm-lift")).toBe(lifted);
    act(() => {
      hidden.mockReturnValue(false);
      document.dispatchEvent(new Event("visibilitychange"));
    });
    clock.step(16);
    expect(clock.pending()).toBe(1);
    expect(
      container.querySelector('[data-pose="greeting"] image'),
    ).toBeTruthy();
    expect(Math.abs(stageValue(svg, "--arm-lift") - lifted)).toBeLessThan(0.1);
  } finally {
    hidden.mockRestore();
  }
});

it("uses separately registered moving lid masks for the two painted eyes", () => {
  const { container } = render(
    <MotionAvatar
      character="isol"
      emotion="concerned"
      gesture="idle"
      level={0}
    />,
  );
  const eyes = Array.from(container.querySelectorAll(".painted-face__blink"));
  const masks = eyes.map((eye) => {
    const mask = eye.getAttribute("clip-path")!.slice(5, -1);
    return document
      .getElementById(mask)
      ?.querySelector("path")
      ?.getAttribute("d");
  });
  expect(masks).toHaveLength(2);
  expect(masks.every(Boolean)).toBe(true);
  expect(masks[0]).not.toBe(masks[1]);
});

it("follows a pointer over the portrait, ignores touch and releases focus on exit", () => {
  const clock = motionClock();
  const { container } = render(
    <MotionAvatar
      character="seorin"
      emotion="neutral"
      gesture="idle"
      level={0}
    />,
  );
  const svg = container.querySelector("svg")!;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
    new DOMRect(40, 10, 360, 360),
  );
  function move(x: number, type: string) {
    const event = Object.assign(
      new MouseEvent("pointermove", { clientX: x, clientY: 180 }),
      { pointerType: type },
    );
    svg.dispatchEvent(event);
  }
  move(382, "mouse");
  clock.step(160);
  expect(stageValue(svg, "--gaze-x")).toBeGreaterThan(0.5);
  move(48, "touch");
  clock.step(60);
  expect(stageValue(svg, "--gaze-x")).toBeGreaterThan(0.5);
  move(48, "mouse");
  clock.step(160);
  expect(stageValue(svg, "--gaze-x")).toBeLessThan(-0.5);
  svg.dispatchEvent(new MouseEvent("pointerleave"));
  clock.step(170);
  expect(Math.abs(stageValue(svg, "--gaze-x"))).toBeLessThan(0.2);
});

it("lowers an interrupted wave before exchanging it for a pointing hand", () => {
  const clock = motionClock();
  const pose = (gesture: "greeting" | "point") => (
    <MotionAvatar
      character="hana"
      emotion="happy"
      gesture={gesture}
      level={0.68}
    />
  );
  const { container, rerender } = render(pose("greeting"));
  const svg = container.querySelector("svg")!;
  clock.step(450);
  const raised = stageValue(svg, "--arm-lift");
  rerender(pose("point"));
  clock.step(110);
  expect(container.querySelector('[data-pose="greeting"] image')).toBeTruthy();
  const release = stageValue(svg, "--arm-lift");
  expect(release).toBeLessThan(raised);
  expect(release).toBeGreaterThan(0);
  clock.step(380);
  expect(container.querySelector('[data-pose="point"] image')).toBeTruthy();
});

it("shows the whole portrait together after its original face and costume decode", () => {
  const clock = motionClock();
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
  clock.step(120);
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
