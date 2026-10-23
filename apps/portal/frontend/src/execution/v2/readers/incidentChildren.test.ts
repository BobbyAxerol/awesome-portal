/** WP-K slice 3: the strict incident children and operations audit readers, judged against the canonical fixtures and the published JSON Schemas. */
import { describe, expect, it } from "vitest";
import { loadCanonical } from "../testkit/loadCanonical";
import { validateAgainst } from "../testkit/schema";
import { incidentChildrenAnswers, incidentChildrenPath, operationsAuditPath, readIncidentChildrenV1, readOperationsAuditV1 } from "./incidentChildren";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = any;
const CHILDREN = "execution-incident-children.v1.schema.json";
const AUDIT = "execution-operations-audit.v1.schema.json";
const kids = (name: string): Draft => structuredClone(loadCanonical<{ value: Draft }>(`execution-incident-children.${name}.synthetic.valid.json`).value);
const feed = (name: string): Draft => structuredClone(loadCanonical<{ value: Draft }>(`execution-operations-audit.${name}.synthetic.valid.json`).value);

describe("incident children fixtures", () => {
  it.each(["published", "eligible", "not-read", "no-source"])("%s passes the schema and the reader", (name) => {
    expect(validateAgainst(CHILDREN, "", kids(name))).toEqual([]);
    expect(readIncidentChildrenV1(kids(name))?.kind).toBe("incident_children");
  });
  it("reads omitted as NO_SOURCE, null as NOT_READ, published lists with their zeros and the original target or its absence", () => {
    const none = (readIncidentChildrenV1(kids("no-source")) as Draft).children;
    const unread = (readIncidentChildrenV1(kids("not-read")) as Draft).children;
    const full = (readIncidentChildrenV1(kids("published")) as Draft).children;
    const eligible = (readIncidentChildrenV1(kids("eligible")) as Draft).children;
    expect([none.evidence.state, none.resolutionGate.state]).toEqual(["NO_SOURCE", "NO_SOURCE"]);
    expect([unread.timeline.state, unread.linkedOperations.state]).toEqual(["NOT_READ", "NOT_READ"]);
    expect(full.evidence.value.map((e: Draft) => e.source)).toEqual(["FINDING", "ALERT", "DEAD_LETTER", "ORDER_TRACE"]);
    expect(full.linkedOperations.value.map((o: Draft) => o.originalTarget)).toEqual([{ type: "DEPLOYMENT", id: "TEST_ONLY:dep-1" }, null]);
    expect(eligible.evidence.value).toEqual([]);
    expect(eligible.resolutionGate.value).toEqual({ eligible: true, blockerCodes: [] });
    expect(incidentChildrenAnswers(full, "TEST_ONLY:incident-1")).toBe(true);
    expect(incidentChildrenAnswers(full, "x")).toBe(false);
    expect(incidentChildrenPath("TEST_ONLY:incident-1")).toBe("/operations/incidents/TEST_ONLY%3Aincident-1/children");
    expect(incidentChildrenPath("a/b")).toBeNull();
  });
  it("IC-1 an eligible gate with blockers, IC-2 versions going backwards, IC-3 duplicate ids, and another schema are refused", () => {
    const gate = kids("published"); gate.resolution_gate.eligible = true;
    expect(readIncidentChildrenV1(gate)).toBeNull();
    const back = kids("published"); back.timeline[1].version_before = 3; back.timeline[1].version_after = 2;
    expect(readIncidentChildrenV1(back)).toBeNull();
    const dup = kids("published"); dup.linked_operations[1].operation_id = dup.linked_operations[0].operation_id;
    expect(readIncidentChildrenV1(dup)).toBeNull();
    const dupEvidence = kids("published"); dupEvidence.evidence[1] = { ...dupEvidence.evidence[0] };
    expect(readIncidentChildrenV1(dupEvidence)).toBeNull();
    expect(readIncidentChildrenV1({ schema_version: "portal.execution.incident-children.v2" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.incident-children.v2" });
    expect(readIncidentChildrenV1(null)).toBeNull();
  });
});

describe("operations audit fixtures", () => {
  it.each(["page", "last", "empty"])("%s passes the schema and the reader", (name) => {
    expect(validateAgainst(AUDIT, "", feed(name))).toEqual([]);
    expect(readOperationsAuditV1(feed(name))?.kind).toBe("operations_audit");
  });
  it("reads rows newest first with a nullable receipt, and the cursor exists exactly when there is another page", () => {
    const page = (readOperationsAuditV1(feed("page")) as Draft).page;
    expect(page.items.map((r: Draft) => r.action)).toEqual(["ACKNOWLEDGED", "ASSIGNED", "RESOLVED"]);
    expect(page.items[1].receiptRef).toBeNull();
    expect([page.hasMore, page.nextCursor]).toEqual([true, "TEST_ONLY:cursor-1"]);
    const last = (readOperationsAuditV1(feed("last")) as Draft).page;
    expect([last.hasMore, last.nextCursor]).toEqual([false, null]);
    expect((readOperationsAuditV1(feed("empty")) as Draft).page.items).toEqual([]);
  });
  it("AU-1 older rows first, AU-2 duplicate ids, the cursor rule and another schema are refused", () => {
    const order = feed("page"); order.items.reverse();
    expect(readOperationsAuditV1(order)).toBeNull();
    const dup = feed("page"); dup.items[1].audit_id = dup.items[0].audit_id;
    expect(readOperationsAuditV1(dup)).toBeNull();
    const more = feed("page"); more.next_cursor = null;
    expect(readOperationsAuditV1(more)).toBeNull();
    const cursor = feed("last"); cursor.next_cursor = "x";
    expect(readOperationsAuditV1(cursor)).toBeNull();
    expect(readOperationsAuditV1({ schema_version: "portal.execution.operations-audit.v9" })).toEqual({ kind: "unsupported_shape", schemaVersion: "portal.execution.operations-audit.v9" });
  });
  it("builds a safe path", () => {
    expect(operationsAuditPath()).toBe("/operations/audit");
    expect(operationsAuditPath({ limit: 50, after: "c1", incidentId: "inc_1" })).toBe("/operations/audit?limit=50&after=c1&incident_id=inc_1");
    expect(operationsAuditPath({ limit: 0 })).toBeNull();
    expect(operationsAuditPath({ incidentId: "../x" })).toBeNull();
  });
});

describe("published negatives", () => {
  const rule = loadCanonical<Draft>("execution-incident-audit.synthetic.negative.json");
  it.each(rule.cases.map((c: Draft): [string, Draft] => [c.id, c]) as [string, Draft][])("%s", (_id: string, c: Draft) => {
    const draft = structuredClone(loadCanonical<{ value: Draft }>(rule.bases[c.base]).value);
    for (const op of c.ops) {
      const holder = op.path.slice(0, -1).reduce((node: Draft, key: string | number) => node[key], draft);
      if (op.op === "delete") delete holder[op.path.at(-1)]; else holder[op.path.at(-1)] = op.value;
    }
    expect(validateAgainst(c.schema === "detail" ? CHILDREN : AUDIT, "", draft).length).toBeGreaterThan(0);
    expect(c.schema === "detail" ? readIncidentChildrenV1(draft) : readOperationsAuditV1(draft)).toBeNull();
  });
});
