// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { loadLocalCubismAdapter } from "./licensed-avatar";

const canvas = document.createElement("canvas");

function adapter() {
  return {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("private licensed Cubism adapter entry point", () => {
  it("accepts a locally supplied adapter with the required lifecycle", async () => {
    const runtime = adapter();
    const createAvatarAdapter = vi.fn(async () => runtime);
    const loaded = await loadLocalCubismAdapter(canvas, async () => ({
      createAvatarAdapter,
    }));
    expect(loaded).toBe(runtime);
    expect(createAvatarAdapter).toHaveBeenCalledExactlyOnceWith(canvas);
  });

  it("does not accept a missing or invalid runtime factory", async () => {
    await expect(
      loadLocalCubismAdapter(canvas, async () => ({})),
    ).rejects.toThrow(/createAvatarAdapter/);
    await expect(
      loadLocalCubismAdapter(canvas, async () => ({
        createAvatarAdapter: () => ({ load: () => {} }),
      })),
    ).rejects.toThrow(/필수 메서드/);
  });

  it("does not silently substitute a fake renderer for a failed SDK import", async () => {
    await expect(
      loadLocalCubismAdapter(canvas, async () => {
        throw new Error("private SDK not installed");
      }),
    ).rejects.toThrow("private SDK not installed");
  });
});
