// @vitest-environment jsdom
import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("keeps mode changes out of a pending connection and cancels it on disconnect", async () => {
  let resolveStatus!: (value: Response) => void;
  const fetchStatus = vi.fn(
    (_url: string, _options: RequestInit) =>
      new Promise<Response>((resolve) => {
        resolveStatus = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchStatus);
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("연결 토큰"), "pending-token");
  await user.click(screen.getByRole("button", { name: "연결" }));
  expect(screen.queryByRole("button", { name: "가상 소개팅" })).toBeNull();
  expect(screen.queryByLabelText("LLM 서비스")).toBeNull();
  const signal = fetchStatus.mock.calls[0][1].signal;
  await user.click(screen.getByRole("button", { name: /토큰 다시 입력/ }));
  expect(signal?.aborted).toBe(true);
  resolveStatus(
    Response.json({
      llm: "demo",
      tts: "none",
      stt_enabled: false,
      model: null,
    }),
  );
  await screen.findByLabelText("연결 토큰");
  expect(fetchStatus).toHaveBeenCalledTimes(1);
});

it("recovers from a temporary status failure without retyping the token", async () => {
  const fetchApi = vi
    .fn(async (url: string) => {
      if (url === "/api/status")
        return Response.json({
          llm: "demo",
          tts: "none",
          stt_enabled: false,
          model: null,
        });
      return Response.json(url === "/api/sessions" ? { id: "retry" } : []);
    })
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal("fetch", fetchApi);
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("연결 토큰"), "retry-token");
  await user.click(screen.getByRole("button", { name: "연결" }));
  expect((await screen.findByRole("alert")).textContent).toContain("503");
  expect(screen.queryByLabelText("메시지")).toBeNull();
  expect(fetchApi).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "다시 연결" }));
  await screen.findByText("대화 준비됨");
  expect(
    fetchApi.mock.calls
      .map(([url]) => url)
      .filter((url) => url === "/api/sessions"),
  ).toHaveLength(1);
});

it("retries session creation only for the selected provider and mode", async () => {
  const sessions: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/status"))
        return Response.json({
          llm: "cloud",
          tts: "none",
          model: "example-model",
          stt_enabled: false,
          services: [
            {
              id: "cloud",
              label: "클라우드 API",
              available: true,
              model: "example-model",
            },
          ],
        });
      if (url === "/api/sessions") {
        sessions.push(JSON.parse(String(options.body)));
        return sessions.length === 1
          ? new Response(null, { status: 503 })
          : Response.json({ id: "restored" });
      }
      return Response.json([]);
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("연결 토큰"), "test-token");
  await user.click(screen.getByRole("button", { name: "연결" }));
  await screen.findByText("대화 연결 대기");
  await user.click(screen.getByRole("button", { name: "대화 연결 다시 시도" }));
  await screen.findByText("대화 준비됨");
  expect(sessions).toHaveLength(2);
  expect(sessions[0]).toMatchObject({
    mode: "assistant",
    service: "cloud",
    request_id: expect.any(String),
  });
  expect(sessions[1]).toEqual(sessions[0]);
});

it("rechecks an unavailable default from the open tab after configuration changes", async () => {
  let configured = false;
  const sessions: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith("/status"))
        return Response.json({
          llm: "cloud",
          tts: "none",
          model: null,
          stt_enabled: false,
          services: [
            {
              id: "cloud",
              label: "클라우드 API",
              available: configured,
              model: null,
              reason: configured ? undefined : "CLOUD_MODEL 설정 필요",
            },
          ],
        });
      if (url === "/api/sessions") {
        sessions.push(JSON.parse(String(options.body)).service);
        return Response.json({ id: "configured" });
      }
      return Response.json([]);
    }),
  );
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("연결 토큰"), "test-token");
  await user.click(screen.getByRole("button", { name: "연결" }));
  await screen.findByText("CLOUD_MODEL 설정 필요");
  expect(sessions).toEqual([]);
  configured = true;
  await user.click(
    screen.getByRole("button", { name: "서비스 설정 다시 확인" }),
  );
  await screen.findByText("대화 준비됨");
  expect(sessions).toEqual(["cloud"]);
});

it.each([
  ["memories", "기억할 내용", "기억 저장"],
  ["notes", "비서 메모", "메모 저장"],
])(
  "preserves an edited %s draft when the previous save completes",
  async (kind, label, action) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let written = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.endsWith("/status"))
          return Response.json({
            llm: "demo",
            tts: "none",
            model: null,
            stt_enabled: false,
          });
        if (url === "/api/sessions") return Response.json({ id: "current" });
        if (url.endsWith("/" + kind)) {
          if (options.method === "POST") {
            await pending;
            written = true;
          }
          if (written)
            return Response.json([{ id: "saved", text: "saved draft" }]);
        }
        return Response.json([]);
      }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText("연결 토큰"), "test-token");
    await user.click(screen.getByRole("button", { name: "연결" }));
    await screen.findByText("대화 준비됨");
    const field = screen.getByLabelText(label, {
      exact: true,
    }) as HTMLInputElement;
    await user.type(field, "saved draft");
    await user.click(screen.getByRole("button", { name: action }));
    await user.clear(field);
    await user.type(field, "new draft");
    await act(async () => {
      release();
    });
    await screen.findByText("saved draft");
    expect(field.value).toBe("new draft");
  },
);

it("shows a saved memory and clears its draft when a turn starts during the save", async () => {
  let finishSave!: () => void;
  const pendingSave = new Promise<void>((resolve) => {
    finishSave = resolve;
  });
  const memories: { id: string; text: string }[] = [];
  vi.stubGlobal("fetch", async (url: string, options: RequestInit) => {
    if (url === "/api/status")
      return Response.json({
        llm: "demo",
        tts: "none",
        model: null,
        stt_enabled: false,
      });
    if (url === "/api/sessions") return Response.json({ id: "current" });
    if (url.endsWith("/memories")) {
      if (options.method === "POST") {
        await pendingSave;
        const item = {
          id: "memory",
          text: JSON.parse(String(options.body)).text,
        };
        memories.push(item);
        return Response.json(item, { status: 201 });
      }
      return Response.json(memories);
    }
    if (url.endsWith("/turns"))
      return Response.json({ id: "turn", status: "queued", segments: [] });
    if (url.endsWith("/turns/turn"))
      return Response.json({
        id: "turn",
        status: "completed",
        segments: [{ text: "Reply" }],
      });
    return Response.json([]);
  });
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("연결 토큰"), "test-token");
  await user.click(screen.getByRole("button", { name: "연결" }));
  await screen.findByText("대화 준비됨");
  const draft = screen.getByLabelText("기억할 내용") as HTMLInputElement;
  await user.type(draft, "A saved memory");
  await user.click(screen.getByRole("button", { name: "기억 저장" }));
  await user.type(screen.getByLabelText("메시지"), "Hello");
  await user.click(screen.getByRole("button", { name: "전송" }));
  await screen.findByText("Reply");
  await act(async () => finishSave());
  expect(draft.value).toBe("");
  expect(screen.getByText("A saved memory")).toBeTruthy();
});

it("keeps the chat error visible while a failed storage list is reloaded", async () => {
  let finishRead!: (result: Response) => void;
  const firstRead = new Promise<Response>((resolve) => {
    finishRead = resolve;
  });
  let reads = 0;
  vi.stubGlobal("fetch", async (url: string) => {
    if (url === "/api/status")
      return Response.json({
        llm: "demo",
        tts: "none",
        model: null,
        stt_enabled: false,
      });
    if (url === "/api/sessions") return Response.json({ id: "current" });
    if (url.endsWith("/turns")) return new Response(null, { status: 502 });
    if (url.endsWith("/memories")) {
      if (++reads === 1) return firstRead;
      return Response.json([{ id: "m", text: "Recovered memory" }]);
    }
    return Response.json([]);
  });
  const user = userEvent.setup();
  render(<App />);
  await user.type(screen.getByLabelText("연결 토큰"), "test-token");
  await user.click(screen.getByRole("button", { name: "연결" }));
  await screen.findByText("대화 준비됨");
  await user.type(screen.getByLabelText("메시지"), "Hello");
  await user.click(screen.getByRole("button", { name: "전송" }));
  await screen.findByText(/HTTP 502/);
  await act(async () => finishRead(new Response(null, { status: 503 })));
  expect(screen.queryByText(/HTTP 502/)).toBeTruthy();
  const storage = within(screen.getByRole("region", { name: "기억과 메모" }));
  expect(storage.getByText(/HTTP 503/)).toBeTruthy();
  await user.click(
    storage.getByRole("button", { name: "저장 목록 다시 불러오기" }),
  );
  await screen.findByText("Recovered memory");
  expect(screen.queryByText(/HTTP 503/)).toBeNull();
  expect(screen.getByText(/HTTP 502/)).toBeTruthy();
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
  await user.selectOptions(screen.getByLabelText("아바타 종류"), "hana");
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
  expect(screen.getByRole("img", { name: /하나/ })).toBeTruthy();
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
    expect(sessions).toContainEqual(
      expect.objectContaining({ mode: "assistant", service: "cloud" }),
    ),
  );
  expect((screen.getByLabelText("메시지") as HTMLTextAreaElement).value).toBe(
    "",
  );
  expect(screen.getByText(/CLOUD · configured-model/)).toBeTruthy();
  expect(screen.getByText(/클라우드 제공자에게 전송/)).toBeTruthy();
  expect(screen.getByRole("img", { name: /기본 아바타/ })).toBeTruthy();
});
