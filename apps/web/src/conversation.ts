import type { AvatarCharacter } from "./avatar-cast";
import {
  GatewayClient,
  type Mode,
  type ServiceId,
  type Segment,
  type Session,
  type Status,
} from "./gateway";
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
type StorageOperation = "list" | "memories" | "notes" | "forget";
function defaultService(status: Status): ServiceId {
  if (status.default_service) return status.default_service;
  if (status.llm === "cloud") return "cloud";
  return status.llm === "ollama" ? "local" : "demo";
}
function connectionError(error: unknown): string {
  if (error instanceof TypeError)
    return "서버에 연결할 수 없습니다. 네트워크와 서버 상태를 확인하세요.";
  return error instanceof Error ? error.message : String(error);
}
export type View = {
  mode: Mode;
  service: ServiceId | null;
  latestCue: Segment | null;
  session: Session | null;
  status: Status | null;
  input: string;
  messages: { role: "user" | "assistant"; text: string }[];
  memories: Item[];
  notes: Item[];
  storageErrors: Partial<Record<StorageOperation, string>>;
  busy: boolean;
  voice: VoiceKind;
  error: string;
  warning: string;
};
/** One owner for each session's network, recording and playback lifecycle. */
export class Conversation {
  state: View = {
    mode: "assistant",
    service: null,
    latestCue: null,
    session: null,
    status: null,
    input: "",
    messages: [],
    memories: [],
    notes: [],
    storageErrors: {},
    busy: false,
    voice: "idle",
    error: "",
    warning: "",
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private listRevision = 0;
  private pendingRequestId?: string;
  private availabilityCheck?: AbortController;
  private controller: AbortController | null = null;
  private active: { sid: string; tid: string } | null = null;
  private voice: VoiceInput;
  constructor(
    private client: GatewayClient,
    private player: AudioPlayer,
    recorder: Recorder,
    private interval = 250,
    private onSegment?: (segment: Segment) => void,
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
  connect() {
    return this.connectToService(null);
  }
  async retryConnection() {
    if (!this.state.session)
      return this.connectToService(this.state.service, this.pendingRequestId);

    this.availabilityCheck?.abort();
    const check = new AbortController();
    this.availabilityCheck = check;
    this.patch({ error: "" });
    try {
      const status = await this.client.status(check.signal);
      if (!check.signal.aborted) this.patch({ status });
    } catch (error) {
      if (!check.signal.aborted) this.patch({ error: connectionError(error) });
    } finally {
      if (this.availabilityCheck === check) this.availabilityCheck = undefined;
    }
  }
  private async connectToService(
    selected: ServiceId | null,
    requestId?: string,
  ) {
    this.availabilityCheck?.abort();
    this.stop();
    const epoch = this.epoch;
    const controller = new AbortController();
    this.controller = controller;
    this.patch({ busy: true, error: "" });
    try {
      const status = await this.client.status(controller.signal);
      if (epoch !== this.epoch) return;
      this.controller = null;
      const service = selected ?? defaultService(status);
      this.patch({ status, service });
      if (epoch === this.epoch)
        await this.startSession(this.state.mode, service, requestId);
    } catch (error) {
      if (epoch === this.epoch) {
        this.controller = null;
        this.patch({ error: connectionError(error), busy: false });
      }
    }
  }
  async changeService(service: ServiceId) {
    const option = this.state.status?.services?.find(
      (item) => item.id === service,
    );
    if (!option?.available) {
      this.patch({
        error: option?.reason || "선택한 서비스가 서버에 설정되지 않았습니다.",
      });
      return;
    }
    if (service === this.state.service && this.state.session) return;
    await this.changeMode(this.state.mode, service);
  }
  changeMode(mode: Mode, service = this.state.service) {
    return this.startSession(mode, service);
  }
  private async startSession(
    mode: Mode,
    service: ServiceId | null,
    requestId?: string,
  ) {
    this.availabilityCheck?.abort();
    this.stop();
    const epoch = this.epoch;
    this.pendingRequestId = requestId;
    this.patch({
      mode,
      service,
      latestCue: null,
      session: null,
      input: "",
      messages: [],
      memories: [],
      notes: [],
      storageErrors: {},
      error: "",
      warning: "",
      busy: true,
    });
    const status = this.state.status;
    const option = status?.services?.find((item) => item.id === service);
    if (
      status &&
      (status.services
        ? !option?.available
        : service !== defaultService(status))
    ) {
      this.patch({
        error: option?.reason || "사용할 수 있는 LLM 서비스를 선택하세요.",
        busy: false,
      });
      return;
    }
    try {
      this.pendingRequestId ??= crypto.randomUUID();
      const session = await this.client.createSession(
        mode,
        service ?? undefined,
        this.pendingRequestId,
      );
      if (epoch !== this.epoch) return;
      this.pendingRequestId = undefined;
      this.patch({ session, busy: false });
      await this.refresh();
    } catch (error) {
      if (epoch === this.epoch)
        this.patch({ error: String(error), busy: false });
    }
  }
  async send(voice?: AvatarCharacter) {
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
      const turn = await this.client.createTurn(sid, text, undefined, voice);
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
            latestCue: segment,
            messages: [
              ...this.state.messages,
              { role: "assistant", text: segment.text },
            ],
          });
          try {
            this.onSegment?.(segment);
          } catch {
            // A user-installed renderer must not interrupt chat or voice output.
          }
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
            this.state.service === "cloud"
              ? "클라우드 AI 서비스 오류입니다. API 키, 모델 및 응답 형식을 확인하세요."
              : this.state.service === "local"
                ? "로컬 AI 서비스 오류입니다. Ollama 실행과 모델 설정을 확인하세요."
                : "데모 응답 처리 오류입니다.",
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
  private setStorageError(operation: StorageOperation, message?: string) {
    if (this.state.storageErrors[operation] !== message)
      this.patch({
        storageErrors: { ...this.state.storageErrors, [operation]: message },
      });
  }
  async refresh() {
    const { session, mode } = this.state;
    if (!session) return;
    const revision = ++this.listRevision;
    const current = () =>
      this.state.session === session && this.listRevision === revision;
    try {
      const memories = await this.client.request<Item[]>(
        `/sessions/${session.id}/memories`,
      );
      if (!current()) return;
      this.patch({ memories });
      if (mode === "assistant") {
        const notes = await this.client.request<Item[]>(
          `/sessions/${session.id}/notes`,
        );
        if (!current()) return;
        this.patch({ notes });
      }
      if (current()) this.setStorageError("list");
    } catch (error) {
      if (current())
        this.setStorageError(
          "list",
          "저장 목록을 불러오지 못했습니다. " + connectionError(error),
        );
    }
  }
  async save(kind: "memories" | "notes", text: string) {
    const session = this.state.session;
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
      if (this.state.session !== session) return false;
      this.setStorageError(kind);
      await this.refresh();
      return this.state.session === session;
    } catch (error) {
      if (this.state.session === session) {
        const label = kind === "memories" ? "기억" : "메모";
        this.setStorageError(
          kind,
          label + " 저장에 실패했습니다. " + connectionError(error),
        );
      }
      return false;
    }
  }
  async forget(id: string) {
    const session = this.state.session;
    if (!session) return;
    try {
      await this.client.request(
        `/sessions/${session.id}/memories/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (this.state.session !== session) return;
      this.setStorageError("forget");
      await this.refresh();
    } catch (error) {
      if (this.state.session === session)
        this.setStorageError(
          "forget",
          "기억 삭제에 실패했습니다. " + connectionError(error),
        );
    }
  }
  dispose() {
    this.availabilityCheck?.abort();
    this.listeners.clear();
    this.patch({ session: null, storageErrors: {} });
    this.stop();
    void this.player.close();
  }
}
