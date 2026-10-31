import { describe, expect, it, vi } from "vitest";
import { verifyLocalModelResources } from "./model-assets";

const modelPath = "/avatar-local/Haru/Haru.model3.json";
const origin = "http://127.0.0.1:8765";

function model() {
  return {
    Version: 3,
    FileReferences: {
      Moc: "Haru.moc3",
      Textures: ["textures/0.png", "textures/1.png"],
      Expressions: [{ Name: "smile", File: "expressions/smile.exp3.json" }],
    },
    Groups: [
      { Target: "Parameter", Name: "LipSync", Ids: ["ParamMouthOpenY"] },
    ],
  };
}

describe("local Cubism asset accessibility preflight", () => {
  it("uses same-origin GET for metadata and HEAD for referenced assets", async () => {
    const read = vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith(".model3.json")) {
        return new Response(JSON.stringify(model()));
      }
      expect(options.method).toBe("HEAD");
      expect(options.credentials).toBe("omit");
      expect(options.redirect).toBe("error");
      expect(url.startsWith(origin + "/avatar-local/Haru/")).toBe(true);
      return new Response(null, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    });
    const result = await verifyLocalModelResources(modelPath, origin, read);
    expect(result.checked).toBe(4);
    expect(result.available).toBe(4);
    expect(result.issues).toEqual([]);
    expect(result.manifest.lipSyncIds).toEqual(["ParamMouthOpenY"]);
    expect(read).toHaveBeenCalledTimes(5);
  });

  it("reports missing, zero-length and SPA fallback assets without claiming success", async () => {
    const read = vi.fn(async (url: string) => {
      if (url.endsWith(".model3.json")) {
        return new Response(JSON.stringify(model()));
      }
      if (url.endsWith("Haru.moc3")) {
        return new Response(null, { status: 404 });
      }
      if (url.endsWith("textures/0.png")) {
        return new Response(null, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (url.endsWith("textures/1.png")) {
        return new Response(null, {
          status: 200,
          headers: { "content-length": "0" },
        });
      }
      return new Response(null, { status: 200 });
    });
    const result = await verifyLocalModelResources(modelPath, origin, read);
    expect(result.checked).toBe(4);
    expect(result.available).toBe(1);
    expect(result.issues).toEqual([
      { path: "Haru.moc3", reason: "HTTP 404" },
      {
        path: "textures/0.png",
        reason: "HTML 응답 (누락 파일의 SPA fallback 가능)",
      },
      { path: "textures/1.png", reason: "비어 있는 파일" },
    ]);
  });

  it("rejects malicious paths before any asset HEAD request", async () => {
    const unsafe = model();
    unsafe.FileReferences.Moc = "../private.moc3";
    const read = vi.fn(async () => new Response(JSON.stringify(unsafe)));
    await expect(
      verifyLocalModelResources(modelPath, origin, read),
    ).rejects.toThrow(/상대 경로/);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("does not exceed four simultaneous resource probes", async () => {
    const many = model();
    many.FileReferences.Textures = Array.from(
      { length: 12 },
      (_, i) => `textures/${i}.png`,
    );
    let active = 0;
    let peak = 0;
    const read = vi.fn(async (url: string) => {
      if (url.endsWith(".model3.json")) {
        return new Response(JSON.stringify(many));
      }
      active += 1;
      peak = Math.max(active, peak);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return new Response(null, { status: 200 });
    });
    const result = await verifyLocalModelResources(modelPath, origin, read);
    expect(result.checked).toBe(14);
    expect(result.available).toBe(14);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("aborts without reporting a successful audit", async () => {
    const abort = new AbortController();
    const read = vi.fn(async (url: string) => {
      if (url.endsWith(".model3.json")) {
        return new Response(JSON.stringify(model()));
      }
      abort.abort();
      throw new DOMException("cancelled", "AbortError");
    });
    await expect(
      verifyLocalModelResources(modelPath, origin, read, abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
