export type AvatarState = "unavailable" | "loading" | "ready" | "error";
export type AvatarAdapter = {
  load(modelUrl: string): Promise<void>;
  setExpression(name: string): void;
  setMotion(name: string): void;
  setLipSync(value: number): void;
  dispose(): void;
};
/** Safe fallback until the licensed Cubism SDK and model are installed. */
export class UnavailableAvatar implements AvatarAdapter {
  readonly state: AvatarState = "unavailable";
  async load(_modelUrl: string): Promise<void> {
    throw new Error("Live2D Cubism SDK와 사용권이 확인된 모델이 필요합니다.");
  }
  setExpression(_name: string): void {}
  setMotion(_name: string): void {}
  setLipSync(_value: number): void {}
  dispose(): void {}
}
export function normalizedLipSync(rms: number, gain = 3): number {
  if (!Number.isFinite(rms) || !Number.isFinite(gain)) return 0;
  return Math.min(1, Math.max(0, rms * gain));
}
