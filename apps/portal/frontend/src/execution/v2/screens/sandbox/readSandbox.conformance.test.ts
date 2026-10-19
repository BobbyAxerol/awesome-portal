/**
 * Reader conformance for `readSandbox.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * The Sandbox screen reads two bodies off one route. Every body here goes through the REAL
 * dispatch (`readSandboxByVersion`: the V2 reader `readSandboxParentV2` holds the published schema
 * for the V2 body, the V1 reader reads the V1 body) and then through `readSandboxView`, the strict
 * step the screen adds. The oracle is the published schema and the contract in the header of
 * `readSandbox.ts`.
 *
 * L0  the published bodies, verbatim from disk and schema-checked: the V1 body
 *     (`execution-sandbox-certification.unavailable`) and the three V2 following-parent bodies
 *     (`sandbox`, `sandbox_absent`, `sandbox_draft`), each read as its own version, and proved
 *     unchanged by the suite.
 * L1  matrices: V1 step evaluation x strip state, V2 step availability x stored evaluation, V1
 *     findings shape (total x returned x truncated), V1 lineage kinds. Each state keeps its word:
 *     an unknown evaluation is `unknown`, a V2 step with no evidence is `not-recorded`.
 * L2  the schema bounds: 50 findings, 250 timeline events, 20 plans, in order, inside a budget.
 * L3  generated negatives through the dispatch and the view: no throw, no leak of the probe, the
 *     prototype stays clean, a V2 body is `ready` only if the schema accepts it, and no word the
 *     reader does not know ever reads as Pass.
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest } from "../../testkit/loadCanonical";
import { cartesian, coverage, describeCoverage, dimension, type Draft } from "../../testkit/matrix";
import {
  arrayCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
  type NegativeCase,
} from "../../testkit/negative";
import { timed } from "../../testkit/scale";
import { validateAgainst } from "../../testkit/schema";
import { readSandboxByVersion } from "../../readers/dispatch";
import { V1_FIXTURE, V2_FIXTURE, v1Body, v1Rich, v2Body } from "./testApi";
import { isoToMs, readSandboxView, type SandboxView, type StepState } from "./readSandbox";

const V1_DEF = ["execution-sandbox-certification.v1", "/$defs/CertificationResponse"] as const;
const V2_DEF = ["execution-operations.v1", "/$defs/SandboxParentReadV2"] as const;
const violations = (def: readonly [string, string], body: unknown) => validateAgainst(def[0], def[1], body);

const digests = Object.fromEntries([V1_FIXTURE, V2_FIXTURE].map((f) => [f, canonicalDigest(f)]));
afterAll(() => {
  for (const f of [V1_FIXTURE, V2_FIXTURE]) expect(canonicalDigest(f), f).toBe(digests[f]);
});

/** The view of a body, through the real dispatch. */
function viewOf(body: unknown): SandboxView {
  const read = readSandboxView(readSandboxByVersion(body));
  if (read.kind !== "ready") throw new Error(`expected a ready view, got: ${read.text}`);
  return read.view;
}
const answerOf = (body: unknown) => readSandboxView(readSandboxByVersion(body));

const STEP_ORDER = ["CONNECT", "SYNC", "ORDER_TYPES", "RECONCILIATION", "TIMEBOXED_RUN", "CLEANUP", "EXIT_REVIEW"];

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the V1 body conforms to its schema and reads as a V1 view: seven unavailable steps, 0 of 7, three dark panels", () => {
    const body = v1Body();
    expect(violations(V1_DEF, body)).toEqual([]);
    const view = viewOf(body);
    expect(view.version).toBe("v1");
    expect(view.schemaVersion).toBe("governance.sandbox-certification.v1");
    expect(view.steps.availability).toBe("available");
    if (view.steps.availability === "available") {
      expect(view.steps.items.map((s) => s.key)).toEqual(STEP_ORDER);
      expect(view.steps.items.map((s) => s.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(view.steps.items.every((s) => s.state === "unavailable")).toBe(true);
      expect(view.steps.items.every((s) => s.asOf === null && s.expiresAt === null)).toBe(true);
    }
    expect(view.progress).toMatchObject({ passed: 0, total: 7, eligible: false });
    expect(view.panels.map((p) => p.id)).toEqual(["internal", "broker", "difference"]);
    expect(view.panels.every((p) => p.state === "unavailable" && !p.suppressed)).toBe(true);
    expect(view.findings).toMatchObject({ total: 0, truncated: false, rows: [] });
    expect(view.timeline?.rows.map((r) => r.action)).toEqual(["CREATE"]);
    expect(view.plans).toEqual([]);
    expect(view.runtimeState).toBeNull();
    expect(view.sourceActed).toBe(false);
    expect(view.lineage.map((l) => l.kind)).toEqual(["artifact", "r1", "r2", "paper", "grant"]);
    expect(view.workspaceId).toBeNull();
  });

  it("the V1 body with steps, findings, a timeline and a plan (the test's own, still schema-valid) keeps every published word", () => {
    const body = v1Rich();
    expect(violations(V1_DEF, body)).toEqual([]);
    const view = viewOf(body);
    if (view.steps.availability !== "available") throw new Error("steps");
    expect(view.steps.items.map((s) => s.state)).toEqual(["pass", "pass", "pass", "fail", "pass", "unavailable", "unavailable"]);
    expect(view.steps.items[0]!.asOf).toBe(Date.parse("2026-10-16T17:50:00.000Z"));
    expect(view.steps.items[0]!.expiresAt).toBe(Date.parse("2026-10-23T17:50:00.000Z"));
    expect(view.steps.items[3]!.summary).toBe("2 findings are still open.");
    expect(view.progress).toMatchObject({ passed: 4, total: 7, eligible: false });
    expect(view.findings?.rows.map((f) => [f.id, f.severity])).toEqual([["fnd_TEST_ONLY_1", "WARNING"], ["fnd_TEST_ONLY_2", "INFO"]]);
    expect(view.plans?.map((p) => [p.id, p.status])).toEqual([["plan_TEST_ONLY_1", "BLOCKED"]]);
  });

  it.each(["sandbox", "sandbox_absent", "sandbox_draft"] as const)("V2 %s conforms to its schema and reads as a V2 view", (key) => {
    const body = v2Body(key);
    expect(violations(V2_DEF, body)).toEqual([]);
    const view = viewOf(body);
    expect(view.version).toBe("v2");
    expect(view.schemaVersion).toBe("portal.execution.following-parent.v2");
    expect(view.workspaceId).toBe(body.workspace_id);
    expect(view.certificationId).toBe(body.certification.certification_id);
    expect(view.workflowVersion).toBe(body.certification.workflow_version);
    expect(view.observedAt).toBe(body.observed_at_ms);
    // The V2 body carries none of these; a view that filled them would be inventing them.
    expect(view.progress).toBeNull();
    expect(view.findings).toBeNull();
    expect(view.timeline).toBeNull();
    expect(view.plans).toBeNull();
    expect(view.panels).toEqual([]);
    expect(view.runtimeState).toBeNull();
  });

  it("V2 sandbox: seven stored steps in the published order; a step with no evidence is not-recorded, not unavailable", () => {
    const view = viewOf(v2Body("sandbox"));
    if (view.steps.availability !== "available") throw new Error("steps");
    expect(view.steps.items.map((s) => s.key)).toEqual(STEP_ORDER);
    expect(view.steps.items.map((s) => s.state)).toEqual(["pass", "fail", "stale", "unavailable", "not-recorded", "not-recorded", "not-recorded"]);
    expect(view.steps.items.every((s) => s.summary === null && s.blockerCode === null)).toBe(true);
    expect(view.steps.items[0]).toMatchObject({ asOf: 1790812800000, expiresAt: 1790812801000, authority: "PORTAL" });
    expect(view.lineage.map((l) => l.kind)).toEqual(["r1", "r2", "paper", "grant"]);
    expect(view.lineage.find((l) => l.kind === "r2")?.href).toMatch(/^\/governance\/approvals\/.+\/r2$/);
  });

  it("V2 steps not published: the section is absent with its published reason, and no lineage is drawn", () => {
    for (const key of ["sandbox_absent", "sandbox_draft"] as const) {
      const view = viewOf(v2Body(key));
      expect(view.steps).toMatchObject({ availability: "absent", code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
      expect(view.lineage).toEqual([]);
    }
  });

  it("an unsupported answer carries its sentence and no view", () => {
    const swapped = { ...v1Body(), schema_version: "governance.r2-review.v1" };
    const read = answerOf(swapped);
    expect(read.kind).toBe("unsupported");
    if (read.kind === "unsupported") expect(read.text).toContain("governance.r2-review.v1");
    expect(answerOf(null).kind).toBe("unsupported");
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrices", () => {
  it("A · V1 step: evaluation x strip state. Each published word maps to its own state; strip state never changes it", () => {
    const base = v1Body();
    const DIMS = [
      dimension("evaluation", ["steps", 3, "evaluation_state"], ["PASS", "FAIL", "STALE", "UNAVAILABLE"]),
      dimension("strip", ["steps", 3, "strip_state"], ["DONE", "CURRENT", "PENDING"]),
    ];
    const states = cartesian(base, DIMS);
    console.info(describeCoverage("readSandbox A (V1 step) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(12);
    const WANT: Record<string, StepState> = { PASS: "pass", FAIL: "fail", STALE: "stale", UNAVAILABLE: "unavailable" };
    for (const state of states) {
      expect(violations(V1_DEF, state.value), state.name).toEqual([]);
      const view = viewOf(state.value);
      if (view.steps.availability !== "available") throw new Error(state.name);
      expect(view.steps.items[3]!.state, state.name).toBe(WANT[state.picks.evaluation!]);
      // The other six are untouched.
      expect(view.steps.items.filter((_, i) => i !== 3).every((s) => s.state === "unavailable"), state.name).toBe(true);
    }
  });

  it("B · V2 step: availability x stored evaluation x authority. A recorded step keeps its word; NOT_RECORDED has no evaluation", () => {
    const base = v2Body("sandbox");
    const recorded = (value: string) => (draft: Draft) => {
      const item = draft.steps.items[1];
      item.availability = "AVAILABLE";
      item.evidence_id = "evidence_TEST_ONLY_x";
      item.stored_evaluation_state = value;
      item.source_authority = "BROKER";
      item.source_verification_state = "VERIFIED";
    };
    const WANT: Record<string, StepState> = { PASS: "pass", FAIL: "fail", STALE: "stale", UNAVAILABLE: "unavailable" };
    for (const word of ["PASS", "FAIL", "STALE", "UNAVAILABLE"]) {
      const body = structuredClone(base);
      recorded(word)(body);
      expect(violations(V2_DEF, body), word).toEqual([]);
      const view = viewOf(body);
      if (view.steps.availability !== "available") throw new Error(word);
      expect(view.steps.items[1]).toMatchObject({ state: WANT[word], authority: "BROKER" });
    }
    const none = structuredClone(base);
    Object.assign(none.steps.items[1], { availability: "NOT_RECORDED", evidence_id: null, stored_evaluation_state: null, source_authority: null, source_verification_state: null, as_of_ms: null, expires_at_ms: null });
    expect(violations(V2_DEF, none)).toEqual([]);
    const view = viewOf(none);
    if (view.steps.availability !== "available") throw new Error("steps");
    expect(view.steps.items[1]).toMatchObject({ state: "not-recorded", authority: null, asOf: null });
  });

  it("C · V1 findings: total x returned x truncated. The collection is kept as the server shaped it", () => {
    const row = (n: number) => ({ finding_id: `fnd_TEST_ONLY_${n}`, severity: "ERROR", source_authority: "DERIVED", finding_code: "X", summary: "A finding summary", blocking: true, evidence_hash: null, as_of: null, resolved_at: null, created_at: "2026-10-17T12:02:00.000Z" });
    for (const [total, rows, truncated] of [[0, 0, false], [3, 3, false], [120, 50, true], [51, 50, true]] as const) {
      const body = v1Body();
      body.findings = { total_count: total, returned_count: rows, truncated, rows: Array.from({ length: rows }, (_, i) => row(i)) };
      expect(violations(V1_DEF, body), `${total}/${rows}`).toEqual([]);
      const view = viewOf(body);
      expect(view.findings).toMatchObject({ total, returned: rows, truncated });
      expect(view.findings?.rows).toHaveLength(rows);
    }
  });

  it("G · finding row: code, summary, blocking, opened and resolved are read; open is resolved_at null, an absent or unreadable key is unknown", () => {
    const row = (over: Draft) => ({ finding_id: "fnd_TEST_ONLY_g", severity: "ERROR", source_authority: "DERIVED", finding_code: "FEE_DIFF", summary: "Fee total differs", blocking: true, evidence_hash: null, as_of: null, resolved_at: null, created_at: "2026-10-17T12:02:00.000Z", ...over });
    const read = (r: Draft) => {
      const body = v1Body();
      body.findings = { total_count: 1, returned_count: 1, truncated: false, rows: [r] };
      return viewOf(body).findings!.rows[0]!;
    };
    expect(read(row({}))).toEqual({ id: "fnd_TEST_ONLY_g", severity: "ERROR", code: "FEE_DIFF", summary: "Fee total differs", blocking: true, openedAt: Date.parse("2026-10-17T12:02:00.000Z"), resolvedAt: null, state: "open" });
    expect(read(row({ blocking: false, resolved_at: "2026-10-17T13:00:00.000Z" }))).toMatchObject({ blocking: false, resolvedAt: Date.parse("2026-10-17T13:00:00.000Z"), state: "resolved" });
    // The wire row without the key is not an open finding.
    const absent = row({});
    delete absent.resolved_at;
    expect(read(absent)).toMatchObject({ state: "unknown", resolvedAt: null });
    for (const bad of ["yesterday", "2026-10-17", 5, true, ""]) {
      expect(read(row({ resolved_at: bad })), String(bad)).toMatchObject({ state: "unknown", resolvedAt: null });
    }
    // A non-boolean `blocking`, a missing summary and an unreadable clock are null, never a default.
    expect(read(row({ blocking: "true", summary: undefined, created_at: "soon" }))).toMatchObject({ blocking: null, summary: null, openedAt: null });
    // A summary past the bound is dropped whole, not cut.
    expect(read(row({ summary: "s".repeat(2001) })).summary).toBeNull();
    expect(read(row({ summary: "s".repeat(2000) })).summary).toHaveLength(2000);
  });

  it("D · timestamps: only exact ISO-8601 UTC is an instant; every other spelling is null, never a guess", () => {
    expect(isoToMs("2026-10-17T12:02:00.000Z")).toBe(Date.UTC(2026, 9, 17, 12, 2, 0));
    expect(isoToMs("2026-10-17T12:02:00Z")).toBe(Date.UTC(2026, 9, 17, 12, 2, 0));
    for (const bad of ["2026-10-17", "2026-10-17T12:02:00+07:00", "17 Oct 2026", "1792281600000", "2026-13-45T99:99:99Z", "", " 2026-10-17T12:02:00Z", null, undefined]) {
      expect(isoToMs(bad as string | null), String(bad)).toBeNull();
    }
  });

  it("E · seven steps once each, or none: a missing, repeated or unknown step voids the whole section", () => {
    const withSteps = (mutate: (steps: Draft[]) => Draft[]) => {
      const body = v1Body();
      body.steps = mutate(body.steps);
      return viewOf(body);
    };
    expect(withSteps((s) => s.slice(0, 6)).steps.availability).toBe("absent");
    expect(withSteps((s) => [...s, s[0]]).steps.availability).toBe("absent");
    expect(withSteps((s) => [s[0], s[0], ...s.slice(2)]).steps.availability).toBe("absent");
    expect(withSteps((s) => [{ ...s[0], step_key: "TELEPORT" }, ...s.slice(1)]).steps.availability).toBe("absent");
    // Shuffled is fine: the seven are placed in their fixed order.
    const shuffled = withSteps((s) => [...s].reverse());
    if (shuffled.steps.availability !== "available") throw new Error("steps");
    expect(shuffled.steps.items.map((i) => i.key)).toEqual(STEP_ORDER);
  });

  it("F · a passed count that does not fit its total is null, never clamped", () => {
    for (const [passed, total] of [[8, 7], [0, 0], [3, 0]] as const) {
      const body = v1Body();
      body.progress.passed_count = passed;
      body.progress.total_count = total;
      expect(viewOf(body).progress).toMatchObject({ passed: null, total: null });
    }
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
describe("L2 · scale", () => {
  it("50 findings, 250 timeline events and 20 plans: read whole, in order, inside the budget", () => {
    const body = v1Body();
    body.findings = {
      total_count: 50, returned_count: 50, truncated: false,
      rows: Array.from({ length: 50 }, (_, i) => ({ finding_id: `fnd_TEST_ONLY_${i}`, severity: ["INFO", "WARNING", "ERROR", "CRITICAL"][i % 4], source_authority: "DERIVED", finding_code: "X", summary: "A finding summary", blocking: false, evidence_hash: null, as_of: null, resolved_at: null, created_at: "2026-10-17T12:02:00.000Z" })),
    };
    body.timeline = {
      total_count: 250, returned_count: 250, truncated: false,
      rows: Array.from({ length: 250 }, (_, i) => ({ event_id: `evt_TEST_ONLY_${i}`, actor_user_id: "usr_TEST_ONLY_a", action: "PLAN_PROMOTION", workflow_version_before: 1, workflow_version_after: 1, created_at: "2026-10-17T12:02:00.000Z" })),
    };
    body.promotion_plans = Array.from({ length: 20 }, (_, i) => ({ plan_id: `plan_TEST_ONLY_${i}`, target_stage: "CANARY", evidence_set_hash: `sha256:${"e".repeat(64)}`, status: "BLOCKED", blocker_codes: ["X"], source_side_effect_requested: false, created_at: "2026-10-17T12:10:00.000Z" }));
    expect(violations(V1_DEF, body)).toEqual([]);
    const { value, ms } = timed(() => viewOf(body));
    expect(ms).toBeLessThan(250);
    expect(value.findings?.rows.map((f) => f.id)).toEqual(Array.from({ length: 50 }, (_, i) => `fnd_TEST_ONLY_${i}`));
    expect(value.timeline?.rows).toHaveLength(250);
    expect(value.plans).toHaveLength(20);
  });

  it("the same body read 500 times costs the same order of work each time (no growth, no shared state)", () => {
    const body = v1Rich();
    const first = JSON.stringify(viewOf(body));
    const { ms } = timed(() => { for (let i = 0; i < 500; i += 1) viewOf(body); });
    expect(ms).toBeLessThan(1500);
    expect(JSON.stringify(viewOf(body))).toBe(first);
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Plan { def: readonly [string, string]; base: () => Draft; schema: string; enums: [readonly (string | number)[], readonly string[]][]; ints: (string | number)[][]; strs: (string | number)[][]; arrays: [(string | number)[], string | undefined][]; containers: (string | number)[][]; keys: (string | number)[][] }
const PLANS: Record<string, Plan> = {
  v1: {
    def: V1_DEF,
    base: v1Rich,
    schema: "governance.sandbox-certification.v1",
    enums: [
      [["steps", 0, "evaluation_state"], ["PASS", "FAIL", "STALE", "UNAVAILABLE"]], [["steps", 0, "strip_state"], ["DONE", "CURRENT", "PENDING"]],
      [["steps", 0, "step_key"], STEP_ORDER], [["findings", "rows", 0, "severity"], ["INFO", "WARNING", "ERROR", "CRITICAL"]],
      [["timeline", "rows", 0, "action"], ["CREATE", "SUBMIT", "APPROVE", "DENY", "PLAN_PROMOTION"]], [["source_panels", 0, "panel_state"], ["ready", "stale", "error", "unavailable"]],
      [["promotion_plans", 0, "status"], ["BLOCKED"]], [["promotion_plans", 0, "target_stage"], ["CANARY"]], [["certification", "workflow_state"], ["DRAFT", "IN_REVIEW", "APPROVED", "DENIED"]],
      [["delivery_profile"], ["fixture", "shadow", "SANDBOX_BINANCE_USDM"]], [["source_integration_state"], ["UNAVAILABLE", "SHADOW", "SOURCE_BACKED"]],
    ],
    ints: [["progress", "passed_count"], ["progress", "total_count"], ["certification", "workflow_version"], ["findings", "total_count"]],
    strs: [["certification", "certification_id"], ["steps", 0, "label"], ["steps", 0, "as_of"], ["steps", 3, "summary"], ["findings", "rows", 0, "finding_id"], ["timeline", "rows", 0, "created_at"], ["promotion_plans", 0, "plan_id"]],
    arrays: [[["steps"], "step_key"], [["findings", "rows"], "finding_id"], [["timeline", "rows"], "event_id"], [["promotion_plans"], "plan_id"], [["source_panels"], "panel_id"], [["lineage"], undefined]],
    containers: [[], ["certification"], ["progress"], ["steps", 0], ["findings"], ["timeline"], ["source_panels", 0], ["actor"]],
    keys: [["certification"], ["progress"], ["steps"], ["source_panels"], ["findings"], ["timeline"], ["promotion_plans"], ["lineage"], ["actor"], ["delivery_profile"], ["source_side_effect_requested"]],
  },
  v2: {
    def: V2_DEF,
    base: () => v2Body("sandbox"),
    schema: "portal.execution.following-parent.v2",
    enums: [
      [["certification", "workflow_state"], ["DRAFT", "IN_REVIEW", "APPROVED", "DENIED"]], [["steps", "items", 0, "availability"], ["AVAILABLE", "NOT_RECORDED"]],
      [["steps", "items", 0, "stored_evaluation_state"], ["PASS", "FAIL", "STALE", "UNAVAILABLE"]], [["steps", "items", 1, "stored_evaluation_state"], ["PASS", "FAIL", "STALE", "UNAVAILABLE"]],
      [["steps", "items", 0, "step_key"], STEP_ORDER], [["anchors", "environment"], ["SANDBOX"]],
    ],
    ints: [["certification", "workflow_version"], ["certification", "created_at_ms"], ["steps", "items", 0, "as_of_ms"], ["observed_at_ms"]],
    strs: [["workspace_id"], ["certification", "certification_id"], ["steps", "items", 0, "evidence_id"], ["lineage", "r1_approval_id"], ["anchors", "deployment_id"]],
    arrays: [[["steps", "items"], "step_key"]],
    containers: [[], ["certification"], ["steps"], ["steps", "items", 0], ["lineage"], ["anchors"], ["source"]],
    keys: [["certification"], ["steps"], ["lineage"], ["anchors"], ["source"], ["workspace_id"], ["observed_at_ms"]],
  },
};

interface Case extends NegativeCase { plan: string }
const CASES: Case[] = Object.entries(PLANS).flatMap(([name, plan]) => {
  const base = plan.base();
  const tag = (cases: NegativeCase[]): Case[] => cases.map((c) => ({ ...c, name: `${name} · ${c.name}`, plan: name }));
  return [
    ...tag(plan.enums.flatMap(([path, valid]) => enumCases(base, path, valid))),
    ...tag(plan.ints.flatMap((p) => integerCases(base, p))),
    ...tag(plan.strs.flatMap((p) => stringCases(base, p))),
    ...tag(plan.arrays.flatMap(([p, id]) => arrayCases(base, p, id ? { idKey: id } : {}))),
    ...tag(requiredCases(base, plan.keys)),
    ...tag(schemaVersionCases(base, ["schema_version"], plan.schema, name === "v1" ? ["portal.execution.following-parent.v2", "governance.r2-review.v1"] : ["governance.sandbox-certification.v1"])),
    ...tag(pollutionCases(base, plan.containers)),
  ];
});

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of CASES) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    console.info(`readSandbox L3: ${CASES.length} cases (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases`);
    expect(CASES.length).toBeGreaterThan(400);
  });

  it.each(CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => answerOf(c.value)).not.toThrow();
    const read = answerOf(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (read.kind === "unsupported") {
      // Whatever was refused leaves a sentence and nothing else.
      expect(read.text.length).toBeGreaterThan(10);
      return;
    }
    const { view } = read;
    // A V2 view exists only for a body the published schema accepts.
    if (view.version === "v2") expect(violations(PLANS.v2!.def, c.value), `accepted though schema-invalid: ${c.name}`).toEqual([]);
    // The steps, when drawn, are the seven in order, once each.
    if (view.steps.availability === "available") expect(view.steps.items.map((s) => s.key)).toEqual(STEP_ORDER);
    // No word the reader does not know is ever a Pass: a Pass in the view needs the published PASS.
    if (view.version === "v1" && view.steps.availability === "available") {
      const raw = (c.value as Draft).steps as Draft[];
      for (const step of view.steps.items) {
        const source = raw.find((s) => s?.step_key === step.key);
        if (step.state === "pass") expect(source?.evaluation_state, c.name).toBe("PASS");
      }
    }
    // A schema-invalid timestamp is never an instant.
    for (const item of view.steps.availability === "available" ? view.steps.items : []) {
      if (item.asOf !== null && view.version === "v1") expect(Number.isFinite(item.asOf)).toBe(true);
    }
  });

  it("an unknown evaluation word is `unknown`, never Pass and never Unavailable", () => {
    for (const c of CASES.filter((x) => x.plan === "v1" && x.category === "unknown-enum" && /evaluation_state/.test(x.name))) {
      const read = answerOf(c.value);
      if (read.kind !== "ready") continue;
      if (read.view.steps.availability !== "available") continue;
      expect(read.view.steps.items[0]!.state, c.name).toBe("unknown");
    }
  });

  it("a V2 unknown word anywhere refuses the whole body: nothing partial is drawn", () => {
    for (const c of CASES.filter((x) => x.plan === "v2" && x.category === "unknown-enum" && !/huge/.test(x.name))) {
      expect(answerOf(c.value).kind, c.name).toBe("unsupported");
    }
  });

  it("a V1 body wearing the V2 version, or the other way round, is refused and never half-read", () => {
    for (const c of CASES.filter((x) => x.category === "schema-swapped")) {
      const sv = (c.value as Draft)?.schema_version;
      if (c.plan === "v1" && sv === "portal.execution.following-parent.v2") expect(answerOf(c.value).kind, c.name).toBe("unsupported");
      if (c.plan === "v2" && sv === "governance.sandbox-certification.v1") expect(answerOf(c.value).kind, c.name).toBe("unsupported");
    }
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s is never a certification", (_name, c) => {
    expect(() => answerOf(c.value)).not.toThrow();
    expect(answerOf(c.value).kind).toBe("unsupported");
  });
});
