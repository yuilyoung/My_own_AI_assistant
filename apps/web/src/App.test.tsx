// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("connects, labels demo, sends reviewed text and clears it on mode change", async () => {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      requests.push(url);
      const value = url.endsWith("/status")
        ? { llm: "demo", tts: "none", stt_enabled: false, model: null }
        : url === "/api/sessions"
          ? { id: JSON.parse(String(options.body)).mode }
          : url.endsWith("/turns")
            ? { id: "turn", segments: [], status: "queued" }
            : url.endsWith("/turns/turn")
              ? {
                  id: "turn",
                  segments: [{ text: "테스트 답변" }],
                  status: "completed",
                }
              : [];
      return { ok: true, status: 200, json: async () => value };
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("연결 토큰"), "a".repeat(32));
  await user.click(screen.getByRole("button", { name: "연결" }));
  expect(await screen.findByText(/DEMO · 고정 응답/)).toBeTruthy();
  expect(screen.getByText(/Live2D 미연결/)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "마이크로 입력" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.type(screen.getByLabelText("메시지"), "확인한 메시지");
  expect(requests.filter((p) => p.endsWith("/turns"))).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "전송" }));
  expect(await screen.findByText("테스트 답변")).toBeTruthy();
  await user.type(screen.getByLabelText("메시지"), "이전 모드 초안");
  await user.click(screen.getByRole("button", { name: "가상 소개팅" }));
  await waitFor(() =>
    expect((screen.getByLabelText("메시지") as HTMLTextAreaElement).value).toBe(
      "",
    ),
  );
  expect(screen.queryByText("테스트 답변")).toBeNull();
  expect(screen.queryByLabelText("비서 메모")).toBeNull();
});
