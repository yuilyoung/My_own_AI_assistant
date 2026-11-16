import { describe, expect, it, vi } from "vitest";
import { AvatarMotionBridge } from "./avatar-motion";
import { dispatchAvatarCues } from "./avatar-cues";
import type { AvatarAdapter } from "./avatar";
import type { CubismModel3 } from "./model3";

const modelUrl = "/avatar-local/Haru/Haru.model3.json";

const manifest: CubismModel3 = {
  moc: "Haru.moc3",
  textures: ["texture.png"],
  referencedFiles: ["Haru.moc3", "texture.png"],
  lipSyncIds: ["ParamMouthOpenY"],
  expressions: { Smile: "smile.exp3.json" },
  motions: { Greeting: ["greeting.motion3.json"] },
};

function createAdapter(): AvatarAdapter {
  return {
    load: vi.fn(async () => {}),
    setExpression: vi.fn(),
    setMotion: vi.fn(),
    setLipSync: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("server reply cues to a licensed avatar", () => {
  it("applies mapped expression and motion cues", async () => {
    const bridge = new AvatarMotionBridge();
    const adapter = createAdapter();
    await bridge.attach(adapter, modelUrl, manifest, {
      expressions: { happy: "Smile" },
      motions: { greeting: "Greeting" },
    });

    dispatchAvatarCues(bridge, {
      text: "안녕하세요",
      emotion: "happy",
      gesture: "greeting",
    });

    expect(adapter.setExpression).toHaveBeenCalledExactlyOnceWith("Smile");
    expect(adapter.setMotion).toHaveBeenCalledExactlyOnceWith("Greeting");
    bridge.detach();
  });

  it("ignores unknown and unmapped cues", async () => {
    const bridge = new AvatarMotionBridge();
    const adapter = createAdapter();
    await bridge.attach(adapter, modelUrl, manifest, {
      expressions: { happy: "Smile" },
    });

    dispatchAvatarCues(bridge, {
      text: "malformed provider",
      emotion: "__proto__",
      gesture: "unknown",
    });
    dispatchAvatarCues(bridge, {
      text: "no configured mapping",
      emotion: "surprised",
      gesture: "nod",
    });

    expect(adapter.setExpression).not.toHaveBeenCalled();
    expect(adapter.setMotion).not.toHaveBeenCalled();
    bridge.detach();
  });

  it("contains SDK errors and skips missing renderers", async () => {
    const bridge = new AvatarMotionBridge();
    const adapter = createAdapter();
    const cue = { text: "답변", emotion: "happy", gesture: "greeting" };
    dispatchAvatarCues(bridge, cue);
    await bridge.attach(adapter, modelUrl, manifest, {
      expressions: { happy: "Smile" },
      motions: { greeting: "Greeting" },
    });
    vi.mocked(adapter.setExpression).mockImplementation(() => {
      throw new Error("Cubism lost GPU context");
    });

    expect(() => dispatchAvatarCues(bridge, cue)).not.toThrow();
    expect(bridge.ready).toBe(false);
    expect(bridge.lastFailure).toContain("Cubism lost GPU context");
    expect(adapter.setMotion).not.toHaveBeenCalled();
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });
});
