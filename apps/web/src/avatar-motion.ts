import { normalizedLipSync, type AvatarAdapter } from "./avatar";
import type { CubismModel3 } from "./model3";

export const expressionLabels = {
  neutral: "차분함",
  happy: "기쁨",
  concerned: "걱정",
  surprised: "놀람",
  curious: "호기심",
  thoughtful: "사색",
} as const;
export const motionLabels = {
  idle: "대기",
  nod: "끄덕임",
  greeting: "인사",
  tilt: "고개 기울임",
  point: "가리키기",
} as const;

export type ExpressionCue = keyof typeof expressionLabels;
export type MotionCue = keyof typeof motionLabels;

export function isExpressionCue(value: unknown): value is ExpressionCue {
  return typeof value === "string" && Object.hasOwn(expressionLabels, value);
}

export function isMotionCue(value: unknown): value is MotionCue {
  return typeof value === "string" && Object.hasOwn(motionLabels, value);
}

/** Map semantic cues to names in the user's licensed model export, not guessed IDs. */
export type AvatarBindings = {
  expressions?: Partial<Record<ExpressionCue, string>>;
  motions?: Partial<Record<MotionCue, string>>;
};

type Attached = {
  adapter: AvatarAdapter;
  manifest: CubismModel3;
  bindings: AvatarBindings;
  ready: boolean;
  controller: AbortController;
};

export function validateAvatarBindings(
  manifest: CubismModel3,
  bindings: AvatarBindings,
): void {
  for (const [cue, name] of Object.entries(bindings.expressions ?? {})) {
    if (
      !isExpressionCue(cue) ||
      typeof name !== "string" ||
      !Object.hasOwn(manifest.expressions, name)
    ) {
      throw new Error("모델에 없는 표정 매핑: " + cue);
    }
  }
  for (const [cue, group] of Object.entries(bindings.motions ?? {})) {
    if (
      !isMotionCue(cue) ||
      typeof group !== "string" ||
      !Object.hasOwn(manifest.motions, group) ||
      manifest.motions[group].length === 0
    ) {
      throw new Error("모델에 없는 모션 매핑: " + cue);
    }
  }
}

/**
 * Bridges the existing Player's normalized audio level to a future licensed
 * Cubism renderer. No Core/SDK is bundled or silently initialized here.
 */
export class AvatarMotionBridge {
  private attached: Attached | null = null;
  lastFailure = "";

  get ready(): boolean {
    return this.attached?.ready ?? false;
  }

  get lipSyncEnabled(): boolean {
    return this.ready && (this.attached?.manifest.lipSyncIds.length ?? 0) > 0;
  }

  async attach(
    adapter: AvatarAdapter,
    modelUrl: string,
    manifest: CubismModel3,
    bindings: AvatarBindings,
  ): Promise<boolean> {
    try {
      validateAvatarBindings(manifest, bindings);
    } catch (error) {
      // Keep the binding error even if a partially created GPU runtime cannot
      // release its resources. The incoming adapter belongs to this bridge.
      try {
        adapter.dispose();
      } catch {
        // Best effort for foreign SDK code; preserve the validation failure.
      }
      throw error;
    }
    this.detach();
    const attached: Attached = {
      adapter,
      manifest,
      bindings,
      ready: false,
      controller: new AbortController(),
    };
    this.attached = attached;
    try {
      await adapter.load(modelUrl, attached.controller.signal);
      if (this.attached !== attached || attached.controller.signal.aborted)
        return false;
      attached.ready = true;
      if (manifest.lipSyncIds.length) adapter.setLipSync(0);
      this.lastFailure = "";
      return true;
    } catch (error) {
      const cancelled =
        attached.controller.signal.aborted || this.attached !== attached;
      if (this.attached === attached) this.detach();
      if (cancelled) return false;
      throw error;
    }
  }

  /**
   * A user-installed SDK can fail after a GPU/context loss. Revoke the bridge
   * before swallowing its cleanup error, so audio frames cannot call it again.
   */
  private discardFailedRenderer(error: unknown): void {
    try {
      this.lastFailure = String(error);
    } catch {
      this.lastFailure = "알 수 없는 로컬 SDK 오류";
    }
    try {
      this.detach();
    } catch {
      // Foreign GPU cleanup can throw. The adapter is already disconnected.
    }
  }

  /** Player already provides a 0–1 level; do not amplify it twice. */
  onAudioLevel(level: number): void {
    if (!this.lipSyncEnabled) return;
    try {
      this.attached?.adapter.setLipSync(normalizedLipSync(level, 1));
    } catch (error) {
      // This callback runs in Player's animation frame: preserve audio output.
      this.discardFailedRenderer(error);
    }
  }

  setExpression(cue: ExpressionCue): boolean {
    const current = this.attached;
    const name = current?.bindings.expressions?.[cue];
    if (!current?.ready || !name) return false;
    try {
      current.adapter.setExpression(name);
    } catch (error) {
      this.discardFailedRenderer(error);
      throw error;
    }
    return true;
  }

  setMotion(cue: MotionCue): boolean {
    const current = this.attached;
    const name = current?.bindings.motions?.[cue];
    if (!current?.ready || !name) return false;
    try {
      current.adapter.setMotion(name);
    } catch (error) {
      this.discardFailedRenderer(error);
      throw error;
    }
    return true;
  }

  reset(): void {
    if (!this.lipSyncEnabled) return;
    try {
      this.attached?.adapter.setLipSync(0);
    } catch (error) {
      this.discardFailedRenderer(error);
    }
  }

  detach(): void {
    const current = this.attached;
    this.attached = null;
    if (!current) return;
    // Revoke callbacks before calling foreign SDK code. A failed lip-sync
    // reset must not prevent disposal, and a failed disposal must not break
    // mode switching, panel unmount or the original SDK load rejection.
    current.controller.abort();
    let cleanupFailed = false;
    let cleanupError: unknown;
    try {
      if (current.ready && current.manifest.lipSyncIds.length) {
        current.adapter.setLipSync(0);
      }
    } catch (error) {
      cleanupFailed = true;
      cleanupError = error;
    }
    try {
      current.adapter.dispose();
    } catch (error) {
      if (!cleanupFailed) cleanupError = error;
      cleanupFailed = true;
    }
    if (cleanupFailed && !this.lastFailure) {
      try {
        this.lastFailure = String(cleanupError);
      } catch {
        this.lastFailure = "로컬 SDK 리소스 정리에 실패했습니다.";
      }
    }
  }
}
