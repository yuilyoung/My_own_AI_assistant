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
  expect(screen.getByRole("img", { name: /기본 아바타/ })).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "live2d");
  expect(
    (screen.getByRole("button", { name: "마이크로 입력" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  await user.type(screen.getByLabelText("메시지"), "확인한 메시지");
  expect(requests.filter((p) => p.endsWith("/turns"))).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "전송" }));
  expect(await screen.findByText("테스트 답변")).toBeTruthy();
  await user.type(
    screen.getByLabelText("로컬 모델 export 경로 점검"),
    "/avatar-local/Haru/Haru.model3.json",
  );
  await user.type(screen.getByLabelText("메시지"), "이전 모드 초안");
  await user.click(screen.getByRole("button", { name: "가상 소개팅" }));
  await waitFor(() =>
    expect((screen.getByLabelText("메시지") as HTMLTextAreaElement).value).toBe(
      "",
    ),
  );
  expect(screen.getByRole("img", { name: /기본 아바타/ })).toBeTruthy();
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "live2d");
  expect(
    (screen.getByLabelText("로컬 모델 export 경로 점검") as HTMLInputElement)
      .value,
  ).toBe("");
  expect(screen.queryByText("테스트 답변")).toBeNull();
  expect(screen.queryByLabelText("비서 메모")).toBeNull();
});

it("shows local and cloud choices, clears prior messages, and labels cloud transmission", async () => {
  const sessions: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      const value = url.endsWith("/status")
        ? {
            llm: "demo",
            tts: "none",
            stt_enabled: false,
            model: null,
            default_service: "demo",
            deployment: "cloud",
            services: [
              { id: "demo", label: "데모", available: true, model: null },
              {
                id: "local",
                label: "로컬 Ollama",
                available: false,
                model: "qwen3:4b",
                reason: "현재 서버에 Ollama가 없습니다.",
              },
              {
                id: "cloud",
                label: "클라우드 API",
                available: true,
                model: "configured-model",
              },
            ],
          }
        : url === "/api/sessions"
          ? (() => {
              const body = JSON.parse(String(options.body));
              sessions.push(body);
              return { id: body.service, service: body.service };
            })()
          : url.endsWith("/turns")
            ? { id: "t", status: "thinking", segments: [] }
            : url.endsWith("/turns/t")
              ? {
                  id: "t",
                  status: "completed",
                  segments: [{ text: "demo answer" }],
                }
              : [];
      return { ok: true, status: 200, json: async () => value };
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByText(/연결한 서버에 저장/)).toBeTruthy();
  await user.type(screen.getByLabelText("연결 토큰"), "a".repeat(32));
  await user.click(screen.getByRole("button", { name: "연결" }));
  expect(await screen.findByLabelText("LLM 서비스")).toBeTruthy();
  expect(
    (screen.getByRole("option", { name: /로컬 Ollama/ }) as HTMLOptionElement)
      .disabled,
  ).toBe(true);
  await user.type(screen.getByLabelText("메시지"), "private draft");
  await user.selectOptions(screen.getByLabelText("LLM 서비스"), "cloud");
  await waitFor(() =>
    expect(sessions).toContainEqual({ mode: "assistant", service: "cloud" }),
  );
  expect((screen.getByLabelText("메시지") as HTMLTextAreaElement).value).toBe(
    "",
  );
  expect(screen.getByText(/CLOUD · configured-model/)).toBeTruthy();
  expect(screen.getByText(/클라우드 제공자에게 전송/)).toBeTruthy();
  expect(screen.getByRole("img", { name: /기본 아바타/ })).toBeTruthy();
});
