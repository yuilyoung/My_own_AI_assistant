import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAvatar } from "./cubism-runtime";
import { CubismFramework, CubismModelSettingJson, sdk } from "./test-sdk";

const config = {
  modelUrl: "/avatar-local/Haru/Haru.model3.json",
  emotionMappings: { happy: "F01" },
  gestureMappings: {
    idle: { group: "Idle", index: 0 },
    greeting: { group: "TapBody", index: 0 },
  },
};
let frames: Map<number, FrameRequestCallback>;
let disposables: (() => void)[];
const data = new TextEncoder().encode(
  JSON.stringify({
    Version: 3,
    FileReferences: { Moc: "Haru.moc3", Textures: ["texture.png"] },
  }),
).buffer;
const tick = () => {
  const pending = [...frames.values()];
  frames.clear();
  for (const run of pending) run(performance.now());
};
function canvas() {
  const element = document.createElement("canvas");
  Object.defineProperty(element, "clientWidth", { value: 400 });
  Object.defineProperty(element, "clientHeight", { value: 600 });
  const gl = {
    isContextLost: () => false,
    bindFramebuffer: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    deleteTexture: vi.fn(),
    getParameter: () => 4096,
    createTexture: () => ({}),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    viewport: vi.fn(),
  };
  vi.spyOn(element, "getContext").mockReturnValue(
    gl as unknown as WebGLRenderingContext,
  );
  return { element, gl };
}
beforeEach(() => {
  vi.clearAllMocks();
  sdk.models.length = 0;
  frames = new Map();
  disposables = [];
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
    frames.set(++id, run);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) =>
    frames.delete(frame),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => data })),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })),
  );
});
afterEach(() => {
  disposables.forEach((dispose) => dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function start() {
  const { element, gl } = canvas();
  const avatar = await createAvatar(
    element,
    config,
    new AbortController().signal,
  );
  disposables.push(avatar.dispose);
  return { avatar, element, gl, model: sdk.models.at(-1)! };
}

describe("runtime SDK boundary (mocked, no real Cubism rendering)", () => {
  it("restores the base expression when neutral has no explicit mapping", async () => {
    const { avatar, model } = await start();
    avatar.setExpression("happy");
    tick();
    expect(model.getModel()!.values.expression).toBe(1);
    avatar.setExpression("neutral");
    tick();
    expect(model._expressionManager.active).toBeNull();
    expect(model.getModel()!.values.expression).toBe(0);
  });
  it("idle interrupts an active higher-priority gesture", async () => {
    const { avatar, model } = await start();
    avatar.setMotion("greeting");
    expect(model._motionManager.active?.name).toBe("TapBody:0");
    avatar.setMotion("idle");
    expect(model._motionManager.active?.name).toBe("Idle:0");
    expect(model._motionManager.priority).toBe(1);
  });
  it("clamps lip sync, closes immediately and frees the frame/textures on context loss", async () => {
    const { avatar, model, element, gl } = await start();
    const failed = vi.fn();
    element.addEventListener("avatar-error", failed);
    avatar.setLipSync(7);
    expect(model.getModel()!.values.mouth).toBe(1);
    avatar.setLipSync(0);
    expect(model.getModel()!.values.mouth).toBe(0);
    element.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(failed).toHaveBeenCalledOnce();
    expect(model.released).toBe(true);
    expect(gl.deleteTexture).toHaveBeenCalledOnce();
    expect(frames.size).toBe(0);
    expect(CubismFramework.dispose).toHaveBeenCalledOnce();
    avatar.dispose();
    expect(CubismFramework.dispose).toHaveBeenCalledOnce();
  });
  it("does not tear down the framework while another avatar still owns it", async () => {
    const first = await start(),
      second = await start();
    first.avatar.dispose();
    expect(CubismFramework.dispose).not.toHaveBeenCalled();
    second.avatar.setLipSync(0.5);
    expect(second.model.getModel()!.values.mouth).toBe(0.5);
    second.avatar.dispose();
    expect(CubismFramework.dispose).toHaveBeenCalledOnce();
  });
  it("reports a frame failure and releases the running model", async () => {
    const { element, model } = await start();
    const failed = vi.fn();
    element.addEventListener("avatar-error", failed);
    model.renderer.drawModel.mockImplementationOnce(() => {
      throw new Error("GPU failure");
    });
    tick();
    expect(failed).toHaveBeenCalledOnce();
    expect(model.released).toBe(true);
    expect(frames.size).toBe(0);
  });
  it("rejects an external texture reference and cleans up the partial model", async () => {
    vi.spyOn(
      CubismModelSettingJson.prototype,
      "getTextureFileName",
    ).mockReturnValue("https://other.example/texture.png");
    const { element } = canvas();
    await expect(
      createAvatar(element, config, new AbortController().signal),
    ).rejects.toThrow("avatar-local");
    expect(
      vi
        .mocked(fetch)
        .mock.calls.every(
          ([url]) => new URL(String(url)).origin === location.origin,
        ),
    ).toBe(true);
    expect(sdk.models[0].released).toBe(true);
    expect(CubismFramework.dispose).toHaveBeenCalledOnce();
  });
  it("aborts a partial model load and never renders after late completion", async () => {
    let finish!: (value: unknown) => void;
    vi.mocked(fetch)
      .mockImplementationOnce(
        async () => ({ ok: true, arrayBuffer: async () => data }) as Response,
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    const { element } = canvas(),
      stop = new AbortController();
    const loading = createAvatar(element, config, stop.signal);
    await vi.waitFor(() => expect(sdk.models.length).toBe(1));
    stop.abort();
    finish({ ok: true, arrayBuffer: async () => data });
    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(sdk.models[0].released).toBe(true);
    expect(sdk.models[0].renderer.drawModel).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
  it.each([
    "https://other.example/Haru.model3.json",
    "/avatar-local/../../private.json",
    "/avatar-local/%2e%2e/private.json",
    "/avatar-local/Haru.model3.json?token=x",
  ])("rejects model path %s before any request", async (modelUrl) => {
    const { element } = canvas();
    await expect(
      createAvatar(
        element,
        { ...config, modelUrl },
        new AbortController().signal,
      ),
    ).rejects.toThrow("avatar-local");
    expect(fetch).not.toHaveBeenCalled();
  });
});

it("fits a wide model to the portrait canvas rather than cropping its sides", async () => {
  const { model } = await start();
  expect(model.getModelMatrix().setWidth).toHaveBeenCalledWith(2);
});
