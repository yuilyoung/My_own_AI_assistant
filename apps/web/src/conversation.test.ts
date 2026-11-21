import { expect, it, vi } from "vitest";
import { Conversation } from "./conversation";
import { GatewayClient, type Segment, type Status } from "./gateway";
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
function serviceStatus(cloudAvailable: boolean): Status {
  return {
    llm: "demo",
    tts: "none",
    model: null,
    stt_enabled: false,
    default_service: "demo",
    services: [
      { id: "demo", label: "데모", available: true, model: null },
      {
        id: "cloud",
        label: "클라우드",
        available: cloudAvailable,
        model: null,
        reason: cloudAvailable ? undefined : "Cloud unavailable",
      },
    ],
  };
}
const uuid = expect.stringMatching(
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);
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

it("keeps a deleted memory out of the list when a prior refresh arrives late", async () => {
  const { app, client } = setup();
  const memory = { id: "forgotten", text: "deleted memory" };
  vi.mocked(client.request).mockResolvedValueOnce([memory]);
  await app.connect();
  const stale = deferred<(typeof memory)[]>();
  vi.mocked(client.request).mockReturnValueOnce(stale.promise);
  const reading = app.refresh();
  await app.forget(memory.id);
  stale.resolve([memory]);
  await reading;
  expect(app.state.memories).toEqual([]);
});

it("keeps initial saved items when the user starts a turn before the list loads", async () => {
  const { app, client } = setup();
  const reading = deferred<void>();
  const memories = deferred<{ id: string; text: string }[]>();
  const note = { id: "note", text: "existing note" };
  vi.mocked(client.request).mockImplementation(async (path) => {
    if (path.endsWith("/notes")) return [note];
    reading.resolve();
    return memories.promise;
  });
  const connecting = app.connect();
  await reading.promise;
  vi.spyOn(client, "createTurn").mockResolvedValue({
    id: "t",
    status: "queued",
    segments: [],
  });
  vi.spyOn(client, "pollTurn").mockResolvedValue({
    id: "t",
    status: "completed",
    segments: [],
  });
  app.setInput("hello");
  await app.send();
  const memory = { id: "memory", text: "existing memory" };
  memories.resolve([memory]);
  await connecting;
  expect(app.state.memories).toEqual([memory]);
  expect(app.state.notes).toEqual([note]);
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
  expect(client.createSession).toHaveBeenLastCalledWith(
    "assistant",
    "local",
    uuid,
  );
  app.state.messages = [{ role: "user", text: "local private text" }];
  app.state.memories = [{ id: "private", text: "local memory" }];
  app.state.notes = [{ id: "note", text: "local note" }];
  app.setInput("local draft");
  await app.changeService("cloud");
  expect(client.createSession).toHaveBeenLastCalledWith(
    "assistant",
    "cloud",
    uuid,
  );
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

it("waits for an explicit service choice when the configured default is unavailable", async () => {
  const { app, client } = setup();
  vi.mocked(client.status).mockResolvedValue({
    llm: "cloud",
    tts: "none",
    model: null,
    stt_enabled: false,
    default_service: "cloud",
    services: [
      {
        id: "cloud",
        label: "클라우드",
        available: false,
        model: null,
        reason: "CLOUD_MODEL을 설정하세요.",
      },
      { id: "demo", label: "데모", available: true, model: null },
    ],
  });
  await app.connect();
  expect(client.createSession).not.toHaveBeenCalled();
  expect(app.state.session).toBeNull();
  expect(app.state.error).toContain("CLOUD_MODEL");
  expect(app.state.busy).toBe(false);
  await app.changeService("demo");
  expect(client.createSession).toHaveBeenCalledTimes(1);
  expect(client.createSession).toHaveBeenCalledWith("assistant", "demo", uuid);
  expect(app.state.error).toBe("");
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

it("reports a cloud provider error without recommending Ollama", async () => {
  const { app, client } = setup();
  vi.mocked(client.status).mockResolvedValue({
    llm: "cloud",
    tts: "none",
    stt_enabled: false,
    model: "cloud-model",
    default_service: "cloud",
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
  expect(app.state.error).toContain("클라우드");
  expect(app.state.error).not.toContain("Ollama");
  expect(client.cancelTurn).toHaveBeenCalledWith("assistant", "failed-turn");
  expect(app.state.busy).toBe(false);
});

it("reports an obsolete save when the session changes during its refresh", async () => {
  const { app, client } = setup();
  await app.connect();
  const readingNotes = deferred<void>();
  const oldNotes = deferred<unknown[]>();
  vi.mocked(client.request).mockImplementation(async (path) => {
    if (path === "/sessions/assistant/notes") {
      readingNotes.resolve();
      return oldNotes.promise;
    }
    return [];
  });
  const saving = app.save("memories", "old draft");
  await readingNotes.promise;
  await app.changeMode("companion");
  oldNotes.resolve([{ id: "old", text: "private" }]);
  expect(await saving).toBe(false);
  expect(app.snapshot().notes).toEqual([]);
  expect(await app.save("memories", "current draft")).toBe(true);
});

it("acknowledges a successful write even when the subsequent list refresh fails", async () => {
  const { app, client } = setup();
  await app.connect();
  vi.mocked(client.request)
    .mockResolvedValueOnce({ id: "saved", text: "saved once" })
    .mockRejectedValueOnce(new Error("HTTP 503"));
  expect(await app.save("notes", "saved once")).toBe(true);
  expect(app.snapshot().error).toContain("503");
});

it("ignores a storage result delivered after disconnect", async () => {
  const { app, client } = setup();
  await app.connect();
  const pending = deferred<{ id: string; text: string }[]>();
  vi.mocked(client.request).mockReturnValueOnce(pending.promise);
  const reading = app.refresh();
  app.dispose();
  const before = app.snapshot();
  pending.resolve([{ id: "old", text: "detached" }]);
  await reading;
  expect(app.snapshot()).toBe(before);
});

it("reuses the first create UUID after a lost response with legacy status", async () => {
  const { app, client } = setup();
  const create = vi.mocked(client.createSession);
  create.mockRejectedValueOnce(new TypeError("response lost"));
  await app.connect();
  expect(create).toHaveBeenNthCalledWith(1, "assistant", "demo", uuid);
  const requestId = create.mock.calls[0][2];
  await app.retryConnection();
  expect(client.status).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenNthCalledWith(2, "assistant", "demo", requestId);
  expect(app.snapshot().session?.id).toBe("assistant");

  await app.changeMode("assistant");
  expect(create).toHaveBeenNthCalledWith(3, "assistant", "demo", uuid);
  expect(create.mock.calls[2][2]).not.toBe(requestId);
});

it("rechecks the selected service before replaying the original mode and UUID", async () => {
  const { app, client } = setup();
  const status = vi
    .mocked(client.status)
    .mockResolvedValue(serviceStatus(true));
  const create = vi.mocked(client.createSession);
  await app.connect();
  await app.changeService("cloud");
  create.mockRejectedValueOnce(new TypeError("response lost"));
  await app.changeMode("companion");
  const requestId = create.mock.calls[2][2];
  expect(new Set(create.mock.calls.map((args) => args[2])).size).toBe(3);

  status.mockRejectedValueOnce(new Error("HTTP 503"));
  await app.retryConnection();
  expect(app.snapshot().error).toContain("503");
  status.mockResolvedValueOnce(serviceStatus(false));
  await app.retryConnection();
  expect(app.snapshot()).toMatchObject({
    mode: "companion",
    service: "cloud",
    session: null,
    busy: false,
    error: "Cloud unavailable",
  });
  status.mockResolvedValueOnce({ ...serviceStatus(true), services: [] });
  await app.retryConnection();
  expect(create).toHaveBeenCalledTimes(3);

  await app.retryConnection();
  expect(create).toHaveBeenNthCalledWith(4, "companion", "cloud", requestId);
  expect(app.snapshot().error).toBe("");
  expect(app.snapshot().session?.id).toBe("companion");
});

it("recovers an unavailable default after it becomes available even if the default moved", async () => {
  const { app, client } = setup();
  vi.mocked(client.status)
    .mockResolvedValueOnce({
      ...serviceStatus(false),
      default_service: "cloud",
    })
    .mockResolvedValueOnce(serviceStatus(true));
  await app.connect();
  expect(client.createSession).not.toHaveBeenCalled();
  await app.retryConnection();
  expect(client.createSession).toHaveBeenCalledExactlyOnceWith(
    "assistant",
    "cloud",
    uuid,
  );
  expect(app.snapshot().service).toBe("cloud");
});

it("keeps the newer selection's retry UUID when an obsolete create succeeds", async () => {
  const { app, client } = setup();
  vi.mocked(client.status).mockResolvedValue(serviceStatus(true));
  await app.connect();
  const late = deferred<{ id: string }>();
  const create = vi
    .mocked(client.createSession)
    .mockReturnValueOnce(late.promise)
    .mockRejectedValueOnce(new TypeError("second response lost"));
  const old = app.changeMode("companion");
  await app.changeService("cloud");
  const [, , requestId] = create.mock.calls[2];
  expect(requestId).toEqual(uuid);
  expect(requestId).not.toBe(create.mock.calls[1][2]);
  late.resolve({ id: "obsolete" });
  await old;
  expect(app.snapshot().session).toBeNull();
  await app.retryConnection();
  expect(create).toHaveBeenNthCalledWith(4, "companion", "cloud", requestId);
});

it.each(["switch", "disconnect"] as const)(
  "ignores a late startup status after %s",
  async (action) => {
    const { app, client } = setup();
    vi.mocked(client.status).mockResolvedValue(serviceStatus(true));
    vi.mocked(client.createSession).mockRejectedValueOnce(
      new TypeError("lost"),
    );
    await app.connect();
    const late = deferred<Status>();
    vi.mocked(client.status).mockReturnValueOnce(late.promise);
    const retrying = app.retryConnection();
    if (action === "switch") await app.changeService("cloud");
    else app.dispose();
    const snapshot = app.snapshot();
    late.resolve(serviceStatus(false));
    await retrying;
    expect(app.snapshot()).toBe(snapshot);
    expect(client.createSession).toHaveBeenCalledTimes(
      action === "switch" ? 2 : 1,
    );
  },
);

it("refreshes availability in an active demo session while preserving the conversation", async () => {
  const { app, client, player } = setup();
  vi.mocked(client.status).mockResolvedValueOnce(serviceStatus(false));
  await app.connect();
  app.setInput("next draft");
  app.state.messages = [{ role: "assistant", text: "existing answer" }];
  const before = app.snapshot();
  const fresh = { ...serviceStatus(true), default_service: "cloud" as const };
  vi.mocked(client.status).mockResolvedValueOnce(fresh);
  player.stop.mockClear();
  await app.retryConnection();
  expect(app.snapshot()).toEqual({ ...before, status: fresh });
  expect(app.snapshot().session).toBe(before.session);
  expect(client.createSession).toHaveBeenCalledTimes(1);
  expect(player.stop).not.toHaveBeenCalled();
});

it("keeps a turn running while checking availability", async () => {
  const { app, client } = setup();
  await app.connect();
  vi.spyOn(client, "createTurn").mockResolvedValue({
    id: "t",
    status: "queued",
    segments: [],
  });
  const polling = deferred<void>();
  const answer = deferred<{
    id: string;
    status: string;
    segments: Segment[];
  }>();
  vi.spyOn(client, "pollTurn").mockImplementation(() => {
    polling.resolve();
    return answer.promise;
  });
  app.setInput("question");
  const sending = app.send();
  await polling.promise;
  const fresh = serviceStatus(true);
  vi.mocked(client.status).mockResolvedValueOnce(fresh);
  await app.retryConnection();
  expect(client.cancelTurn).not.toHaveBeenCalled();
  expect(app.snapshot().busy).toBe(true);
  expect(app.snapshot().status).toEqual(fresh);
  answer.resolve({
    id: "t",
    status: "completed",
    segments: [{ text: "answer" }],
  });
  await sending;
  expect(app.snapshot().messages.map((m) => m.text)).toEqual([
    "question",
    "answer",
  ]);
});

it.each(["switch", "disconnect", "refresh again"] as const)(
  "discards an obsolete active session's availability reply after %s",
  async (action) => {
    const { app, client } = setup();
    vi.mocked(client.status).mockResolvedValue(serviceStatus(true));
    await app.connect();
    const late = deferred<Status>();
    vi.mocked(client.status).mockReturnValueOnce(late.promise);
    const refreshing = app.retryConnection();
    if (action === "switch") await app.changeService("cloud");
    if (action === "disconnect") app.dispose();
    if (action === "refresh again") await app.retryConnection();
    const current = app.snapshot();
    late.resolve(serviceStatus(false));
    await refreshing;
    expect(app.snapshot()).toBe(current);
  },
);
