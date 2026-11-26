// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvatarPanel } from "./AvatarPanel";
import { AvatarMotionBridge } from "./avatar-motion";

vi.mock("./usePortraitReady", () => ({ usePortraitReady: () => "ready" }));
vi.mock("./usePortraitPose", () => ({ usePortraitPose: () => true }));
const state = vi.hoisted(() => ({
  report: undefined as
    ((level: number, brightness: number) => void) | undefined,
  close: vi.fn(),
  unlock: vi.fn(),
  play: vi.fn(),
}));
vi.mock("../../diagnostics/player.mjs", () => ({
  Player: class {
    constructor(callback: (level: number, brightness: number) => void) {
      state.report = callback;
    }
    unlock = state.unlock;
    play = state.play;
    close = state.close;
  },
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("uses the local narration's audio for the visible meter and yields to a real answer", async () => {
  const user = userEvent.setup();
  state.close.mockResolvedValue(undefined);
  const bridge = new AvatarMotionBridge();
  state.play.mockReturnValue(new Promise(() => {}));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(8))),
  );
  const { rerender } = render(<AvatarPanel bridge={bridge} level={0} />);
  await user.click(screen.getByText("표정·동작 미리보기"));
  await user.click(screen.getByRole("button", { name: "내레이션 미리듣기" }));
  await screen.findByRole("button", { name: "미리듣기 중지" });
  expect(state.play).toHaveBeenCalledOnce();
  expect(screen.getByTestId("avatar-character").dataset.gesture).toBe("idle");
  act(() => state.report?.(0.65, 0.4));
  expect(screen.getByTestId("avatar-character").dataset.gesture).toBe("nod");
  act(() => state.report?.(0, 0.5));
  expect(screen.getByTestId("avatar-character").dataset.gesture).toBe("nod");
  act(() => state.report?.(0.65, 0.4));
  const meter = screen.getByRole("meter") as HTMLMeterElement;
  expect(meter.value).toBe(0.65);
  rerender(
    <AvatarPanel
      bridge={bridge}
      level={0.2}
      busy
      cue={{ emotion: "surprised", gesture: "nod" }}
    />,
  );
  expect(state.close).toHaveBeenCalledOnce();
  expect(meter.value).toBe(0.2);
  expect(screen.getByRole("img", { name: /놀람/ })).toBeTruthy();
  act(() => state.report?.(0.9, 0.5));
  expect(meter.value).toBe(0.2);
});

it("cancels a pending clip download on character switch and ignores its late response", async () => {
  const user = userEvent.setup();
  state.close.mockResolvedValue(undefined);
  let finish!: (r: Response) => void;
  const fetchClip = vi.fn(
    (_url: string, _init: RequestInit) =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchClip);
  render(<AvatarPanel bridge={new AvatarMotionBridge()} level={0} />);
  await user.click(screen.getByText("표정·동작 미리보기"));
  await user.click(screen.getByRole("button", { name: "내레이션 미리듣기" }));
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "hana");
  expect(fetchClip.mock.calls[0][1].signal?.aborted).toBe(true);
  await act(async () => finish(new Response(new ArrayBuffer(8))));
  expect(state.play).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "내레이션 미리듣기" }),
  ).toBeTruthy();
});

it("stops the sample when the microphone opens and keeps it disabled during voice input", async () => {
  const user = userEvent.setup();
  state.close.mockResolvedValue(undefined);
  state.play.mockReturnValue(new Promise(() => {}));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(8))),
  );
  const bridge = new AvatarMotionBridge();
  const { rerender } = render(<AvatarPanel bridge={bridge} level={0} />);
  await user.click(screen.getByText("표정·동작 미리보기"));
  await user.click(screen.getByRole("button", { name: "내레이션 미리듣기" }));
  expect(state.play).toHaveBeenCalledOnce();
  rerender(<AvatarPanel bridge={bridge} level={0} voiceActive />);
  expect(state.close).toHaveBeenCalledOnce();
  const button = screen.getByRole("button", {
    name: "내레이션 미리듣기",
  }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  await user.click(button);
  expect(state.play).toHaveBeenCalledOnce();
  rerender(<AvatarPanel bridge={bridge} level={0} />);
  expect(button.disabled).toBe(false);
});

it("stops an active narration before the page enters the back-forward cache", async () => {
  const user = userEvent.setup();
  state.close.mockResolvedValue(undefined);
  state.play.mockReturnValue(new Promise(() => {}));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new ArrayBuffer(8))),
  );
  render(<AvatarPanel bridge={new AvatarMotionBridge()} level={0} />);
  await user.click(screen.getByText("표정·동작 미리보기"));
  await user.click(screen.getByRole("button", { name: "내레이션 미리듣기" }));
  expect(state.play).toHaveBeenCalledOnce();
  act(() => window.dispatchEvent(new Event("pagehide")));
  expect(state.close).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("button", { name: "내레이션 미리듣기" }),
  ).toBeTruthy();
});

it("plays the selected student's Korean greeting, then switches to her own introduction", async () => {
  const user = userEvent.setup();
  state.close.mockResolvedValue(undefined);
  state.play.mockReturnValue(new Promise(() => {}));
  const fetchClip = vi.fn(async () => new Response(new ArrayBuffer(8)));
  vi.stubGlobal("fetch", fetchClip);
  render(
    <AvatarPanel
      bridge={new AvatarMotionBridge()}
      level={0}
      defaultCharacter="hana"
    />,
  );
  await user.click(screen.getByText("표정·동작 미리보기"));
  await user.click(screen.getByRole("button", { name: "인사말 듣기" }));
  expect(fetchClip).toHaveBeenLastCalledWith(
    expect.stringContaining("hana-greeting"),
    expect.anything(),
  );
  act(() => state.report?.(0.55, 0.7));
  expect(screen.getByTestId("avatar-character").dataset.gesture).toBe(
    "greeting",
  );
  await user.click(screen.getByRole("button", { name: "내레이션 미리듣기" }));
  expect(fetchClip).toHaveBeenLastCalledWith(
    expect.stringContaining("hana-intro"),
    expect.anything(),
  );
  expect(state.close).toHaveBeenCalledTimes(1);
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "isol");
  await user.click(screen.getByRole("button", { name: "내레이션 미리듣기" }));
  expect(fetchClip).toHaveBeenLastCalledWith(
    expect.stringContaining("isol-intro"),
    expect.anything(),
  );
});
