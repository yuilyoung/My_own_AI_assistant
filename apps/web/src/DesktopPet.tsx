import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Player } from "../../diagnostics/player.mjs";
import { MicrophoneRecorder } from "../../diagnostics/recorder.mjs";
import { avatarNames, type AvatarCharacter } from "./avatar-cast";
import { isExpressionCue, isMotionCue } from "./avatar-motion";
import { Conversation } from "./conversation";
import { GatewayClient } from "./gateway";
import { MotionAvatar } from "./MotionAvatar";
import { useNarrationPreview } from "./useNarrationPreview";
import "./desktop-pet.css";

type PetHost = {
  drag(): void;
  close(): void;
  setRoaming(enabled: boolean): void;
};
declare global {
  interface Window {
    desktopPet?: PetHost;
  }
}

export function isPetWindow(
  url: Pick<Location, "hostname" | "search" | "protocol">,
) {
  return (
    url.protocol === "http:" &&
    url.hostname === "127.0.0.1" &&
    new URLSearchParams(url.search).get("pet") === "1"
  );
}

const greeting = { emotion: "happy", gesture: "greeting" } as const;

export function DesktopPet() {
  const [token] = useState(() =>
    new URLSearchParams(location.hash.slice(1)).get("token"),
  );
  const [host, setHost] = useState(() => window.desktopPet);
  const [app, setApp] = useState<Conversation | null>(null);
  const [audio, setAudio] = useState({ level: 0, brightness: 0.5 });
  useEffect(() => {
    history.replaceState(
      history.state,
      "",
      location.pathname + location.search,
    );
    const ready = () => setHost(window.desktopPet);
    window.addEventListener("desktop-pet-ready", ready);
    ready();
    return () => window.removeEventListener("desktop-pet-ready", ready);
  }, []);
  useEffect(() => {
    if (!host || !token) return;
    const conversation = new Conversation(
      new GatewayClient(token),
      new Player((level, brightness) => setAudio({ level, brightness })),
      new MicrophoneRecorder(),
    );
    setApp(conversation);
    void conversation.connect();
    const leave = () => conversation.stop();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      conversation.dispose();
    };
  }, [host, token]);
  if (!host || !app)
    return (
      <main className="pet-shell">
        <p className="pet-info" role="status">
          {token
            ? "바탕화면 펫을 연결하고 있습니다. 창이 연결되지 않으면 Pet.cmd를 다시 실행하세요."
            : "Pet.cmd를 다시 실행해 바탕화면 펫을 연결하세요."}
        </p>
      </main>
    );
  return <PetSurface app={app} host={host} {...audio} />;
}

function PetSurface({
  app,
  host,
  level,
  brightness,
}: {
  app: Conversation;
  host: PetHost;
  level: number;
  brightness: number;
}) {
  const state = useSyncExternalStore(app.subscribe, app.snapshot);
  const [character, setCharacter] = useState<AvatarCharacter>("seorin");
  const [chatOpen, setChatOpen] = useState(false);
  const [roaming, setRoaming] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const preview = useNarrationPreview(
    !state.busy && state.voice === "idle",
    character,
  );
  const previewActive = !!preview.signal;
  const cue = preview.signal?.started ? greeting : state.latestCue;
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () =>
      host.setRoaming(
        roaming &&
          !chatOpen &&
          !state.busy &&
          !previewActive &&
          !preference.matches,
      );
    update();
    preference.addEventListener("change", update);
    return () => {
      preference.removeEventListener("change", update);
      host.setRoaming(false);
    };
  }, [host, roaming, chatOpen, state.busy, previewActive]);
  useEffect(() => {
    if (chatOpen) input.current?.focus();
  }, [chatOpen]);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [state.messages, chatOpen]);
  const locked = state.busy || state.voice !== "idle";
  return (
    <main className="pet-shell" data-desktop-pet aria-label="바탕화면 비서">
      <div
        className="pet-figure"
        title="끌어서 펫 이동"
        onPointerDown={(e) => {
          if (e.button === 0) {
            e.preventDefault();
            host.drag();
          }
        }}
      >
        <MotionAvatar
          character={character}
          level={preview.signal?.level ?? level}
          brightness={preview.signal?.brightness ?? brightness}
          transparent
          emotion={isExpressionCue(cue?.emotion) ? cue.emotion : "neutral"}
          gesture={isMotionCue(cue?.gesture) ? cue.gesture : "idle"}
          cue={cue ?? undefined}
        />
      </div>
      <div className="pet-tools">
        <select
          aria-label="펫 캐릭터"
          value={character}
          disabled={locked}
          onChange={(e) => setCharacter(e.target.value as AvatarCharacter)}
        >
          {Object.entries(avatarNames).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={locked}
          onClick={() =>
            preview.signal ? preview.stop() : void preview.start("greeting")
          }
        >
          {preview.signal ? "인사 중지" : "인사"}
        </button>
        <button
          type="button"
          aria-pressed={roaming}
          onClick={() => setRoaming(!roaming)}
        >
          산책
        </button>
        <button
          type="button"
          data-pet-chat
          aria-expanded={chatOpen}
          aria-controls="pet-chat"
          onClick={() => setChatOpen(!chatOpen)}
        >
          대화
        </button>
        <button
          type="button"
          aria-label="펫 종료"
          title="펫 종료"
          onClick={() => host.close()}
        >
          ×
        </button>
      </div>
      {preview.failed && (
        <p role="alert" className="pet-info">
          인사 음성을 재생하지 못했습니다.
        </p>
      )}
      {(chatOpen || state.error) && (
        <section id="pet-chat" className="pet-chat" aria-label="펫 대화">
          {state.error && <p role="alert">{state.error}</p>}
          {!state.session && !state.busy && (
            <button onClick={() => void app.retryConnection()}>
              연결 다시 시도
            </button>
          )}
          {chatOpen && (
            <>
              <div className="pet-log" role="log" aria-label="대화 내용">
                {state.messages.map((message, index) => (
                  <p key={index}>
                    <strong>{message.role === "user" ? "나" : "비서"}</strong>{" "}
                    {message.text}
                  </p>
                ))}
                <div ref={end} />
              </div>
              {state.warning && <p role="status">{state.warning}</p>}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  preview.stop();
                  void app.send(character);
                }}
              >
                <input
                  ref={input}
                  aria-label="메시지"
                  placeholder="메시지 입력"
                  value={state.input}
                  maxLength={2000}
                  onChange={(e) => app.setInput(e.target.value)}
                  disabled={!state.session || locked}
                />
                <button
                  disabled={!state.session || locked || !state.input.trim()}
                >
                  전송
                </button>
              </form>
              <div className="pet-voice">
                {state.status?.stt_enabled && (
                  <button
                    disabled={
                      !state.session ||
                      !["idle", "recording"].includes(state.voice)
                    }
                    onClick={() => {
                      preview.stop();
                      void app.toggleMicrophone();
                    }}
                  >
                    {state.voice === "recording"
                      ? "녹음 완료"
                      : state.voice === "idle"
                        ? "마이크로 입력"
                        : "음성 처리 중"}
                  </button>
                )}
                {state.busy && state.session && (
                  <button onClick={() => app.stop()}>응답 중지</button>
                )}
                {state.status?.tts === "none" && (
                  <small>답변 낭독은 음성 워커 연결 후 사용할 수 있어요.</small>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
