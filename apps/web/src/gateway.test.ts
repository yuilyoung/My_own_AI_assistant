import { afterEach, describe, expect, it, vi } from "vitest";
import { GatewayClient } from "./gateway";

afterEach(() => vi.unstubAllGlobals());

describe("GatewayClient", () => {
  it("sends bearer authentication and correct mode", async () => {
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "session-1" }),
    });
    vi.stubGlobal("fetch", mock);
    const result = await new GatewayClient("secret").createSession("companion");
    expect(result.id).toBe("session-1");
    expect(mock).toHaveBeenCalledWith(
      "/api/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mode: "companion" }),
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      }),
    );
  });
  it("does not retry failed authentication", async () => {
    const mock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal("fetch", mock);
    await expect(new GatewayClient("bad").status()).rejects.toThrow(
      "Gateway HTTP 401",
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it("encodes session and turn identifiers", async () => {
    const mock = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal("fetch", mock);
    await new GatewayClient("token").cancelTurn("a/b", "c d");
    expect(mock.mock.calls[0][0]).toBe("/api/sessions/a%2Fb/turns/c%20d");
  });
});

it("fetches WAV bytes with bearer authentication and cancellation", async () => {
  const bytes = new ArrayBuffer(44),
    signal = new AbortController().signal;
  const mock = vi
    .fn()
    .mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });
  vi.stubGlobal("fetch", mock);
  expect(await new GatewayClient("secret").audio("a/b", "x y", signal)).toBe(
    bytes,
  );
  expect(mock).toHaveBeenCalledWith(
    "/api/sessions/a%2Fb/audio/x%20y",
    expect.objectContaining({
      headers: { Authorization: "Bearer secret" },
      signal,
    }),
  );
});

it("pins the chosen service to session creation without sending provider keys", async () => {
  const mock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({ id: "cloud-session", service: "cloud" }),
  });
  vi.stubGlobal("fetch", mock);
  await new GatewayClient("pairing-token").createSession("assistant", "cloud");
  expect(mock.mock.calls[0][1].body).toBe(
    JSON.stringify({ mode: "assistant", service: "cloud" }),
  );
});

it("sends an optional session request UUID in the authenticated JSON body", async () => {
  const fetchApi = vi.fn().mockResolvedValue(Response.json({ id: "created" }));
  vi.stubGlobal("fetch", fetchApi);
  const requestId = "9b8a70e4-1924-4ff1-baa6-684f83958fb3";
  await new GatewayClient("pairing-token").createSession(
    "companion",
    "cloud",
    requestId,
  );
  const [url, options] = fetchApi.mock.calls[0];
  expect(url).toBe("/api/sessions");
  expect(options.headers.Authorization).toBe("Bearer pairing-token");
  expect(JSON.parse(options.body)).toEqual({
    mode: "companion",
    service: "cloud",
    request_id: requestId,
  });
});

it("sends the selected Korean voice on a turn while preserving cancellation", async () => {
  const client = new GatewayClient("local-test-token");
  const request = vi.spyOn(client, "request").mockResolvedValue({ id: "turn" });
  const abort = new AbortController();
  await client.createTurn("session", "안녕하세요", abort.signal, "isol");
  expect(request).toHaveBeenCalledWith("/sessions/session/turns", {
    method: "POST",
    body: JSON.stringify({ text: "안녕하세요", voice: "isol" }),
    signal: abort.signal,
  });
});
