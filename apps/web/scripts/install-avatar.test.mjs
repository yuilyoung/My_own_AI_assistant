import { it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
it("rejects incomplete SDK before writing any public assets", () => {
  const sdk = mkdtempSync(join(tmpdir(), "avatar-missing-core-"));
  try {
    mkdirSync(join(sdk, "Framework/src"), { recursive: true });
    mkdirSync(join(sdk, "Framework/Shaders/WebGL"), { recursive: true });
    writeFileSync(join(sdk, "Framework/src/live2dcubismframework.ts"), "");
    const result = spawnSync(
      process.execPath,
      ["scripts/install-avatar.mjs", sdk],
      { encoding: "utf8" },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Missing official SDK file: Core/live2dcubismcore.min.js",
    );
  } finally {
    rmSync(sdk, { recursive: true, force: true });
  }
});
