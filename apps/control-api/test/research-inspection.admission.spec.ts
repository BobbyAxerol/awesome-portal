import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { ResearchCurrentSourceRepository } from "../src/research/current-source.repository";
import { ResearchEvidenceRepository } from "../src/research/evidence.repository";

const scope = { workspaceId: "p23-owned-workspace", actorUserId: "p23-owned-reader" };

describe("P23 finite twenty-principal inspection burst", () => {
  for (const lane of ["evidence", "retained"] as const) {
    it(`${lane}: keeps two active clients, admits eighteen waiters and refuses overflow`, async () => {
      let unblock!: () => void;
      const hold = new Promise<void>(resolve => { unblock = resolve; });
      let active = 0, peak = 0;
      const clients: Array<{ release: ReturnType<typeof vi.fn> }> = [];
      const pool = {
        connect: vi.fn(async () => {
          active++; peak = Math.max(peak, active);
          const client = {
            query: vi.fn(async (sql: string) => {
              if (sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY") await hold;
              if (sql.includes("AS as_of_utc_ms")) return { rows: [{ as_of_utc_ms: "1" }], rowCount: 1 };
              if (sql.startsWith("SELECT 1 FROM workspace_members")) return { rows: [{}], rowCount: 1 };
              return { rows: [], rowCount: 0 };
            }),
            release: vi.fn(() => { active--; }),
          };
          clients.push(client); return client;
        }),
      };
      const repository = lane === "evidence"
        ? new ResearchEvidenceRepository(pool as unknown as Pool)
        : new ResearchCurrentSourceRepository(pool as unknown as Pool);
      const read = () => repository instanceof ResearchEvidenceRepository
        ? repository.hub(scope, "rrun_owned")
        : repository.sealForRead(scope, "rrun_owned");
      const burst = Array.from({ length: 20 }, read);
      await vi.waitFor(() => expect(pool.connect).toHaveBeenCalledTimes(2));
      await expect(read()).rejects.toMatchObject({ status: 503 });
      unblock();
      await expect(Promise.all(burst)).resolves.toHaveLength(20);
      expect(peak).toBe(2); expect(active).toBe(0);
      expect(clients.every(client => client.release.mock.calls.length === 1)).toBe(true);
    });
  }
});
