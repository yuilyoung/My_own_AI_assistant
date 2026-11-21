import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { GatewayClient, type ServiceId } from "./gateway";
import { AvatarPanel } from "./AvatarPanel";
import { AvatarMotionBridge } from "./avatar-motion";
import { dispatchAvatarCues } from "./avatar-cues";
import { Conversation } from "./conversation";
import { Player } from "../../diagnostics/player.mjs";
import { MicrophoneRecorder } from "../../diagnostics/recorder.mjs";

function Workspace({
  app,
  level,
  bridge,
}: {
  app: Conversation;
  level: number;
  bridge: AvatarMotionBridge;
}) {
  const state = useSyncExternalStore(app.subscribe, app.snapshot);
  const [memory, setMemory] = useState(""),
    [note, setNote] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [state.messages]);
  useEffect(() => {
    const leave = () => app.stop();
    addEventListener("pagehide", leave);
    return () => removeEventListener("pagehide", leave);
  }, [app]);
  const save = async (e: FormEvent, kind: "memories" | "notes") => {
    e.preventDefault();
    const value = kind === "memories" ? memory : note;
    if (
      (await app.save(kind, value)) &&
      app.snapshot().session === state.session
    ) {
      const setDraft = kind === "memories" ? setMemory : setNote;
      setDraft((current) => (current === value ? "" : current));
    }
  };
  if (!state.status)
    return (
      <section className="pairing">
        <h2>비서 서버 연결</h2>
        {state.busy ? (
          <p role="status">서버 연결을 확인하고 있습니다.</p>
        ) : (
          <>
            {state.error && (
              <p role="alert" className="error">
                {state.error}
              </p>
            )}
            <button className="primary" onClick={() => void app.connect()}>
              다시 연결
            </button>
          </>
        )}
      </section>
    );
  const selectedService = state.status?.services?.find(
    (item) => item.id === state.service,
  );
  const serviceLabel =
    state.service === "cloud"
      ? "CLOUD"
      : state.service === "local"
        ? "LOCAL"
        : "DEMO";
  const model = selectedService?.model ?? state.status?.model;
  const mode = state.mode === "assistant" ? "개인 비서" : "가상 소개팅";
  const voiceLabel = {
    idle: "마이크로 입력",
    opening: "마이크 권한 확인 중",
    recording: "녹음 완료",
    transcribing: "음성 인식 중",
  }[state.voice];
  return (
    <>
      <section className="service-settings" aria-label="서비스 연결 설정">
        <label htmlFor="llm-service">LLM 서비스</label>
        <select
          id="llm-service"
          value={state.service ?? "demo"}
          disabled={!state.status}
          onChange={(event) => {
            setMemory("");
            setNote("");
            void app.changeService(event.target.value as ServiceId);
          }}
        >
          {(
            state.status?.services ?? [
              {
                id: state.service ?? "demo",
                label: serviceLabel,
                available: true,
                model,
              },
            ]
          ).map((option) => (
            <option
              key={option.id}
              value={option.id}
              disabled={!option.available}
            >
              {option.label}
              {option.available ? "" : " · 설정 필요"}
            </option>
          ))}
        </select>
        <p className="hint">
          서비스를 바꾸면 진행 중인 응답을 중지하고 새 대화를 시작합니다. 기억과
          메모는 서비스별로 분리됩니다.
        </p>
        {state.service === "cloud" && (
          <p className="notice">
            이 서비스의 메시지와 저장한 기억은 설정한 클라우드 제공자에게
            전송됩니다.
          </p>
        )}
        {state.service === "local" && (
          <p className="hint">
            로컬 모델은 이 웹사이트를 실행하는 서버의 Ollama를 사용합니다. 다른
            PC의 Ollama에는 자동 연결되지 않습니다.
          </p>
        )}
        {state.status?.services
          ?.filter((item) => !item.available && item.reason !== state.error)
          .map((item) => (
            <p className="hint" key={item.id}>
              {item.label}: {item.reason || "서버 연결 설정이 필요합니다."}
            </p>
          ))}
        {state.status.services?.some((item) => !item.available) &&
          (state.session || selectedService?.available === false) && (
            <button
              type="button"
              disabled={state.busy || state.voice !== "idle"}
              onClick={() => void app.retryConnection()}
            >
              서비스 설정 다시 확인
            </button>
          )}
      </section>
      <nav aria-label="대화 모드">
        {(["assistant", "companion"] as const).map((value) => (
          <button
            key={value}
            aria-pressed={state.mode === value}
            onClick={() => {
              setMemory("");
              setNote("");
              void app.changeMode(value);
            }}
          >
            {value === "assistant" ? "개인 비서" : "가상 소개팅"}
          </button>
        ))}
      </nav>
      <div className="workspace">
        <aside className="avatar-container">
          <AvatarPanel
            key={`${state.mode}:${state.service}`}
            bridge={bridge}
            level={level}
            cue={state.latestCue ?? undefined}
            busy={state.busy}
          />
        </aside>
        <section className="chat-panel">
          <div className="chat-heading">
            <h2>{mode}</h2>
            <span role="status">
              {state.voice !== "idle"
                ? voiceLabel
                : state.busy
                  ? state.session
                    ? "응답 준비 중"
                    : "대화 연결 중"
                  : state.session
                    ? "대화 준비됨"
                    : "대화 연결 대기"}
            </span>
          </div>
          {state.status && (
            <p className="notice">
              {state.service === "demo"
                ? "DEMO · 고정 응답입니다. 실제 AI 생성 답변이 아닙니다."
                : [serviceLabel, model].filter(Boolean).join(" · ")}{" "}
              / TTS: {state.status.tts} / STT:{" "}
              {state.status.stt_enabled ? "연결됨" : "미연결"}
            </p>
          )}
          <section
            role="log"
            aria-label="대화 내용"
            aria-live="polite"
            className="messages"
          >
            {state.messages.length === 0 ? (
              <p className="empty">
                {mode}와 대화를 시작하세요. 기억은 모드별로 분리됩니다.
              </p>
            ) : (
              state.messages.map((message, i) => (
                <article key={i} className={"bubble " + message.role}>
                  <small>{message.role === "user" ? "나" : mode}</small>
                  <p>{message.text}</p>
                </article>
              ))
            )}
            <div ref={end} />
          </section>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void app.send();
            }}
          >
            <label htmlFor="message">메시지</label>
            <textarea
              id="message"
              maxLength={2000}
              value={state.input}
              disabled={!state.session || state.busy || state.voice !== "idle"}
              onChange={(e) => app.setInput(e.target.value)}
              placeholder="내용을 입력하거나 마이크로 입력하세요"
            />
            <p className="hint">
              음성 인식 결과는 입력창에서 확인·수정한 뒤 전송합니다. 녹음은 최대
              30초입니다.
            </p>
            <div className="actions">
              <button
                type="button"
                onClick={() => void app.toggleMicrophone()}
                disabled={
                  !state.session ||
                  !state.status?.stt_enabled ||
                  state.busy ||
                  ["opening", "transcribing"].includes(state.voice)
                }
              >
                {voiceLabel}
              </button>
              <button
                type="button"
                disabled={!state.busy && state.voice === "idle"}
                onClick={() => app.stop()}
              >
                중지
              </button>
              <button
                className="primary"
                disabled={
                  !state.session ||
                  state.busy ||
                  state.voice !== "idle" ||
                  !state.input.trim()
                }
              >
                전송
              </button>
            </div>
          </form>
          {state.error && (
            <p role="alert" className="error">
              {state.error}
            </p>
          )}
          {!state.session &&
            !state.busy &&
            selectedService?.available !== false && (
              <button onClick={() => void app.retryConnection()}>
                대화 연결 다시 시도
              </button>
            )}
          {state.warning && (
            <p role="status" className="notice">
              {state.warning}
            </p>
          )}
        </section>
      </div>
      <section className="storage" aria-label="기억과 메모">
        {Object.entries(state.storageErrors).map(([operation, message]) =>
          message ? (
            <p key={operation} role="alert" className="error">
              {message}{" "}
              {operation === "list" && (
                <button type="button" onClick={() => void app.refresh()}>
                  저장 목록 다시 불러오기
                </button>
              )}
            </p>
          ) : null,
        )}
        <div>
          <h2>승인한 기억</h2>
          <p>직접 저장한 내용만 이 모드의 다음 대화에 반영합니다.</p>
          <form onSubmit={(e) => void save(e, "memories")}>
            <label htmlFor="memory">기억할 내용</label>
            <input
              id="memory"
              maxLength={500}
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              required
            />
            <button disabled={!state.session}>기억 저장</button>
          </form>
          <ul>
            {state.memories.map((item) => (
              <li key={item.id}>
                {item.text}
                <button
                  onClick={() => void app.forget(item.id)}
                  aria-label={"기억 삭제: " + item.text}
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        </div>
        {state.mode === "assistant" && (
          <div>
            <h2>비서 메모</h2>
            <form onSubmit={(e) => void save(e, "notes")}>
              <label htmlFor="note">비서 메모</label>
              <input
                id="note"
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                required
              />
              <button disabled={!state.session}>메모 저장</button>
            </form>
            <ul>
              {state.notes.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </>
  );
}
export function App() {
  const [token, setToken] = useState("");
  const [app, setApp] = useState<Conversation | null>(null),
    [level, setLevel] = useState(0);
  const avatarBridge = useRef<AvatarMotionBridge | null>(null);
  useEffect(() => {
    const readFragment = () => {
      if (!location.hash) return;
      const incoming = new URLSearchParams(location.hash.slice(1)).get("token");
      history.replaceState(
        history.state,
        "",
        location.pathname + location.search,
      );
      if (incoming && !app?.snapshot().status) {
        app?.stop();
        setApp(null);
        setToken(incoming);
      }
    };
    readFragment();
    window.addEventListener("hashchange", readFragment);
    return () => window.removeEventListener("hashchange", readFragment);
  }, [app]);
  useEffect(
    () => () => {
      app?.dispose();
      avatarBridge.current?.detach();
    },
    [app],
  );
  const connect = (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    const bridge = (avatarBridge.current ??= new AvatarMotionBridge());
    const next = new Conversation(
      new GatewayClient(token.trim()),
      new Player((value: number) => {
        setLevel(value);
        bridge.onAudioLevel(value);
      }),
      new MicrophoneRecorder(),
      250,
      (segment) => dispatchAvatarCues(bridge, segment),
    );
    setApp(next);
    setToken("");
    void next.connect();
  };
  return (
    <main>
      <header>
        <p className="eyebrow">MY COMPANION</p>
        <h1>My own AI assistant</h1>
        <p>나를 돕는 비서, 이야기를 나누는 친구</p>
      </header>
      {app && avatarBridge.current ? (
        <>
          <Workspace app={app} level={level} bridge={avatarBridge.current} />
          <button
            className="disconnect"
            onClick={() => {
              app.dispose();
              setApp(null);
            }}
          >
            연결 해제 / 토큰 다시 입력
          </button>
        </>
      ) : (
        <form className="pairing" onSubmit={connect}>
          <h2>비서 서버 연결</h2>
          <p>
            이 서버에 설정한 연결 토큰을 입력하세요. 로컬 실행은 실행 콘솔,
            클라우드는 서버 환경 설정에서 확인할 수 있습니다.
          </p>
          <label htmlFor="token">연결 토큰</label>
          <input
            id="token"
            type="password"
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            required
          />
          <button className="primary">연결</button>
        </form>
      )}
      <footer>
        대화는 연결한 서버에 저장됩니다. 로컬 실행은 해당 PC, 클라우드 실행은
        배포 서버의 저장소를 사용합니다. 소개팅 모드에는 비서 도구가 제공되지
        않습니다.
      </footer>
    </main>
  );
}
