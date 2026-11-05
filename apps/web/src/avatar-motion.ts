import { normalizedLipSync, type AvatarAdapter } from "./avatar";
import type { CubismModel3 } from "./model3";

export type ExpressionCue = "neutral" | "happy" | "concerned" | "surprised";
export type MotionCue = "idle" | "nod" | "greeting";

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

const expressionCues: ExpressionCue[] = [
  "neutral",
  "happy",
  "concerned",
  "surprised",
];
const motionCues: MotionCue[] = ["idle", "nod", "greeting"];

export function validateAvatarBindings(
  manifest: CubismModel3,
  bindings: AvatarBindings,
): void {
  for (const [cue, name] of Object.entries(bindings.expressions ?? {})) {
    if (
      !expressionCues.includes(cue as ExpressionCue) ||
      typeof name !== "string" ||
      !Object.hasOwn(manifest.expressions, name)
    ) {
      throw new Error("모델에 없는 표정 매핑: " + cue);
    }
  }
  for (const [cue, group] of Object.entries(bindings.motions ?? {})) {
    if (
      !motionCues.includes(cue as MotionCue) ||
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
      // The bridge owns a supplied adapter even if its manifest is invalid.
      adapter.dispose();
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
      return true;
    } catch (error) {
      const cancelled =
        attached.controller.signal.aborted || this.attached !== attached;
      if (this.attached === attached) this.detach();
      if (cancelled) return false;
      throw error;
    }
  }

  /** Player already provides a 0–1 level; do not amplify it twice. */
  onAudioLevel(level: number): void {
    if (!this.lipSyncEnabled) return;
    this.attached?.adapter.setLipSync(normalizedLipSync(level, 1));
  }

  setExpression(cue: ExpressionCue): boolean {
    const current = this.attached;
    const name = current?.bindings.expressions?.[cue];
    if (!current?.ready || !name) return false;
    current.adapter.setExpression(name);
    return true;
  }

  setMotion(cue: MotionCue): boolean {
    const current = this.attached;
    const name = current?.bindings.motions?.[cue];
    if (!current?.ready || !name) return false;
    current.adapter.setMotion(name);
    return true;
  }

  reset(): void {
    if (this.lipSyncEnabled) this.attached?.adapter.setLipSync(0);
  }

  detach(): void {
    const current = this.attached;
    this.attached = null;
    if (!current) return;
    // Ask the runtime to stop loading before destroying WebGL resources.
    current.controller.abort();
    try {
      if (current.ready && current.manifest.lipSyncIds.length) {
        current.adapter.setLipSync(0);
      }
    } finally {
      current.adapter.dispose();
    }
  }
}
