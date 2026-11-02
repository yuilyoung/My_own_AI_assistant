import { describe, expect, it, vi } from "vitest";
import type { AvatarAdapter } from "./avatar";
import { AvatarMotionBridge, validateAvatarBindings } from "./avatar-motion";
import type { CubismModel3 } from "./model3";

function manifest(withLipSync = true): CubismModel3 {
  return {
    moc: "Haru.moc3",
    textures: ["textures/0.png"],
    referencedFiles: ["Haru.moc3", "textures/0.png"],
    lipSyncIds: withLipSync ? ["ParamMouthOpenY"] : [],
    expressions: { F01: "expressions/F01.exp3.json" },
    motions: { Idle: ["motions/idle.motion3.json"], Empty: [] },
  };
}

function fakeAdapter(load: () => Promise<void> = async () => {}) {
  const adapter: AvatarAdapter = {
    load: vi.fn(load),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  return adapter;
}

describe("licensed SDK boundary and audio-to-avatar bridge", () => {
  it("rejects guessed or missing expression and motion names before loading", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    await expect(
      bridge.attach(adapter, "/avatar-local/Haru/Haru.model3.json", manifest(), {
        expressions: { happy: "not-present" },
      }),
    ).rejects.toThrow(/표정 매핑/);
    expect(adapter.load).not.toHaveBeenCalled();
    expect(bridge.ready).toBe(false);
    expect(() =>
      validateAvatarBindings(manifest(), { motions: { nod: "Empty" } }),
    ).toThrow(/모션 매핑/);
    expect(() =>
      validateAvatarBindings(manifest(), {
        motions: { greeting: "Missing" },
      }),
    ).toThrow(/모션 매핑/);
  });

  it("forwards normalized Player RMS and only configured semantic cues", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    const modelUrl = "/avatar-local/Haru/Haru.model3.json";
    expect(
      await bridge.attach(adapter, modelUrl, manifest(), {
        expressions: { happy: "F01" },
        motions: { idle: "Idle" },
      }),
    ).toBe(true);
    expect(adapter.load).toHaveBeenCalledWith(modelUrl);
    expect(bridge.ready).toBe(true);
    expect(bridge.lipSyncEnabled).toBe(true);
    bridge.onAudioLevel(0.4);
    bridge.onAudioLevel(3);
    bridge.onAudioLevel(Number.NaN);
    expect(adapter.setLipSync).toHaveBeenNthCalledWith(1, 0);
    expect(adapter.setLipSync).toHaveBeenNthCalledWith(2, 0.4);
    expect(adapter.setLipSync).toHaveBeenNthCalledWith(3, 1);
    expect(adapter.setLipSync).toHaveBeenNthCalledWith(4, 0);
    expect(bridge.setExpression("happy")).toBe(true);
    expect(bridge.setExpression("concerned")).toBe(false);
    expect(bridge.setMotion("idle")).toBe(true);
    expect(bridge.setMotion("nod")).toBe(false);
    expect(adapter.setExpression).toHaveBeenCalledTimes(1);
    expect(adapter.setExpression).toHaveBeenCalledWith("F01");
    expect(adapter.setMotion).toHaveBeenCalledTimes(1);
    expect(adapter.setMotion).toHaveBeenCalledWith("Idle");
    bridge.reset();
    bridge.detach();
    expect(adapter.setLipSync).toHaveBeenLastCalledWith(0);
    expect(adapter.dispose).toHaveBeenCalledOnce();
    expect(bridge.ready).toBe(false);
    bridge.onAudioLevel(0.5);
    expect(adapter.setLipSync).toHaveBeenCalledTimes(6);
  });

  it("does not report mouth support for a model with no LipSync group", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    await bridge.attach(adapter, "/avatar-local/Haru/Haru.model3.json", manifest(false), {});
    expect(bridge.ready).toBe(true);
    expect(bridge.lipSyncEnabled).toBe(false);
    bridge.onAudioLevel(0.9);
    bridge.reset();
    bridge.detach();
    expect(adapter.setLipSync).not.toHaveBeenCalled();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it("never reactivates an adapter whose loading finished after detach", async () => {
    let finish!: () => void;
    const loading = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const adapter = fakeAdapter(() => loading);
    const bridge = new AvatarMotionBridge();
    const attached = bridge.attach(adapter, "/avatar-local/Haru/Haru.model3.json", manifest(), {});
    bridge.detach();
    finish();
    expect(await attached).toBe(false);
    expect(bridge.ready).toBe(false);
    expect(adapter.dispose).toHaveBeenCalledOnce();
    expect(adapter.setLipSync).not.toHaveBeenCalled();
  });

  it("disposes a renderer that fails to load without claiming it is ready", async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error("SDK missing");
    });
    const bridge = new AvatarMotionBridge();
    await expect(
      bridge.attach(adapter, "/avatar-local/Haru/Haru.model3.json", manifest(), {}),
    ).rejects.toThrow("SDK missing");
    expect(bridge.ready).toBe(false);
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });
});
