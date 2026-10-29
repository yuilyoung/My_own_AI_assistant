import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["avatar-runtime/cubism-runtime.test.ts"],
    alias: [
      {
        find: /^@cubism\/.+$/,
        replacement: fileURLToPath(new URL("./test-sdk.ts", import.meta.url)),
      },
    ],
  },
});
