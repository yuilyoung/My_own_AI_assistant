import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { inspectLocalModel3 } from "./model3";
import { verifyLocalModelResources, type AssetAudit } from "./model-assets";
import type { AvatarAdapter } from "./avatar";
import type { AvatarMotionBridge } from "./avatar-motion";
import { loadLocalCubismAdapter } from "./licensed-avatar";

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
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      pending.current?.abort();
      bridge?.detach();
    },
    [bridge],
  );

  const inspect = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult("");
    setResources(null);
    setRuntimeStatus("");
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
        {},
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
          <button
            type="button"
            disabled={
              busy || !resources || resources.available !== resources.checked
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
          {runtimeStatus && <p role="status">{runtimeStatus}</p>}
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
