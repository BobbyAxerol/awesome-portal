/**
 * The 15 runtime refusals of `execution-manager-scoped.refusals.synthetic.negative.json` (BE-P14, `requests`): HTTP status + `error.code`
 * map to typed outcomes in `scopedRefusal.ts`, never by text. The 20 schema `mutations` of the same file are in
 * `scopedRead.scenarios.conformance.test.ts`.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical } from "../../testkit/loadCanonical";
import { readScopedRefusal, SCOPED_REFUSAL_PAIRS, type ScopedRefusalKind } from "./scopedRefusal";

const REFUSALS = "execution-manager-scoped.refusals.synthetic.negative.json";
const digest = canonicalDigest(REFUSALS);
afterAll(() => expect(canonicalDigest(REFUSALS)).toBe(digest));

interface Refusal { id: string; status: number; code: string }
const file = loadCanonical<{ requests: Refusal[] }>(REFUSALS);
const envelope = (code: string, message = "free text the reader must not use") => ({ error: { code, message }, request_id: "req_TEST_ONLY" });

const EXPECTED: Record<string, [ScopedRefusalKind, string]> = {
  "cursor/changed-query": ["cursor_reset", "restart_chain"],
  "cursor/wrong-direction": ["cursor_reset", "restart_chain"],
  "cursor/other-workspace": ["cursor_reset", "restart_chain"],
  "cursor/tampered": ["cursor_reset", "restart_chain"],
  "cursor/expired": ["cursor_reset", "restart_chain"],
  "cursor/source-moved": ["cursor_reset", "restart_chain"],
  "read/revoked-mid-request": ["access_changed", "refetch_scope"],
  "read/single-environment-not-recorded": ["authority_unavailable", "show_absence"],
  "read/single-environment-not-granted": ["not_available", "show_absence"],
  "read/single-environment-policy-pending": ["policy_pending", "show_absence"],
  "read/all-environments-denied": ["not_available", "show_absence"],
  "read/field-policy-pending": ["field_policy_pending", "show_absence"],
  "read/query-field-not-authorized": ["not_available", "show_absence"],
  "read/over-bound-is-refused-not-truncated": ["authority_unavailable", "show_absence"],
  "read/binding-detail-unknown": ["not_available", "show_absence"],
};

describe("the 15 runtime refusals (status + code, never text)", () => {
  it("there are 15 and every one is mapped", () => {
    expect(file.requests).toHaveLength(15);
    expect(file.requests.map((r) => r.id).sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(file.requests.map((r) => [r.id, r] as const))("%s maps by status and code", (_id, r) => {
    const refusal = readScopedRefusal(r.status, envelope(r.code));
    expect(refusal).not.toBeNull();
    expect([refusal!.kind, refusal!.action]).toEqual(EXPECTED[r.id]);
    // The message is not an input: another text, or none, gives the same outcome.
    expect(readScopedRefusal(r.status, envelope(r.code, "another sentence"))).toEqual(refusal);
    expect(readScopedRefusal(r.status, { error: { code: r.code } })).toEqual(refusal);
    // The status is part of the identity: the same code on a status the contract does not pair with it is not read.
    expect(readScopedRefusal(r.status === 500 ? 502 : 500, envelope(r.code))).toBeNull();
  });

  it("the table holds exactly the pairs the fixture proves (no pair without a proof)", () => {
    expect([...new Set(file.requests.map((r) => `${r.status}|${r.code}`))].sort()).toEqual([...SCOPED_REFUSAL_PAIRS].sort());
  });

  it("what is not the envelope is not a refusal, and nothing throws", () => {
    for (const body of [null, undefined, "EXECUTION_READ_NOT_AVAILABLE", 7, [], {}, { error: null }, { error: "x" }, { error: { code: 4 } }, { error: { code: "SOMETHING_ELSE" } }, { code: "INVALID_CURSOR" }]) {
      expect(readScopedRefusal(400, body)).toBeNull();
      expect(readScopedRefusal(404, body)).toBeNull();
    }
    for (const status of [undefined, null, "400", 400.5, Number.NaN]) expect(readScopedRefusal(status, envelope("INVALID_CURSOR"))).toBeNull();
  });

  it("the three cursor codes (400) restart the chain; none is an access or availability outcome", () => {
    const cursor = file.requests.filter((r) => r.code === "CURSOR_CONTEXT_MISMATCH" || r.code === "INVALID_CURSOR" || r.code === "CURSOR_EXPIRED");
    expect(cursor).toHaveLength(6);
    for (const r of cursor) expect(readScopedRefusal(r.status, envelope(r.code))).toMatchObject({ kind: "cursor_reset", action: "restart_chain" });
    expect(readScopedRefusal(409, envelope("EXECUTION_READ_ACCESS_CHANGED"))).toEqual({ kind: "access_changed", action: "refetch_scope" });
  });
});
