/** Shared cancellation generation: a delayed fetch/decode must never revive an old turn. */
export class TurnGate {
  #generation = 0;
  next() { return ++this.#generation; }
  cancel() { ++this.#generation; }
  accepts(generation) { return this.#generation === generation; }
}

/** RMS amplitude, not phoneme recognition. Suitable for a future Live2D LipSync parameter. */
export function mouthLevel(samples) {
  if (!samples.length) return 0;
  let energy=0;
  for (const value of samples) {
    if (!Number.isFinite(value)) return 0;
    energy+=value*value;
  }
  return Math.min(1,Math.max(0,(Math.sqrt(energy/samples.length)-0.015)*7));
}
