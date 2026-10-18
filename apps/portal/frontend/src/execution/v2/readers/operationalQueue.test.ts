/**
 * V2 operations readers against the canonical contract fixture.
 *
 * The fixture is read from `packages/contracts/fixtures` so a contract change
 * fails here; the negative cases are mutations of it, never a second copy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  INCIDENT_ROOT_V2_SCHEMA,
  OPERATIONAL_QUEUE_V2_SCHEMA,
  operationalQueueSearch,
  readIncidentRootV2,
  readInstant,
  readOperationalQueueV2,
  type OperationalQueueReadV2,
} from "./operationalQueue";

const FIXTURE = JSON.parse(
  readFileSync(
    join(__dirname, "../../../../../../../packages/contracts/fixtures/execution-operational-current.synthetic.valid.json"),
    "utf8",
  ),
) as { queue: Record<string, any>; incident: Record<string, any> };

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const queueWith = (edit: (q: Record<string, any>) => void) => {
  const q = clone(FIXTURE.queue);
  edit(q);
  return q;
};
const incidentWith = (edit: (i: Record<string, any>) => void) => {
  const i = clone(FIXTURE.incident);
  edit(i);
  return i;
};

function asQueue(read: OperationalQueueReadV2 | null) {
  if (read === null || read.kind !== "queue") throw new Error("expected a V2 queue read");
  return read.queue;
}

describe("queue reader", () => {
  it("reads the contract fixture", () => {
    const queue = asQueue(readOperationalQueueV2(FIXTURE.queue));
    expect(queue.workspaceId).toBe("ws_TEST_ONLY_operational");
    expect(queue.sourceIntegrationState).toBe("UNAVAILABLE");
    expect(queue.sourceAsOfMs).toBeNull();
    expect(queue.readTruth).toEqual({ state: "AVAILABLE", reasonCode: null });
    expect(queue.page.rows).toHaveLength(1);
    const row = queue.page.rows[0];
    expect(row.operationId).toBe("op_01K3COMMANDPLAN000000000000");
    expect(row.commandKey).toBe("account/sync");
    expect(row.targetType).toBe("ACCOUNT");
    expect(row.sourceStatus).toBe("BLOCKED");
    expect(row.verificationResult).toBe("NOT_STARTED");
    expect(row.triageState).toBe("UNACKNOWLEDGED");
    expect(row.createdAt.ms).toBe(Date.parse("2026-08-22T12:00:00Z"));
  });

  it("normalises the uppercase environment for display and filters, and keeps the wire value", () => {
    const row = asQueue(readOperationalQueueV2(FIXTURE.queue)).page.rows[0];
    expect(row.environmentWire).toBe("PAPER");
    expect(row.environment).toBe("paper");
  });

  it("refuses a lowercase environment: V2 writes it uppercase and a mixed spelling is not repaired", () => {
    const q = queueWith((x) => { x.page.rows[0].environment = "paper"; });
    expect(readOperationalQueueV2(q)).toBeNull();
  });

  it("reads the pagination fields as the server stated them", () => {
    const q = queueWith((x) => {
      x.page.total_count = 40;
      x.page.filtered_count = 12;
      x.page.next_cursor = "next_opaque";
      x.page.has_more = true;
      x.page.prev_cursor = "prev_opaque";
      x.page.has_previous = true;
      x.page.applied_filters = [{ field: "severity", op: "eq", value: "WARNING" }];
    });
    const page = asQueue(readOperationalQueueV2(q)).page;
    expect(page).toMatchObject({
      totalCount: 40, filteredCount: 12, nextCursor: "next_opaque", prevCursor: "prev_opaque",
      hasMore: true, hasPrevious: true,
    });
    expect(page.appliedFilters).toEqual([{ field: "severity", value: "WARNING" }]);
    expect(page.appliedSort).toEqual([
      { field: "created_at", direction: "desc" },
      { field: "operation_id", direction: "desc" },
    ]);
  });

  it("answers unsupported_shape for the legacy queue instead of reading it as V2", () => {
    const legacy = { schema_version: "execution.operations-queue.v1", page: { rows: [] } };
    expect(readOperationalQueueV2(legacy)).toEqual({ kind: "unsupported_shape", schemaVersion: "execution.operations-queue.v1" });
  });

  it("answers unsupported_shape with no version for a body that names none, and null for a non-object", () => {
    expect(readOperationalQueueV2({ page: {} })).toEqual({ kind: "unsupported_shape", schemaVersion: null });
    expect(readOperationalQueueV2("nope")).toBeNull();
    expect(readOperationalQueueV2(null)).toBeNull();
    expect(readOperationalQueueV2([FIXTURE.queue])).toBeNull();
  });

  it("an incident root is not a queue", () => {
    expect(readOperationalQueueV2(FIXTURE.incident)).toEqual({ kind: "unsupported_shape", schemaVersion: INCIDENT_ROOT_V2_SCHEMA });
  });

  it.each([
    ["a row with an unknown severity", (q: Record<string, any>) => { q.page.rows[0].severity = "FATAL"; }],
    ["a row with a non-ISO time", (q: Record<string, any>) => { q.page.rows[0].created_at = "22 Aug 2026"; }],
    ["a row that updated before it was created", (q: Record<string, any>) => { q.page.rows[0].updated_at = "2026-08-22T11:00:00Z"; }],
    ["an unacknowledged row that carries a resolution", (q: Record<string, any>) => { q.page.rows[0].resolved_at = "2026-08-22T12:30:00Z"; }],
    ["a resolved row with no resolution time", (q: Record<string, any>) => { q.page.rows[0].triage_state = "RESOLVED"; }],
    ["a missing row grain", (q: Record<string, any>) => { delete q.page.rows[0].operation_id; }],
    ["a missing page", (q: Record<string, any>) => { delete q.page; }],
    ["filtered above total", (q: Record<string, any>) => { q.page.filtered_count = 9; }],
    ["fewer filtered than rows", (q: Record<string, any>) => { q.page.filtered_count = 0; q.page.total_count = 1; }],
    ["has_more without a cursor", (q: Record<string, any>) => { q.page.has_more = true; }],
    ["a cursor without has_more", (q: Record<string, any>) => { q.page.next_cursor = "x"; }],
    ["a source_as_of that is not null or a time", (q: Record<string, any>) => { q.source_as_of_ms = "soon"; }],
    ["a source side effect that is not exactly false", (q: Record<string, any>) => { delete q.source_side_effect_requested; }],
    ["a source integration that is not UNAVAILABLE", (q: Record<string, any>) => { q.source_integration_state = "AVAILABLE"; }],
    ["an EMPTY read that carries rows", (q: Record<string, any>) => { q.read_truth.state = "EMPTY"; }],
    ["a read truth of another scope", (q: Record<string, any>) => { q.read_truth.scope = "GLOBAL"; }],
    ["an applied filter that is not eq", (q: Record<string, any>) => { q.page.applied_filters = [{ field: "severity", op: "like", value: "W" }]; }],
  ])("is malformed (null) with %s", (_name, edit) => {
    expect(readOperationalQueueV2(queueWith(edit))).toBeNull();
  });

  it("one bad row voids the page; no row is silently dropped", () => {
    const q = queueWith((x) => {
      x.page.rows.push({ ...x.page.rows[0], operation_id: "op_second", severity: "FATAL" });
      x.page.total_count = 2;
      x.page.filtered_count = 2;
    });
    expect(readOperationalQueueV2(q)).toBeNull();
  });

  it("reads an EMPTY page with no rows", () => {
    const q = queueWith((x) => {
      x.read_truth.state = "EMPTY";
      x.page.rows = [];
      x.page.filtered_count = 0;
    });
    const queue = asQueue(readOperationalQueueV2(q));
    expect(queue.readTruth.state).toBe("EMPTY");
    expect(queue.page.rows).toEqual([]);
  });

  it("keeps microseconds in the instant text and uses milliseconds for ordering", () => {
    const q = queueWith((x) => {
      x.page.rows[0].created_at = "2026-08-22T12:00:00.123456Z";
      x.page.rows[0].updated_at = "2026-08-22T12:00:00.123999Z";
    });
    const row = asQueue(readOperationalQueueV2(q)).page.rows[0];
    expect(row.createdAt.iso).toBe("2026-08-22T12:00:00.123456Z");
    expect(row.createdAt.ms).toBe(Date.parse("2026-08-22T12:00:00.123Z"));
  });
});

describe("instants", () => {
  it("accepts Z and +00:00 with up to nine fractional digits", () => {
    expect(readInstant("2026-08-22T12:00:00Z")).not.toBeNull();
    expect(readInstant("2026-08-22T12:00:00.123456789Z")).not.toBeNull();
    expect(readInstant("2026-08-22T12:00:00+00:00")).not.toBeNull();
  });
  it("refuses a zone offset, a date alone, and a number", () => {
    expect(readInstant("2026-08-22T12:00:00+07:00")).toBeNull();
    expect(readInstant("2026-08-22")).toBeNull();
    expect(readInstant(1_787_400_000_000)).toBeNull();
    expect(readInstant(null)).toBeNull();
  });
});

describe("incident root reader", () => {
  it("reads the contract fixture", () => {
    const read = readIncidentRootV2(FIXTURE.incident);
    if (read === null || read.kind !== "incident") throw new Error("expected an incident read");
    expect(read.incident).toMatchObject({
      incidentId: "inc_TEST_ONLY_operational",
      workflowState: "OPEN",
      severity: "WARNING",
      environment: "paper",
      environmentWire: "PAPER",
      targetType: "ACCOUNT",
      workflowVersion: 1,
      sourceIntegrationState: "UNAVAILABLE",
      historicalChildren: { availability: "NOT_PUBLISHED", reasonCode: "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED" },
    });
    expect(read.incident.mitigatedAt).toBeNull();
  });

  it("answers unsupported_shape for the legacy incident detail", () => {
    expect(readIncidentRootV2({ schema_version: "execution.incident-detail.v1", incident: {} })).toEqual({
      kind: "unsupported_shape",
      schemaVersion: "execution.incident-detail.v1",
    });
    expect(readIncidentRootV2(FIXTURE.queue)).toEqual({ kind: "unsupported_shape", schemaVersion: OPERATIONAL_QUEUE_V2_SCHEMA });
  });

  it.each([
    ["MITIGATED without a mitigation time", (i: Record<string, any>) => { i.workflow_state = "MITIGATED"; }],
    ["OPEN with a resolution", (i: Record<string, any>) => { i.resolved_at = "2026-08-22T13:00:00Z"; }],
    ["RESOLVED without a resolution", (i: Record<string, any>) => { i.workflow_state = "RESOLVED"; }],
    ["an unknown workflow state", (i: Record<string, any>) => { i.workflow_state = "REOPENED"; }],
    ["children that claim to be published", (i: Record<string, any>) => { i.historical_children.availability = "AVAILABLE"; }],
    ["children without a reason code", (i: Record<string, any>) => { delete i.historical_children.reason_code; }],
    ["a deployment resume that is not exactly false", (i: Record<string, any>) => { delete i.deployment_resume_requested; }],
    ["a different record basis", (i: Record<string, any>) => { i.record_basis = "HISTORICAL_LINEAGE"; }],
    ["a missing observed time", (i: Record<string, any>) => { delete i.observed_at_ms; }],
    ["a lowercase environment", (i: Record<string, any>) => { i.environment = "paper"; }],
  ])("is malformed (null) with %s", (_name, edit) => {
    expect(readIncidentRootV2(incidentWith(edit))).toBeNull();
  });

  it("reads MITIGATED and RESOLVED with their timestamps", () => {
    const mitigated = readIncidentRootV2(incidentWith((i) => {
      i.workflow_state = "MITIGATED";
      i.mitigated_at = "2026-08-22T12:30:00Z";
    }));
    expect(mitigated?.kind === "incident" && mitigated.incident.workflowState).toBe("MITIGATED");
    const resolved = readIncidentRootV2(incidentWith((i) => {
      i.workflow_state = "RESOLVED";
      i.mitigated_at = "2026-08-22T12:30:00Z";
      i.resolved_at = "2026-08-22T12:45:00Z";
    }));
    expect(resolved?.kind === "incident" && resolved.incident.resolvedAt?.iso).toBe("2026-08-22T12:45:00Z");
  });
});

describe("query string", () => {
  it("writes the environment UPPERCASE and drops empty values", () => {
    const params = operationalQueueSearch({
      workspaceId: "ws_1", environment: "live", severity: "ERROR", verificationResult: "UNCERTAIN",
      targetType: "DEPLOYMENT", commandKey: " account/sync ", triageState: "UNACKNOWLEDGED", limit: 50,
      after: "", sort: "created_at:asc",
    });
    expect(Object.fromEntries(params)).toEqual({
      workspace_id: "ws_1", environment: "LIVE", severity: "ERROR", verification_result: "UNCERTAIN",
      target_type: "DEPLOYMENT", command_key: "account/sync", triage_state: "UNACKNOWLEDGED", limit: "50",
      sort: "created_at:asc",
    });
  });

  it("has no assigned_to: the server answers 400 for it", () => {
    expect(operationalQueueSearch({}).has("assigned_to")).toBe(false);
  });
});
