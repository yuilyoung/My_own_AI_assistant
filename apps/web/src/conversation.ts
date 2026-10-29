import { GatewayClient, type Mode, type Session, type Status } from "./gateway";
import {
  VoiceInput,
  type VoiceKind,
  type Recorder,
} from "../../diagnostics/voice-input.mjs";
export type AudioPlayer = {
  unlock(): Promise<void>;
  stop(): void;
  play(bytes: ArrayBuffer, current: () => boolean): Promise<void>;
  close(): Promise<void>;
};
type Item = { id: string; text: string };
export type View = {
  mode: Mode;
  session: Session | null;
  status: Status | null;
  input: string;
  messages: { role: "user" | "assistant"; text: string }[];
  memories: Item[];
  notes: Item[];
  busy: boolean;
  voice: VoiceKind;
  error: string;
  warning: string;
};
/** One owner for each session's network, recording and playback lifecycle. */
export class Conversation {
  state: View = {
    mode: "assistant",
    session: null,
    status: null,
    input: "",
    messages: [],
    memories: [],
    notes: [],
    busy: false,
    voice: "idle",
    error: "",
    warning: "",
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private controller: AbortController | null = null;
  private active: { sid: string; tid: string } | null = null;
  private voice: VoiceInput;
  constructor(
    private client: GatewayClient,
    private player: AudioPlayer,
    recorder: Recorder,
    private interval = 250,
  ) {
    this.voice = new VoiceInput({
      recorder,
      request: client.request.bind(client),
      onResult: (text) => this.patch({ input: text }),
      onState: (voice) => this.patch({ voice }),
      onError: (error) => this.patch({ error: String(error) }),
      interval,
    });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private patch(value: Partial<View>) {
    this.state = { ...this.state, ...value };
    this.listeners.forEach((fn) => fn());
  }
  setInput(input: string) {
    this.patch({ input });
  }
  stop() {
    ++this.epoch;
    this.controller?.abort();
    this.controller = null;
    this.voice.cancel();
    this.player.stop();
    const old = this.active;
    this.active = null;
    if (old) void this.client.cancelTurn(old.sid, old.tid).catch(() => {});
    this.patch({ busy: false });
  }
  async connect() {
    this.stop();
    const epoch = this.epoch;
    this.patch({ busy: true, error: "" });
    try {
      const status = await this.client.status();
      if (epoch !== this.epoch) return;
      this.patch({ status });
      await this.changeMode(this.state.mode);
    } catch (error) {
      if (epoch === this.epoch)
        this.patch({ error: String(error), busy: false });
    }
  }
  async changeMode(mode: Mode) {
    this.stop();
    const epoch = this.epoch;
    this.patch({
      mode,
      session: null,
      input: "",
      messages: [],
      memories: [],
      notes: [],
      error: "",
      warning: "",
      busy: true,
    });
    try {
      const session = await this.client.createSession(mode);
      if (epoch !== this.epoch) return;
      this.patch({ session, busy: false });
      await this.refresh();
    } catch (error) {
      if (epoch === this.epoch)
        this.patch({ error: String(error), busy: false });
    }
  }
  async send() {
    const text = this.state.input.trim(),
      session = this.state.session;
    if (
      !session ||
      !text ||
      text.length > 2000 ||
      this.state.busy ||
      this.state.voice !== "idle"
    )
      return;
    this.stop();
    const epoch = this.epoch,
      sid = session.id,
      controller = new AbortController();
    this.controller = controller;
    const current = () => epoch === this.epoch && !controller.signal.aborted;
    this.patch({
      busy: true,
      error: "",
      warning: "",
      input: "",
      messages: [...this.state.messages, { role: "user", text }],
    });
    try {
      try {
        await this.player.unlock();
      } catch {
        /* Text is still available without an audio device. */
      }
      if (!current()) return;
      // Let creation finish so its ID can be cancelled even after a mode switch.
      const turn = await this.client.createTurn(sid, text);
      if (!current()) {
        void this.client.cancelTurn(sid, turn.id).catch(() => {});
        return;
      }
      this.active = { sid, tid: turn.id };
      let seen = 0;
      while (current()) {
        const result = await this.client.pollTurn(
          sid,
          turn.id,
          controller.signal,
        );
        if (!current()) return;
        for (const segment of result.segments.slice(seen)) {
          if (!current()) return;
          this.patch({
            messages: [
              ...this.state.messages,
              { role: "assistant", text: segment.text },
            ],
          });
          if (segment.audio_id) {
            try {
              const bytes = await this.client.audio(
                sid,
                segment.audio_id,
                controller.signal,
              );
              if (!current()) return;
              await this.player.play(bytes, current);
            } catch (error) {
              if (current())
                this.patch({ error: "음성 재생 실패: " + String(error) });
            }
          }
        }
        if (!current()) return;
        seen = result.segments.length;
        if (result.warning)
          this.patch({
            warning:
              "음성 생성에 실패했습니다. 텍스트로 대화를 계속할 수 있습니다.",
          });
        if (result.status === "error")
          throw new Error(
            "로컬 모델 연결 또는 응답 형식 오류입니다. Ollama 설정을 확인하세요.",
          );
        if (["completed", "cancelled"].includes(result.status)) break;
        await new Promise((resolve) => setTimeout(resolve, this.interval));
      }
    } catch (error) {
      if (current()) {
        const active = this.active;
        if (active)
          void this.client.cancelTurn(active.sid, active.tid).catch(() => {});
        this.patch({ error: String(error) });
      }
    } finally {
      if (current()) {
        this.active = null;
        this.controller = null;
        this.patch({ busy: false });
      }
    }
  }
  async toggleMicrophone() {
    if (!this.state.session || !this.state.status?.stt_enabled) return;
    try {
      if (this.state.voice === "recording") {
        await this.voice.finish();
        return;
      }
      if (this.state.voice !== "idle") return;
      this.stop();
      this.patch({ error: "" });
      await this.voice.start(this.state.session.id);
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        this.patch({ error: String(error) });
    }
  }
  async refresh() {
    const session = this.state.session,
      epoch = this.epoch,
      mode = this.state.mode;
    if (!session) return;
    const memories = await this.client.request<Item[]>(
      `/sessions/${session.id}/memories`,
    );
    if (epoch !== this.epoch || session.id !== this.state.session?.id) return;
    this.patch({ memories });
    if (mode === "assistant") {
      const notes = await this.client.request<Item[]>(
        `/sessions/${session.id}/notes`,
      );
      if (epoch === this.epoch && session.id === this.state.session?.id)
        this.patch({ notes });
    }
  }
  async save(kind: "memories" | "notes", text: string) {
    const session = this.state.session,
      epoch = this.epoch;
    if (
      !session ||
      !text.trim() ||
      (kind === "notes" && this.state.mode !== "assistant")
    )
      return false;
    try {
      await this.client.request(`/sessions/${session.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      if (epoch !== this.epoch) return false;
      await this.refresh();
      return true;
    } catch (error) {
      if (epoch === this.epoch) this.patch({ error: String(error) });
      return false;
    }
  }
  async forget(id: string) {
    const session = this.state.session,
      epoch = this.epoch;
    if (!session) return;
    try {
      await this.client.request(
        `/sessions/${session.id}/memories/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (epoch === this.epoch) await this.refresh();
    } catch (error) {
      if (epoch === this.epoch) this.patch({ error: String(error) });
    }
  }
  dispose() {
    this.stop();
    this.listeners.clear();
    void this.player.close();
  }
}
