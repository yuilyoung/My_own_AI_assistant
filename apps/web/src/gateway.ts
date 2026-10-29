export type Status = {
  llm: string;
  tts: string;
  model: string | null;
  stt_enabled: boolean;
};
export type Mode = "assistant" | "companion";
export type Session = { id: string };
export type Segment = {
  text: string;
  emotion?: "neutral" | "happy" | "concerned" | "surprised";
  gesture?: "idle" | "nod" | "greeting";
  audio_id?: string | null;
};
export type Turn = {
  id: string;
  segments: Segment[];
  status: string;
  warning?: string;
};
export class GatewayClient {
  constructor(private readonly token: string) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch("/api" + path, {
      ...options,
      headers: {
        Authorization: "Bearer " + this.token,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error("Gateway HTTP " + response.status);
    return response.status === 204
      ? (undefined as T)
      : ((await response.json()) as T);
  }
  async audio(
    sid: string,
    aid: string,
    signal?: AbortSignal,
  ): Promise<ArrayBuffer> {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(sid)}/audio/${encodeURIComponent(aid)}`,
      { headers: { Authorization: "Bearer " + this.token }, signal },
    );
    if (!response.ok) throw new Error("오디오 요청 실패: " + response.status);
    return response.arrayBuffer();
  }
  status() {
    return this.request<Status>("/status");
  }
  createSession(mode: Mode) {
    return this.request<Session>("/sessions", {
      method: "POST",
      body: JSON.stringify({ mode }),
    });
  }
  createTurn(sessionId: string, text: string, signal?: AbortSignal) {
    return this.request<Turn>(
      `/sessions/${encodeURIComponent(sessionId)}/turns`,
      { method: "POST", body: JSON.stringify({ text }), signal },
    );
  }
  pollTurn(sessionId: string, turnId: string, signal?: AbortSignal) {
    return this.request<Turn>(
      `/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`,
      { signal },
    );
  }
  cancelTurn(sessionId: string, turnId: string) {
    return this.request<void>(
      `/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`,
      { method: "DELETE" },
    );
  }
}
