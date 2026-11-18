import { expect, it, vi } from "vitest";
import { Conversation } from "./conversation";
import { GatewayClient, type Segment } from "./gateway";
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
function setup(onSegment?: (segment: Segment) => void) {
  const client = new GatewayClient("test");
  vi.spyOn(client, "status").mockResolvedValue({
    llm: "demo",
    tts: "none",
    stt_enabled: false,
    model: null,
  });
  vi.spyOn(client, "createSession").mockImplementation(async (mode) => ({
    id: mode,
  }));
  vi.spyOn(client, "request").mockResolvedValue([]);
  vi.spyOn(client, "cancelTurn").mockResolvedValue();
  const player = {
    unlock: vi.fn(async () => {}),
    stop: vi.fn(),
    close: vi.fn(async () => {}),
    play: vi.fn(async () => {}),
  };
  const recorder = {
    cancel: vi.fn(),
    start: vi.fn(
      async (_onLimit?: () => void, _onFailure?: (error: Error) => void) => {},
    ),
    finish: vi.fn(async () => new ArrayBuffer(44)),
  };
  const app = new Conversation(client, player, recorder, 0, onSegment);
  return { app, client, player, recorder };
}
it("discards and cancels a turn created after switching modes", async () => {
  const { app, client, player } = setup();
  await app.connect();
  const pending = deferred<{ id: string; status: string; segments: [] }>();
  vi.spyOn(client, "createTurn").mockReturnValue(pending.promise);
  const poll = vi.spyOn(client, "pollTurn");
  app.setInput("hello");
  const sending = app.send();
  await Promise.resolve();
  await Promise.resolve();
  await app.changeMode("companion");
  pending.resolve({ id: "late", status: "queued", segments: [] });
  await sending;
  expect(client.cancelTurn).toHaveBeenCalledWith("assistant", "late");
  expect(poll).not.toHaveBeenCalled();
  expect(app.state.messages).toEqual([]);
  expect(app.state.mode).toBe("companion");
  expect(player.stop).toHaveBeenCalled();
});
it("plays authenticated audio and keeps text when playback fails", async () => {
  const { app, client, player } = setup();
  await app.connect();
  vi.spyOn(client, "createTurn").mockResolvedValue({
    id: "t",
    status: "queued",
    segments: [],
  });
  vi.spyOn(client, "pollTurn").mockResolvedValue({
    id: "t",
    status: "completed",
    segments: [{ text: "answer", audio_id: "audio" }],
  });
  vi.spyOn(client, "audio").mockResolvedValue(new ArrayBuffer(12));
  player.play.mockRejectedValue(new Error("speaker"));
  app.setInput("question");
  await app.send();
  expect(client.audio).toHaveBeenCalledWith(
    "assistant",
    "audio",
    expect.any(AbortSignal),
  );
  expect(app.state.messages.map((m) => m.text)).toEqual(["question", "answer"]);
  expect(app.state.error).toContain("speaker");
  expect(app.state.busy).toBe(false);
});
it("puts a transcript in the composer without creating a chat turn", async () => {
  const { app, client, recorder } = setup();
  await app.connect();
  app.state.status!.stt_enabled = true;
  const create = vi.spyOn(client, "createTurn");
  vi.mocked(client.request).mockImplementation(async (path) =>
    path.endsWith("/transcriptions")
      ? { id: "job" }
      : path.endsWith("/job")
        ? { status: "completed", text: "인식 결과" }
        : undefined,
  );
  await app.toggleMicrophone();
  expect(recorder.start).toHaveBeenCalled();
  await app.toggleMicrophone();
  expect(app.state.input).toBe("인식 결과");
  expect(create).not.toHaveBeenCalled();
  expect(app.state.voice).toBe("idle");
});
it("resets React voice state and reports a device disconnect without sending a turn", async () => {
  const { app, client, recorder } = setup();
  await app.connect();
  app.state.status!.stt_enabled = true;
  let onFailure: ((error: Error) => void) | undefined;
  recorder.start.mockImplementation(async (_onLimit, failure) => {
    onFailure = failure;
  });
  const createTurn = vi.spyOn(client, "createTurn");
  await app.toggleMicrophone();
  expect(app.state.voice).toBe("recording");
  expect(onFailure).toBeDefined();
  onFailure?.(new Error("마이크 분리"));
  expect(app.state.voice).toBe("idle");
  expect(app.state.error).toContain("마이크 분리");
  expect(recorder.cancel).toHaveBeenCalled();
  expect(createTurn).not.toHaveBeenCalled();
});

it("ignores stale memory lists when the mode changes", async () => {
  const { app, client } = setup();
  const old = deferred<unknown>();
  vi.mocked(client.request).mockImplementation(async (path) =>
    path === "/sessions/assistant/memories" ? old.promise : [],
  );
  const connecting = app.connect();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await app.changeMode("companion");
  old.resolve([{ id: "secret", text: "private" }]);
  await connecting;
  expect(app.state.memories).toEqual([]);
  expect(app.state.notes).toEqual([]);
});

it("cancels server inference when polling fails instead of losing its turn ID", async () => {
  const { app, client } = setup();
  await app.connect();
  vi.spyOn(client, "createTurn").mockResolvedValue({
    id: "pending",
    status: "thinking",
    segments: [],
  });
  vi.spyOn(client, "pollTurn").mockRejectedValue(
    new Error("network disconnected"),
  );
  app.setInput("question");
  await app.send();
  expect(client.cancelTurn).toHaveBeenCalledWith("assistant", "pending");
  expect(app.state.busy).toBe(false);
  expect(app.state.error).toContain("network disconnected");
});

it("delivers validated reply metadata to the avatar before playback while keeping voice independent", async () => {
  const order: string[] = [];
  const onSegment = vi.fn(() => {
    order.push("avatar");
    throw new Error("private SDK failed");
  });
  const { app, client, player } = setup(onSegment);
  await app.connect();
  vi.spyOn(client, "createTurn").mockResolvedValue({
    id: "t",
    status: "queued",
    segments: [],
  });
  vi.spyOn(client, "pollTurn").mockResolvedValue({
    id: "t",
    status: "completed",
    segments: [
      {
        text: "반가워요",
        emotion: "happy",
        gesture: "greeting",
        audio_id: "wav-1",
      },
    ],
  });
  vi.spyOn(client, "audio").mockResolvedValue(new ArrayBuffer(44));
  player.play.mockImplementation(async () => {
    order.push("audio");
  });

  app.setInput("안녕");
  await app.send();
  expect(onSegment).toHaveBeenCalledWith({
    text: "반가워요",
    emotion: "happy",
    gesture: "greeting",
    audio_id: "wav-1",
  });
  expect(order).toEqual(["avatar", "audio"]);
  expect(app.state.messages.map((message) => message.text)).toEqual([
    "안녕",
    "반가워요",
  ]);
  expect(app.state.error).toBe("");
});

it("never dispatches obsolete reply cues after changing conversation modes", async () => {
  const onSegment = vi.fn();
  const { app, client } = setup(onSegment);
  await app.connect();
  vi.spyOn(client, "createTurn").mockResolvedValue({
    id: "t",
    status: "queued",
    segments: [],
  });
  const pending = deferred<{
    id: string;
    status: string;
    segments: Segment[];
  }>();
  vi.spyOn(client, "pollTurn").mockReturnValue(pending.promise);

  app.setInput("이전 질문");
  const sending = app.send();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await app.changeMode("companion");
  pending.resolve({
    id: "t",
    status: "completed",
    segments: [{ text: "오래된 답변", emotion: "happy", gesture: "nod" }],
  });
  await sending;
  expect(onSegment).not.toHaveBeenCalled();
  expect(app.state.mode).toBe("companion");
});

it("selects the configured default and clears local data when switching to cloud", async () => {
  const { app, client, player } = setup();
  vi.mocked(client.status).mockResolvedValue({
    llm: "ollama",
    tts: "none",
    stt_enabled: false,
    model: "local-model",
    default_service: "local",
    services: [
      { id: "demo", label: "데모", available: true, model: null },
      { id: "local", label: "로컬", available: true, model: "local-model" },
      { id: "cloud", label: "클라우드", available: true, model: "cloud-model" },
    ],
  });
  await app.connect();
  expect(client.createSession).toHaveBeenLastCalledWith("assistant", "local");
  app.state.messages = [{ role: "user", text: "local private text" }];
  app.state.memories = [{ id: "private", text: "local memory" }];
  app.state.notes = [{ id: "note", text: "local note" }];
  app.setInput("local draft");
  await app.changeService("cloud");
  expect(client.createSession).toHaveBeenLastCalledWith("assistant", "cloud");
  expect(app.state.service).toBe("cloud");
  expect(app.state.messages).toEqual([]);
  expect(app.state.memories).toEqual([]);
  expect(app.state.notes).toEqual([]);
  expect(app.state.input).toBe("");
  expect(player.stop).toHaveBeenCalled();
});

it("does not switch or silently fall back when a provider is unconfigured", async () => {
  const { app, client } = setup();
  await app.connect();
  app.state.status!.services = [
    { id: "demo", label: "데모", available: true, model: null },
    {
      id: "cloud",
      label: "클라우드",
      available: false,
      model: null,
      reason: "CLOUD_API_KEY와 CLOUD_MODEL을 설정하세요.",
    },
  ];
  const before = vi.mocked(client.createSession).mock.calls.length;
  await app.changeService("cloud");
  expect(client.createSession).toHaveBeenCalledTimes(before);
  expect(app.state.service).toBe("demo");
  expect(app.state.error).toContain("CLOUD_API_KEY");
});

it("cancels pending inference and ignores its answer when switching services", async () => {
  const { app, client } = setup();
  await app.connect();
  app.state.status!.services = [
    { id: "demo", label: "데모", available: true, model: null },
    { id: "cloud", label: "클라우드", available: true, model: "cloud-model" },
  ];
  vi.spyOn(client, "createTurn").mockResolvedValue({
    id: "local-turn",
    status: "thinking",
    segments: [],
  });
  const pending = deferred<{
    id: string;
    status: string;
    segments: Segment[];
  }>();
  vi.spyOn(client, "pollTurn").mockReturnValue(pending.promise);
  app.setInput("private");
  const sending = app.send();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await app.changeService("cloud");
  pending.resolve({
    id: "local-turn",
    status: "completed",
    segments: [{ text: "late answer", emotion: "happy" }],
  });
  await sending;
  expect(client.cancelTurn).toHaveBeenCalledWith("assistant", "local-turn");
  expect(app.state.messages).toEqual([]);
  expect(app.state.latestCue).toBeNull();
});


it.each([
  ["local", "Ollama"],
  ["cloud", "클라우드"],
] as const)("reports %s provider errors without recommending the wrong service", async (service, providerLabel) => {
  const { app, client } = setup();
  vi.mocked(client.status).mockResolvedValue({
    llm: service === "local" ? "ollama" : "cloud",
    tts: "none",
    stt_enabled: false,
    model: "model-id",
    default_service: service,
    services: [{ id: service, label: providerLabel, available: true, model: "model-id" }],
  });
  await app.connect();
  vi.spyOn(client, "createTurn").mockResolvedValue({
    id: "failed-turn",
    status: "thinking",
    segments: [],
  });
  vi.spyOn(client, "pollTurn").mockResolvedValue({
    id: "failed-turn",
    status: "error",
    segments: [],
  });
  app.setInput("질문");
  await app.send();
  expect(app.state.error).toContain(providerLabel);
  if (service === "cloud") expect(app.state.error).not.toContain("Ollama");
  expect(client.cancelTurn).toHaveBeenCalledWith("assistant", "failed-turn");
  expect(app.state.busy).toBe(false);
});
