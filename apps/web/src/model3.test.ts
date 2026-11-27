import { describe, expect, it, vi } from "vitest";
import {
  inspectLocalModel3,
  localAssetPath,
  parseModel3,
  resolveModelAsset,
} from "./model3";

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

  it("audits optional motion sound paths without treating audio as a motion name", () => {
    const base = sample();
    const withSound = {
      ...base,
      FileReferences: {
        ...base.FileReferences,
        Motions: {
          Idle: [
            {
              File: "motions/idle.motion3.json",
              Sound: "sounds/idle.wav",
            },
          ],
        },
      },
    };
    const parsed = parseModel3(withSound);
    expect(parsed.motions).toEqual({ Idle: ["motions/idle.motion3.json"] });
    expect(parsed.referencedFiles).toContain("sounds/idle.wav");

    withSound.FileReferences.Motions.Idle[0].Sound = "../private.wav";
    expect(() => parseModel3(withSound)).toThrow(/안전한 상대 경로/);
  });

  it("permits a motion with an empty optional Sound field", () => {
    const base = sample();
    const withEmptySound = {
      ...base,
      FileReferences: {
        ...base.FileReferences,
        Motions: {
          Idle: [{ File: "motions/idle.motion3.json", Sound: "" }],
        },
      },
    };
    expect(parseModel3(withEmptySound).referencedFiles).not.toContain("");
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

  it("inspects a local model without fetching any external URL", async () => {
    const origin = "http://127.0.0.1:8765";
    const read = vi.fn(async () => new Response(JSON.stringify(sample())));
    const parsed = await inspectLocalModel3(
      "/avatar-local/Haru/Haru.model3.json",
      origin,
      read,
    );
    expect(parsed.lipSyncIds).toEqual(["ParamMouthOpenY"]);
    expect(read).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/avatar-local/Haru/Haru.model3.json",
    );
    await expect(
      inspectLocalModel3("https://other.example/model3.json", origin, read),
    ).rejects.toThrow(/동일 출처/);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("requests metadata without credentials or redirects and forwards cancellation", async () => {
    const origin = "http://127.0.0.1:8765";
    const controller = new AbortController();
    const read = vi.fn(async () => new Response(JSON.stringify(sample())));
    vi.stubGlobal("fetch", read);
    try {
      await inspectLocalModel3(
        "/avatar-local/Haru/Haru.model3.json",
        origin,
        undefined,
        controller.signal,
      );
      expect(read).toHaveBeenCalledWith(
        origin + "/avatar-local/Haru/Haru.model3.json",
        {
          cache: "no-store",
          credentials: "omit",
          mode: "same-origin",
          redirect: "error",
          signal: controller.signal,
        },
      );
      controller.abort();
      await expect(
        inspectLocalModel3(
          "/avatar-local/Haru/Haru.model3.json",
          origin,
          undefined,
          controller.signal,
        ),
      ).rejects.toMatchObject({ name: "AbortError" });
      expect(read).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("rejects metadata returned by a redirect even with a custom reader", async () => {
    const response = new Response(JSON.stringify(sample()));
    Object.defineProperty(response, "redirected", { value: true });
    await expect(
      inspectLocalModel3(
        "/avatar-local/Haru/Haru.model3.json",
        "http://127.0.0.1:8765",
        async () => response,
      ),
    ).rejects.toThrow(/리다이렉트/);
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
