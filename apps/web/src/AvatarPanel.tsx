import { useEffect, useRef, useState } from "react";
import { loadAvatar, type LoadedAvatar } from "./avatar-loader";
import { normalizedLipSync } from "./avatar";
import type { AvatarCue } from "./conversation";
export function AvatarPanel({ level, cue }: { level: number; cue: AvatarCue }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const avatar = useRef<LoadedAvatar | null>(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const target = canvas.current!;
    const fail = () => {
      controller.abort();
      avatar.current?.dispose();
      avatar.current = null;
      setStatus("error");
      setError("캐릭터 렌더링이 중단됐습니다. 다시 연결해 주세요.");
    };
    const hide = () => avatar.current?.setLipSync(0);
    target.addEventListener("avatar-error", fail);
    window.addEventListener("pagehide", hide);
    void loadAvatar(target, controller.signal)
      .then((loaded) => {
        if (controller.signal.aborted) {
          loaded.dispose();
          return;
        }
        avatar.current = loaded;
        setStatus("ready");
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setStatus("error");
          setError(
            reason instanceof Error
              ? reason.message
              : "캐릭터를 불러올 수 없습니다.",
          );
        }
      });
    return () => {
      controller.abort();
      target.removeEventListener("avatar-error", fail);
      window.removeEventListener("pagehide", hide);
      avatar.current?.setLipSync(0);
      avatar.current?.dispose();
      avatar.current = null;
    };
  }, [attempt]);
  useEffect(() => {
    avatar.current?.setLipSync(normalizedLipSync(level, 1));
  }, [level, status]);
  useEffect(() => {
    avatar.current?.setExpression(cue.emotion);
    avatar.current?.setMotion(cue.gesture);
  }, [cue, status]);
  return (
    <aside className="avatar-panel">
      <canvas
        key={attempt}
        ref={canvas}
        className="avatar-canvas"
        aria-label="Live2D 캐릭터"
        hidden={status !== "ready"}
      />
      <h2>
        {status === "ready"
          ? "Live2D 연결됨"
          : status === "loading"
            ? "Live2D 불러오는 중"
            : "Live2D 미연결"}
      </h2>
      {status === "ready" && <p>공식 샘플 캐릭터 · 가상 캐릭터입니다.</p>}
      {error && (
        <>
          <p>{error}</p>
          <button
            onClick={() => {
              setStatus("loading");
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            캐릭터 다시 연결
          </button>
        </>
      )}
      <label>
        음성 레벨 <meter min="0" max="1" value={level} />
      </label>
    </aside>
  );
}
