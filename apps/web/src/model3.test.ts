import { describe, expect, it } from "vitest";
import { localAssetPath, parseModel3, resolveModelAsset } from "./model3";

function sample() {
  return {
    Version: 3,
    FileReferences: {
      Moc: "Haru.moc3",
      Textures: ["Haru.2048/texture_00.png"],
      Physics: "Haru.physics3.json",
      Expressions: [{ Name: "F01", File: "expressions/F01.exp3.json" }],
      Motions: { Idle: [{ File: "motions/idle.motion3.json" }] },
    },
    Groups: [
      { Target: "Parameter", Name: "LipSync", Ids: ["ParamMouthOpenY"] },
      { Target: "Parameter", Name: "EyeBlink", Ids: ["ParamEyeLOpen"] },
    ],
  };
}

describe("official Cubism model3 metadata validation", () => {
  it("lists actual referenced assets and lip sync parameter IDs", () => {
    const parsed = parseModel3(sample());
    expect(parsed.moc).toBe("Haru.moc3");
    expect(parsed.textures).toEqual(["Haru.2048/texture_00.png"]);
    expect(parsed.expressions).toEqual({ F01: "expressions/F01.exp3.json" });
    expect(parsed.motions).toEqual({ Idle: ["motions/idle.motion3.json"] });
    expect(parsed.lipSyncIds).toEqual(["ParamMouthOpenY"]);
    expect(parsed.referencedFiles).toContain("Haru.physics3.json");
  });

  it("never assumes a hardcoded mouth parameter when LipSync is absent", () => {
    const input = sample();
    input.Groups = [];
    expect(parseModel3(input).lipSyncIds).toEqual([]);
  });

  it.each([
    "../secret.moc3",
    "/root/model.moc3",
    "https://example.com/model.moc3",
    "path\\texture.png",
    "sub//model.moc3",
    "sub/%2e%2e/model.moc3",
    "texture.png?token=secret",
  ])("rejects unsafe model paths: %s", (path) => {
    expect(() => localAssetPath(path)).toThrow();
  });

  it("rejects missing textures and incompatible versions", () => {
    const missing = sample();
    missing.FileReferences.Textures = [];
    expect(() => parseModel3(missing)).toThrow(/텍스처/);
    expect(() => parseModel3({ ...sample(), Version: 2 })).toThrow(/Version 3/);
  });

  it("rejects prototype names from external model metadata", () => {
    const input = sample();
    const groups = JSON.parse(
      '{"__proto__":[{"File":"motions/idle.motion3.json"}]}',
    );
    expect(() =>
      parseModel3({
        ...input,
        FileReferences: { ...input.FileReferences, Motions: groups },
      }),
    ).toThrow(/모션 그룹/);
  });

  it("resolves only local assets inside the selected model directory", () => {
    const origin = "http://127.0.0.1:8765";
    const model = "/avatar-local/Haru/Haru.model3.json";
    expect(resolveModelAsset(model, "Haru.moc3", origin)).toBe(
      "http://127.0.0.1:8765/avatar-local/Haru/Haru.moc3",
    );
    expect(() =>
      resolveModelAsset(
        "https://external.example/Haru.model3.json",
        "Haru.moc3",
        origin,
      ),
    ).toThrow(/동일 출처/);
    expect(() => resolveModelAsset(model, "../other.moc3", origin)).toThrow();
  });
});
