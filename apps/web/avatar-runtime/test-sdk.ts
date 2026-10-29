/** Test-only SDK boundary, not a replacement renderer or proof of model output. */
import { vi } from "vitest";

export const sdk = {
  models: [] as CubismUserModel[],
  settingsReleased: vi.fn(),
};
export const CubismFramework = {
  startUp: vi.fn(() => true),
  initialize: vi.fn(),
  dispose: vi.fn(),
  cleanUp: vi.fn(),
};

class Manager {
  active: ACubismMotion | null = null;
  priority = 0;
  stopAllMotions = vi.fn(() => {
    this.active = null;
  });
  reserveMotion(priority: number) {
    return priority > this.priority;
  }
  setReservePriority = vi.fn();
  startMotionPriority(motion: ACubismMotion, _auto: boolean, priority: number) {
    this.active = motion;
    this.priority = priority;
  }
  startMotion(motion: ACubismMotion) {
    this.active = motion;
  }
  isFinished() {
    return !this.active;
  }
  updateMotion(model: FakeModel) {
    if (this.active?.expression) model.values.expression = 1;
    return !!this.active;
  }
}
class FakeModel {
  values: Record<string, number> = { mouth: 0, expression: 0 };
  saved = { ...this.values };
  getCanvasWidth() {
    return 2;
  }
  getParameterCount() {
    return 1;
  }
  getParameterId() {
    return "mouth";
  }
  setParameterValueById(id: string, value: number) {
    this.values[id] = value;
  }
  loadParameters() {
    this.values = { ...this.saved };
  }
  saveParameters() {
    this.saved = { ...this.values };
  }
  update = vi.fn();
}
class Renderer {
  startUp = vi.fn();
  setIsPremultipliedAlpha = vi.fn();
  bindTexture = vi.fn();
  setMvpMatrix = vi.fn();
  setRenderState = vi.fn();
  drawModel = vi.fn();
}
export class CubismUserModel {
  _model: FakeModel | null = null;
  _motionManager = new Manager();
  _expressionManager = new Manager();
  _modelMatrix = {
    setupFromLayout: vi.fn(),
    setWidth: vi.fn(),
    getArray: () => new Float32Array(16),
    setMatrix: vi.fn(),
  };
  _eyeBlink = null;
  _physics = null;
  _pose = null;
  renderer = new Renderer();
  released = false;
  constructor() {
    sdk.models.push(this);
  }
  getModel() {
    return this._model;
  }
  getModelMatrix() {
    return this._modelMatrix;
  }
  loadModel() {
    this._model = new FakeModel();
  }
  loadMotion(_data: unknown, _size: number, name: string) {
    return new CubismMotion(name);
  }
  loadExpression(_data: unknown, _size: number, name: string) {
    return new ACubismMotion(name, true);
  }
  loadPhysics = vi.fn();
  loadPose = vi.fn();
  createRenderer = vi.fn();
  getRenderer() {
    return this.renderer;
  }
  setRenderTargetSize = vi.fn();
  release() {
    this.released = true;
  }
}
export class CubismModelSettingJson {
  getModelFileName() {
    return "Haru.moc3";
  }
  getLipSyncParameterCount() {
    return 1;
  }
  getLipSyncParameterId() {
    return "mouth";
  }
  getEyeBlinkParameterCount() {
    return 0;
  }
  getLayoutMap = vi.fn();
  getPhysicsFileName() {
    return "";
  }
  getPoseFileName() {
    return "";
  }
  getExpressionCount() {
    return 1;
  }
  getExpressionName() {
    return "F01";
  }
  getExpressionFileName() {
    return "F01.exp3.json";
  }
  getMotionCount(group: string) {
    return ["Idle", "TapBody"].includes(group) ? 1 : 0;
  }
  getMotionFileName(group: string) {
    return `${group}.motion3.json`;
  }
  getTextureCount() {
    return 1;
  }
  getTextureFileName() {
    return "texture.png";
  }
  release() {
    sdk.settingsReleased();
  }
}
export class CubismMatrix44 {
  scale = vi.fn();
  multiplyByMatrix = vi.fn();
}
export class ACubismMotion {
  constructor(
    public name: string,
    public expression = false,
  ) {}
  static delete = vi.fn();
}
export class CubismMotion extends ACubismMotion {}
export const CubismEyeBlink = { create: vi.fn() };
const offscreen = {
  beginFrameProcess: vi.fn(),
  endFrameProcess: vi.fn(),
  releaseStaleRenderTextures: vi.fn(),
  release: vi.fn(),
};
export const CubismWebGLOffscreenManager = { getInstance: () => offscreen };
export const CubismShaderManager_WebGL = {
  getInstance: () => ({ getShader: () => ({ _isShaderLoaded: true }) }),
};
export class CubismShaderSet {}
