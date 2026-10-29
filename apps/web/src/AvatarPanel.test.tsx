// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AvatarPanel } from "./AvatarPanel";
import { loadAvatar, type LoadedAvatar } from "./avatar-loader";
vi.mock("./avatar-loader", () => ({ loadAvatar: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
const cue = { emotion: "neutral", gesture: "idle", serial: 0 };
function avatar(): LoadedAvatar {
  return {
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
}
it("reports missing installation while retaining the level display", async () => {
  vi.mocked(loadAvatar).mockRejectedValue(new Error("SDK 설치 필요"));
  render(<AvatarPanel level={0} cue={cue} />);
  expect(await screen.findByText("SDK 설치 필요")).toBeTruthy();
  expect(screen.getByText("Live2D 미연결")).toBeTruthy();
});
it("disposes a late load after unmount", async () => {
  let resolve!: (a: LoadedAvatar) => void;
  vi.mocked(loadAvatar).mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const view = render(<AvatarPanel level={0} cue={cue} />);
  view.unmount();
  const a = avatar();
  resolve(a);
  await waitFor(() => expect(a.dispose).toHaveBeenCalledOnce());
  expect(a.setMotion).not.toHaveBeenCalled();
});
it("applies RMS and cues then closes the mouth on page hide and dispose", async () => {
  const a = avatar();
  vi.mocked(loadAvatar).mockResolvedValue(a);
  const view = render(<AvatarPanel level={0.2} cue={cue} />);
  await screen.findByText("Live2D 연결됨");
  expect(a.setLipSync).toHaveBeenLastCalledWith(expect.closeTo(0.2));
  view.rerender(
    <AvatarPanel
      level={0}
      cue={{ emotion: "happy", gesture: "greeting", serial: 1 }}
    />,
  );
  expect(a.setExpression).toHaveBeenLastCalledWith("happy");
  expect(a.setMotion).toHaveBeenLastCalledWith("greeting");
  window.dispatchEvent(new Event("pagehide"));
  expect(a.setLipSync).toHaveBeenLastCalledWith(0);
  view.unmount();
  expect(a.dispose).toHaveBeenCalledOnce();
});
