import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  test: {
    include: ["scripts/research-loop-v11/p07-alpha-import.spec.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 90_000,
    pool: "forks",
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
};
