import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  test: {
    // P15 consumes the P14 immutable receipt in the existing terminal ingress
    // corpus. Its isolated proof adds no source service, worker or database.
    include: ["scripts/research-loop-v11/p11-progress.spec.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 90_000,
    pool: "forks",
    fileParallelism: false,
    minWorkers: 1,
    maxWorkers: 1,
  },
};
