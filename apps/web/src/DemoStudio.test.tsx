// @vitest-environment jsdom
import { useState } from "react";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DemoStudio } from "./DemoStudio";
import type { AvatarCharacter } from "./avatar-cast";

vi.mock("./usePortraitReady", () => ({ usePortraitReady: () => "ready" }));
vi.mock("./usePortraitPose", () => ({ usePortraitPose: () => true }));
const audio = vi.hoisted(() => ({
  report: undefined as
    ((level: number, brightness: number) => void) | undefined,
  close: vi.fn(async () => {}),
  play: vi.fn(() => new Promise(() => {})),
}));
vi.mock("../../diagnostics/player.mjs", () => ({
  Player: class {
    constructor(onLevel: (level: number, brightness: number) => void) {
      audio.report = onLevel;
    }
    async unlock() {}
    close = audio.close;
    play = audio.play;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function Studio() {
  const [character, setCharacter] = useState<AvatarCharacter>("isol");
  return <DemoStudio character={character} onCharacterChange={setCharacter} />;
}

it("plays the selected character's sample locally and cancels it when leaving the character", async () => {
  const fetchClip = vi.fn(
    async (_url: string, _init: RequestInit) =>
      new Response(new ArrayBuffer(4)),
  );
  vi.stubGlobal("fetch", fetchClip);
  const user = userEvent.setup();
  const studio = render(<Studio />);
  expect(fetchClip).not.toHaveBeenCalled();

  const thread = screen.getByRole("log", { name: "샘플 대화" });
  expect(thread.textContent).toContain("나무 그늘에서");
  await user.click(screen.getByRole("button", { name: "자기소개 듣기" }));
  expect(fetchClip.mock.calls[0][0]).toContain("isol-intro");
  const messages = within(thread).getAllByRole("article");
  expect(messages).toHaveLength(2);
  expect(messages[0].textContent).toContain("자기소개해 줄래요?");
  expect(messages[1].textContent).toContain("작은 노트에 그려요");
  act(() => audio.report?.(0.55, 0.7));
  expect((screen.getByRole("meter") as HTMLMeterElement).value).toBe(0.55);
  expect(screen.getByTestId("avatar-character").dataset.gesture).toBe("nod");

  await user.click(screen.getByRole("button", { name: /서린/ }));
  expect(fetchClip.mock.calls[0][1].signal?.aborted).toBe(true);
  expect(
    screen.getByRole("button", { name: /서린/ }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(within(thread).getByText("서린", { exact: true })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "인사말 듣기" }));
  expect(fetchClip.mock.calls[1][0]).toContain("seorin-greeting");
  studio.unmount();
  expect(fetchClip.mock.calls[1][1].signal?.aborted).toBe(true);
});

it("lets visitors try motion without requesting audio", async () => {
  const fetchClip = vi.fn();
  vi.stubGlobal("fetch", fetchClip);
  const user = userEvent.setup();
  render(<Studio />);
  await user.click(screen.getByRole("button", { name: "끄덕이기" }));
  expect(screen.getByTestId("avatar-character").dataset.gesture).toBe("nod");
  await user.click(screen.getByRole("button", { name: "갸웃하기" }));
  expect(screen.getByTestId("avatar-character").dataset.gesture).toBe("tilt");
  expect(fetchClip).not.toHaveBeenCalled();
});
