import type { AvatarAdapter } from "./avatar";

/**
 * Explicit opt-in bridge to a privately installed, licensed Cubism runtime.
 * Neither the SDK/Core nor any character assets are fetched or bundled here.
 */
export async function loadLocalCubismAdapter(
  canvas: HTMLCanvasElement,
  importRuntime: () => Promise<unknown> = () => {
    const url = "/avatar-local/runtime/adapter.js";
    return import(/* @vite-ignore */ url);
  },
): Promise<AvatarAdapter> {
  const module: unknown = await importRuntime();
  if (
    !module ||
    typeof module !== "object" ||
    !("createAvatarAdapter" in module) ||
    typeof module.createAvatarAdapter !== "function"
  ) {
    throw new Error(
      "로컬 adapter.js에 createAvatarAdapter(canvas) 함수가 없습니다.",
    );
  }

  const adapter: unknown = await module.createAvatarAdapter(canvas);
  const required = [
    "load",
    "setExpression",
    "setMotion",
    "setLipSync",
    "dispose",
  ] as const;
  const methods = (adapter ?? {}) as Record<string, unknown>;
  if (
    typeof adapter !== "object" ||
    required.some((method) => typeof methods[method] !== "function")
  ) {
    // A partially initialized runtime may have allocated a WebGL context.
    // Clean it up if its factory already supplied a usable dispose hook.
    if (typeof methods.dispose === "function") {
      try {
        methods.dispose.call(adapter);
      } catch {
        // Keep the contract error; cleanup is best-effort for foreign code.
      }
    }
    throw new Error("로컬 Cubism 어댑터의 필수 메서드가 누락됐습니다.");
  }
  return adapter as AvatarAdapter;
}
