/** Shared cancellation generation: a delayed fetch/decode must never revive an old turn. */
export class TurnGate {
  #generation = 0;
  next() { return ++this.#generation; }
  cancel() { ++this.#generation; }
  accepts(generation) { return this.#generation === generation; }
}

const noiseFloor = 0.015;

export function ttsLabel(provider) {
  switch (provider) {
    case 'none': return '미연결 · 텍스트만';
    case 'melo': return '로컬 MeloTTS';
    case 'supertonic': return '로컬 Supertonic 2';
    default: return provider ?? '알 수 없음';
  }
}

/** RMS amplitude, not phoneme recognition. Suitable for a Live2D LipSync parameter. */
export function mouthLevel(samples) {
  if (!samples.length) return 0;
  let energy=0;
  for (const value of samples) {
    if (!Number.isFinite(value)) return 0;
    energy+=value*value;
  }
  return Math.min(1,Math.max(0,(Math.sqrt(energy/samples.length)-noiseFloor)*7));
}

/** Estimate brightness from the energy of consecutive PCM differences relative to the signal. */
export function voiceBrightness(samples, sampleRate) {
  if (samples.length < 2 || !Number.isFinite(sampleRate) || sampleRate <= 0) return 0.5;
  let energy = 0;
  let differenceEnergy = 0;
  let previous = samples[0];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const change = sample - previous;
    differenceEnergy += change * change;
    energy += sample * sample;
    previous = sample;
  }
  if (!Number.isFinite(energy) || energy <= samples.length * noiseFloor * noiseFloor) return 0.5;

  // For a sinusoid, difference RMS / signal RMS approaches 2 sin(π f / sampleRate).
  const sine = Math.min(1, Math.sqrt(differenceEnergy / (4 * energy)));
  const frequency = sampleRate * Math.asin(sine) / Math.PI;
  return Math.min(1, Math.max(0, (frequency - 300) / 2700));
}
