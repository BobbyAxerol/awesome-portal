import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { ApprovalRow } from "../../../screens/ApprovalInbox";
import { inboxRowFromV1, mergeInboxRows, readInboxActor, readInboxPageV2, readInboxRowV2, readInboxSla, readRawRows } from "./inboxRowV2";

const FIXTURES = resolve(__dirname, "../../../../../../../../packages/contracts/fixtures");

function fixture(name: string): unknown {
  const path = resolve(FIXTURES, name);
  expect(existsSync(path), path).toBe(true);
  return JSON.parse(readFileSync(path, "utf8"));
}

function wireRow(): Record<string, unknown> {
  const envelope = fixture("execution-governance.approval-inbox.valid.json") as { page: { rows: Record<string, unknown>[] } };
  return structuredClone(envelope.page.rows[0]);
}

function v1Row(over: Partial<ApprovalRow> = {}): ApprovalRow {
  return {
    id: "apr_fixture_r1" as ApprovalRow["id"],
    gate: "R1",
    subject: "Fixture alpha",
    target: "research · R1",
    blockerCount: 0,
    blockerSummary: null,
    sla: { ageMinutes: 5, budgetMinutes: 240, state: "ON_TRACK" },
    quorumMet: 0,
    quorumRequired: 1,
    inert: null,
    needsYou: true,
    ...over,
  };
}

describe("V2 inbox row reader · the canonical contract fixture", () => {
  const page = readInboxPageV2(fixture("execution-governance.approval-inbox.valid.json"));

  it("reads the whole envelope", () => {
    expect(page).not.toBeNull();
    expect(page?.rows).toHaveLength(1);
    expect(page?.dropped).toBe(0);
    expect(page?.totalCount).toBe(1);
    expect(page?.filteredCount).toBe(1);
    expect(page?.hasMore).toBe(false);
    expect(page?.nextCursor).toBeNull();
  });

  it("keeps creator and requester, which the V1 reader drops", () => {
    const row = page?.rows[0];
    expect(row?.creator).toEqual({ userId: "usr_stan", username: "stan" });
    expect(row?.requester).toEqual({ userId: "usr_stan", username: "stan" });
  });

  it("keeps status, SLA, quorum, needs_you, inert and the blocker fields as published", () => {
    expect(page?.rows[0]).toMatchObject({
      id: "apr_fixture_r1",
      gate: "R1",
      subject: "Carry v3.2",
      target: "research · R1",
      environment: "RESEARCH",
      releaseCandidate: "RC-42",
      status: "PENDING",
      policyVersion: "approval.v3",
      blockerCount: 0,
      blockerSummary: null,
      quorumMet: 0,
      quorumRequired: 1,
      inert: null,
      needsYou: true,
      sla: { state: "ON_TRACK", ageMinutes: 5, budgetMinutes: 240, dueAt: "2026-09-11T13:00:00.000Z", expiresAt: "2026-09-12T09:00:00.000Z" },
    });
  });

  it("a published zero stays a zero, not a gap", () => {
    expect(page?.rows[0].quorumMet).toBe(0);
    expect(page?.rows[0].blockerCount).toBe(0);
  });
});

describe("V2 inbox row reader · the persisted subject type (a navigation hint, never a grant)", () => {
  it("reads the type the canonical fixture publishes and keeps the id apart from it", () => {
    const row = readInboxRowV2(wireRow());
    expect(row?.subjectType).toBe("ALPHA_VERSION");
    expect(row?.subjectId).toEqual(expect.any(String));
  });

  it("accepts each published kind and nothing is derived from the gate, the label or the id", () => {
    for (const kind of ["ALPHA_VERSION", "DEPLOYMENT", "EXIT_REVIEW"] as const) {
      const row = readInboxRowV2({ ...wireRow(), subject_type: kind, gate: "R2", subject: "A label that says deployment" });
      expect(row?.subjectType, kind).toBe(kind);
    }
  });

  it("an older server that sends none is still a valid row, with no type", () => {
    const wire = wireRow();
    delete wire.subject_type;
    const row = readInboxRowV2(wire);
    expect(row).not.toBeNull();
    expect(row?.subjectType).toBeNull();
  });

  it("reads approval_version as a whole number of 1 or more, and null otherwise (never guessed)", () => {
    expect(readInboxRowV2({ ...wireRow(), approval_version: 3 })?.approvalVersion).toBe(3);
    for (const bad of [0, -1, 1.5, "3", null]) expect(readInboxRowV2({ ...wireRow(), approval_version: bad })?.approvalVersion, JSON.stringify(bad)).toBeNull();
    const wire = wireRow();
    delete wire.approval_version;
    expect(readInboxRowV2(wire)?.approvalVersion).toBeNull();
  });

  it("a type outside the published enum, a null, a lower-case spelling or a non-string refuses the row", () => {
    for (const bad of ["PORTFOLIO", "alpha_version", "", null, 7, ["DEPLOYMENT"], { kind: "DEPLOYMENT" }]) {
      expect(readInboxRowV2({ ...wireRow(), subject_type: bad }), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("V2 inbox row reader · malformed input", () => {
  it.each([null, undefined, "row", 7, [], [wireRow()]])("%j is not a row", (raw) => {
    expect(readInboxRowV2(raw)).toBeNull();
  });

  it("refuses a row with no id or with a gate this build cannot route", () => {
    expect(readInboxRowV2({ ...wireRow(), id: undefined, approval_id: undefined })).toBeNull();
    expect(readInboxRowV2({ ...wireRow(), id: "" })).toBeNull();
    expect(readInboxRowV2({ ...wireRow(), gate: "ARCHIVE" })).toBeNull();
    expect(readInboxRowV2({ ...wireRow(), gate: 3 })).toBeNull();
  });

  it("accepts approval_id where the wire says approval_id", () => {
    expect(readInboxRowV2({ ...wireRow(), id: undefined, approval_id: "apr_alt" })?.id).toBe("apr_alt");
  });

  it("an absent number is null, never 0 and never -1", () => {
    const raw = wireRow();
    delete raw.blocker_count;
    delete raw.quorum_met;
    delete raw.quorum_required;
    delete raw.sla;
    const row = readInboxRowV2(raw);
    expect(row?.blockerCount).toBeNull();
    expect(row?.quorumMet).toBeNull();
    expect(row?.quorumRequired).toBeNull();
    expect(row?.sla).toBeNull();
  });

  it.each([["1"], [-1], [1.5], [Number.NaN], [null], [{}]])("quorum_met %j is not a count", (value) => {
    expect(readInboxRowV2({ ...wireRow(), quorum_met: value })?.quorumMet).toBeNull();
  });

  it("needs_you is true, false or unknown; a string is unknown", () => {
    expect(readInboxRowV2({ ...wireRow(), needs_you: true })?.needsYou).toBe(true);
    expect(readInboxRowV2({ ...wireRow(), needs_you: false })?.needsYou).toBe(false);
    expect(readInboxRowV2({ ...wireRow(), needs_you: "true" })?.needsYou).toBeNull();
    const raw = wireRow();
    delete raw.needs_you;
    expect(readInboxRowV2(raw)?.needsYou).toBeNull();
  });

  it("an inert word this build does not know is no inert reason", () => {
    expect(readInboxRowV2({ ...wireRow(), inert: "SELF" })?.inert).toBe("SELF");
    expect(readInboxRowV2({ ...wireRow(), inert: "SOMETHING_NEW" })?.inert).toBeNull();
  });

  it("an SLA with only a due time has no age, so it is no SLA", () => {
    expect(readInboxSla({ due_at: "2026-09-11T13:00:00.000Z", budget_minutes: 240 })).toBeNull();
    expect(readInboxSla({ age_minutes: 5.5, budget_minutes: 240 })).toBeNull();
    expect(readInboxSla({ age_minutes: "5", budget_minutes: 240 })).toBeNull();
    expect(readInboxSla("ON_TRACK")).toBeNull();
  });

  it("actors: a bare name and an object are actors, nothing else is", () => {
    expect(readInboxActor("stan")).toEqual({ userId: null, username: "stan" });
    expect(readInboxActor({ user_id: "usr_stan" })).toEqual({ userId: "usr_stan", username: null });
    expect(readInboxActor({})).toBeNull();
    expect(readInboxActor("")).toBeNull();
    expect(readInboxActor(12)).toBeNull();
    expect(readInboxActor([])).toBeNull();
  });
});

describe("V2 inbox page reader", () => {
  it("counts the rows it dropped instead of hiding them", () => {
    const page = readInboxPageV2({ page: { rows: [wireRow(), { id: "x", gate: "NOPE" }, 4], total_count: 9, has_more: true, next_cursor: "c1" } });
    expect(page?.rows).toHaveLength(1);
    expect(page?.dropped).toBe(2);
    expect(page?.totalCount).toBe(9);
    expect(page?.hasMore).toBe(true);
    expect(page?.nextCursor).toBe("c1");
    expect(page?.filteredCount).toBeNull();
  });

  it("reads a bare rows array and refuses an envelope with none", () => {
    expect(readInboxPageV2({ rows: [wireRow()] })?.rows).toHaveLength(1);
    expect(readInboxPageV2({ page: { rows: "no" } })).toBeNull();
    expect(readInboxPageV2({})).toBeNull();
    expect(readInboxPageV2(null)).toBeNull();
    expect(readInboxPageV2([])).toBeNull();
  });
});

describe("V1 row widening and merging", () => {
  it("V1 sentinels become absence: -1 blockers, the target placeholder, the empty SLA", () => {
    const row = inboxRowFromV1(v1Row({ blockerCount: -1, target: "target not published", sla: { ageMinutes: -1, budgetMinutes: -1 } }));
    expect(row.blockerCount).toBeNull();
    expect(row.target).toBeNull();
    expect(row.sla).toBeNull();
    expect(row.creator).toBeNull();
    expect(row.requester).toBeNull();
    expect(row.status).toBeNull();
  });

  it("a V1 row keeps what it has, including a counted zero", () => {
    const row = inboxRowFromV1(v1Row());
    expect(row.blockerCount).toBe(0);
    expect(row.quorumMet).toBe(0);
    expect(row.sla).toMatchObject({ ageMinutes: 5, budgetMinutes: 240, state: "ON_TRACK" });
  });

  it("the wire row of the same id upgrades the V1 row, so creator survives", () => {
    const merged = mergeInboxRows([v1Row()], [wireRow()]);
    expect(merged).toHaveLength(1);
    expect(merged[0].creator).toEqual({ userId: "usr_stan", username: "stan" });
    expect(merged[0].status).toBe("PENDING");
  });

  it("an unreadable wire row leaves the V1 row, and a wire row with no V1 twin is not added", () => {
    const merged = mergeInboxRows([v1Row()], [{ id: "apr_fixture_r1", gate: "WHAT" }, { ...wireRow(), id: "apr_other" }]);
    expect(merged.map((row) => row.id)).toEqual(["apr_fixture_r1"]);
    expect(merged[0].creator).toBeNull();
  });

  it("with no wire rows the V1 rows pass through in server order", () => {
    const merged = mergeInboxRows([v1Row({ id: "b" as ApprovalRow["id"] }), v1Row({ id: "a" as ApprovalRow["id"] })], null);
    expect(merged.map((row) => row.id)).toEqual(["b", "a"]);
  });

  it("readRawRows takes only an array under rawRows", () => {
    expect(readRawRows({ rawRows: [1, 2] })).toEqual([1, 2]);
    expect(readRawRows({ rawRows: "x" })).toBeNull();
    expect(readRawRows({})).toBeNull();
    expect(readRawRows(null)).toBeNull();
  });
});
