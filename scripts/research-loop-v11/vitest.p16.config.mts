import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "../..");

export default {
  root: repositoryRoot,
  test: {
    // P16 adds only a retained-binding reader to the established P10→P14
    // terminal corpus. The isolated proof must not start a second worker,
    // source adapter, artifact service or persistent database volume.
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
