import {
  inspectLocalModel3,
  resolveModelAsset,
  type CubismModel3,
} from "./model3";

export type AssetIssue = { path: string; reason: string };
export type AssetAudit = {
  manifest: CubismModel3;
  checked: number;
  available: number;
  issues: AssetIssue[];
};
export type AssetReader = (
  url: string,
  options: RequestInit,
) => Promise<Response>;

/**
 * Verifies that each referenced local resource can be reached without
 * downloading its contents. This is not a Cubism renderer or integrity check.
 * HEAD failures (including servers that do not support HEAD) are reported.
 */
export async function verifyLocalModelResources(
  modelPath: string,
  origin: string,
  read: AssetReader = (url, options) => fetch(url, options),
  signal?: AbortSignal,
): Promise<AssetAudit> {
  const options: RequestInit = {
    cache: "no-store",
    credentials: "omit",
    redirect: "error",
    signal,
  };
  const readMetadata = (url: string) => read(url, options);
  const manifest = await inspectLocalModel3(modelPath, origin, readMetadata);
  const files = [...new Set(manifest.referencedFiles)];
  const issues: AssetIssue[] = [];
  let next = 0;

  async function worker() {
    while (next < files.length) {
      signal?.throwIfAborted();
      const path = files[next++];
      const url = resolveModelAsset(modelPath, path, origin);
      try {
        const response = await read(url, { ...options, method: "HEAD" });
        const contentType = response.headers.get("content-type") || "";
        const mime = contentType.split(";")[0].trim().toLowerCase();
        if (!response.ok) {
          issues.push({ path, reason: `HTTP ${response.status}` });
        } else if (mime === "text/html") {
          issues.push({
            path,
            reason: "HTML 응답 (누락 파일의 SPA fallback 가능)",
          });
        } else if (response.headers.get("content-length") === "0") {
          issues.push({ path, reason: "비어 있는 파일" });
        }
      } catch {
        signal?.throwIfAborted();
        issues.push({ path, reason: "HEAD 요청 실패 또는 리다이렉트 거부" });
      }
    }
  }
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(files.length, 4); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  signal?.throwIfAborted();
  issues.sort((a, b) => files.indexOf(a.path) - files.indexOf(b.path));
  return {
    manifest,
    checked: files.length,
    available: files.length - issues.length,
    issues,
  };
}
