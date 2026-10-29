/** Install only a locally obtained official Cubism SDK. No vendor downloads. */
import { build } from "esbuild";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { execFileSync } from "node:child_process";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sdk = process.argv[2] && resolve(process.argv[2]);
const compileOnly = process.argv[3] === "--compile-only";
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
async function inventory(root, prefix = "") {
  const result = {};
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink())
      throw new Error("SDK symlinks are unsupported: " + path);
    if (entry.isDirectory()) Object.assign(result, await inventory(root, path));
    else if (entry.isFile())
      result[path.replaceAll("\\", "/")] = createHash("sha256")
        .update(await readFile(join(root, path)))
        .digest("hex");
  }
  return result;
}
async function main() {
  if (!sdk || process.argv.length > 4 || (process.argv[3] && !compileOnly))
    throw new Error(
      "Usage: npm run avatar:install -- /path/to/CubismSdkForWeb-5-r.5 [--compile-only]",
    );
  await access(join(sdk, "Framework/src/live2dcubismframework.ts"));
  await access(join(sdk, "Framework/Shaders/WebGL"));
  const required = [
    "Core/live2dcubismcore.min.js",
    "Core/live2dcubismcore.d.ts",
    "Samples/Resources/Haru/Haru.model3.json",
    "LICENSE.md",
    "NOTICE.md",
    "Core/LICENSE.md",
    "Framework/LICENSE.md",
  ];
  if (!compileOnly)
    for (const path of required) {
      if (!(await exists(join(sdk, path))))
        throw new Error(
          "Missing official SDK file: " +
            path +
            ". Obtain the complete official SDK ZIP (including Core), then retry.",
        );
    }
  const publicDir = join(web, "public"),
    runtimeDir = join(publicDir, "avatar-runtime"),
    modelDir = join(publicDir, "avatar-local");
  if (!compileOnly && ((await exists(runtimeDir)) || (await exists(modelDir))))
    throw new Error(
      "Existing local avatar installation found. Preserve or move public/avatar-runtime and public/avatar-local before reinstalling.",
    );
  await mkdir(publicDir, { recursive: true });
  const stage = await mkdtemp(join(publicDir, ".avatar-stage-"));
  try {
    const runtime = join(stage, "avatar-runtime"),
      model = join(stage, "avatar-local");
    await mkdir(runtime);
    await build({
      entryPoints: [join(web, "avatar-runtime/cubism-runtime.ts")],
      outfile: join(runtime, "cubism-runtime.js"),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      alias: { "@cubism": join(sdk, "Framework/src") },
      logLevel: "warning",
    });
    if (compileOnly) {
      process.stdout.write(
        "Runtime bundle compiled against local Framework; Core and rendering NOT validated.\n",
      );
      return;
    }
    const typecheck = join(stage, "tsconfig.json");
    await writeFile(
      typecheck,
      JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["ES2022", "DOM"],
          noEmit: true,
          skipLibCheck: true,
          types: [],
          paths: { "@cubism/*": [join(sdk, "Framework/src/*")] },
        },
        files: [
          join(web, "avatar-runtime/cubism-runtime.ts"),
          join(sdk, "Core/live2dcubismcore.d.ts"),
        ],
      }),
    );
    execFileSync(
      process.execPath,
      [join(web, "node_modules/typescript/bin/tsc"), "-p", typecheck],
      { stdio: "inherit" },
    );
    await rm(typecheck);
    await cp(
      join(sdk, "Core/live2dcubismcore.min.js"),
      join(runtime, "live2dcubismcore.min.js"),
    );
    await cp(join(sdk, "Framework/Shaders/WebGL"), join(runtime, "shaders"), {
      recursive: true,
    });
    await mkdir(model);
    await cp(join(sdk, "Samples/Resources/Haru"), join(model, "Haru"), {
      recursive: true,
      dereference: false,
    });
    await cp(join(sdk, "LICENSE.md"), join(model, "SDK-LICENSE.md"));
    await cp(join(sdk, "NOTICE.md"), join(model, "SDK-NOTICE.md"));
    await cp(join(sdk, "Core/LICENSE.md"), join(runtime, "Core-LICENSE.md"));
    await cp(
      join(sdk, "Framework/LICENSE.md"),
      join(runtime, "Framework-LICENSE.md"),
    );
    await writeFile(
      join(model, "manifest.json"),
      JSON.stringify(
        {
          version: 1,
          modelUrl: "/avatar-local/Haru/Haru.model3.json",
          emotionMappings: {},
          gestureMappings: { idle: { group: "Idle", index: 0 } },
        },
        null,
        2,
      ) + "\n",
    );
    const files = await inventory(stage);
    const receipt = {
      source: "https://www.live2d.com/download/cubism-sdk/download-web/",
      targetSdk: "5-r.5",
      sample: "Haru",
      files,
      notes:
        "Local installation only. Expressions/nod/greeting are intentionally unmapped until visually verified. No redistribution permission implied.",
    };
    await writeFile(
      join(model, "installation.json"),
      JSON.stringify(receipt, null, 2) + "\n",
    );
    await mkdir(publicDir, { recursive: true });
    await rename(runtime, runtimeDir);
    try {
      await rename(model, modelDir);
    } catch (error) {
      await rename(runtimeDir, runtime);
      throw error;
    }
    process.stdout.write(
      "Installed local official runtime and Haru assets. Run npm run build, restart Gateway, then verify actual rendering.\n",
    );
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
main().catch((error) => {
  process.stderr.write(String(error) + "\n");
  process.exitCode = 1;
});
