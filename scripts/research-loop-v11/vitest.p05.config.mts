import { resolve } from "node:path";

// P05 uses the same disposable, local PostgreSQL cell as P03.  It is a
// backend-only proof: no browser, Compose runtime or release image is needed.
const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  test: {
    include: ["scripts/research-loop-v11/p05-artifact.spec.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 90_000,
    pool: "forks",
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
};
