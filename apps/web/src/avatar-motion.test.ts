import { describe, expect, it, vi } from "vitest";
import type { AvatarAdapter } from "./avatar";
import { AvatarMotionBridge, validateAvatarBindings } from "./avatar-motion";
import type { CubismModel3 } from "./model3";

const MODEL_URL = "/avatar-local/Haru/Haru.model3.json";

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

function fakeAdapter(
  load?: (modelUrl: string, signal?: AbortSignal) => Promise<void>,
) {
  const adapter: AvatarAdapter = {
    load: vi.fn(load ?? (async () => {})),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
  return adapter;
}

describe("licensed SDK boundary and audio-to-avatar bridge", () => {
  it("rejects guessed expression and motion names", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    await expect(
      bridge.attach(adapter, MODEL_URL, manifest(), {
        expressions: { happy: "not-present" },
      }),
    ).rejects.toThrow(/표정 매핑/);
    expect(adapter.load).not.toHaveBeenCalled();
    expect(adapter.dispose).toHaveBeenCalledOnce();
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

  it("forwards normalized RMS and mapped semantic cues", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    expect(
      await bridge.attach(adapter, MODEL_URL, manifest(), {
        expressions: { happy: "F01" },
        motions: { idle: "Idle" },
      }),
    ).toBe(true);
    expect(adapter.load).toHaveBeenCalledWith(
      MODEL_URL,
      expect.any(AbortSignal),
    );
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

  it("does not enable lipsync without a LipSync group", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    await bridge.attach(adapter, MODEL_URL, manifest(false), {});
    expect(bridge.ready).toBe(true);
    expect(bridge.lipSyncEnabled).toBe(false);
    bridge.onAudioLevel(0.9);
    bridge.reset();
    bridge.detach();
    expect(adapter.setLipSync).not.toHaveBeenCalled();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it("rejects a late SDK load after detach", async () => {
    let finish!: () => void;
    const loading = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const adapter = fakeAdapter(() => loading);
    const bridge = new AvatarMotionBridge();
    const attached = bridge.attach(adapter, MODEL_URL, manifest(), {});
    const signal = vi.mocked(adapter.load).mock.calls[0][1];
    bridge.detach();
    expect(signal?.aborted).toBe(true);
    finish();
    expect(await attached).toBe(false);
    expect(bridge.ready).toBe(false);
    expect(adapter.dispose).toHaveBeenCalledOnce();
    expect(adapter.setLipSync).not.toHaveBeenCalled();
  });

  it("treats a canceled asynchronous SDK rejection as a stale load", async () => {
    const adapter = fakeAdapter(
      async (_modelUrl, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new Error("SDK initialization canceled")),
            { once: true },
          );
        }),
    );
    const bridge = new AvatarMotionBridge();
    const attaching = bridge.attach(adapter, MODEL_URL, manifest(), {});
    bridge.detach();
    await expect(attaching).resolves.toBe(false);
    expect(bridge.ready).toBe(false);
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it("disposes failed SDK loads", async () => {
    const adapter = fakeAdapter(async () => {
      throw new Error("SDK missing");
    });
    const bridge = new AvatarMotionBridge();
    await expect(
      bridge.attach(adapter, MODEL_URL, manifest(), {}),
    ).rejects.toThrow("SDK missing");
    expect(bridge.ready).toBe(false);
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });
  it("isolates a failing lip-sync SDK from the audio animation frame", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    await bridge.attach(adapter, MODEL_URL, manifest(), {});
    vi.mocked(adapter.setLipSync).mockImplementation(() => {
      throw new Error("WebGL device lost");
    });
    vi.mocked(adapter.dispose).mockImplementation(() => {
      throw new Error("GPU cleanup failed");
    });

    expect(() => bridge.onAudioLevel(0.5)).not.toThrow();
    expect(bridge.ready).toBe(false);
    expect(adapter.dispose).toHaveBeenCalledOnce();
    const calls = vi.mocked(adapter.setLipSync).mock.calls.length;
    bridge.onAudioLevel(0.8);
    expect(adapter.setLipSync).toHaveBeenCalledTimes(calls);
  });

  it("preserves the original motion error while invalidating a failed SDK", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    await bridge.attach(adapter, MODEL_URL, manifest(), {
      motions: { idle: "Idle" },
    });
    vi.mocked(adapter.setMotion).mockImplementation(() => {
      throw new Error("motion failed");
    });
    vi.mocked(adapter.dispose).mockImplementation(() => {
      throw new Error("dispose failed");
    });

    expect(() => bridge.setMotion("idle")).toThrow("motion failed");
    expect(bridge.ready).toBe(false);
    expect(adapter.dispose).toHaveBeenCalledOnce();
    expect(bridge.setMotion("idle")).toBe(false);
  });

  it("recovers from a failed manual lip-sync reset without keeping the SDK alive", async () => {
    const adapter = fakeAdapter();
    const bridge = new AvatarMotionBridge();
    await bridge.attach(adapter, MODEL_URL, manifest(), {});
    vi.mocked(adapter.setLipSync).mockImplementation(() => {
      throw new Error("reset failed");
    });

    expect(() => bridge.reset()).not.toThrow();
    expect(bridge.ready).toBe(false);
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });
});
