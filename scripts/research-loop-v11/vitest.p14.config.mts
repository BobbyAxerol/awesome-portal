import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  test: {
    // P14 extends the P11 terminal ingress boundary. Reuse that one durable
    // corpus plus the P14 source/projection proof in a disposable database;
    // no second worker, database, or runtime container is introduced.
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
