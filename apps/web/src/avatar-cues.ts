import type {
  AvatarMotionBridge,
  ExpressionCue,
  MotionCue,
} from "./avatar-motion";
import type { Segment } from "./gateway";

function isExpressionCue(value: unknown): value is ExpressionCue {
  return (
    value === "neutral" ||
    value === "happy" ||
    value === "concerned" ||
    value === "surprised"
  );
}

function isMotionCue(value: unknown): value is MotionCue {
  return value === "idle" || value === "nod" || value === "greeting";
}

/**
 * Only dispatch server-defined cues to an already attached, user-owned renderer.
 * An unknown cue or failing private SDK must never interrupt text or TTS.
 * Names are resolved through the model-specific allowlist in AvatarMotionBridge.
 */
export function dispatchAvatarCues(
  bridge: AvatarMotionBridge,
  segment: Segment,
): void {
  if (!bridge.ready) return;
  if (isExpressionCue(segment.emotion)) {
    try {
      bridge.setExpression(segment.emotion);
    } catch {
      // The bridge has detached the failed private SDK.
    }
  }
  if (bridge.ready && isMotionCue(segment.gesture)) {
    try {
      bridge.setMotion(segment.gesture);
    } catch {
      // Keep conversation playback independent of renderer errors.
    }
  }
}
