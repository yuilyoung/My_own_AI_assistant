import type { AvatarAdapter } from "./avatar";
export type AvatarConfig = {
  version: 1;
  modelUrl: string;
  emotionMappings: Record<string, string>;
  gestureMappings: Record<string, { group: string; index: number }>;
};
export type LoadedAvatar = Omit<AvatarAdapter, "load">;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("캐릭터 설정 형식이 올바르지 않습니다.");
  return value as Record<string, unknown>;
}
export function parseAvatarConfig(value: unknown): AvatarConfig {
  const c = record(value);
  if (
    c.version !== 1 ||
    typeof c.modelUrl !== "string" ||
    !/^\/avatar-local\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.model3\.json$/.test(
      c.modelUrl,
    ) ||
    c.modelUrl.split("/").some((part) => part === ".." || part === ".")
  )
    throw new Error("지원하는 로컬 캐릭터 설정이 아닙니다.");
  const emotionMappings: AvatarConfig["emotionMappings"] = {};
  for (const [name, expression] of Object.entries(record(c.emotionMappings))) {
    if (
      !["neutral", "happy", "concerned", "surprised"].includes(name) ||
      typeof expression !== "string" ||
      !expression ||
      expression.length > 100
    )
      throw new Error("표정 매핑이 올바르지 않습니다.");
    emotionMappings[name] = expression;
  }
  const gestureMappings: AvatarConfig["gestureMappings"] = {};
  for (const [name, mapping] of Object.entries(record(c.gestureMappings))) {
    const item = record(mapping);
    if (
      !["idle", "nod", "greeting"].includes(name) ||
      typeof item.group !== "string" ||
      !item.group ||
      item.group.length > 100 ||
      !Number.isInteger(item.index) ||
      Number(item.index) < 0
    )
      throw new Error("모션 매핑이 올바르지 않습니다.");
    gestureMappings[name] = { group: item.group, index: Number(item.index) };
  }
  return { version: 1, modelUrl: c.modelUrl, emotionMappings, gestureMappings };
}
let core: Promise<void> | undefined;
function loadCore(): Promise<void> {
  if ("Live2DCubismCore" in globalThis) return Promise.resolve();
  if (!core)
    core = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/avatar-runtime/live2dcubismcore.min.js";
      script.onload = () => {
        if ("Live2DCubismCore" in globalThis) resolve();
        else {
          core = undefined;
          script.remove();
          reject(new Error("Cubism Core 초기화 실패"));
        }
      };
      script.onerror = () => {
        core = undefined;
        script.remove();
        reject(new Error("공식 Cubism Core 파일을 설치하세요."));
      };
      document.head.append(script);
    });
  return core;
}
export async function loadAvatar(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<LoadedAvatar> {
  const response = await fetcher("/avatar-local/manifest.json", { signal });
  if (!response.ok) throw new Error("공식 SDK와 샘플 모델을 먼저 설치하세요.");
  const data: unknown = await response.json().catch(() => {
    throw new Error(
      "캐릭터 설정을 읽지 못했습니다. 공식 SDK·샘플 설치와 웹 빌드를 확인하세요.",
    );
  });
  const config = parseAvatarConfig(data);
  signal.throwIfAborted();
  await loadCore();
  signal.throwIfAborted();
  const runtimeUrl = "/avatar-runtime/cubism-runtime.js";
  const runtime = (await import(/* @vite-ignore */ runtimeUrl)) as {
    createAvatar(
      canvas: HTMLCanvasElement,
      config: AvatarConfig,
      signal: AbortSignal,
    ): Promise<LoadedAvatar>;
  };
  signal.throwIfAborted();
  const avatar = await runtime.createAvatar(canvas, config, signal);
  if (signal.aborted) {
    avatar.dispose();
    signal.throwIfAborted();
  }
  return avatar;
}
