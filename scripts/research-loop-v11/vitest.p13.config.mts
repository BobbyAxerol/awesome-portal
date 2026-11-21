import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  test: {
    // P13 extends the P11 terminal ingress boundary; this isolated lane runs
    // the established P11 corpus plus the P13 end-to-end receipt proof in one
    // disposable database rather than inventing a second synthetic producer.
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
