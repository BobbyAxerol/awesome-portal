// @vitest-environment node
/**
 * FE-CAT-2 on the fixture lane (FIXTURE_LAB, `e2e/bffDoubleV2.ts`, opt-in `simulated`): the operations queue serves health counts
 * and row axes with a counted zero, a typed null and (simulation off) an omitted block. Counts are over the filtered set, not the page.
 */
import { describe, expect, it } from "vitest";

import { answerExecutionBff, type BffDoubleOptions } from "../../e2e/bffDouble";
import { readIncidentRootV2, readOperationalQueueV2 } from "../execution/v2/readers/operationalQueue";

const OFF: BffDoubleOptions = { operationsV2: true, screensV2: true };
const ON: BffDoubleOptions = { operationsV2: true, screensV2: true, simulated: true };
const ask = (options: BffDoubleOptions, query: Record<string, string> = {}) =>
  answerExecutionBff("GET", "/api/v1/execution/operations", new URLSearchParams(query), options).body;
const queue = (options: BffDoubleOptions, query: Record<string, string> = {}) => {
  const read = readOperationalQueueV2(ask(options, query));
  if (read === null || read.kind !== "queue") throw new Error("unreadable queue");
  return read.queue.page;
};

describe("opt-in", () => {
  it("off: no health block and no row axes", () => {
    const body = ask(OFF) as { page: { health?: unknown; rows: Record<string, unknown>[] } };
    expect(body.page.health).toBeUndefined();
    expect(body.page.rows.every((row) => !("delivery_state" in row) && !("display_state" in row))).toBe(true);
    expect(queue(OFF).health).toBeUndefined();
  });
});

describe("on", () => {
  it("pending receipts are counted over the whole filtered set, not the loaded page", () => {
    const page = queue(ON, { limit: "5" });
    expect(page.rows).toHaveLength(5);
    const everything = queue(ON, { limit: "250" });
    const pending = everything.rows.filter((row) => row.deliveryState === "AWAITING_RECEIPT").length;
    expect(page.health!.pendingReceipt!.count).toBe(pending);
    expect(pending).toBeGreaterThan(page.rows.filter((row) => row.deliveryState === "AWAITING_RECEIPT").length - 1);
    expect(page.health!.pendingReceipt).toMatchObject({ coverage: "COMPLETE" });
  });

  it("a filter narrows the counts with the set (same snapshot, same filters)", () => {
    const succeeded = queue(ON, { limit: "250", source_status: "SUCCEEDED" });
    const awaiting = succeeded.rows.filter((row) => row.deliveryState === "AWAITING_RECEIPT").length;
    expect(succeeded.health!.pendingReceipt!.count).toBe(awaiting);
    expect(awaiting).toBeLessThan(queue(ON, { limit: "250" }).health!.pendingReceipt!.count!);
  });

  it("serves display lag as counted over the filtered set, a floor while some row did not report, and an exact count once none is missing", () => {
    const all = queue(ON, { limit: "250" });
    const hasBlocked = all.rows.some((row) => row.displayState === null);
    const catching = all.rows.filter((row) => row.displayState === "CATCHING_UP").length;
    expect(catching).toBeGreaterThanOrEqual(3);
    expect(all.health!.displayLag).toMatchObject({ count: catching, coverage: hasBlocked ? "PARTIAL" : "COMPLETE" });
    const confirmed = queue(ON, { limit: "250", source_status: "PENDING" });
    expect(confirmed.health!.displayLag!.count).toBe(confirmed.rows.filter((row) => row.displayState === "CATCHING_UP").length);
  });

  it("a row with no reported display carries null (the source did not report it); the named rows show every badge", () => {
    const blocked = queue(ON, { limit: "250", source_status: "BLOCKED" });
    expect(blocked.rows.length).toBeGreaterThan(0);
    expect(blocked.rows.every((row) => row.displayState === null && row.deliveryState === "NOT_APPLICABLE")).toBe(true);
    const all = queue(ON, { limit: "250" });
    const displays = new Set(all.rows.map((row) => row.displayState));
    const deliveries = new Set(all.rows.map((row) => row.deliveryState));
    expect([...displays].sort()).toEqual([null, "CATCHING_UP", "CURRENT", "STALE"].sort());
    expect([...deliveries].sort()).toEqual(["AWAITING_RECEIPT", "NOT_APPLICABLE", "RECEIPT_CONFIRMED", "RECEIPT_FAILED"]);
  });
});

describe("on: incident links and open exceptions (WP-B, FE-042)", () => {
  it("rows carry links that agree with the incident root the route answers", () => {
    const all = queue(ON, { limit: "250" });
    const linked = all.rows.filter((row) => (row.incidentLinks?.items.length ?? 0) > 0);
    expect(linked.length).toBeGreaterThanOrEqual(6);
    const one = linked.flatMap((row) => row.incidentLinks!.items).find((item) => item.state === "LINKED");
    expect(one).toBeDefined();
    if (one?.state !== "LINKED") return;
    const root = readIncidentRootV2(answerExecutionBff("GET", `/api/v1/execution/operations/incidents/${one.incidentId}`, new URLSearchParams(), ON).body);
    expect(root?.kind).toBe("incident");
    if (root?.kind !== "incident") return;
    expect(root.incident).toMatchObject({ targetType: one.incident.targetType, targetId: one.incident.targetId, severity: one.incident.severity, workflowState: one.incident.workflowState });
  });

  it("is many to many: an incident is linked from two operations and an operation names two incidents", () => {
    const rows = queue(ON, { limit: "250" }).rows;
    const byIncident = new Map<string, number>();
    for (const row of rows) for (const link of row.incidentLinks?.items ?? []) if (link.state === "LINKED") byIncident.set(link.incidentId, (byIncident.get(link.incidentId) ?? 0) + 1);
    expect(Math.max(...byIncident.values())).toBeGreaterThanOrEqual(2);
    expect(rows.some((row) => (row.incidentLinks?.authorizedLinkCount ?? 0) >= 2)).toBe(true);
  });

  it("open exceptions are counted from the OPEN incidents of the filtered set (a true zero stays 0), complete", () => {
    expect(queue(ON, { limit: "250" }).health!.openException).toMatchObject({ count: 4, coverage: "COMPLETE" }); // WP-B2-S3: 3 -> 4, the world now holds the open reconciliation incident of Carry A's Live deployment (QA7 R5-03)
    expect(queue(ON, { limit: "250", target_id: "acc_TEST_ONLY_binance02" }).health!.openException).toMatchObject({ count: 0, coverage: "COMPLETE" });
  });

  it("off: no links, and the unchanged incident root for a simulated id", () => {
    const rows = (ask(OFF) as { page: { rows: Record<string, unknown>[] } }).page.rows;
    expect(rows.every((row) => !("incident_links" in row))).toBe(true);
    const root = answerExecutionBff("GET", "/api/v1/execution/operations/incidents/inc_TEST_ONLY_fx_recall", new URLSearchParams(), OFF).body as Record<string, unknown>;
    expect(root.severity).toBe("WARNING");
    expect(root.workflow_state).toBe("OPEN");
    expect(root.target).toEqual({ type: "ACCOUNT", id: "acc_TEST_ONLY_operational" });
  });
});
