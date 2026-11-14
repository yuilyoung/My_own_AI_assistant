import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { inspectLocalModel3 } from "./model3";
import { verifyLocalModelResources, type AssetAudit } from "./model-assets";
import type { AvatarAdapter } from "./avatar";
import type { AvatarMotionBridge, AvatarBindings } from "./avatar-motion";
import { AvatarBindingEditor } from "./AvatarBindingEditor";
import { loadLocalCubismAdapter } from "./licensed-avatar";

/** Sends a manual 0–1 test level to an explicitly connected, licensed renderer. */
function LipSyncTester({ bridge }: { bridge: AvatarMotionBridge }) {
  const [level, setLevel] = useState(0);
  const reset = () => {
    bridge.reset();
    setLevel(0);
  };
  useEffect(() => () => bridge.reset(), [bridge]);

  return (
    <div className="avatar-lip-test">
      <label htmlFor="avatar-lip-level">
        수동 입모양 테스트 강도: {Math.round(level * 100)}%
      </label>
      <input
        id="avatar-lip-level"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={level}
        onChange={(event) => {
          const next = Number(event.target.value);
          setLevel(next);
          bridge.onAudioLevel(next);
        }}
        onPointerUp={reset}
        onKeyUp={reset}
        onBlur={reset}
      />
      <button type="button" onClick={reset}>
        입모양 닫기
      </button>
      <small>
        실제 입모양은 화면에서 확인하세요. 음성 재생 중엔 시험하지 마세요.
      </small>
    </div>
  );
}

/** Preflight only. The official Cubism SDK/Core must be installed separately. */
export function AvatarInspector({
  bridge,
  loadAdapter = loadLocalCubismAdapter,
}: {
  bridge?: AvatarMotionBridge;
  loadAdapter?: (canvas: HTMLCanvasElement) => Promise<AvatarAdapter>;
}) {
  const [path, setPath] = useState("");
  const [result, setResult] = useState("");
  const [resources, setResources] = useState<AssetAudit | null>(null);
  const [error, setError] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState("");
  const [bindings, setBindings] = useState<AvatarBindings>({});
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      pending.current?.abort();
      bridge?.detach();
    },
    [bridge],
  );

  // A lost WebGL context invalidates the private renderer even when its
  // adapter object still exists. Never send subsequent audio to that object.
  useEffect(() => {
    const node = canvas.current;
    if (!node || !bridge) return;
    const onLost = (event: Event) => {
      event.preventDefault(); // Permit the browser to restore the context.
      pending.current?.abort();
      pending.current = null;
      let cleanupFailed = false;
      try {
        bridge.detach();
      } catch {
        // A foreign SDK may throw while deleting already-lost GPU resources.
        cleanupFailed = true;
      }
      setBusy(false);
      setContextLost(true);
      setRuntimeStatus("");
      setError(
        cleanupFailed
          ? "WebGL 컨텍스트가 손실되었고 렌더러 정리에도 실패했습니다. 복구 후 다시 연결하세요."
          : "WebGL 컨텍스트가 손실되었습니다. 복구 후 어댑터를 다시 연결하세요.",
      );
    };
    const onRestored = () => {
      setContextLost(false);
      setError(
        "WebGL 컨텍스트가 복구되었습니다. 로컬 Cubism 어댑터를 다시 연결하세요.",
      );
    };
    node.addEventListener("webglcontextlost", onLost);
    node.addEventListener("webglcontextrestored", onRestored);
    return () => {
      node.removeEventListener("webglcontextlost", onLost);
      node.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [bridge]);

  const inspect = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult("");
    setResources(null);
    setRuntimeStatus("");
    setBindings({});
    bridge?.detach();
    try {
      const manifest = await inspectLocalModel3(path.trim(), location.origin);
      const expressions = Object.keys(manifest.expressions);
      const motions = Object.entries(manifest.motions)
        .filter(([, files]) => files.length > 0)
        .map(([name]) => name);
      setResult(
        `JSON 검사 완료: 참조 ${manifest.referencedFiles.length}개, LipSync 파라미터 ${manifest.lipSyncIds.join(", ") || "없음"}, 표정 ${expressions.join(", ") || "없음"}, 모션 ${motions.join(", ") || "없음"}. 실제 파일 존재·렌더링은 미검증입니다.`,
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  const checkResources = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setResources(null);
    setRuntimeStatus("");
    setBindings({});
    bridge?.detach();
    const controller = new AbortController();
    pending.current = controller;
    try {
      const audit = await verifyLocalModelResources(
        path.trim(),
        location.origin,
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) setResources(audit);
    } catch (reason) {
      if (!controller.signal.aborted) setError(String(reason));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const activate = async () => {
    const audit = resources;
    if (
      busy ||
      contextLost ||
      !bridge ||
      !canvas.current ||
      !audit ||
      audit.available !== audit.checked
    )
      return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setRuntimeStatus("");
    try {
      const adapter = await loadAdapter(canvas.current);
      if (controller.signal.aborted) {
        adapter.dispose();
        return;
      }
      const attached = await bridge.attach(
        adapter,
        path.trim(),
        audit.manifest,
        bindings,
      );
      if (controller.signal.aborted) {
        bridge.detach();
        return;
      }
      if (attached) {
        setRuntimeStatus(
          "로컬 어댑터 초기화 완료. 실제 WebGL 표시와 립싱크 동작은 수동으로 확인해야 합니다.",
        );
      } else {
        setError("이전 로컬 어댑터 연결이 취소됐습니다.");
      }
    } catch (reason) {
      if (!controller.signal.aborted) setError(String(reason));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  return (
    <form
      className="avatar-inspector"
      onSubmit={(event) => void inspect(event)}
    >
      <label htmlFor="avatar-model3">로컬 모델 export 경로 점검</label>
      <input
        id="avatar-model3"
        value={path}
        onChange={(event) => {
          setPath(event.target.value);
          setResult("");
          setResources(null);
          setError("");
          setRuntimeStatus("");
          setBindings({});
          bridge?.detach();
        }}
        disabled={busy}
        placeholder="/avatar-local/Haru/Haru.model3.json"
        required
      />
      <button disabled={busy}>{busy ? "검사 중" : "모델 JSON 검사"}</button>
      <button
        type="button"
        disabled={busy || !path.trim()}
        onClick={() => void checkResources()}
      >
        참조 파일 접근 검사
      </button>
      {result && <p role="status">{result}</p>}
      {resources && (
        <>
          <p role="status">
            참조 파일 HEAD 확인: {resources.available}/{resources.checked}개
            접근 가능. 실제 파일 내용·무결성·사용권·렌더링은 미검증입니다.
          </p>
          {resources.issues.length > 0 && (
            <ul aria-label="문제가 있는 모델 자산">
              {resources.issues.slice(0, 10).map((issue) => (
                <li key={issue.path}>
                  {issue.path}: {issue.reason}
                </li>
              ))}
              {resources.issues.length > 10 && (
                <li>이외 {resources.issues.length - 10}개 문제가 있습니다.</li>
              )}
            </ul>
          )}
        </>
      )}
      {bridge && (
        <>
          {resources && resources.available === resources.checked && (
            <AvatarBindingEditor
              manifest={resources.manifest}
              bindings={bindings}
              disabled={busy}
              ready={bridge.ready && !!runtimeStatus}
              onChange={(next) => {
                bridge.detach();
                setRuntimeStatus("");
                setBindings(next);
              }}
              onExpression={(cue) => {
                try {
                  if (!bridge.setExpression(cue))
                    setError("선택한 표정을 재생할 수 없습니다.");
                } catch (reason) {
                  setError(String(reason));
                }
              }}
              onMotion={(cue) => {
                try {
                  if (!bridge.setMotion(cue))
                    setError("선택한 모션을 재생할 수 없습니다.");
                } catch (reason) {
                  setError(String(reason));
                }
              }}
            />
          )}
          <button
            type="button"
            disabled={
              busy ||
              contextLost ||
              !resources ||
              resources.available !== resources.checked
            }
            onClick={() => void activate()}
          >
            로컬 Cubism 어댑터 연결
          </button>
          <canvas
            ref={canvas}
            className="avatar-canvas"
            width={400}
            height={500}
            role="img"
            aria-label="Live2D 로컬 캔버스"
          />
          {runtimeStatus &&
            (bridge.ready ? (
              <p role="status">{runtimeStatus}</p>
            ) : (
              <p role="alert" className="error">
                로컬 Cubism 어댑터가 오류로 해제되었습니다:{" "}
                {bridge.lastFailure || "렌더러가 연결 해제됨"}. SDK와 모델을
                확인한 뒤 다시 연결하세요.
              </p>
            ))}
          {bridge.ready && !!runtimeStatus && bridge.lipSyncEnabled && (
            <LipSyncTester bridge={bridge} />
          )}
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <small>
        HEAD 요청은 파일 접근 여부만 확인합니다. HEAD를 지원하지 않는 서버는
        오류로 보고될 수 있습니다. 검사만으로 Cubism Core/렌더러를 적재하지
        않습니다.
      </small>
    </form>
  );
}
