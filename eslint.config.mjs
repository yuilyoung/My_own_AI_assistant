import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/**", "build/**", "reports/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["apps/diagnostics/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.browser },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "eqeqeq": ["error", "always"]
    }
  },
  {
    files: ["apps/diagnostics/tests/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { globals: globals.node }
  },
  {
    files: ["apps/diagnostics/capture-worklet.mjs"],
    languageOptions: { globals: { AudioWorkletProcessor: "readonly", registerProcessor: "readonly", sampleRate: "readonly" } }
  }
];
