import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    environment: "node",
    testTimeout: 20000,
    hookTimeout: 60000,
    pool: "forks",
    fileParallelism: false,
    // Integration files share one PostgreSQL database and several include
    // scale corpora. A single worker keeps the fresh-PG gate deterministic and
    // avoids multiplying the peak heap by the host CPU count.
    minWorkers: 1,
    maxWorkers: 1,
  },
});
