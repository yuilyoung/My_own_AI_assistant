import { useState } from "react";
import type { FormEvent } from "react";
import { inspectLocalModel3 } from "./model3";

/** Asset preflight only. The official Cubism SDK/Core must be installed separately. */
export function AvatarInspector() {
  const [path, setPath] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const inspect = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      const manifest = await inspectLocalModel3(path.trim(), location.origin);
      setResult(
        `JSON 검사 완료: 참조 ${manifest.referencedFiles.length}개, LipSync 파라미터 ${manifest.lipSyncIds.join(", ") || "없음"}. 실제 파일 존재·렌더링은 미검증입니다.`,
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="avatar-inspector" onSubmit={(event) => void inspect(event)}>
      <label htmlFor="avatar-model3">로컬 모델 export 경로 점검</label>
      <input
        id="avatar-model3"
        value={path}
        onChange={(event) => setPath(event.target.value)}
        placeholder="/avatar-local/Haru/Haru.model3.json"
        required
      />
      <button disabled={busy}>{busy ? "검사 중" : "모델 JSON 검사"}</button>
      {result && <p role="status">{result}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <small>
        모델 파일은 현재 서버에서만 읽습니다. Cubism Core 또는 캐릭터 렌더링을
        활성화하지 않습니다.
      </small>
    </form>
  );
}
