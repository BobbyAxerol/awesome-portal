// @vitest-environment node
/**
 * QA9 N9a-02: the closed V2 operations reader must ACCEPT the served queue for a variant target id (`dep_live_01_mismatch`, `dep_live_01_gap`):
 * the filters echo the request, the rows are the resolved deployment's, and the facets count the same rows. A body the reader rejects reads as an outage.
 */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readOperationalQueueV2 } from "../execution/v2/readers/operationalQueue";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";

let server: import("node:http").Server;
let base = "";
beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

describe("the operations reader accepts a variant target", () => {
  for (const target of ["dep_live_01", "dep_live_01_mismatch", "dep_live_01_gap", "dep_live_01_stale", "dep_live_01_dark"]) {
    it(`target_id=${target}: accepted, non-empty, the deployment's own rows`, async () => {
      const response = await fetch(`${base}/api/v1/execution/operations?target_id=${target}&limit=50&sort=created_at:desc`);
      expect(response.status).toBe(200);
      const body = await response.json();
      const read = readOperationalQueueV2(body);
      expect(read, `the reader rejected the body for ${target}`).not.toBeNull();
      expect(read!.kind, `the reader read ${read?.kind} for ${target}`).toBe("queue");
      const queue = (read as { kind: "queue"; queue: { page: { rows: { targetId: string }[]; appliedFilters: unknown } } }).queue;
      expect(queue.page.rows.length).toBeGreaterThan(0);
      expect(queue.page.rows.every((row) => row.targetId === "dep_live_01")).toBe(true);
      expect(queue.page.appliedFilters).toEqual([{ field: "target_id", value: target }]);
    });
  }
});
