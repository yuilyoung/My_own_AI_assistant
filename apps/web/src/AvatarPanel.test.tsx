// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarPanel } from "./AvatarPanel";
import { AvatarMotionBridge } from "./avatar-motion";

afterEach(cleanup);

it("switches built-in characters while preserving a live reply and its audio level", async () => {
  const user = userEvent.setup();
  const bridge = new AvatarMotionBridge();
  const cue = { emotion: "happy", gesture: "greeting" };
  render(<AvatarPanel bridge={bridge} cue={cue} level={0.6} busy />);
  const selector = screen.getByLabelText("아바타 종류");
  for (const [value, name] of [
    ["hana", "하나"],
    ["isol", "이솔"],
  ]) {
    await user.selectOptions(selector, value);
    const portrait = screen.getByRole("img", { name: new RegExp(name) });
    expect(portrait.getAttribute("data-character")).toBe(value);
    expect(portrait.textContent).toContain("기쁨");
    expect(portrait.textContent).toContain("인사");
    expect((screen.getByRole("meter") as HTMLMeterElement).value).toBe(0.6);
    expect(bridge.ready).toBe(false);
  }
});

it("previews a new gesture in silence and yields to the next reply", async () => {
  const user = userEvent.setup();
  const bridge = new AvatarMotionBridge();
  const { rerender } = render(<AvatarPanel bridge={bridge} level={0} />);
  await user.click(screen.getByText("표정·동작 미리보기"));
  await user.click(screen.getByRole("button", { name: "갸웃하기" }));
  expect(screen.getByRole("img", { name: /호기심.*고개 기울임/ })).toBeTruthy();
  expect((screen.getByRole("meter") as HTMLMeterElement).value).toBe(0);
  const reply = { emotion: "thoughtful", gesture: "point" };
  rerender(<AvatarPanel bridge={bridge} level={0.3} cue={reply} busy />);
  expect(screen.getByRole("img", { name: /사색.*가리키기/ })).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "갸웃하기" })
      .disabled,
  ).toBe(true);
  rerender(<AvatarPanel bridge={bridge} level={0} cue={reply} />);
  expect(screen.getByRole("img", { name: /사색.*가리키기/ })).toBeTruthy();
});

it.each(["close the preview", "start a turn"])(
  "keeps a completed reply gesture at rest when I %s",
  async (action) => {
    const bridge = new AvatarMotionBridge();
    const user = userEvent.setup();
    const greeting = { emotion: "happy", gesture: "greeting" };
    const panel = (cue: typeof greeting, busy = false) => (
      <AvatarPanel bridge={bridge} level={0} cue={cue} busy={busy} />
    );
    const { rerender } = render(panel(greeting));
    const hand = screen.getByRole("img").querySelector(".avatar-panel__hand")!;
    fireEvent(
      hand,
      Object.assign(new Event("animationend", { bubbles: true }), {
        animationName: "seorin-wave",
      }),
    );
    expect(hand.querySelector("path")).toBeNull();
    const summary = screen.getByText("표정·동작 미리보기");
    await user.click(summary);
    await user.click(screen.getByRole("button", { name: "갸웃하기" }));
    if (action === "close the preview") await user.click(summary);
    else rerender(panel(greeting, true));
    await screen.findByRole("img", { name: /기쁨.*대기/ });
    expect(hand.querySelector("path")).toBeNull();
    rerender(panel({ ...greeting }));
    expect(hand.querySelector("path")).toBeTruthy();
  },
);

async function attachRenderer(bridge: AvatarMotionBridge) {
  const adapter = {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  await bridge.attach(
    adapter,
    "/avatar-local/own/own.model3.json",
    {
      moc: "own.moc3",
      textures: ["own.png"],
      referencedFiles: ["own.moc3", "own.png"],
      lipSyncIds: ["ParamMouthOpenY"],
      expressions: {},
      motions: {},
    },
    {},
  );
  return adapter;
}

it("shows an original SVG avatar by default without attaching a licensed runtime", () => {
  const bridge = new AvatarMotionBridge();
  const attach = vi.spyOn(bridge, "attach");
  render(<AvatarPanel bridge={bridge} level={0} />);

  expect(
    (screen.getByRole("combobox", { name: "아바타 종류" }) as HTMLSelectElement)
      .value,
  ).toBe("builtin");
  expect(screen.getByRole("option", { name: /서린/ })).toBeTruthy();
  const avatar = screen.getByRole("img", { name: /서린/ });
  expect(avatar.tagName.toLowerCase()).toBe("svg");
  expect(avatar.getAttribute("viewBox")).toBeTruthy();
  expect(screen.queryByLabelText("로컬 모델 export 경로 점검")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("대화 준비 완료");
  expect(attach).not.toHaveBeenCalled();
  expect(bridge.ready).toBe(false);
});

it("opens the licensed inspector and warns public deployments about private assets", async () => {
  const user = userEvent.setup();
  const bridge = new AvatarMotionBridge();
  render(<AvatarPanel bridge={bridge} level={0} />);

  await user.selectOptions(
    screen.getByRole("combobox", { name: "아바타 종류" }),
    "live2d",
  );

  expect(screen.queryByRole("img", { name: /기본 아바타/ })).toBeNull();
  expect(screen.getByLabelText("로컬 모델 export 경로 점검")).toBeTruthy();
  expect(screen.getByRole("img", { name: "Live2D 로컬 캔버스" })).toBeTruthy();
  expect(screen.getByText(/사용권이 확인된 모델/).textContent).toContain("SDK");
  expect(screen.getByText(/로컬 PC의 Gateway에서만/).textContent).toContain(
    "/avatar-local/",
  );
  expect(screen.getByText(/로컬 PC의 Gateway에서만/).textContent).toContain(
    "공개 서버에서는 인증 없는 모델 자산 노출",
  );
  expect(
    (
      screen.getByRole("button", {
        name: "로컬 Cubism 어댑터 연결",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(bridge.ready).toBe(false);
});

it("disposes a licensed renderer on a type switch and does not reuse it on return", async () => {
  const user = userEvent.setup();
  const bridge = new AvatarMotionBridge();
  render(<AvatarPanel bridge={bridge} level={0} />);
  const selector = screen.getByRole("combobox", { name: "아바타 종류" });
  await user.selectOptions(selector, "live2d");
  const adapter = await attachRenderer(bridge);
  bridge.onAudioLevel(0.7);

  await user.selectOptions(selector, "builtin");

  expect(bridge.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(adapter.setLipSync).toHaveBeenLastCalledWith(0);
  const calls = adapter.setLipSync.mock.calls.length;
  bridge.onAudioLevel(0.9);
  expect(adapter.setLipSync).toHaveBeenCalledTimes(calls);
  await user.selectOptions(selector, "live2d");
  expect(bridge.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(
    (screen.getByLabelText("로컬 모델 export 경로 점검") as HTMLInputElement)
      .value,
  ).toBe("");
});

it("detaches an incoming renderer before showing builtin and cleans up on unmount", async () => {
  const bridge = new AvatarMotionBridge();
  const previous = await attachRenderer(bridge);
  const { unmount } = render(<AvatarPanel bridge={bridge} level={0} />);
  expect(bridge.ready).toBe(false);
  expect(previous.dispose).toHaveBeenCalledOnce();

  const current = await attachRenderer(bridge);
  unmount();
  expect(bridge.ready).toBe(false);
  expect(current.dispose).toHaveBeenCalledOnce();
});

it("detaches the licensed renderer when the panel unmounts", async () => {
  const user = userEvent.setup();
  const bridge = new AvatarMotionBridge();
  const { unmount } = render(<AvatarPanel bridge={bridge} level={0} />);
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "live2d");
  const adapter = await attachRenderer(bridge);

  unmount();

  expect(bridge.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
});

it("detaches the old bridge when a parent replaces it", async () => {
  const previous = new AvatarMotionBridge();
  const next = new AvatarMotionBridge();
  const { rerender } = render(<AvatarPanel bridge={previous} level={0} />);
  const adapter = await attachRenderer(previous);

  rerender(<AvatarPanel bridge={next} level={0} />);

  expect(previous.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
  expect(next.ready).toBe(false);
});

it.each([
  [0, 0],
  [0.5, 0.5],
  [1, 1],
  [-10, 0],
  [10, 1],
  [NaN, 0],
  [Infinity, 0],
  [-Infinity, 0],
])(
  "keeps mouth geometry and the level meter finite for input %s",
  (level, expected) => {
    render(<AvatarPanel bridge={new AvatarMotionBridge()} level={level} />);

    expect(
      (screen.getByRole("meter", { name: "음성 레벨" }) as HTMLMeterElement)
        .value,
    ).toBe(expected);
    const mouth = screen.getByTestId("avatar-mouth");
    const radius = Number(mouth.getAttribute("ry"));
    expect(Number.isFinite(radius)).toBe(true);
    expect(radius).toBeGreaterThan(0);
    expect(radius).toBeLessThanOrEqual(18);
    expect(
      screen.getByRole("img", { name: /기본 아바타/ }).outerHTML,
    ).not.toMatch(/NaN|Infinity/);
  },
);

it("moves the visible SVG mouth with audio and closes it when playback stops", () => {
  const bridge = new AvatarMotionBridge();
  const { rerender } = render(<AvatarPanel bridge={bridge} level={0} />);
  const closed = Number(screen.getByTestId("avatar-mouth").getAttribute("ry"));

  rerender(<AvatarPanel bridge={bridge} level={0.8} />);
  expect(
    Number(screen.getByTestId("avatar-mouth").getAttribute("ry")),
  ).toBeGreaterThan(closed);
  expect(screen.getByRole("status").textContent).toContain("말하는 중");

  rerender(<AvatarPanel bridge={bridge} level={0} />);
  expect(Number(screen.getByTestId("avatar-mouth").getAttribute("ry"))).toBe(
    closed,
  );
  expect(screen.getByRole("status").textContent).toContain("대화 준비 완료");
});

it.each([
  ["happy", "기쁨"],
  ["concerned", "걱정"],
  ["surprised", "놀람"],
])(
  "changes facial features when the latest emotion becomes %s",
  (emotion, label) => {
    const bridge = new AvatarMotionBridge();
    const { rerender } = render(<AvatarPanel bridge={bridge} level={0} />);
    const initialFace = screen.getByTestId("avatar-features").innerHTML;

    rerender(<AvatarPanel bridge={bridge} level={0} cue={{ emotion }} />);

    expect(screen.getByRole("img", { name: new RegExp(label) })).toBeTruthy();
    expect(screen.getByTestId("avatar-features").innerHTML).not.toBe(
      initialFace,
    );

    rerender(<AvatarPanel bridge={bridge} level={0} />);
    expect(screen.getByTestId("avatar-features").innerHTML).toBe(initialFace);
  },
);

it("reacts to supported gesture cues and safely resets unknown cues", () => {
  const bridge = new AvatarMotionBridge();
  const { rerender } = render(<AvatarPanel bridge={bridge} level={0} />);

  rerender(
    <AvatarPanel
      bridge={bridge}
      level={0}
      cue={{ emotion: "happy", gesture: "greeting" }}
    />,
  );
  expect(screen.getByRole("img", { name: /인사/ })).toBeTruthy();
  expect(
    screen.getByTestId("avatar-character").getAttribute("data-gesture"),
  ).toBe("greeting");

  rerender(<AvatarPanel bridge={bridge} level={0} cue={{ gesture: "nod" }} />);
  expect(screen.getByRole("img", { name: /끄덕임/ })).toBeTruthy();
  expect(
    screen.getByTestId("avatar-character").getAttribute("data-gesture"),
  ).toBe("nod");

  rerender(
    <AvatarPanel
      bridge={bridge}
      level={0}
      cue={{ emotion: "not-a-cue", gesture: "not-a-cue" }}
    />,
  );
  expect(screen.getByRole("img", { name: /차분함.*대기/ })).toBeTruthy();
  expect(
    screen.getByTestId("avatar-character").getAttribute("data-gesture"),
  ).toBe("idle");
});

it("shows busy feedback while preserving the usable selector", async () => {
  const user = userEvent.setup();
  const bridge = new AvatarMotionBridge();
  const { rerender } = render(<AvatarPanel bridge={bridge} level={0} busy />);
  expect(screen.getByRole("status").textContent).toContain("답변 준비 중");

  rerender(<AvatarPanel bridge={bridge} level={0.4} busy />);
  expect(screen.getByRole("status").textContent).toContain("말하는 중");
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "live2d");
  expect(screen.getByLabelText("로컬 모델 export 경로 점검")).toBeTruthy();
});

it.each([
  ["nod", ".avatar-panel__head"],
  ["greeting", ".avatar-panel__hand"],
])(
  "replays %s for a new cue object while preserving mouth playback",
  (gesture, selector) => {
    const bridge = new AvatarMotionBridge();
    const cue = { emotion: "happy", gesture };
    const { rerender } = render(
      <AvatarPanel bridge={bridge} level={0.2} cue={cue} />,
    );
    const avatar = screen.getByRole("img", { name: /기본 아바타/ });
    const target = avatar.querySelector<SVGGElement>(selector)!;
    // jsdom does not run CSS animations. Observe the layout flush that restarts
    // only the gesture's animated SVG group; Chromium verifies actual replay.
    const restart = vi.spyOn(target, "getBoundingClientRect");
    const mouth = screen.getByTestId("avatar-mouth");

    rerender(<AvatarPanel bridge={bridge} level={0.8} cue={cue} />);
    expect(restart).not.toHaveBeenCalled();
    expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
    const speaking = mouth.getAttribute("ry");

    rerender(<AvatarPanel bridge={bridge} level={0.8} cue={{ ...cue }} />);
    expect(restart).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: /기본 아바타/ })).toBe(avatar);
    expect(screen.getByTestId("avatar-mouth")).toBe(mouth);
    expect(mouth.getAttribute("ry")).toBe(speaking);
    expect(target.style.animation).toBe("");
  },
);

it("resets selection and licensed form state when the parent's service/mode key changes", async () => {
  const user = userEvent.setup();
  const bridge = new AvatarMotionBridge();
  const { rerender } = render(
    <AvatarPanel key="local-assistant" bridge={bridge} level={0} />,
  );
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "live2d");
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/old.model3.json",
  );
  const adapter = await attachRenderer(bridge);

  rerender(<AvatarPanel key="cloud-companion" bridge={bridge} level={0} />);

  expect(screen.getByRole("img", { name: /기본 아바타/ })).toBeTruthy();
  expect(bridge.ready).toBe(false);
  expect(adapter.dispose).toHaveBeenCalledOnce();
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "live2d");
  expect(
    (screen.getByLabelText("로컬 모델 export 경로 점검") as HTMLInputElement)
      .value,
  ).toBe("");
});

it("uses unique accessible labels and SVG definitions across concurrent panels in StrictMode", () => {
  render(
    <StrictMode>
      <AvatarPanel bridge={new AvatarMotionBridge()} level={0} />
      <AvatarPanel bridge={new AvatarMotionBridge()} level={0} />
    </StrictMode>,
  );
  const panels = screen.getAllByRole("region", { name: "아바타" });
  const selectors = panels.map((panel) =>
    within(panel).getByLabelText("아바타 종류"),
  );
  expect(selectors[0].id).not.toBe(selectors[1].id);
  const avatars = screen.getAllByRole("img", { name: /기본 아바타/ });
  expect(avatars[0].getAttribute("aria-labelledby")).not.toBe(
    avatars[1].getAttribute("aria-labelledby"),
  );
  const gradientIds = avatars.map(
    (avatar) => avatar.querySelector("linearGradient")?.id,
  );
  expect(gradientIds[0]).toBeTruthy();
  expect(gradientIds[0]).not.toBe(gradientIds[1]);
});
