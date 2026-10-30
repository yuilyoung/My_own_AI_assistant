import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { GatewayClient } from "./gateway";
import { AvatarInspector } from "./AvatarInspector";
import { Conversation } from "./conversation";
import { Player } from "../../diagnostics/player.mjs";
import { MicrophoneRecorder } from "../../diagnostics/recorder.mjs";

function Workspace({ app, level }: { app: Conversation; level: number }) {
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
    if (await app.save(kind, value)) {
      if (kind === "memories") setMemory("");
      else setNote("");
    }
  };
  const mode = state.mode === "assistant" ? "개인 비서" : "가상 소개팅";
  const voiceLabel = {
    idle: "마이크로 입력",
    opening: "마이크 권한 확인 중",
    recording: "녹음 완료",
    transcribing: "음성 인식 중",
  }[state.voice];
  return (
    <>
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
        <aside className="avatar-panel">
          <div className="avatar-placeholder" aria-hidden="true">
            ◇
          </div>
          <h2>Live2D 미연결</h2>
          <p>
            공식 Cubism SDK와 사용권이 확인된 캐릭터 모델을 설치해야 합니다.
          </p>
          <p>
            현재 화면은 음성·텍스트 대화용이며 캐릭터가 렌더링되지 않습니다.
          </p>
          <AvatarInspector />
          <label>
            음성 레벨 <meter min="0" max="1" value={level} />
          </label>
        </aside>
        <section className="chat-panel">
          <div className="chat-heading">
            <h2>{mode}</h2>
            <span role="status">
              {state.voice !== "idle"
                ? voiceLabel
                : state.busy
                  ? "응답 준비 중"
                  : state.session
                    ? "대화 준비됨"
                    : "연결 중"}
            </span>
          </div>
          {state.status && (
            <p className="notice">
              {state.status.llm === "demo"
                ? "DEMO · 고정 응답입니다. 실제 AI 생성 답변이 아닙니다."
                : "LOCAL · " + state.status.model}{" "}
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
          {state.warning && (
            <p role="status" className="notice">
              {state.warning}
            </p>
          )}
        </section>
      </div>
      <section className="storage">
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
  const [token, setToken] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("token") || "",
  );
  const [app, setApp] = useState<Conversation | null>(null),
    [level, setLevel] = useState(0);
  useEffect(() => {
    if (location.hash)
      history.replaceState(null, "", location.pathname + location.search);
  }, []);
  useEffect(() => () => app?.dispose(), [app]);
  const connect = (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    const next = new Conversation(
      new GatewayClient(token.trim()),
      new Player(setLevel),
      new MicrophoneRecorder(),
    );
    setApp(next);
    setToken("");
    void next.connect();
  };
  return (
    <main>
      <header>
        <p className="eyebrow">LOCAL COMPANION</p>
        <h1>My own AI assistant</h1>
        <p>나를 돕는 비서, 이야기를 나누는 친구</p>
      </header>
      {app ? (
        <>
          <Workspace app={app} level={level} />
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
          <h2>로컬 Gateway 연결</h2>
          <p>실행 콘솔에 표시된 연결 토큰을 입력하세요.</p>
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
        대화는 로컬 PC에 저장됩니다. 소개팅 모드에는 비서 도구가 제공되지
        않습니다.
      </footer>
    </main>
  );
}
