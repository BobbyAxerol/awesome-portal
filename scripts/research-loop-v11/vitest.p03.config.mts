import { resolve } from "node:path";

// P03 owns an isolated PostgreSQL contract suite.  Keep it outside the normal
// application discovery tree so the phase can validate fresh/upgrade schema
// behavior without starting a Portal runtime or browser build.
const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  test: {
    include: ["scripts/research-loop-v11/p03-schema.spec.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 90_000,
    pool: "forks",
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
};
