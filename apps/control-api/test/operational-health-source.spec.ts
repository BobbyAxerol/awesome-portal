import { describe, expect, it, vi } from "vitest";
import type { QueryResultRow } from "pg";
import type { PostgresSnapshotReader } from "../src/query";
import type { OperationalAuditCohort } from "../src/operations/current-operational-read";
import { createOperationalQueueHealthSource, type OperationalQueueHealthBinding } from "../src/operations/operational-health-source";
import { queueHealth, queueHealthResource, readQueueSnapshot } from "../src/operations/operational-read.service";

const fingerprint = `sha256:${"a".repeat(64)}`;
const cohort = { fingerprint, context: {}, scope: { fingerprint, columns: ["target_type", "target_id", "environment"],
  allowedTuples: [["ACCOUNT", "acc_allowed", "PAPER"]] } } as unknown as OperationalAuditCohort;
const binding: OperationalQueueHealthBinding = { authority: "PORTAL", source_ref: "portal://qualified-operation-health/cut-7",
  schema_sha256: `sha256:${"b".repeat(64)}`, table: "execution_operation_queue_health_v2",
  delivery_axis: "delivery_state", display_axis: "display_state" };

describe("qualified Operations health runtime binding", () => {
  it("selects only a closed source view and exact source axes, preserving all engine scope/filters", () => {
    const selected = createOperationalQueueHealthSource(binding).select(cohort, { severity: "ERROR" })!;
    expect(selected.table).toBe("execution_operation_queue_health_v2");
    expect(selected.resourceId).toBe("execution.operational-queue.health.v2");
    const resource = queueHealthResource(selected.plan);
    expect(resource.selectColumns).toContain("delivery_state");
    expect(resource.selectColumns).toContain("display_state");
    expect(resource.filters!.severity).toBeDefined();
    expect(resource.filters!.delivery_state).toBeDefined();
  });
  it.each([{ authority: "EDGE" }, { source_ref: "" }, { schema_sha256: "unknown" },
    { table: "execution_operation_queue_v2; DROP TABLE accounts" }, { delivery_axis: "source_status" },
    { display_axis: "triage_state" }, { delivery_axis: null, display_axis: null }])("rejects unsafe/missing provenance or semantic axis %j", delta => {
    expect(() => createOperationalQueueHealthSource({ ...binding, ...delta } as OperationalQueueHealthBinding)).toThrow();
  });
  it("does not mint a scope from configuration", () => {
    expect(() => createOperationalQueueHealthSource(binding).select({ ...cohort,
      scope: { ...cohort.scope, fingerprint: "other" } }, {})).toThrow();
  });
  it("counts full authorized filtered population rather than page rows or queue business state", async () => {
    const specs: unknown[] = [];
    const lent: PostgresSnapshotReader<QueryResultRow> = { rows: [{ operation_id: "op_a", source_status: "SUCCEEDED",
      delivery_state: "AWAITING_RECEIPT", display_state: "CURRENT" }], query: async () => [], groupedCounts: async spec => {
      specs.push(spec);
      if (spec.column === "delivery_state") return new Map([["AWAITING_RECEIPT", 3], ["RECEIPT_CONFIRMED", 1]]);
      if (spec.column === "display_state") return new Map([["CURRENT", 1], ["CATCHING_UP", 2], ["NOT_REPORTED", 1]]);
      if (spec.column === "triage_state") return new Map([["UNACKNOWLEDGED", 4]]);
      if (spec.column === "verification_result") return new Map([["PENDING", 4]]);
      if (spec.column === "source_status") return new Map([["SUCCEEDED", 4]]);
      return new Map([["ERROR", 4]]);
    } };
    const selected = createOperationalQueueHealthSource(binding).select(cohort, { severity: "ERROR" })!;
    const result = await readQueueSnapshot({ incidentLinks: async () => [] }, "ws_a", cohort.scope,
      [{ field: "severity", op: "eq", value: "ERROR" }], lent, selected.plan);
    const health = queueHealth(result.health, 4, "2026-10-25T12:00:00.000Z")!;
    expect(health.pending_receipt_count).toMatchObject({ count: 3, coverage: "COMPLETE" });
    expect(health.display_lag_count).toMatchObject({ count: 2, coverage: "PARTIAL" });
    expect(result.axes!.get("op_a")).toEqual({ delivery_state: "AWAITING_RECEIPT", display_state: "CURRENT" });
    expect(specs).toContainEqual({ column: "delivery_state", excludeFilterFields: [], maxGroups: 5 });
    expect(specs).toContainEqual({ column: "display_state", excludeFilterFields: [], maxGroups: 4 });
  });
  it("passes the same lent transaction, exact cohort and captured filters to a distinct exceptions owner", async () => {
    const exceptions = vi.fn(async () => ({ count: 0 }));
    const filters = { severity: "ERROR" };
    const plan = createOperationalQueueHealthSource({ ...binding, exceptions }).select(cohort, filters)!.plan;
    filters.severity = "INFO";
    const lent = {} as PostgresSnapshotReader<QueryResultRow>;
    expect(await plan.exceptions!(lent)).toEqual({ count: 0 });
    expect(exceptions).toHaveBeenCalledExactlyOnceWith(lent, cohort, { severity: "ERROR" });
    const invalid = createOperationalQueueHealthSource({ ...binding, exceptions: async () => ({ count: -1 }) }).select(cohort, {})!;
    await expect(invalid.plan.exceptions!(lent)).rejects.toThrow();
  });
  it("rejects invalid or page-only group populations instead of blessing fabricated source health", () => {
    const at = "2026-10-25T12:00:00.000Z";
    expect(() => queueHealth({ delivery: new Map([["AWAITING_RECEIPT", 1]]) }, 4, at)).toThrow();
    expect(() => queueHealth({ delivery: new Map([["AWAITING_RECEIPT", -1], ["RECEIPT_CONFIRMED", 5]]) }, 4, at)).toThrow();
    expect(() => queueHealth({ delivery: new Map([["AWAITING_RECEIPT", 0.5], ["RECEIPT_CONFIRMED", 3.5]]) }, 4, at)).toThrow();
  });
});
