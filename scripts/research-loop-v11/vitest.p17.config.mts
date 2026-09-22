import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  test: {
    // P17 reads only the existing P13 immutable evidence projection. The
    // isolated proof deliberately has one disposable PostgreSQL cell and
    // never starts an engine, market-data, worker or persistent replay store.
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
