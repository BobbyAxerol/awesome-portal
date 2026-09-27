/** Run the ops verifier with existing contracts dependencies, not a root install. */
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("../../", import.meta.url)),
  resolve: { alias: { vitest: fileURLToPath(new URL("./node_modules/vitest/dist/index.js", import.meta.url)) } },
  test: { include: ["scripts/research-p23/qualify.test.mjs"], environment: "node",
    fileParallelism: false, minWorkers: 1, maxWorkers: 1, testTimeout: 20000 },
});
