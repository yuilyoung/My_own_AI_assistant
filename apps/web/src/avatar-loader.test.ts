import { describe, expect, it, vi } from "vitest";
import { parseAvatarConfig, loadAvatar } from "./avatar-loader";
const config = {
  version: 1,
  modelUrl: "/avatar-local/Haru/Haru.model3.json",
  emotionMappings: { happy: "F01" },
  gestureMappings: { idle: { group: "Idle", index: 0 } },
};
describe("local avatar installation", () => {
  it("accepts the installed fixed model", () => {
    expect(parseAvatarConfig(config).modelUrl).toBe(config.modelUrl);
  });
  it.each([
    "https://remote.example/model.json",
    "//remote/model.json",
    "/avatar-local/../api/status",
    "/avatar-local/%2e%2e/api/status",
    "/avatar-local/a%2fb.json",
    "/avatar-local/model.json?remote=1",
  ])("rejects unsafe path %s", (modelUrl) => {
    expect(() => parseAvatarConfig({ ...config, modelUrl })).toThrow();
  });
  it("rejects malformed mappings and unsupported config", () => {
    expect(() => parseAvatarConfig({ ...config, version: 2 })).toThrow();
    expect(() =>
      parseAvatarConfig({
        ...config,
        gestureMappings: { idle: { group: "Idle", index: -1 } },
      }),
    ).toThrow();
  });
  it("does not start runtime when installation is absent", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 404 }));
    await expect(
      loadAvatar(
        {} as HTMLCanvasElement,
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow("설치");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
it("explains missing assets when Vite serves its HTML fallback", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response("<!doctype html><html></html>", { status: 200 }),
    );
  await expect(
    loadAvatar({} as HTMLCanvasElement, new AbortController().signal, fetcher),
  ).rejects.toThrow("설치");
});
