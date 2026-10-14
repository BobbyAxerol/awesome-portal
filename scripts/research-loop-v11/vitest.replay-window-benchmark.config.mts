import { defineConfig } from "../../apps/control-api/node_modules/vitest/dist/config.js";

export default defineConfig({ test: {
  include: ["scripts/research-loop-v11/replay-window-benchmark.spec.ts"],
  environment: "node", pool: "forks", minWorkers: 1, maxWorkers: 1,
  fileParallelism: false, testTimeout: 180_000,
} });
