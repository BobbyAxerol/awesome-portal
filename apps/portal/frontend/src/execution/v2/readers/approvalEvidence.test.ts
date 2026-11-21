/** WP-K slice 2: the strict approval evidence reader, judged against the canonical fixtures and the published JSON Schema. */
import { describe, expect, it } from "vitest";
import { loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";
import { approvalEvidenceAnswers, approvalEvidencePath, readApprovalEvidenceV1 } from "./approvalEvidence";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const SCHEMA = "execution-approval-evidence.v1.schema.json";
const body = (name: string): Draft => structuredClone(loadCanonical<{ value: Draft }>(`execution-approval-evidence.${name}.synthetic.valid.json`).value);
const read = (raw: unknown) => readApprovalEvidenceV1(raw);

describe("fixtures", () => {
  it.each(["published", "not-read", "no-source", "drawdown"])("%s passes the schema and the reader", (name) => {
    expect(validateAgainst(SCHEMA, "", body(name))).toEqual([]);
    expect(read(body(name))?.kind).toBe("approval_evidence");
  });
  it("omitted is NO_SOURCE, null is NOT_READ, an object is PUBLISHED, and a true zero stays 0", () => {
    const none = read(body("no-source")) as Draft;
    const unread = read(body("not-read")) as Draft;
    const full = read(body("published")) as Draft;
    expect([none.evidence.history.state, none.evidence.obligations.state]).toEqual(["NO_SOURCE", "NO_SOURCE"]);
    expect([unread.evidence.diff.state, unread.evidence.receipt.state]).toEqual(["NOT_READ", "NOT_READ"]);
    expect(full.evidence.obligations.value).toEqual({ openPositions: 2, workingOrders: 0, reservations: 1, unknownOutcomes: 0, settlementPending: 0 });
    expect(full.evidence.history.value.points[0]).toMatchObject({ exact: "100.000000000000000001" });
    expect(full.evidence.readAtMs).toBeGreaterThan(0);
  });
  it("answers only the approval asked", () => {
    const evidence = (read(body("published")) as Draft).evidence;
    expect(approvalEvidenceAnswers(evidence, "TEST_ONLY:approval-1")).toBe(true);
    expect(approvalEvidenceAnswers(evidence, "other")).toBe(false);
    expect(approvalEvidencePath("TEST_ONLY:approval-1")).toBe("/governance/approvals/TEST_ONLY%3Aapproval-1/evidence");
    expect(approvalEvidencePath("../x")).toBeNull();
  });
});

describe("refusals (reader and schema agree on the published negatives)", () => {
  const rule = loadCanonical<Draft>("execution-approval-evidence.synthetic.negative.json");
  it.each(rule.cases.map((c: Draft): [string, Draft] => [c.id, c]) as [string, Draft][])("%s", (_id: string, c: Draft) => {
    const draft = structuredClone(loadCanonical<{ value: Draft }>(rule.bases[c.base]).value);
    for (const op of c.ops) {
      const holder = op.path.slice(0, -1).reduce((node: Draft, key: string | number) => node[key], draft);
      if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
    }
    expect(validateAgainst(SCHEMA, "", draft).length).toBeGreaterThan(0);
    expect(read(draft)).toBeNull();
  });
  it("EV-1 unordered or out-of-window points, EV-3 a diff row that changes nothing, and another schema", () => {
    const unordered = body("published");
    unordered.prior_economic_history.points.reverse();
    expect(read(unordered)).toBeNull();
    const outside = body("published");
    outside.prior_economic_history.points[0].ts_ms = 1;
    expect(read(outside)).toBeNull();
    const same = body("published");
    same.evidence_diff.changes[0].after = same.evidence_diff.changes[0].before;
    expect(read(same)).toBeNull();
    expect(read({ schema_version: "portal.execution.approval-evidence.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.approval-evidence.v2" });
    expect(read(null)).toBeNull();
    expect(read([])).toBeNull();
  });
});
