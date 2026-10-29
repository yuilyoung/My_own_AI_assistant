export type Mode = 'assistant' | 'companion';
export type Session = { id: string };
export type Segment = { text: string; audio_id?: string | null };
export type Turn = { id: string; segments: Segment[]; status: string; warning?: string };
export class GatewayClient {
  constructor(private readonly token: string) {}
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch('/api' + path, {
      ...options,
      headers: { Authorization: 'Bearer ' + this.token, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
    if (!response.ok) throw new Error('Gateway HTTP ' + response.status);
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
  status() { return this.request<{ llm: string; stt_enabled: boolean }>('/status'); }
  createSession(mode: Mode) { return this.request<Session>('/sessions', { method: 'POST', body: JSON.stringify({ mode }) }); }
  createTurn(sessionId: string, text: string, signal?: AbortSignal) { return this.request<Turn>(`/sessions/${encodeURIComponent(sessionId)}/turns`, { method: 'POST', body: JSON.stringify({ text }), signal }); }
  pollTurn(sessionId: string, turnId: string, signal?: AbortSignal) { return this.request<Turn>(`/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`, { signal }); }
  cancelTurn(sessionId: string, turnId: string) { return this.request<void>(`/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}`, { method: 'DELETE' }); }
}
