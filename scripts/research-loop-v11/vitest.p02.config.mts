import { resolve } from "node:path";

// Kept outside Control API so P02 can prove compatibility without changing the
// protected application's ordinary test discovery configuration.
const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  resolve: {
    // The P02 suite intentionally lives outside the protected Control API
    // test tree; resolve its existing dev dependency from that application.
    alias: {
      undici: resolve(repositoryRoot, "apps/control-api/node_modules/undici/index.js"),
    },
  },
  test: {
    include: [
      "apps/control-api/test/facade.spec.ts",
      "apps/control-api/test/run-sync.spec.ts",
      "apps/control-api/test/governance-product.spec.ts",
      "scripts/research-loop-v11/p02-compatibility.spec.ts",
    ],
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
};
