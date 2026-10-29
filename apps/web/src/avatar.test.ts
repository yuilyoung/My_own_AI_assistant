import { describe, expect, it } from "vitest";
import { normalizedLipSync, UnavailableAvatar } from "./avatar";
describe("avatar fallback", () => {
  it("does not claim an unloaded model is ready", async () => {
    const avatar = new UnavailableAvatar();
    expect(avatar.state).toBe("unavailable");
    await expect(avatar.load("/model.model3.json")).rejects.toThrow("Live2D");
    avatar.dispose();
  });
  it("clamps RMS and handles invalid samples", () => {
    expect(normalizedLipSync(0)).toBe(0);
    expect(normalizedLipSync(0.2)).toBeCloseTo(0.6);
    expect(normalizedLipSync(1)).toBe(1);
    expect(normalizedLipSync(Number.NaN)).toBe(0);
    expect(normalizedLipSync(-1)).toBe(0);
  });
});
