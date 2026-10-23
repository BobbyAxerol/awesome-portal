import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { QueryResultRow } from "pg";
import type { GroupedCountSpec, PostgresSnapshotReader } from "../src/query";
import { operationalQueue } from "../src/operations/operational-read.contract";
import { OPERATIONAL_QUEUE_TOTAL_DEADLINE_MS, QUEUE_NOT_REPORTED, operationalQueueResource, queueHealth, queueHealthResource,
  readQueueSnapshot, type QueueHealthPlan } from "../src/operations/operational-read.service";

// FE-CAT-2. In-process only (no database): the plan, the counting rules and the contract invariants. The engine's own SQL scope
// predicate is covered by the PostgreSQL specs, which are skipped without a database and are not claimed here.

const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../packages/contracts/fixtures/execution-operational-queue-health.synthetic.valid.json"), "utf8")).queue;
const repository = { incidentLinks: async () => [] as readonly QueryResultRow[] };
const SCOPE = { allowed: true } as never;

/** A lent snapshot over a tiny table in which some rows are hidden by the scope; grouped counts apply the scope and ALL filters, as the engine does. */
function lentOver(table: { operation_id: string; visible: boolean; delivery_state: string; display_state: string }[], pageIds: string[]) {
  const specs: GroupedCountSpec[] = [];
  const authorized = table.filter(row => row.visible);
  const lent: PostgresSnapshotReader<QueryResultRow> = {
    rows: authorized.filter(row => pageIds.includes(row.operation_id)),
    query: async () => [],
    groupedCounts: async spec => {
      specs.push(spec);
      const groups = new Map<string, number>();
      for (const row of authorized) {
        const value = (row as Record<string, unknown>)[spec.column] as string;
        if (spec.column === "delivery_state" || spec.column === "display_state" || spec.column === "severity" || spec.column === "triage_state" ||
          spec.column === "verification_result" || spec.column === "source_status") groups.set(value ?? "x", (groups.get(value ?? "x") ?? 0) + 1);
      }
      return groups;
    },
  };
  return { lent, specs, authorized };
}
const row = (id: string, visible: boolean, delivery: string, display: string) =>
  ({ operation_id: id, visible, delivery_state: delivery, display_state: display, severity: "INFO", triage_state: "UNACKNOWLEDGED",
    verification_result: "PENDING", source_status: "PENDING" });
const plan: QueueHealthPlan = { delivery: true, display: true };

describe("no source named: nothing is published", () => {
  it("production wiring has no plan, no extra column and no extra statement", async () => {
    expect(operationalQueueResource.selectColumns).not.toContain("delivery_state");
    expect(operationalQueueResource.selectColumns).not.toContain("display_state");
    expect(OPERATIONAL_QUEUE_TOTAL_DEADLINE_MS).toBe(5000);
    const { lent, specs } = lentOver([row("a", true, "AWAITING_RECEIPT", "CURRENT")], ["a"]);
    const snapshot = await readQueueSnapshot(repository, "ws", SCOPE, [], lent);
    expect(snapshot.health).toBeUndefined();
    expect(snapshot.axes).toBeUndefined();
    expect(specs.map(spec => spec.column)).toEqual(["triage_state", "verification_result", "source_status", "severity"]);
    expect(queueHealth(snapshot.health, 1, "2026-10-23T10:00:00.000Z")).toBeUndefined();
    expect(queueHealth({}, 1, "2026-10-23T10:00:00.000Z")).toBeUndefined();
  });

  it("the plan only adds selectable and countable columns when it names them", () => {
    expect(queueHealthResource({}).selectColumns).toEqual(operationalQueueResource.selectColumns);
    const both = queueHealthResource(plan);
    expect(both.selectColumns).toEqual([...operationalQueueResource.selectColumns, "delivery_state", "display_state"]);
    expect(Object.keys(both.filters!)).toContain("delivery_state");
    expect(Object.keys(operationalQueueResource.filters)).not.toContain("delivery_state");
  });
});

describe("authorization before count: counts cover the whole authorized filtered set", () => {
  const table = [
    row("a", true, "AWAITING_RECEIPT", "CURRENT"), row("b", true, "AWAITING_RECEIPT", "CATCHING_UP"), row("c", true, "RECEIPT_CONFIRMED", "CURRENT"),
    row("d", true, "AWAITING_RECEIPT", "CURRENT"), row("e", true, "NOT_APPLICABLE", "CURRENT"),
    // Hidden by the scope: awaiting and catching up, and they must change nothing.
    row("h1", false, "AWAITING_RECEIPT", "CATCHING_UP"), row("h2", false, "AWAITING_RECEIPT", "CATCHING_UP"),
  ];

  it("counts from the engine's grouped counts under ALL filters, not from the one loaded row, and never a hidden row", async () => {
    const { lent, specs, authorized } = lentOver(table, ["a"]);
    const snapshot = await readQueueSnapshot(repository, "ws", SCOPE, [{ field: "severity", op: "eq", value: "INFO" }], lent, plan);
    const health = queueHealth(snapshot.health, authorized.length, "2026-10-23T10:00:00.000Z")!;
    // 3 authorized rows await a receipt (a, b, d); the page shows only `a`; the 2 hidden rows are in no number.
    expect(health.pending_receipt_count).toEqual({ count: 3, observed_at: "2026-10-23T10:00:00.000Z", coverage: "COMPLETE" });
    expect(health.display_lag_count).toEqual({ count: 1, observed_at: "2026-10-23T10:00:00.000Z", coverage: "COMPLETE" });
    const health_specs = specs.filter(spec => spec.column === "delivery_state" || spec.column === "display_state");
    expect(health_specs).toHaveLength(2);
    for (const spec of health_specs) expect(spec.excludeFilterFields).toEqual([]); // no filter dropped: the whole filtered set
  });

  it("a counted zero is 0 with COMPLETE coverage, not null and not omitted", async () => {
    const { lent, authorized } = lentOver([row("a", true, "RECEIPT_CONFIRMED", "CURRENT"), row("b", true, "NOT_APPLICABLE", "CURRENT")], ["a"]);
    const snapshot = await readQueueSnapshot(repository, "ws", SCOPE, [], lent, plan);
    const health = queueHealth(snapshot.health, authorized.length, "2026-10-23T10:00:00.000Z")!;
    expect(health.pending_receipt_count).toMatchObject({ count: 0, coverage: "COMPLETE" });
    expect(health.display_lag_count).toMatchObject({ count: 0, coverage: "COMPLETE" });
  });

  it("rows that did not report an axis make the count a floor (PARTIAL) and publish null on the row", async () => {
    const { lent, authorized } = lentOver([row("a", true, QUEUE_NOT_REPORTED, "CURRENT"), row("b", true, "AWAITING_RECEIPT", QUEUE_NOT_REPORTED)], ["a", "b"]);
    const snapshot = await readQueueSnapshot(repository, "ws", SCOPE, [], lent, plan);
    const health = queueHealth(snapshot.health, authorized.length, "2026-10-23T10:00:00.000Z")!;
    expect(health.pending_receipt_count).toMatchObject({ count: 1, coverage: "PARTIAL" });
    expect(health.display_lag_count).toMatchObject({ count: 0, coverage: "PARTIAL" });
    expect(snapshot.axes!.get("a")).toEqual({ delivery_state: null, display_state: "CURRENT" });
    expect(snapshot.axes!.get("b")).toEqual({ delivery_state: "AWAITING_RECEIPT", display_state: null });
  });

  it("fails closed when the groups do not add up to the filtered set, or hold a value outside the domain", async () => {
    const groups = new Map([["AWAITING_RECEIPT", 2]]);
    expect(() => queueHealth({ delivery: groups }, 3, "2026-10-23T10:00:00.000Z")).toThrow();
    expect(() => queueHealth({ delivery: new Map([["SHIPPED", 3]]) }, 3, "2026-10-23T10:00:00.000Z")).toThrow();
    const { lent } = lentOver([row("a", true, "SHIPPED", "CURRENT")], ["a"]);
    await expect(readQueueSnapshot(repository, "ws", SCOPE, [], lent, plan)).rejects.toThrow();
  });

  it("open exceptions: a number is COMPLETE, a source that did not report is null with UNKNOWN, no source is omitted", async () => {
    const at = "2026-10-23T10:00:00.000Z";
    expect(queueHealth({ exceptions: { count: 4 } }, 9, at)!.open_exception_count).toEqual({ count: 4, observed_at: at, coverage: "COMPLETE" });
    expect(queueHealth({ exceptions: { count: 0 } }, 9, at)!.open_exception_count).toMatchObject({ count: 0 });
    expect(queueHealth({ exceptions: { count: null } }, 9, at)!.open_exception_count).toEqual({ count: null, observed_at: null, coverage: "UNKNOWN" });
    expect(Object.hasOwn(queueHealth({ delivery: new Map([["NOT_APPLICABLE", 1]]) }, 1, at)!, "open_exception_count")).toBe(false);
    const exceptions = vi.fn(async () => ({ count: 2 }));
    const { lent } = lentOver([row("a", true, "NOT_APPLICABLE", "CURRENT")], ["a"]);
    const snapshot = await readQueueSnapshot(repository, "ws", SCOPE, [], lent, { exceptions });
    expect(exceptions).toHaveBeenCalledTimes(1);
    expect(snapshot.health!.exceptions).toEqual({ count: 2 });
  });
});

describe("the contract", () => {
  it("accepts the published health fixture and the L0 shape without health", () => {
    expect(operationalQueue.safeParse(fixture).success).toBe(true);
    const legacy = structuredClone(fixture);
    delete legacy.page.health;
    for (const item of legacy.page.rows) { delete item.delivery_state; delete item.display_state; }
    expect(operationalQueue.safeParse(legacy).success).toBe(true);
  });

  it("rejects a count above the filtered set, below the rows it must include, or with an impossible null/coverage pair", () => {
    const edit = (change: (queue: any) => void) => { const next = structuredClone(fixture); change(next); return operationalQueue.safeParse(next).success; };
    expect(edit(q => { q.page.health.pending_receipt_count.count = q.page.filtered_count + 1; })).toBe(false);
    expect(edit(q => { q.page.health.pending_receipt_count.count = 0; })).toBe(false); // row b awaits a receipt and is on the page
    expect(edit(q => { q.page.health.open_exception_count = { count: null, observed_at: null, coverage: "COMPLETE" }; })).toBe(false);
    expect(edit(q => { q.page.health.display_lag_count = { count: 0, observed_at: null, coverage: "COMPLETE" }; })).toBe(false);
    expect(edit(q => { q.page.health.display_lag_count.count = -1; })).toBe(false);
    expect(edit(q => { q.page.health.basis = "LOADED_ROWS"; })).toBe(false);
    expect(edit(q => { q.page.health.extra = 1; })).toBe(false);
    expect(edit(q => { q.page.rows[0].delivery_state = "SHIPPED"; })).toBe(false);
    expect(edit(q => { q.page.rows[0].display_state = null; })).toBe(true); // typed null is allowed
  });

  it("the queue read still rejects a stray key on the row", () => {
    const next = structuredClone(fixture);
    next.page.rows[0].private_note = "x";
    expect(operationalQueue.safeParse(next).success).toBe(false);
  });
});
