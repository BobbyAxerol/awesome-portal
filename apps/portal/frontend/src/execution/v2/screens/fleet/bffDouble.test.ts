/**
 * The Playwright double's `GET /alphas` answers must be a response the real
 * reader accepts, for every filter combination a spec can ask for, and must
 * keep the fixture row the V1 journeys assert byte for byte.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { alphaFleet } from "../../../../../e2e/bffDouble";
import { readAlphaFleet, type AlphaFleetItem } from "../../../api/profileRead";

const FIXTURE = resolve(__dirname, "../../../../../../../../packages/contracts/fixtures/execution-alpha-fleet-list.v2.valid.json");
const canonical = JSON.parse(readFileSync(FIXTURE, "utf8")) as { page: { rows: unknown[] } };

function ask(query: Record<string, string> = {}) {
  const answer = alphaFleet(new URLSearchParams(query));
  return { answer, envelope: answer.status === 200 ? readAlphaFleet(answer.body) : null };
}

const STAGES = ["", "PAPER", "SANDBOX", "CANARY", "LIVE", "RESEARCH"];
const OWNERS = ["", "Bobby-001", "Lan-002", "Minh-003", "Nobody"];
const HEALTHS = ["", "READY", "ATTENTION", "RESEARCH_ONLY"];
const SEARCHES = ["", "grid", "CARRY", "zzz"];

const labelsOf = (rows: readonly AlphaFleetItem[]) => rows.map((r) => r.alphaLabel);

describe("alphaFleet() double", () => {
  it("keeps the canonical first row byte for byte and leads with it", () => {
    const { answer, envelope } = ask();
    expect(answer.status).toBe(200);
    const body = answer.body as { page: { rows: unknown[] } };
    expect(body.page.rows[0]).toEqual(canonical.page.rows[0]);
    expect(envelope?.page.rows[0]?.alphaId).toBe("alpha_a");
  });

  it("publishes five distinct alphas: owners, every stage, health, attention, several deployments", () => {
    const rows = ask().envelope!.page.rows;
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.alphaId)).size).toBe(5);
    expect(new Set(rows.flatMap((r) => (r.owner ? [r.owner] : []))).size).toBeGreaterThanOrEqual(3);
    expect(new Set(rows.flatMap((r) => r.stages))).toEqual(new Set(["PAPER", "SANDBOX", "CANARY", "LIVE", "RESEARCH"]));
    expect(rows.some((r) => r.health === "ATTENTION" && r.attentionReasons.length > 0)).toBe(true);
    expect(rows.some((r) => r.deployments.length > 1)).toBe(true);
    expect(rows.some((r) => r.owner === null)).toBe(true);
    expect(ask().envelope!.summary).toMatchObject({ alphaCount: 5, needsAttentionCount: 1, researchOnlyCount: 1 });
  });

  const combos = STAGES.flatMap((stage) => OWNERS.flatMap((owner) => HEALTHS.flatMap((health) => SEARCHES.map((search) => ({ stage, owner, health, search })))));

  it.each(combos.map((c) => [JSON.stringify(c), c] as const))("%s validates through readAlphaFleet and honours every filter", (_name, c) => {
    const query: Record<string, string> = {};
    if (c.stage) query.stage = c.stage;
    if (c.owner) query.owner = c.owner;
    if (c.health) query.health = c.health;
    if (c.search) query.search = c.search;
    const { answer, envelope } = ask(query);
    expect(answer.status).toBe(200);
    expect(envelope).not.toBeNull();
    const { rows, filteredCount, totalCount, hasMore } = envelope!.page;
    expect(rows).toHaveLength(filteredCount);
    expect(totalCount).toBe(5);
    expect(hasMore).toBe(false);
    for (const r of rows) {
      if (c.stage) expect(r.stages).toContain(c.stage);
      if (c.owner) expect(r.owner).toBe(c.owner);
      if (c.health) expect(r.health).toBe(c.health);
      if (c.search) expect(r.alphaLabel.toLowerCase()).toContain(c.search.toLowerCase());
    }
    // The summary describes every authorized alpha, whatever the filters.
    expect(envelope!.summary?.alphaCount).toBe(5);
  });

  it("the stage lens answers: Paper holds the paper alphas, Real-funded stages hold the funded ones", () => {
    expect(labelsOf(ask({ stage: "PAPER" }).envelope!.page.rows)).toEqual(["Carry A", "Grid D"]);
    expect(labelsOf(ask({ stage: "SANDBOX" }).envelope!.page.rows)).toEqual(["Grid D"]);
    expect(labelsOf(ask({ stage: "CANARY" }).envelope!.page.rows)).toEqual(["Basis B", "Momentum C"]);
    expect(labelsOf(ask({ stage: "LIVE" }).envelope!.page.rows)).toEqual(["Basis B"]);
  });

  it("sorts on the published fields and refuses others", () => {
    expect(labelsOf(ask({ sort: "alpha_label:asc" }).envelope!.page.rows)).toEqual(["Basis B", "Carry A", "Grid D", "Idea E", "Momentum C"]);
    expect(labelsOf(ask({ sort: "-alpha_label" }).envelope!.page.rows)).toEqual(["Momentum C", "Idea E", "Grid D", "Carry A", "Basis B"]);
    expect(ask({ sort: "stage_rank:desc" }).envelope!.page.rows[0]?.alphaLabel).toBe("Basis B");
    expect(ask({ sort: "updated_at:desc" }).envelope!.page.rows[0]?.alphaLabel).toBe("Basis B");
    expect(ask({ sort: "health:asc" }).envelope!.page.rows[0]?.health).toBe("ATTENTION");
    expect(ask({ sort: "net_pnl:desc" }).answer.status).toBe(400);
    expect(ask({ sort: "alpha_label:sideways" }).answer.status).toBe(400);
  });

  it("pages by keyset cursor: every alpha once, in order, with a next cursor until the end", () => {
    const seen: string[] = [];
    let after: string | null = null;
    let pages = 0;
    do {
      const { envelope }: { envelope: ReturnType<typeof readAlphaFleet> } = ask({ limit: "2", ...(after ? { after } : {}) });
      const page = envelope!.page;
      expect(page.rows.length).toBeLessThanOrEqual(2);
      expect(page.hasPrevious).toBe(pages > 0);
      seen.push(...page.rows.map((r) => r.alphaId));
      expect(page.hasMore).toBe(page.nextCursor !== null);
      after = page.nextCursor;
      pages += 1;
    } while (after && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toEqual(["alpha_a", "alpha_b", "alpha_c", "alpha_d", "alpha_e"]);
  });

  it("pages a filtered, sorted query consistently and goes back with `before`", () => {
    const first = ask({ stage: "CANARY", limit: "1", sort: "alpha_label:asc" }).envelope!.page;
    expect(first.rows.map((r) => r.alphaId)).toEqual(["alpha_b"]);
    expect(first.filteredCount).toBe(2);
    const second = ask({ stage: "CANARY", limit: "1", sort: "alpha_label:asc", after: first.nextCursor! }).envelope!.page;
    expect(second.rows.map((r) => r.alphaId)).toEqual(["alpha_c"]);
    expect(second.hasMore).toBe(false);
    const back = ask({ stage: "CANARY", limit: "1", sort: "alpha_label:asc", before: second.prevCursor! }).envelope!.page;
    expect(back.rows.map((r) => r.alphaId)).toEqual(["alpha_b"]);
  });

  it("refuses a cursor from another query and a bad limit", () => {
    expect(ask({ stage: "LIVE", after: "alpha_a" }).answer.status).toBe(400);
    expect(ask({ limit: "0" }).answer.status).toBe(400);
    expect(ask({ limit: "201" }).answer.status).toBe(400);
  });
});
