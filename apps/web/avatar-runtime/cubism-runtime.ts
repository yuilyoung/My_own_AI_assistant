/**
 * App-owned adapter for the official Cubism 5 SDK for Web R5.
 * Build this entry only against the pinned Framework shipped with that SDK.
 * Core, Framework and sample assets are installed locally, never bundled in Git.
 */
import { CubismModelSettingJson } from "@cubism/cubismmodelsettingjson";
import { CubismEyeBlink } from "@cubism/effect/cubismeyeblink";
import { CubismFramework } from "@cubism/live2dcubismframework";
import { CubismMatrix44 } from "@cubism/math/cubismmatrix44";
import { CubismUserModel } from "@cubism/model/cubismusermodel";
import { ACubismMotion } from "@cubism/motion/acubismmotion";
import { CubismMotion } from "@cubism/motion/cubismmotion";
import { CubismWebGLOffscreenManager } from "@cubism/rendering/cubismoffscreenmanager";
import {
  CubismShaderManager_WebGL,
  CubismShaderSet,
} from "@cubism/rendering/cubismshader_webgl";

type Config = {
  modelUrl: string;
  emotionMappings: Record<string, string>;
  gestureMappings: Record<string, { group: string; index: number }>;
};

let frameworkUsers = 0;

function localAsset(value: string, base: string): URL {
  const url = new URL(value, base);
  if (
    url.origin !== location.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith("/avatar-local/") ||
    /[%\\]/.test(url.pathname)
  ) {
    throw new Error("캐릭터 파일은 로컬 avatar-local 경로에 있어야 합니다.");
  }
  return url;
}

async function read(url: URL, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, {
    signal,
    credentials: "omit",
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(`캐릭터 파일을 읽지 못했습니다 (${response.status}).`);
  return response.arrayBuffer();
}

/** The SDK's default async loader neither checks HTTP status nor cancels fetches.
 * R5 exposes the shader sources/register methods publicly; preload with our
 * abort signal, then compile synchronously so disposal cannot race compilation.
 */
async function prepareShaders(gl: WebGLRenderingContext, signal: AbortSignal) {
  const shader = CubismShaderManager_WebGL.getInstance().getShader(gl);
  if (shader._isShaderLoaded) return;
  const files = {
    _vertShaderSrc: "vertshadersrc.vert",
    _vertShaderSrcMasked: "vertshadersrcmasked.vert",
    _vertShaderSrcSetupMask: "vertshadersrcsetupmask.vert",
    _fragShaderSrcSetupMask: "fragshadersrcsetupmask.frag",
    _fragShaderSrcPremultipliedAlpha: "fragshadersrcpremultipliedalpha.frag",
    _fragShaderSrcMaskPremultipliedAlpha:
      "fragshadersrcmaskpremultipliedalpha.frag",
    _fragShaderSrcMaskInvertedPremultipliedAlpha:
      "fragshadersrcmaskinvertedpremultipliedalpha.frag",
    _vertShaderSrcCopy: "vertshadersrccopy.vert",
    _fragShaderSrcCopy: "fragshadersrccopy.frag",
    _fragShaderSrcColorBlend: "fragshadersrccolorblend.frag",
    _fragShaderSrcAlphaBlend: "fragshadersrcalphablend.frag",
    _vertShaderSrcBlend: "vertshadersrcblend.vert",
    _fragShaderSrcBlend: "fragshadersrcpremultipliedalphablend.frag",
  } as const;
  const sources = await Promise.all(
    Object.entries(files).map(async ([key, file]) => {
      const bytes = await read(
        new URL(`/avatar-runtime/shaders/${file}`, location.href),
        signal,
      );
      return [key, new TextDecoder().decode(bytes)] as const;
    }),
  );
  signal.throwIfAborted();
  for (const [key, source] of sources)
    shader[key as keyof typeof files] = source;
  shader._shaderSets = Array.from(
    { length: shader._shaderCount },
    () => new CubismShaderSet(),
  );
  shader.registerShader();
  shader.registerBlendShader();
  for (const program of new Set(
    shader._shaderSets.map((set) => set.shaderProgram),
  )) {
    if (!program || !gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Live2D 셰이더를 생성하지 못했습니다.");
    }
  }
  shader._isShaderLoaded = true;
}

class Character extends CubismUserModel {
  readonly motions = new Map<string, CubismMotion>();
  readonly expressions = new Map<string, ACubismMotion>();
  private lip = 0;
  private lipIds: ReturnType<
    CubismModelSettingJson["getLipSyncParameterId"]
  >[] = [];
  private idle: string | null = null;

  configure(setting: CubismModelSettingJson, config: Config) {
    const ids = new Set(
      Array.from({ length: this._model.getParameterCount() }, (_, i) =>
        this._model.getParameterId(i),
      ),
    );
    this.lipIds = Array.from(
      { length: setting.getLipSyncParameterCount() },
      (_, i) => setting.getLipSyncParameterId(i),
    ).filter((id) => ids.has(id));
    if (setting.getEyeBlinkParameterCount())
      this._eyeBlink = CubismEyeBlink.create(setting);
    const layout = new Map<string, number>();
    setting.getLayoutMap(layout);
    this._modelMatrix.setupFromLayout(layout);
    const idle = config.gestureMappings.idle;
    if (idle) this.idle = `${idle.group}:${idle.index}`;
  }

  expression(name: string) {
    const expression = this.expressions.get(name);
    if (expression) this._expressionManager.startMotion(expression, false);
  }

  resetExpression() {
    this._expressionManager.stopAllMotions();
    this._model.loadParameters();
    this.setLip(this.lip);
  }

  resetMotion(key?: string) {
    this._motionManager.stopAllMotions();
    this._motionManager.setReservePriority(0);
    const motion = key ? this.motions.get(key) : undefined;
    if (motion) this._motionManager.startMotionPriority(motion, false, 1);
  }

  motion(key: string, priority = 2) {
    const motion = this.motions.get(key);
    if (!motion || !this._motionManager.reserveMotion(priority)) return;
    this._motionManager.startMotionPriority(motion, false, priority);
  }

  setLip(value: number) {
    this.lip = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    // Stop and disposal close the mouth immediately, even between frames.
    for (const id of this.lipIds)
      this._model.setParameterValueById(id, this.lip);
  }

  update(delta: number) {
    this._model.loadParameters();
    if (this._motionManager.isFinished() && this.idle)
      this.motion(this.idle, 1);
    const motionUpdated = this._motionManager.updateMotion(this._model, delta);
    this._model.saveParameters();
    if (!motionUpdated) this._eyeBlink?.updateParameters(this._model, delta);
    this._expressionManager.updateMotion(this._model, delta);
    this._physics?.evaluate(this._model, delta);
    this._pose?.updateParameters(this._model, delta);
    // LipSync owns these parameters after motion/expression/physics updates.
    this.setLip(this.lip);
    this._model.update();
  }

  override release() {
    if (this.getModel()) this.setLip(0);
    this._motionManager?.stopAllMotions();
    this._expressionManager?.stopAllMotions();
    for (const motion of this.motions.values()) ACubismMotion.delete(motion);
    for (const expression of this.expressions.values())
      ACubismMotion.delete(expression);
    this.motions.clear();
    this.expressions.clear();
    super.release();
  }
}

export async function createAvatar(
  canvas: HTMLCanvasElement,
  config: Config,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const modelUrl = localAsset(config.modelUrl, location.href);
  const controller = new AbortController();
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: true,
  });
  if (!gl) throw new Error("이 브라우저에서 WebGL을 시작하지 못했습니다.");
  if (gl.isContextLost())
    throw new Error("그래픽 연결이 복구된 뒤 다시 연결하세요.");
  let model: Character | null = null;
  let setting: CubismModelSettingJson | null = null;
  let frameworkOwned = false;
  let disposed = false;
  let frame = 0;
  const textures: WebGLTexture[] = [];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    controller.abort();
    signal.removeEventListener("abort", dispose);
    canvas.removeEventListener("webglcontextlost", contextLost);
    cancelAnimationFrame(frame);
    model?.release();
    model = null;
    setting?.release();
    setting = null;
    for (const texture of textures) gl.deleteTexture(texture);
    textures.length = 0;
    if (!gl.isContextLost()) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    if (frameworkOwned && --frameworkUsers === 0) {
      CubismWebGLOffscreenManager.getInstance().release();
      CubismFramework.dispose();
      CubismFramework.cleanUp();
    }
    frameworkOwned = false;
  };
  const fail = (message: string) => {
    dispose();
    canvas.dispatchEvent(new CustomEvent("avatar-error", { detail: message }));
  };
  const contextLost = (event: Event) => {
    event.preventDefault();
    fail("그래픽 연결이 끊겼습니다. 캐릭터를 다시 연결하세요.");
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  signal.addEventListener("abort", dispose, { once: true });
  const live = controller.signal;
  const asset = (name: string) => read(localAsset(name, modelUrl.href), live);

  try {
    if (!frameworkUsers) {
      if (!CubismFramework.startUp())
        throw new Error("Cubism Core를 시작하지 못했습니다.");
      CubismFramework.initialize();
    }
    frameworkUsers++;
    frameworkOwned = true;
    const bytes = await asset(modelUrl.href);
    live.throwIfAborted();
    // Check the manifest before passing it to the SDK JSON wrapper.
    const manifest = JSON.parse(new TextDecoder().decode(bytes));
    if (
      manifest.Version !== 3 ||
      !manifest.FileReferences?.Moc ||
      !Array.isArray(manifest.FileReferences.Textures)
    ) {
      throw new Error("지원하는 model3.json 파일이 아닙니다.");
    }
    setting = new CubismModelSettingJson(bytes, bytes.byteLength);
    model = new Character();
    const moc = await asset(setting.getModelFileName());
    live.throwIfAborted();
    model.loadModel(moc, true);
    if (!model.getModel()) throw new Error("Cubism 모델을 읽지 못했습니다.");
    model.configure(setting, config);
    const baseMatrix = model.getModelMatrix().getArray().slice();
    for (const [name, load] of [
      [
        setting.getPhysicsFileName(),
        (data: ArrayBuffer) => model!.loadPhysics(data, data.byteLength),
      ],
      [
        setting.getPoseFileName(),
        (data: ArrayBuffer) => model!.loadPose(data, data.byteLength),
      ],
    ] as const) {
      if (!name) continue;
      const data = await asset(name);
      live.throwIfAborted();
      load(data);
    }
    const wantedExpressions = new Set(Object.values(config.emotionMappings));
    for (let i = 0; i < setting.getExpressionCount(); i++) {
      const name = setting.getExpressionName(i);
      if (!wantedExpressions.has(name)) continue;
      const data = await asset(setting.getExpressionFileName(i));
      live.throwIfAborted();
      const expression = model.loadExpression(data, data.byteLength, name);
      if (!expression) throw new Error("캐릭터 표정을 읽지 못했습니다.");
      model.expressions.set(name, expression);
    }
    for (const mapping of Object.values(config.gestureMappings)) {
      const { group, index } = mapping;
      const key = `${group}:${index}`;
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= setting.getMotionCount(group) ||
        model.motions.has(key)
      )
        continue;
      const data = await asset(setting.getMotionFileName(group, index));
      live.throwIfAborted();
      const motion = model.loadMotion(
        data,
        data.byteLength,
        key,
        undefined,
        undefined,
        setting,
        group,
        index,
        true,
      );
      if (!motion) throw new Error("캐릭터 동작을 읽지 못했습니다.");
      // Sample sound references are deliberately unused; only app TTS plays.
      model.motions.set(key, motion);
    }
    canvas.width = Math.max(
      1,
      Math.round(canvas.clientWidth * Math.min(devicePixelRatio || 1, 2)),
    );
    canvas.height = Math.max(
      1,
      Math.round(canvas.clientHeight * Math.min(devicePixelRatio || 1, 2)),
    );
    model.createRenderer(canvas.width, canvas.height);
    model.getRenderer().startUp(gl);
    model.getRenderer().setIsPremultipliedAlpha(true);
    for (let i = 0; i < setting.getTextureCount(); i++) {
      const data = await asset(setting.getTextureFileName(i));
      live.throwIfAborted();
      const bitmap = await createImageBitmap(new Blob([data]), {
        premultiplyAlpha: "premultiply",
        colorSpaceConversion: "none",
      });
      try {
        live.throwIfAborted();
        if (
          Math.max(bitmap.width, bitmap.height) >
          gl.getParameter(gl.MAX_TEXTURE_SIZE)
        )
          throw new Error("캐릭터 텍스처가 장치 제한보다 큽니다.");
        const texture = gl.createTexture();
        if (!texture) throw new Error("캐릭터 텍스처를 생성하지 못했습니다.");
        textures.push(texture);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bitmap,
        );
        model.getRenderer().bindTexture(i, texture);
      } finally {
        bitmap.close();
      }
    }
    await prepareShaders(gl, live);
    live.throwIfAborted();
    let last = performance.now();
    const render = (now: number) => {
      if (disposed || !model) return;
      const width = Math.max(
        1,
        Math.round(canvas.clientWidth * Math.min(devicePixelRatio || 1, 2)),
      );
      const height = Math.max(
        1,
        Math.round(canvas.clientHeight * Math.min(devicePixelRatio || 1, 2)),
      );
      if (width !== canvas.width || height !== canvas.height) {
        canvas.width = width;
        canvas.height = height;
        model.setRenderTargetSize(width, height);
      }
      const delta = Math.max(0, Math.min((now - last) / 1000, 0.1));
      last = now;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const offscreen = CubismWebGLOffscreenManager.getInstance();
      offscreen.beginFrameProcess(gl);
      try {
        model.update(delta);
        const projection = new CubismMatrix44();
        model.getModelMatrix().setMatrix(baseMatrix);
        if (model.getModel().getCanvasWidth() > 1 && width < height) {
          model.getModelMatrix().setWidth(2);
          projection.scale(1, width / height);
        } else {
          projection.scale(height / width, 1);
        }
        projection.multiplyByMatrix(model.getModelMatrix());
        model.getRenderer().setMvpMatrix(projection);
        model.getRenderer().setRenderState(null, [0, 0, width, height]);
        model.getRenderer().drawModel("/avatar-runtime/shaders/");
      } finally {
        offscreen.endFrameProcess(gl);
        offscreen.releaseStaleRenderTextures(gl);
      }
    };
    // Do one real render before reporting ready to the host.
    render(last);
    const tick = (now: number) => {
      try {
        render(now);
        if (!disposed) frame = requestAnimationFrame(tick);
      } catch {
        fail("캐릭터를 그리지 못했습니다. 다시 연결하세요.");
      }
    };
    frame = requestAnimationFrame(tick);
    return {
      setExpression(name: string) {
        if (disposed) return;
        if (name === "neutral" && !Object.hasOwn(config.emotionMappings, name))
          model?.resetExpression();
        else if (Object.hasOwn(config.emotionMappings, name))
          model?.expression(config.emotionMappings[name]);
      },
      setMotion(name: string) {
        if (disposed) return;
        if (name === "idle") {
          const idle = config.gestureMappings.idle;
          model?.resetMotion(idle ? `${idle.group}:${idle.index}` : undefined);
          return;
        }
        if (!Object.hasOwn(config.gestureMappings, name)) return;
        const motion = config.gestureMappings[name];
        model?.motion(`${motion.group}:${motion.index}`);
      },
      setLipSync(value: number) {
        if (!disposed) model?.setLip(value);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
