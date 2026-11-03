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
  if (
    !adapter ||
    typeof adapter !== "object" ||
    required.some(
      (method) =>
        !(method in adapter) || typeof adapter[method] !== "function",
    )
  ) {
    throw new Error("로컬 Cubism 어댑터의 필수 메서드가 누락됐습니다.");
  }
  return adapter as AvatarAdapter;
}
