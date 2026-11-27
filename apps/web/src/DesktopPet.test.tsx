// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Player } from "../../diagnostics/player.mjs";
import { MicrophoneRecorder } from "../../diagnostics/recorder.mjs";
import { DesktopPet, isPetWindow } from "./DesktopPet";

it("opens only the dedicated loopback pet route", () => {
  expect(isPetWindow(new URL("http://127.0.0.1:8765/?pet=1"))).toBe(true);
  expect(isPetWindow(new URL("https://example.org/?pet=1"))).toBe(false);
  expect(isPetWindow(new URL("http://127.0.0.1:8765/"))).toBe(false);
});

it("waits for the native host, pairs once and sends text as the selected pet", async () => {
  const original = location.href;
  history.replaceState(null, "", "/?pet=1#token=pet-test-key");
  const host = { drag: vi.fn(), close: vi.fn(), setRoaming: vi.fn() };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const requests = vi.fn(async (path: string, options: RequestInit) => {
    if (path.endsWith(".mp3")) return new Response(new ArrayBuffer(8));
    expect(options.headers).toMatchObject({
      Authorization: "Bearer pet-test-key",
    });
    if (path === "/api/status")
      return Response.json({ llm: "demo", tts: "none", stt_enabled: true });
    if (path === "/api/sessions") return Response.json({ id: "s" });
    if (path.endsWith("/turns"))
      return Response.json({ id: "t", status: "running", segments: [] });
    if (path.endsWith("/turns/t"))
      return Response.json({
        status: "completed",
        segments: [
          { text: "반가워요!", emotion: "happy", gesture: "greeting" },
        ],
      });
    return Response.json([]);
  });
  vi.stubGlobal("fetch", requests);
  try {
    vi.spyOn(Player.prototype, "unlock").mockResolvedValue(undefined);
    vi.spyOn(Player.prototype, "play").mockImplementation(function (
      this: Player,
    ) {
      const player = this as unknown as {
        onLevel(level: number, tone: number): void;
      };
      player.onLevel(0.65, 0.5);
      return new Promise<void>(() => {});
    });
    vi.spyOn(MicrophoneRecorder.prototype, "start").mockResolvedValue(
      undefined,
    );
    const user = userEvent.setup();
    render(<DesktopPet />);
    expect(location.hash).toBe("");
    expect(requests).not.toHaveBeenCalled();
    await act(async () => {
      window.desktopPet = host;
      window.dispatchEvent(new Event("desktop-pet-ready"));
    });
    const cast = await screen.findByLabelText("펫 캐릭터");
    await user.selectOptions(cast, "hana");
    await user.click(screen.getByRole("button", { name: "산책" }));
    expect(host.setRoaming).toHaveBeenLastCalledWith(true);
    await user.click(screen.getByRole("button", { name: "대화" }));
    expect(host.setRoaming).toHaveBeenLastCalledWith(false);
    await user.type(screen.getByLabelText("메시지"), "안녕");
    await user.click(screen.getByRole("button", { name: "전송" }));
    await screen.findByText("반가워요!", { exact: false });
    const turn = requests.mock.calls.find(([path]) => path.endsWith("/turns"));
    expect(JSON.parse(String(turn?.[1].body))).toEqual({
      text: "안녕",
      voice: "hana",
    });
    expect(screen.getByRole("img", { name: /인사.*하나/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /^인사$/ }));
    await waitFor(() => expect(Player.prototype.play).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "인사 중지" }));
    expect(screen.getByRole("img", { name: /대기.*하나/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "마이크로 입력" }));
    await screen.findByRole("button", { name: "녹음 완료" });
    expect(
      (screen.getByRole("button", { name: "대화" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(host.setRoaming).toHaveBeenLastCalledWith(false);
    await user.click(screen.getByRole("button", { name: "음성 입력 취소" }));
    await screen.findByRole("button", { name: "마이크로 입력" });
    await user.click(screen.getByRole("button", { name: "펫 종료" }));
    expect(host.close).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(
        requests.mock.calls.filter(([path]) => path === "/api/sessions"),
      ).toHaveLength(1),
    );
  } finally {
    cleanup();
    delete window.desktopPet;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    history.replaceState(null, "", original);
  }
});
