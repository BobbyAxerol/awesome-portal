/**
 * Reader conformance for `governanceParents.ts` (Rules 9.8.3, tiers L0 to L3).
 *
 * L0  the 25 parent bodies of `execution-positive-parent.synthetic.valid.json`
 *     (R2, Paper Exit, Sandbox, Canary, Live, and the operation parents; six of
 *     them added by Codex e19ad906: `paper_exit_criteria`, `r2_followthrough`,
 *     `r2_followthrough_hashes_absent`, `paper_exit_followthrough`,
 *     `r2_recorded`, `paper_exit_recorded`), read verbatim from disk,
 *     schema-checked, read by their own reader and by the generic router, and
 *     proved unchanged by the suite. The three compositions in the same file
 *     are not parents and are never read as one.
 * L1  state matrices; the oracle is the reader's stated contract (header of
 *     governanceParents.ts) with the published schema beside it:
 *       A  approval: status x decision clock x update clock x quorum x evidence
 *       B  Paper Exit: review state x extension x sections; panel clocks
 *       C  Sandbox: workflow state x clocks; step recording and order
 *       D  Canary: revision x predecessor x proposed cap spelling
 *       E  operation: family x status x applied clock x captured parent x decision
 *       F  recorded activity: kind x row count x has_more x version step x clock order x ids
 *       G  R2 recorded verdicts: outcome x blocking x ordinal order x reference x has_more
 *       H  Paper Exit criterion: key x label x observed spelling x source clock
 *       I  actors: decider x viewer flags
 *       J  R2 decision inputs: workspace x approval x version x hash order and count
 *     The vocabularies of A and B (and every enum of F to J) are read from the
 *     published schema, not from the reader's constants; a test pins that the
 *     two are the same list.
 *     Each maps to the documented UI state: an APPROVED / EXPIRED word passes
 *     through unchanged, an optional section is an AVAILABLE body or a typed
 *     absence (never an empty list), a cap is exact and never zero, and
 *     `APPLIED` exists only with its clock.
 * L2  the schema bounds (4 panels, 256 findings, 256 criteria, 32 recorded
 *     decisions, 64 recorded verdicts, 128 evidence hashes) and 200-finding
 *     reads. These are single-object reads, not paged; the bounds are what keep
 *     them finite.
 * L3  generated negatives for every body: enum, integer, string, decimal, array,
 *     required (every key path), schema swap, pollution and bad roots. Every
 *     case is refused or accepted only where the published schema also accepts
 *     it; F5c closed every recorded looseness (the FIXED tests below).
 */
import { afterAll, describe, expect, it } from "vitest";

import { canonicalDigest, loadCanonical, schemaEnum } from "../testkit/loadCanonical";
import { ABSENT, cartesian, coverage, describeCoverage, dimension, dimensionOf, getPath, setPath, type Draft } from "../testkit/matrix";
import {
  arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases, schemaVersionCases, stringCases,
  type NegativeCase,
} from "../testkit/negative";
import { cloneRows, pad, timed } from "../testkit/scale";
import { validateAgainst } from "../testkit/schema";
import {
  APPROVAL_STATUSES_V2,
  FINDING_OUTCOMES_V2,
  FOLLOWING_PARENT_V2_SCHEMA,
  GOVERNANCE_PARENT_OPERATION_V2_SCHEMA,
  GOVERNANCE_PARENT_V2_SCHEMA,
  LIVE_PARENT_V2_SCHEMA,
  LATEST_OPERATION_ABSENCES,
  PANEL_KINDS_V2,
  PANEL_STATES_V2,
  PAPER_EXIT_LABEL_KEYS,
  PARENT_V2_SCHEMAS,
  REVIEW_STATES_V2,
  readCanaryParentV2,
  readGovernanceParentV2,
  readLiveParentV2,
  readOperationParentV2,
  readPaperExitParentV2,
  readR2ParentV2,
  readSandboxParentV2,
} from "./governanceParents";

/* ── budgets (stated, generous: the suite shares a machine with other lanes) ── */
const BUDGET_4096_FINDINGS_MS = 400;
const BUDGET_ALL_BODIES_MS = 200;
/** The schema bound on findings (PaperExitParentReadV2 evaluation.findings maxItems), fixed by F5c from 4,096. */
const MAX_FINDINGS = 256;

const FILE = "execution-positive-parent.synthetic";
const SCHEMA = "execution-operations.v1";
const digestBefore = canonicalDigest(FILE);
afterAll(() => {
  expect(canonicalDigest(FILE)).toBe(digestBefore);
});

const canonical = loadCanonical<Draft>(FILE);
const clone = <T,>(value: T): T => structuredClone(value);
const violations = (def: string, value: unknown) => validateAgainst(SCHEMA, `/$defs/${def}`, value);

/** The vocabularies as the published schema states them (pointers into execution-operations.v1). */
const R2 = "/$defs/R2ParentReadV2/properties";
const EXIT = "/$defs/PaperExitParentReadV2/properties";
const CRITERION = `${EXIT}/criteria/oneOf/0/properties/items/items/properties`;
const VOCAB = {
  approvalStatus: schemaEnum(SCHEMA, `${R2}/approval/properties/status`),
  reviewState: schemaEnum(SCHEMA, `${EXIT}/review/properties/review_state`),
  panelKind: schemaEnum(SCHEMA, `${EXIT}/evaluation/oneOf/0/properties/panels/items/properties/panel_kind`),
  panelState: schemaEnum(SCHEMA, `${EXIT}/evaluation/oneOf/0/properties/panels/items/properties/panel_state`),
  findingOutcome: schemaEnum(SCHEMA, `${EXIT}/evaluation/oneOf/0/properties/findings/items/properties/outcome`),
  operationStatus: schemaEnum(SCHEMA, `${R2}/latest_operation/oneOf/0/properties/stored_status`),
  r2Decision: schemaEnum(SCHEMA, `${R2}/recorded_activity/oneOf/0/properties/items/items/properties/decision`),
  exitDecision: schemaEnum(SCHEMA, `${EXIT}/recorded_activity/oneOf/0/properties/items/items/properties/decision`),
  verdictOutcome: schemaEnum(SCHEMA, `${R2}/recorded_verdicts/oneOf/0/properties/items/items/properties/outcome`),
  criterionKey: schemaEnum(SCHEMA, `${CRITERION}/criterion_key/oneOf/0/properties/value`),
  criterionLabel: schemaEnum(SCHEMA, `${CRITERION}/label_key/oneOf/0/properties/value`),
};

type Reader = (raw: unknown) => unknown;
interface Body { key: string; def: string; read: Reader; family: string }
const BODIES: Body[] = [
  ...["r2", "r2_absent", "r2_followthrough", "r2_followthrough_hashes_absent", "r2_recorded"].map((key) => ({ key, def: "R2ParentReadV2", read: readR2ParentV2 as Reader, family: "R2" })),
  ...["paper_exit", "paper_exit_absent", "paper_exit_extended", "paper_exit_criteria", "paper_exit_followthrough", "paper_exit_recorded"].map((key) => ({ key, def: "PaperExitParentReadV2", read: readPaperExitParentV2 as Reader, family: "PAPER_EXIT" })),
  ...["r2_operation", "r2_operation_uncaptured", "r2_operation_applied", "r2_operation_expired"].map((key) => ({ key, def: "R2ParentOperationReadV2", read: readOperationParentV2 as Reader, family: "R2" })),
  ...["paper_exit_operation", "paper_exit_operation_applied", "paper_exit_operation_expired"].map((key) => ({ key, def: "PaperExitParentOperationReadV2", read: readOperationParentV2 as Reader, family: "PAPER_EXIT" })),
  // BE-P12 (c159bb40): the two bodies per family that carry the optional closed `identity` (published, and hidden with typed reasons).
  ...["sandbox", "sandbox_absent", "sandbox_draft", "sandbox_identity", "sandbox_identity_hidden"].map((key) => ({ key, def: "SandboxParentReadV2", read: readSandboxParentV2 as Reader, family: "SANDBOX" })),
  ...["canary", "canary_absent", "canary_revision", "canary_identity", "canary_identity_hidden"].map((key) => ({ key, def: "CanaryParentReadV2", read: readCanaryParentV2 as Reader, family: "CANARY" })),
  { key: "live", def: "LiveParentReadV2", read: readLiveParentV2 as Reader, family: "LIVE_GATE" },
];
const bodyOf = (key: string): Draft => canonical[key];

/* ═════════════════════════ L0 ═════════════════════════ */
describe("L0 · canonical, verbatim", () => {
  it("the file is the synthetic unqualified lane with the 29 parent bodies and 3 compositions this suite covers", () => {
    expect(canonical.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");
    expect(canonical.runtime_qualified).toBe(false);
    expect(canonical.authority_installed).toBe(false);
    // 25 before BE-P12 c159bb40, which published four more bodies (sandbox_identity, sandbox_identity_hidden, canary_identity,
    // canary_identity_hidden): the opt-in `identity` member, once published and once hidden, for each of the two following parents.
    expect(BODIES).toHaveLength(29);
    // Every object in the file is a covered body or a composition: a body Codex adds later fails here, not silently.
    const objects = Object.keys(canonical).filter((key) => typeof canonical[key] === "object");
    expect(objects.filter((key) => !BODIES.some((b) => b.key === key)).sort()).toEqual(["live_composition", "paper_exit_composition", "r2_composition"]);
    for (const { key } of BODIES) expect(canonical[key], key).toBeTypeOf("object");
  });

  it.each(BODIES.map((b) => [b.key, b] as const))("%s: schema-valid, read by its own reader and by the router, family and status unchanged", (_key, b) => {
    const body = bodyOf(b.key);
    expect(violations(b.def, body)).toEqual([]);
    const own = b.read(body) as Draft;
    expect(own, b.key).not.toBeNull();
    expect(own.family).toBe(b.family);
    expect(readGovernanceParentV2(body)).toEqual(own);
    // The status word of the approval passes through; the published EXPIRED is not turned into a closed or a green state.
    if (body.approval !== undefined) {
      expect(own.approval.status).toBe(body.approval.status);
      expect(own.approval.approvalId).toBe(body.approval.approval_id);
    }
    expect(own.header.workspaceId).toBe(body.workspace_id);
    expect(own.header.observedAt).toBe(body.observed_at_ms);
    // Every datum the body does not carry is named with its FE request, not left blank.
    for (const fe of Object.values(own.notPublished as Record<string, string>)) expect(fe).toMatch(/^FE-\d{3}$/);
  });

  it("the three compositions are not parents: no reader reads them, and the router answers null", () => {
    for (const key of ["r2_composition", "paper_exit_composition", "live_composition"]) {
      const body = canonical[key];
      if (body === undefined) continue;
      expect(readGovernanceParentV2(body), key).toBeNull();
      for (const b of BODIES) expect(b.read(body), `${b.key} on ${key}`).toBeNull();
    }
  });

  it("R2: an AVAILABLE lineage keeps its ids and currency; an absent one is a typed absence with its reason", () => {
    const r2 = readR2ParentV2(bodyOf("r2"))!;
    expect(r2.lineage).toEqual({ availability: "AVAILABLE", basis: "STORED_IMMUTABLE_REFERENCE", r1ApprovalId: "apr_TEST_ONLY_r1", observedRiskGrantId: "grant_TEST_ONLY_historical", currency: "TEST_ONLY:USD" });
    const absent = readR2ParentV2(bodyOf("r2_absent"))!;
    expect(absent.lineage).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
    expect(absent.lineage).not.toHaveProperty("r1ApprovalId");
  });

  it("Paper Exit: the extended review keeps 14 days and its end; panels and findings keep their order and counts", () => {
    const body = bodyOf("paper_exit_extended");
    const exit = readPaperExitParentV2(body)!;
    expect(exit.review).toMatchObject({ reviewState: "EXTENDED", extensionDays: 14, extendedUntil: 1792022400000, reviewVersion: 2 });
    expect(exit.evaluation.availability).toBe("AVAILABLE");
    if (exit.evaluation.availability !== "AVAILABLE") return;
    expect(exit.evaluation.panels.map((p) => p.panelId)).toEqual(body.evaluation.panels.map((p: Draft) => p.panel_id));
    expect(exit.evaluation.findings.map((f) => f.findingId)).toEqual(body.evaluation.findings.map((f: Draft) => f.finding_id));
    expect(exit.evaluation.findings.map((f) => f.outcome)).toEqual(body.evaluation.findings.map((f: Draft) => f.outcome));
    for (const absent of ["paper_exit_absent"]) {
      const read = readPaperExitParentV2(bodyOf(absent))!;
      expect(read.evaluation).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" });
    }
  });

  it("Sandbox: seven steps in published order; a draft has no submit or decision clock", () => {
    const sandbox = readSandboxParentV2(bodyOf("sandbox"))!;
    expect(sandbox.steps.availability).toBe("AVAILABLE");
    if (sandbox.steps.availability === "AVAILABLE") expect(sandbox.steps.items.map((s) => s.stepKey)).toEqual(["CONNECT", "SYNC", "ORDER_TYPES", "RECONCILIATION", "TIMEBOXED_RUN", "CLEANUP", "EXIT_REVIEW"]);
    const draft = readSandboxParentV2(bodyOf("sandbox_draft"))!;
    expect(draft.certification).toMatchObject({ workflowState: "DRAFT", submittedAt: null, decidedAt: null });
  });

  it("Canary: the proposed caps are the exact strings and proposed, never effective; a second revision names its predecessor", () => {
    const body = bodyOf("canary");
    const canary = readCanaryParentV2(body)!;
    expect(canary.proposal.availability).toBe("AVAILABLE");
    if (canary.proposal.availability === "AVAILABLE") {
      expect(canary.proposal.basis).toBe("PROPOSED_NOT_EFFECTIVE");
      expect(canary.proposal.capitalCap.exact).toBe(body.proposal.capital_cap);
      expect(canary.proposal.capitalCap.decimal.full).toBe(body.proposal.capital_cap);
      expect(canary.proposal.grossNotionalCap.exact).toBe(body.proposal.gross_notional_cap);
    }
    expect(canary.envelope).toMatchObject({ status: "DRAFT", productionCommandActive: false, deliveryProfile: "fixture" });
    expect(readCanaryParentV2(bodyOf("canary_revision"))!.envelope).toMatchObject({ revision: 2, previousEnvelopeId: "env_TEST_ONLY_parent" });
  });

  it("operations: APPLIED carries its clock, PLANNED and EXPIRED do not; the captured parent is all three facts or none", () => {
    for (const { key } of BODIES.filter((b) => b.key.includes("_operation"))) {
      const op = readOperationParentV2(bodyOf(key))!.operation;
      expect(op.status === "APPLIED", key).toBe(op.appliedAt !== null);
      expect(op.status, key).toBe(bodyOf(key).status);
    }
    expect(readOperationParentV2(bodyOf("r2_operation"))!.operation.capturedParent).toMatchObject({ approvalId: "apr_TEST_ONLY_r1" });
    expect(readOperationParentV2(bodyOf("r2_operation_uncaptured"))!.operation.capturedParent).toBeNull();
    expect(readOperationParentV2(bodyOf("paper_exit_operation"))!.operation.capturedParent).toBeNull();
  });

  it("Live: the accepted manager facts are a typed absence, the environment is LIVE, and the runtime flag stays false", () => {
    const live = readLiveParentV2(bodyOf("live"))!;
    expect(live.acceptedManagerFacts).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "PARENT_ROOT_NOT_SOURCE_SCREEN_COMPOSITION" });
    expect(live.anchors.environment).toBe("LIVE");
    expect(live.header.source.runtimeActivationRequested).toBe(false);
  });

  it("the reader's vocabularies are the schema's, word for word, in the schema's order", () => {
    expect([...APPROVAL_STATUSES_V2]).toEqual([...VOCAB.approvalStatus]);
    expect([...REVIEW_STATES_V2]).toEqual([...VOCAB.reviewState]);
    expect([...PANEL_KINDS_V2]).toEqual([...VOCAB.panelKind]);
    expect([...PANEL_STATES_V2]).toEqual([...VOCAB.panelState]);
    expect([...FINDING_OUTCOMES_V2]).toEqual([...VOCAB.findingOutcome]);
    expect([...VOCAB.operationStatus]).toEqual(["PLANNED", "APPLIED", "EXPIRED"]);
    expect([...VOCAB.r2Decision]).toEqual(["APPROVE", "APPROVE_WITH_CONDITION", "DENY"]);
    expect([...VOCAB.exitDecision]).toEqual(["PROMOTE", "EXTEND_OBSERVATION", "REJECT"]);
    expect([...VOCAB.verdictOutcome]).toEqual([...VOCAB.findingOutcome]);
    expect(Object.keys(PAPER_EXIT_LABEL_KEYS)).toEqual([...VOCAB.criterionKey]);
    expect(Object.values(PAPER_EXIT_LABEL_KEYS)).toEqual([...VOCAB.criterionLabel]);
    expect([...LATEST_OPERATION_ABSENCES]).toEqual(["PARENT_FIELD_PURPOSE_NOT_QUALIFIED", ...schemaEnum(SCHEMA, `${R2}/latest_operation/oneOf/2/properties/reason_code`)]);
  });

  it("e19ad906 sections: each one is AVAILABLE or the typed absence exactly as the wire says, on every body that carries it", () => {
    const sections: [string, string][] = [
      ["actors", "actors"], ["latest_operation", "latestOperation"], ["decision_context", "decisionContext"],
      ["recorded_activity", "recordedActivity"], ["recorded_verdicts", "recordedVerdicts"], ["criteria", "criteria"],
    ];
    let seen = 0;
    for (const { key, read } of BODIES.filter((b) => b.family === "R2" || b.family === "PAPER_EXIT")) {
      if (key.includes("_operation")) continue;
      const body = bodyOf(key);
      const own = read(body) as Draft;
      for (const [wire, camel] of sections) {
        if (body[wire] === undefined) {
          expect(own, `${key}.${camel}`).not.toHaveProperty(camel);
          continue;
        }
        seen += 1;
        expect(own[camel].availability, `${key}.${camel}`).toBe(body[wire].availability);
        if (body[wire].availability === "NOT_PUBLISHED") expect(own[camel].reasonCode, `${key}.${camel}`).toBe(body[wire].reason_code);
      }
    }
    // R2 bodies carry 5 sections, Paper Exit bodies 4: 5 R2 + 6 Paper Exit.
    expect(seen).toBe(5 * 5 + 4 * 6);
  });

  it("e19ad906: the source reference of a recorded verdict is the approval's, and of a criterion is the review's, in every body", () => {
    for (const key of ["r2_recorded"]) {
      const read = readR2ParentV2(bodyOf(key))!;
      if (read.recordedVerdicts.availability !== "AVAILABLE") throw new Error("absent");
      for (const verdict of read.recordedVerdicts.items) expect(verdict.sourceRef.approvalId).toBe(read.approval.approvalId);
    }
    const exit = readPaperExitParentV2(bodyOf("paper_exit_criteria"))!;
    if (exit.criteria.availability !== "AVAILABLE") throw new Error("absent");
    for (const item of exit.criteria.items) expect(item.sourceRef.reviewId).toBe(exit.review.reviewId);
  });

  it("the router's schema list is the four families, and every body's version is on it", () => {
    expect([...PARENT_V2_SCHEMAS]).toEqual([GOVERNANCE_PARENT_V2_SCHEMA, GOVERNANCE_PARENT_OPERATION_V2_SCHEMA, FOLLOWING_PARENT_V2_SCHEMA, LIVE_PARENT_V2_SCHEMA]);
    for (const { key } of BODIES) expect(PARENT_V2_SCHEMAS).toContain(bodyOf(key).schema_version);
  });
});

/* ═════════════════════════ L1 ═════════════════════════ */
describe("L1 · matrix A · approval: status x decision clock x update clock x quorum x evidence", () => {
  const C = bodyOf("r2").approval.created_at_ms as number;
  const DIMS = [
    dimension("status", ["approval", "status"], [...VOCAB.approvalStatus]),
    dimensionOf("decided_at", [
      { label: "null", apply: (d: Draft) => { d.approval.decided_at_ms = null; } },
      { label: "after-created", apply: (d: Draft) => { d.approval.decided_at_ms = C + 1000; } },
      { label: "before-created", apply: (d: Draft) => { d.approval.decided_at_ms = C - 1; } },
    ]),
    dimensionOf("updated_at", [
      { label: "ok", apply: (d: Draft) => { d.approval.updated_at_ms = C + 1; } },
      { label: "before-created", apply: (d: Draft) => { d.approval.updated_at_ms = C - 1; } },
    ]),
    dimensionOf("quorum", [[0, 1], [0, 2], [2, 2], [3, 2], [0, 0]].map(([met, required]) => ({
      label: `${met}/${required}`, apply: (d: Draft) => { d.approval.quorum_met = met; d.approval.quorum_required = required; },
    }))),
    dimension("evidence_complete", ["approval", "evidence_complete"], [true, false]),
  ];
  const states = cartesian(bodyOf("r2"), DIMS);
  const accepts = (p: Record<string, string>) => p.updated_at === "ok" && p.decided_at !== "before-created" && !p.quorum.endsWith("/0"); // quorum_required minimum 1 (GP-1)

  it("prints the matrix size and where the reader and the schema differ", () => {
    const cover = coverage(DIMS, states);
    const looser = states.filter((s) => readR2ParentV2(s.value) !== null && violations("R2ParentReadV2", s.value).length > 0);
    console.info(describeCoverage("governanceParents A (approval) cartesian", cover));
    console.info(`governanceParents A: reader accepts ${states.filter((s) => readR2ParentV2(s.value) !== null).length}, schema accepts ${states.filter((s) => violations("R2ParentReadV2", s.value).length === 0).length}; ${looser.length} accepted by the reader that the schema refuses`);
    expect(states).toHaveLength(VOCAB.approvalStatus.length * 3 * 2 * 5 * 2);
    expect(looser).toEqual([]);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    expect(() => readR2ParentV2(state.value)).not.toThrow();
    const read = readR2ParentV2(state.value);
    expect(read !== null).toBe(accepts(state.picks));
    if (read === null) return;
    const a = read.approval;
    expect(a.status).toBe(state.picks.status);
    expect(a.evidenceComplete).toBe(state.picks.evidence_complete === "true");
    expect(a.quorumMet).toBe(state.value.approval.quorum_met);
    expect(a.quorumRequired).toBe(state.value.approval.quorum_required);
    expect(a.decidedAt).toBe(state.value.approval.decided_at_ms);
    // Portal lifecycle clocks only; nothing is derived from them (no `isExpired`, `closed`, `overdue`).
    expect(Object.keys(a).filter((k) => /expired|closed|overdue|due$/i.test(k))).toEqual([]);
    expect(readGovernanceParentV2(state.value)).toEqual(read);
  });
});

describe("L1 · matrix B · Paper Exit: review state x extension x sections; panel clocks", () => {
  const base = bodyOf("paper_exit");
  const absent = { availability: "NOT_PUBLISHED", reason_code: "PARENT_FIELD_PURPOSE_NOT_QUALIFIED" };
  const DIMS = [
    dimension("review_state", ["review", "review_state"], [...VOCAB.reviewState]),
    dimensionOf("extension", [
      { label: "none", apply: (d: Draft) => { d.review.extension_days = null; d.review.extended_until_ms = null; } },
      { label: "14d", apply: (d: Draft) => { d.review.extension_days = 14; d.review.extended_until_ms = 1792022400000; } },
      { label: "7d", apply: (d: Draft) => { d.review.extension_days = 7; d.review.extended_until_ms = 1792022400000; } },
      { label: "14d no end", apply: (d: Draft) => { d.review.extension_days = 14; d.review.extended_until_ms = null; } },
    ]),
    dimensionOf("evaluation", [{ label: "available", apply: () => undefined }, { label: "absent", apply: (d: Draft) => { d.evaluation = clone(absent); } }]),
    dimensionOf("lineage", [{ label: "available", apply: () => undefined }, { label: "absent", apply: (d: Draft) => { d.lineage = clone(absent); } }]),
  ];
  const states = cartesian(base, DIMS);
  // EXTENDED needs exactly 14 days and an end; every other state needs neither.
  const accepts = (p: Record<string, string>) => (p.review_state === "EXTENDED" ? p.extension === "14d" : p.extension === "none");

  it("prints the matrix size", () => {
    console.info(describeCoverage("governanceParents B (exit review) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(VOCAB.reviewState.length * 4 * 2 * 2);
    // (EXTENDED + 14d) + (the other states + no extension), each over the 2 x 2 section choices.
    expect(states.filter((s) => accepts(s.picks))).toHaveLength(VOCAB.reviewState.length * 2 * 2);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readPaperExitParentV2(state.value);
    expect(read !== null).toBe(accepts(state.picks));
    if (read === null) return;
    expect(read.review.reviewState).toBe(state.picks.review_state);
    expect(read.review.extensionDays === 14).toBe(state.picks.review_state === "EXTENDED");
    // An optional section is an AVAILABLE body or a typed absence, never an empty list.
    expect(read.evaluation.availability).toBe(state.value.evaluation.availability);
    expect(read.lineage.availability).toBe(state.value.lineage.availability);
    if (read.evaluation.availability === "NOT_PUBLISHED") expect(read.evaluation).not.toHaveProperty("panels");
    expect(violations("PaperExitParentReadV2", state.value)).toEqual([]);
  });

  describe("panel clocks: freshness x as_of x completeness x poll interval", () => {
    const P = base.evaluation.panels[0];
    const PDIMS = [
      dimension("freshness", ["evaluation", "panels", 0, "freshness_state"], ["OK", "STALE", "UNKNOWN"]),
      dimension("as_of", ["evaluation", "panels", 0, "as_of_ms"], [null, 1790812800000]),
      dimension("completeness", ["evaluation", "panels", 0, "source_completeness"], ["EVENT_SOURCED", "POLL_BOUNDED", "UNKNOWN"]),
      // 3,600,001 is read as "no interval" by the reader: DEFECT GP-3, held below, so it is not a matrix value.
      dimension("poll", ["evaluation", "panels", 0, "poll_interval_ms"], [null, 100, 99, 3_600_000]),
    ];
    const pstates = cartesian({ ...base, evaluation: { ...base.evaluation, panels: [clone(P)], findings: [] } }, PDIMS);
    const paccepts = (p: Record<string, string>) =>
      !(p.freshness === "OK" && p.as_of === "null")
      && (p.completeness === "POLL_BOUNDED") === (p.poll !== "null")
      && (p.poll === "null" || (Number(p.poll) >= 100 && Number(p.poll) <= 3_600_000));

    it("prints the matrix size", () => {
      console.info(describeCoverage("governanceParents B (panel clocks) cartesian", coverage(PDIMS, pstates)));
      expect(pstates).toHaveLength(3 * 2 * 3 * 4);
    });

    it.each(pstates.map((s) => [s.name, s] as const))("%s", (_name, state) => {
      const read = readPaperExitParentV2(state.value);
      expect(read !== null).toBe(paccepts(state.picks));
      if (read === null || read.evaluation.availability !== "AVAILABLE") return;
      const panel = read.evaluation.panels[0]!;
      // A fresh panel always has a clock; a panel with no clock is never "fresh".
      if (panel.freshness === "OK") expect(panel.asOf).not.toBeNull();
      expect(panel.pollIntervalMs).toBe(state.value.evaluation.panels[0].poll_interval_ms);
    });
  });
});

describe("L1 · matrix C · Sandbox: workflow state x clocks; step recording and order", () => {
  const base = bodyOf("sandbox");
  const C = base.certification.created_at_ms as number;
  const DIMS = [
    dimension("workflow_state", ["certification", "workflow_state"], ["DRAFT", "IN_REVIEW", "APPROVED", "DENIED"]),
    dimensionOf("submitted_at", [
      { label: "null", apply: (d: Draft) => { d.certification.submitted_at_ms = null; } },
      { label: "after-created", apply: (d: Draft) => { d.certification.submitted_at_ms = C + 1000; } },
      { label: "before-created", apply: (d: Draft) => { d.certification.submitted_at_ms = C - 1; } },
    ]),
    dimensionOf("decided_at", [
      { label: "null", apply: (d: Draft) => { d.certification.decided_at_ms = null; } },
      { label: "after-submitted", apply: (d: Draft) => { d.certification.decided_at_ms = C + 2000; } },
      { label: "before-submitted", apply: (d: Draft) => { d.certification.decided_at_ms = C + 500; } },
    ]),
    dimensionOf("updated_at", [
      { label: "ok", apply: (d: Draft) => { d.certification.updated_at_ms = C + 3000; } },
      { label: "before-created", apply: (d: Draft) => { d.certification.updated_at_ms = C - 1; } },
    ]),
  ];
  const states = cartesian(base, DIMS);
  const accepts = (p: Record<string, string>) => {
    if (p.updated_at !== "ok" || p.submitted_at === "before-created") return false;
    // The schema's if/then (GP-6): only DRAFT has no submit clock; only APPROVED / DENIED has a decision clock.
    if ((p.workflow_state === "DRAFT") !== (p.submitted_at === "null")) return false;
    if ((p.workflow_state === "APPROVED" || p.workflow_state === "DENIED") !== (p.decided_at !== "null")) return false;
    if (p.decided_at === "null") return true;
    if (p.submitted_at === "null") return false;
    return p.decided_at === "after-submitted";
  };

  it("prints the matrix size", () => {
    console.info(describeCoverage("governanceParents C (sandbox clocks) cartesian", coverage(DIMS, states)));
    const looser = states.filter((x) => readSandboxParentV2(x.value) !== null && violations("SandboxParentReadV2", x.value).length > 0);
    console.info(`governanceParents C: reader accepts ${states.filter((x) => accepts(x.picks)).length}, ${looser.length} of them the schema refuses`);
    expect(looser).toEqual([]);
    expect(states).toHaveLength(4 * 3 * 3 * 2);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readSandboxParentV2(state.value);
    expect(read !== null).toBe(accepts(state.picks));
    if (read === null) return;
    expect(read.certification.workflowState).toBe(state.picks.workflow_state);
    // The state word is the server's; the reader does not derive APPROVED from a decision clock.
    expect(read.certification.decidedAt).toBe(state.value.certification.decided_at_ms);
    // The reader is never looser than the schema's state/clock pairing (GP-6).
    expect(violations("SandboxParentReadV2", state.value), state.name).toEqual([]);
  });

  describe("steps", () => {
    const NOT_RECORDED = (key: string) => ({ step_key: key, availability: "NOT_RECORDED", evidence_id: null, stored_evaluation_state: null, source_authority: null, source_verification_state: null, as_of_ms: null, expires_at_ms: null });
    const order = base.steps.items.map((s: Draft) => s.step_key) as string[];
    const VARIANTS: [string, (items: Draft[]) => Draft[], boolean][] = [
      ["as published", (i) => i, true],
      ["last NOT_RECORDED", (i) => [...i.slice(0, 6), NOT_RECORDED("EXIT_REVIEW")], true],
      ["all NOT_RECORDED", (i) => i.map((s) => NOT_RECORDED(s.step_key)), true],
      ["NOT_RECORDED with an evidence id", (i) => [...i.slice(0, 6), { ...NOT_RECORDED("EXIT_REVIEW"), evidence_id: "ev_x" }], false],
      ["NOT_RECORDED with a clock", (i) => [...i.slice(0, 6), { ...NOT_RECORDED("EXIT_REVIEW"), as_of_ms: 1 }], false],
      ["AVAILABLE with no evidence id", (i) => [{ ...i[0], evidence_id: null }, ...i.slice(1)], false],
      ["two steps swapped", (i) => [i[1], i[0], ...i.slice(2)], false],
      ["a step twice", (i) => [...i.slice(0, 6), { ...i[0] }], false],
      ["six steps", (i) => i.slice(0, 6), false],
      ["eight steps", (i) => [...i, { ...i[0] }], false],
      ["no steps", () => [], false],
    ];
    it("prints the matrix size", () => {
      console.info(`governanceParents C (steps): ${VARIANTS.length} variants over ${order.length} published steps, ${VARIANTS.filter((v) => v[2]).length} accepted`);
      expect(order).toHaveLength(7);
    });
    it.each(VARIANTS.map((v) => [v[0], v] as const))("%s", (_name, [, edit, ok]) => {
      const body = clone(base);
      body.steps.items = edit(clone(body.steps.items));
      const read = readSandboxParentV2(body);
      expect(read !== null).toBe(ok);
      if (read !== null && read.steps.availability === "AVAILABLE") {
        // Not recorded is not failed and not "not yet": every other field is null.
        for (const step of read.steps.items.filter((s) => !s.recorded)) expect([step.evidenceId, step.storedEvaluation, step.asOf, step.expiresAt]).toEqual([null, null, null, null]);
      }
    });
  });
});

describe("L1 · matrix D · Canary: revision x predecessor x proposed cap spelling", () => {
  const base = bodyOf("canary");
  const CAPS: unknown[] = ["1", "0", "0.00", "-1", "1e5", "01", "12345678901234567890", "123456789012345678901", "1.123456789012345678", "1.1234567890123456789", ".5", "5.", "1,000", 5, null, "9007199254740993.123456789123456789"];
  const REVISIONS: [number, string | null][] = [[1, null], [1, "env_prev"], [2, "env_prev"], [2, null], [0, null], [3, "env_prev"]];
  const DIMS = [
    dimensionOf("revision", REVISIONS.map(([rev, prev]) => ({ label: `${rev}/${prev === null ? "no-prev" : "prev"}`, apply: (d: Draft) => { d.envelope.revision = rev; d.envelope.previous_envelope_id = prev; } }))),
    dimensionOf("capital_cap", CAPS.map((cap) => ({ label: String(JSON.stringify(cap)), apply: (d: Draft) => { d.proposal.capital_cap = cap; } }))),
  ];
  const states = cartesian(base, DIMS);
  // The schema's own pattern: no leading zero, 20 integer and 18 fractional digits at most, and never zero.
  const capOk = (cap: unknown) => typeof cap === "string" && /^(?:0|[1-9][0-9]{0,19})(?:\.[0-9]{1,18})?$/.test(cap) && !/^[0.]+$/.test(cap);
  const accepts = (p: Record<string, string>) => {
    const [rev, prev] = p.revision.split("/");
    const cap = JSON.parse(p.capital_cap) as unknown;
    return Number(rev) >= 1 && (rev === "1") === (prev === "no-prev") && capOk(cap);
  };

  it("prints the matrix size", () => {
    console.info(describeCoverage("governanceParents D (canary) cartesian", coverage(DIMS, states)));
    expect(states).toHaveLength(REVISIONS.length * CAPS.length);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readCanaryParentV2(state.value);
    expect(read !== null).toBe(accepts(state.picks));
    if (read === null || read.proposal.availability !== "AVAILABLE") return;
    // A cap is the exact string, never a JS number, never zero or negative, and proposed, not effective.
    expect(read.proposal.capitalCap.exact).toBe(state.value.proposal.capital_cap);
    expect(read.proposal.capitalCap.decimal.zero).toBe(false);
    expect(read.proposal.basis).toBe("PROPOSED_NOT_EFFECTIVE");
    expect(read.envelope.status).toBe("DRAFT");
  });
});

describe("L1 · matrix E · operation: family x status x applied clock x captured parent x decision", () => {
  const bases: Record<string, Draft> = { R2: bodyOf("r2_operation_uncaptured"), PAPER_EXIT: bodyOf("paper_exit_operation") };
  const DECISIONS: Record<string, string[]> = { R2: ["APPROVE", "APPROVE_WITH_CONDITION", "DENY"], PAPER_EXIT: ["PROMOTE", "EXTEND_OBSERVATION", "REJECT"] };
  const HASH = `sha256:${"a".repeat(64)}`;
  const DIMS = [
    dimensionOf("family", [{ label: "R2", apply: () => undefined }, { label: "PAPER_EXIT", apply: () => undefined }]),
    dimension("status", ["status"], ["PLANNED", "APPLIED", "EXPIRED"]),
    dimensionOf("applied_at", [{ label: "null", apply: () => undefined }, { label: "after-created", apply: () => undefined }, { label: "before-created", apply: () => undefined }]),
    dimensionOf("parent", [{ label: "none", apply: () => undefined }, { label: "all three", apply: () => undefined }, { label: "id and version only", apply: () => undefined }]),
    dimensionOf("decision", [{ label: "own", apply: () => undefined }, { label: "other family's", apply: () => undefined }, { label: "unknown word", apply: () => undefined }]),
  ];
  const states = cartesian(bases.R2, DIMS).map((s) => {
    const body = clone(bases[s.picks.family]!);
    body.status = s.picks.status;
    const created = body.created_at_ms as number;
    body.applied_at_ms = s.picks.applied_at === "null" ? null : s.picks.applied_at === "after-created" ? created + 1000 : created - 1;
    if (s.picks.parent === "all three") { body.parent_approval_id = "apr_x"; body.parent_approval_version = 1; body.parent_evidence_set_hash = HASH; }
    if (s.picks.parent === "id and version only") { body.parent_approval_id = "apr_x"; body.parent_approval_version = 1; body.parent_evidence_set_hash = null; }
    const own = DECISIONS[s.picks.family]!;
    const other = DECISIONS[s.picks.family === "R2" ? "PAPER_EXIT" : "R2"]!;
    body.decision = s.picks.decision === "own" ? own[0] : s.picks.decision === "other family's" ? other[0] : "MAYBE";
    return { ...s, value: body };
  });
  const accepts = (p: Record<string, string>) => {
    if ((p.status === "APPLIED") !== (p.applied_at !== "null")) return false;
    if (p.applied_at === "before-created") return false;
    if (p.parent === "id and version only") return false;
    if (p.parent === "all three" && p.family !== "R2") return false;
    return p.decision === "own";
  };

  it("prints the matrix size and where the reader and the schema differ", () => {
    const looser = states.filter((s) => readOperationParentV2(s.value) !== null && violations(s.picks.family === "R2" ? "R2ParentOperationReadV2" : "PaperExitParentOperationReadV2", s.value).length > 0);
    console.info(describeCoverage("governanceParents E (operation) cartesian", coverage(DIMS, states)));
    console.info(`governanceParents E: ${states.length} states, ${states.filter((s) => accepts(s.picks)).length} accepted; ${looser.length} accepted by the reader that the schema refuses`);
    expect(states).toHaveLength(2 * 3 * 3 * 3 * 3);
    expect(looser).toHaveLength(0);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readOperationParentV2(state.value);
    expect(read !== null).toBe(accepts(state.picks));
    if (read === null) return;
    // APPLIED is the stored Portal state; the reader exposes the clock with it, and no acceptance/settlement claim.
    expect(read.operation.status === "APPLIED").toBe(read.operation.appliedAt !== null);
    expect(Object.keys(read.operation).filter((k) => /accept|settle|verif|broker/i.test(k))).toEqual([]);
    expect(read.operation.commandType).toBe(state.picks.family === "R2" ? "GOVERNANCE_R2_DECISION" : "GOVERNANCE_PAPER_EXIT_DECISION");
  });
});

/**
 * Matrices F to J (e19ad906). The oracle is the reader's contract plus the
 * schema beside it, and each one states its split:
 * - the reader is never LOOSER than the schema (`looser` is empty);
 * - every state the reader refuses and the schema accepts is a relation the
 *   schema descriptions give as "runtime additionally checks" (`runtimeOnly`),
 *   which standard JSON Schema cannot compare; the matrix names which.
 */
const cleanSchema = (def: string, value: unknown) => violations(def, value).length === 0;

describe("L1 · matrix F · recorded activity: kind x row count x has_more x version step x clock order x ids", () => {
  const ROWS = (n: number, mutate: (row: Draft, i: number) => void): Draft[] => Array.from({ length: n }, (_, i) => {
    const row: Draft = { decision_id: `decision_${i}`, operation_id: `op_${i}`, version_before: 1, version_after: 2, decided_at_ms: 1_790_812_800_000 - i * 1000, kind: "R2_DECISION_RECORDED", decision: "DENY" };
    mutate(row, i);
    return row;
  });
  const DIMS = [
    dimensionOf("kind", [{ label: "own", apply: () => undefined }, { label: "other family's", apply: () => undefined }]),
    dimensionOf("rows", [0, 1, 31, 32, 33].map((n) => ({ label: String(n), apply: () => undefined }))),
    dimension("has_more", ["recorded_activity", "has_more"], [false, true]),
    dimensionOf("step", [{ label: "+1", apply: () => undefined }, { label: "+0", apply: () => undefined }, { label: "+2", apply: () => undefined }]),
    dimensionOf("clock", [{ label: "descending", apply: () => undefined }, { label: "equal", apply: () => undefined }, { label: "ascending", apply: () => undefined }]),
    dimensionOf("ids", [{ label: "unique", apply: () => undefined }, { label: "duplicate decision", apply: () => undefined }, { label: "duplicate operation", apply: () => undefined }]),
    dimensionOf("decision", [{ label: "own", apply: () => undefined }, { label: "other family's", apply: () => undefined }]),
  ];
  const states = cartesian(bodyOf("r2_recorded"), DIMS).map((state) => {
    const body = clone(bodyOf("r2_recorded"));
    const n = Number(state.picks.rows);
    body.recorded_activity.has_more = state.picks.has_more === "true";
    body.recorded_activity.items = ROWS(n, (row, i) => {
      if (state.picks.kind !== "own") row.kind = "PAPER_EXIT_DECISION_RECORDED";
      if (state.picks.step === "+0") row.version_after = 1;
      if (state.picks.step === "+2") row.version_after = 3;
      if (state.picks.clock === "equal") row.decided_at_ms = 1_790_812_800_000;
      if (state.picks.clock === "ascending") row.decided_at_ms = 1_790_812_800_000 + i * 1000;
      if (state.picks.ids === "duplicate decision" && i > 0) row.decision_id = "decision_0";
      if (state.picks.ids === "duplicate operation" && i > 0) row.operation_id = "op_0";
      if (state.picks.decision !== "own") row.decision = "PROMOTE";
    });
    return { ...state, value: body };
  });
  // What only the reader can know: the version step, the clock order, the id uniqueness (and, with one row, order and uniqueness are vacuous).
  const runtimeBreaks = (p: Record<string, string>) => {
    const n = Number(p.rows);
    return p.step !== "+1" && n > 0 || (n > 1 && (p.clock === "ascending" || p.ids !== "unique"));
  };
  const schemaOk = (p: Record<string, string>) => {
    const n = Number(p.rows);
    // maxItems 32; the kind and the decision are per row, so an empty list carries neither.
    return n <= 32 && (n === 0 || (p.kind === "own" && p.decision === "own")) && !(p.has_more === "true" && n < 32);
  };
  const readerOk = (p: Record<string, string>) => schemaOk(p) && !runtimeBreaks(p);

  it("prints the matrix size and the schema/runtime split", () => {
    console.info(describeCoverage("governanceParents F (recorded activity) cartesian", coverage(DIMS, states)));
    const looser = states.filter((x) => readR2ParentV2(x.value) !== null && !cleanSchema("R2ParentReadV2", x.value));
    const runtimeOnly = states.filter((x) => readR2ParentV2(x.value) === null && cleanSchema("R2ParentReadV2", x.value));
    console.info(`governanceParents F: ${states.length} states, reader accepts ${states.filter((x) => readerOk(x.picks)).length}, ${runtimeOnly.length} refused by the reader that the schema accepts (runtime relations)`);
    expect(states).toHaveLength(2 * 5 * 2 * 3 * 3 * 3 * 2);
    expect(looser).toEqual([]);
    expect(runtimeOnly.length).toBeGreaterThan(0);
    expect(runtimeOnly.every((x) => runtimeBreaks(x.picks))).toBe(true);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readR2ParentV2(state.value);
    expect(read !== null).toBe(readerOk(state.picks));
    if (read === null || read.recordedActivity.availability !== "AVAILABLE") return;
    const activity = read.recordedActivity;
    // The rows are as sent, in the order sent; nothing is sorted, merged or dropped to make the matrix pass.
    expect(activity.items.map((i) => i.decisionId)).toEqual(state.value.recorded_activity.items.map((i: Draft) => i.decision_id));
    expect(activity.hasMore).toBe(state.value.recorded_activity.has_more);
    // "More than shown" only ever with a full page: 32 rows.
    if (activity.hasMore) expect(activity.items).toHaveLength(32);
    for (const row of activity.items) expect(row.versionAfter).toBe(row.versionBefore + 1);
  });
});

describe("L1 · matrix G · R2 recorded verdicts: outcome x blocking x ordinal order x reference x has_more", () => {
  const DIMS = [
    dimension("outcome", ["recorded_verdicts", "items", 1, "outcome"], [...VOCAB.verdictOutcome]),
    dimension("blocking", ["recorded_verdicts", "items", 1, "blocking"], [false, true]),
    dimensionOf("ordinals", [
      { label: "ascending", apply: () => undefined },
      { label: "equal", apply: (d: Draft) => { d.recorded_verdicts.items[1].ordinal = d.recorded_verdicts.items[0].ordinal; } },
      { label: "descending", apply: (d: Draft) => { d.recorded_verdicts.items[1].ordinal = d.recorded_verdicts.items[0].ordinal - 1; d.recorded_verdicts.items[0].ordinal = 5; } },
    ]),
    dimensionOf("reference", [
      { label: "own approval", apply: () => undefined },
      { label: "other approval", apply: (d: Draft) => { d.recorded_verdicts.items[1].source_ref.approval_id = "apr_other"; } },
      { label: "other finding", apply: (d: Draft) => { d.recorded_verdicts.items[1].source_ref.finding_id = "finding_other"; } },
    ]),
    dimension("has_more", ["recorded_verdicts", "has_more"], [false, true]),
  ];
  const base = bodyOf("r2_recorded");
  const states = cartesian(base, DIMS);
  const schemaOk = (p: Record<string, string>) => !(p.blocking === "true" && (p.outcome === "PASS" || p.outcome === "WATCH")) && p.has_more === "false";
  const runtimeBreaks = (p: Record<string, string>) => p.ordinals !== "ascending" || p.reference !== "own approval";

  it("prints the matrix size and the schema/runtime split", () => {
    console.info(describeCoverage("governanceParents G (recorded verdicts) cartesian", coverage(DIMS, states)));
    const looser = states.filter((x) => readR2ParentV2(x.value) !== null && !cleanSchema("R2ParentReadV2", x.value));
    const runtimeOnly = states.filter((x) => readR2ParentV2(x.value) === null && cleanSchema("R2ParentReadV2", x.value));
    console.info(`governanceParents G: ${states.length} states, ${runtimeOnly.length} refused by the reader that the schema accepts (ordinal order, reference identity)`);
    expect(states).toHaveLength(VOCAB.verdictOutcome.length * 2 * 3 * 3 * 2);
    expect(looser).toEqual([]);
    expect(runtimeOnly.every((x) => runtimeBreaks(x.picks))).toBe(true);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readR2ParentV2(state.value);
    expect(read !== null).toBe(schemaOk(state.picks) && !runtimeBreaks(state.picks));
    if (read === null || read.recordedVerdicts.availability !== "AVAILABLE") return;
    const second = read.recordedVerdicts.items[1]!;
    expect(second.outcome).toBe(state.picks.outcome);
    // A blocking verdict is a FAIL or INSUFFICIENT, never a PASS or WATCH; the reader derives no verdict of its own.
    if (second.blocking) expect(["FAIL", "INSUFFICIENT"]).toContain(second.outcome);
    // An R2 verdict has no observed value or limit on the wire, so the read has none.
    expect(Object.keys(second).filter((k) => /observed|limit|label|threshold|comparator/i.test(k))).toEqual([]);
  });
});

describe("L1 · matrix H · Paper Exit criterion: key x label x observed spelling x source clock", () => {
  const base = bodyOf("paper_exit_criteria");
  const absentMetric = { availability: "NOT_PUBLISHED", value: null, reason_code: "SOURCE_METRIC_NOT_REGISTERED" };
  const present = (value: unknown) => ({ availability: "AVAILABLE", value, reason_code: null });
  const absentValue = (reason: string) => ({ availability: "NOT_PUBLISHED", value: null, reason_code: reason });
  const OBSERVED: [string, unknown, boolean][] = [
    ["exact decimal", present("1842.000000000000000001"), true],
    ["zero", present("0"), true],
    ["negative zero", present("-0"), true],
    ["negative", present("-5.25"), true],
    ["not recorded", absentValue("SOURCE_VALUE_NOT_RECORDED"), true],
    ["not decimal", absentValue("SOURCE_VALUE_NOT_DECIMAL"), true],
    ["wrong absence word", absentValue("SOURCE_TEXT_NOT_RECORDED"), false],
    ["exponent", present("1e5"), false],
    ["leading zero", present("01"), false],
    ["a JS number", present(1842), false],
    ["trailing dot", present("1."), false],
    ["empty", present(""), false],
    ["too long", present("9".repeat(129)), false],
  ];
  const DIMS = [
    dimensionOf("key", [...VOCAB.criterionKey, "absent"].map((k) => ({
      label: k, apply: (d: Draft) => { d.criteria.items[0].criterion_key = k === "absent" ? clone(absentMetric) : present(k); },
    }))),
    dimensionOf("label", [...VOCAB.criterionLabel, "absent"].map((l) => ({
      label: l, apply: (d: Draft) => { d.criteria.items[0].label_key = l === "absent" ? clone(absentMetric) : present(l); },
    }))),
    dimensionOf("observed", OBSERVED.map(([label, value]) => ({ label, apply: (d: Draft) => { d.criteria.items[0].observed = clone(value); } }))),
    dimensionOf("source_time", [
      { label: "the finding's clock", apply: () => undefined },
      { label: "another clock", apply: (d: Draft) => { d.criteria.items[0].source_time.value = 1; } },
      { label: "none for a finding that has one", apply: (d: Draft) => { d.criteria.items[0].source_time = absentValue("SOURCE_TIME_NOT_RECORDED"); } },
    ]),
  ];
  const states = cartesian(base, DIMS);
  const labelFits = (p: Record<string, string>) =>
    p.key === "absent" ? p.label === "absent" : p.label === VOCAB.criterionLabel[VOCAB.criterionKey.indexOf(p.key)];
  const observedOk = (p: Record<string, string>) => OBSERVED.find(([label]) => label === p.observed)![2];
  const schemaOk = (p: Record<string, string>) => labelFits(p) && observedOk(p);

  it("prints the matrix size and the schema/runtime split", () => {
    console.info(describeCoverage("governanceParents H (criterion) cartesian", coverage(DIMS, states)));
    const looser = states.filter((x) => readPaperExitParentV2(x.value) !== null && !cleanSchema("PaperExitParentReadV2", x.value));
    const runtimeOnly = states.filter((x) => readPaperExitParentV2(x.value) === null && cleanSchema("PaperExitParentReadV2", x.value));
    console.info(`governanceParents H: ${states.length} states, ${runtimeOnly.length} refused by the reader that the schema accepts (the source clock must be the finding's)`);
    expect(states).toHaveLength((VOCAB.criterionKey.length + 1) * (VOCAB.criterionLabel.length + 1) * OBSERVED.length * 3);
    expect(looser).toEqual([]);
    expect(runtimeOnly.every((x) => x.picks.source_time !== "the finding's clock")).toBe(true);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readPaperExitParentV2(state.value);
    expect(read !== null).toBe(schemaOk(state.picks) && state.picks.source_time === "the finding's clock");
    if (read === null || read.criteria.availability !== "AVAILABLE") return;
    const item = read.criteria.items[0]!;
    const wire = state.value.criteria.items[0].observed;
    // The exact string, or the absence with its word: never a number, never 0 for a value that was not recorded.
    if (wire.availability === "AVAILABLE") expect(item.observed).toEqual({ availability: "AVAILABLE", value: wire.value });
    else expect(item.observed).toEqual({ availability: "NOT_PUBLISHED", reasonCode: wire.reason_code });
    // The label is the key's own, or both are absent.
    expect(item.labelKey.availability).toBe(item.criterionKey.availability);
    expect(item.comparator).toEqual({ availability: "NOT_PUBLISHED", reasonCode: "SOURCE_COMPARATOR_FIELD_NOT_RECORDED" });
  });
});

describe("L1 · matrix I · actors: decider x viewer flags", () => {
  const base = bodyOf("r2_recorded");
  const DIMS = [
    dimensionOf("decider", [
      { label: "none", apply: (d: Draft) => { d.actors.decided_by_user_id = null; } },
      { label: "named", apply: (d: Draft) => { d.actors.decided_by_user_id = "user_decider"; } },
      { label: "bad id", apply: (d: Draft) => { d.actors.decided_by_user_id = "a b"; } },
    ]),
    dimension("viewer_is_decided_by", ["actors", "viewer_is_decided_by"], [null, true, false]),
    dimension("viewer_is_requester", ["actors", "viewer_is_requester"], [true, false]),
    dimension("viewer_is_artifact_creator", ["actors", "viewer_is_artifact_creator"], [true, false]),
  ];
  const states = cartesian(base, DIMS);
  const accepts = (p: Record<string, string>) => p.decider !== "bad id" && (p.decider === "none") === (p.viewer_is_decided_by === "null");

  it("prints the matrix size", () => {
    console.info(describeCoverage("governanceParents I (actors) cartesian", coverage(DIMS, states)));
    const looser = states.filter((x) => readR2ParentV2(x.value) !== null && !cleanSchema("R2ParentReadV2", x.value));
    expect(states).toHaveLength(3 * 3 * 2 * 2);
    expect(looser).toEqual([]);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readR2ParentV2(state.value);
    expect(read !== null).toBe(accepts(state.picks));
    if (read === null || read.actors.availability !== "AVAILABLE") return;
    expect(read.actors.decidedByUserId).toBe(state.value.actors.decided_by_user_id);
    expect(read.actors.viewerIsDecidedBy).toBe(state.value.actors.viewer_is_decided_by);
    // The flags are the server's; the reader does not recompute "is the viewer" from ids it cannot compare, and offers no eligibility.
    expect(Object.keys(read.actors).filter((k) => /eligib|allowed|may|sod|separation|role/i.test(k))).toEqual([]);
  });
});

describe("L1 · matrix J · R2 decision inputs: workspace x approval x version x evidence hash order and count", () => {
  const base = bodyOf("r2_followthrough");
  const hash = (i: number) => `sha256:${i.toString(16).padStart(64, "0")}`;
  const LISTS: [string, () => string[], boolean][] = [
    ["empty", () => [], true],
    ["one", () => [hash(1)], true],
    ["ascending", () => [hash(1), hash(2), hash(3)], true],
    ["descending", () => [hash(3), hash(2), hash(1)], false],
    ["duplicate", () => [hash(1), hash(1)], false],
    ["128", () => Array.from({ length: 128 }, (_, i) => hash(i)), true],
    ["129", () => Array.from({ length: 129 }, (_, i) => hash(i)), false],
  ];
  const DIMS = [
    dimensionOf("workspace", [
      { label: "the parent's", apply: () => undefined },
      { label: "another", apply: (d: Draft) => { d.decision_context.workspace_id = "ws_other"; } },
    ]),
    dimensionOf("approval", [
      { label: "this one", apply: () => undefined },
      { label: "another", apply: (d: Draft) => { d.decision_context.approval_id = "apr_other"; } },
    ]),
    dimensionOf("version", [
      { label: "the parent's", apply: () => undefined },
      { label: "next", apply: (d: Draft) => { d.decision_context.expected_approval_version = d.approval.approval_version + 1; } },
    ]),
    dimensionOf("hashes", LISTS.map(([label, make]) => ({ label, apply: (d: Draft) => { d.decision_context.evidence_hashes.value = make(); } }))),
  ];
  const states = cartesian(base, DIMS);
  const listOk = (label: string) => LISTS.find(([l]) => l === label)![2];
  const identityOk = (p: Record<string, string>) => p.workspace === "the parent's" && p.approval === "this one" && p.version === "the parent's";

  it("prints the matrix size and the schema/runtime split", () => {
    console.info(describeCoverage("governanceParents J (decision inputs) cartesian", coverage(DIMS, states)));
    const looser = states.filter((x) => readR2ParentV2(x.value) !== null && !cleanSchema("R2ParentReadV2", x.value));
    const runtimeOnly = states.filter((x) => readR2ParentV2(x.value) === null && cleanSchema("R2ParentReadV2", x.value));
    console.info(`governanceParents J: ${states.length} states, ${runtimeOnly.length} refused by the reader that the schema accepts (identity with the parent, hash order)`);
    expect(states).toHaveLength(2 * 2 * 2 * LISTS.length);
    expect(looser).toEqual([]);
    expect(runtimeOnly.every((x) => !identityOk(x.picks) || x.picks.hashes === "descending")).toBe(true);
    // The schema accepts the descending list (it cannot compare array members): the reader is what says no.
    expect(states.filter((x) => x.picks.hashes === "descending" && identityOk(x.picks)).every((x) => cleanSchema("R2ParentReadV2", x.value))).toBe(true);
  });

  it.each(states.map((s) => [s.name, s] as const))("%s", (_name, state) => {
    const read = readR2ParentV2(state.value);
    expect(read !== null).toBe(identityOk(state.picks) && listOk(state.picks.hashes));
    if (read === null || read.decisionContext.availability !== "AVAILABLE") return;
    const hashes = read.decisionContext.evidenceHashes;
    // An empty list is an empty list (a value), and above 128 there is no list at all: neither is repaired into the other.
    if (hashes.availability === "AVAILABLE") expect(hashes.value).toEqual(state.value.decision_context.evidence_hashes.value);
    expect(read.decisionContext.planPath).toBe("/api/v1/execution/commands/plans");
    expect(read.decisionContext.admission.state).toBe("NOT_EVALUATED");
  });
});

/* ═════════════════════════ L2 ═════════════════════════ */
/** The two words the identity member publishes, as the schema's enums state them (the same object in the Sandbox and Canary bodies). */
const IDENTITY_ALPHA_REASONS = schemaEnum(SCHEMA, "/$defs/SandboxParentReadV2/properties/identity/properties/alpha_reason_code");
const IDENTITY_PORTFOLIO_REASONS = schemaEnum(SCHEMA, "/$defs/SandboxParentReadV2/properties/identity/properties/portfolio_name_reason_code/anyOf/0");

describe("L1 · matrix K · identity (BE-P12): the published object, read exactly as the schema reads it, in both following parents", () => {
  const NAMES: unknown[] = ["Portfolio Name", null, "", " lead", "trail ", "a\nb", "a\u202eb", "\u200fx", "x".repeat(256), "x".repeat(257), 7];
  const ALPHA_IDS: unknown[] = ["alpha_TEST_ONLY", null, "", "-lead", "a b", "a".repeat(191), "a".repeat(192), 7];
  const dims = [
    dimension("alpha_id", ["identity", "alpha_id"], ALPHA_IDS, (v) => JSON.stringify(v).slice(0, 20)),
    dimension("alpha_name", ["identity", "alpha_name"], [null, "An Alpha"]),
    dimension("alpha_reason", ["identity", "alpha_reason_code"], [...IDENTITY_ALPHA_REASONS, "ALPHA_NAME_UNKNOWN", null]),
    dimension("portfolio_name", ["identity", "portfolio_name"], NAMES, (v) => JSON.stringify(v).slice(0, 24)),
    dimension("portfolio_reason", ["identity", "portfolio_name_reason_code"], [null, ...IDENTITY_PORTFOLIO_REASONS, "PORTFOLIO_UNKNOWN"]),
  ];
  const cases = [
    ["sandbox", "sandbox_identity", "SandboxParentReadV2", readSandboxParentV2],
    ["canary", "canary_identity", "CanaryParentReadV2", readCanaryParentV2],
  ] as const;

  it("the four canonical bodies carry the identity member; the original six do not and read it as null", () => {
    for (const key of ["sandbox_identity", "sandbox_identity_hidden", "canary_identity", "canary_identity_hidden"]) {
      expect(Object.keys(bodyOf(key)), key).toContain("identity");
      expect(Object.keys(bodyOf(key.split("_")[0]!)), key).not.toContain("identity");
    }
    for (const key of ["sandbox", "sandbox_absent", "sandbox_draft", "canary", "canary_absent", "canary_revision"]) {
      expect((readGovernanceParentV2(bodyOf(key)) as Draft).identity, key).toBeNull();
    }
  });

  it("published: ids and name come back as published; alpha_name stays null; hidden: null parts with their typed reasons", () => {
    for (const family of ["sandbox", "canary"]) {
      const shown = (readGovernanceParentV2(bodyOf(`${family}_identity`)) as Draft).identity;
      expect(shown).toEqual({
        basis: "RETAINED_PROJECTION_ROW_AND_FIELD_POLICY", alphaId: "alpha_TEST_ONLY_identity", alphaName: null, portfolioName: "TEST_ONLY portfolio name",
        alphaReasonCode: "ALPHA_NAME_NOT_PUBLISHED", portfolioNameReasonCode: null,
      });
      const hidden = (readGovernanceParentV2(bodyOf(`${family}_identity_hidden`)) as Draft).identity;
      expect(hidden).toEqual({
        basis: "RETAINED_PROJECTION_ROW_AND_FIELD_POLICY", alphaId: null, alphaName: null, portfolioName: null,
        alphaReasonCode: "ALPHA_IDENTITY_NOT_AUTHORIZED", portfolioNameReasonCode: "PORTFOLIO_NAME_NOT_AUTHORIZED",
      });
    }
  });

  it("the body without its identity member reads as the same parent with identity null (the member is the only difference)", () => {
    for (const [family, key] of cases) {
      const body = clone(bodyOf(key));
      delete body.identity;
      const bare = readGovernanceParentV2(body) as Draft;
      expect(bare.identity, family).toBeNull();
      expect({ ...(readGovernanceParentV2(bodyOf(key)) as Draft), identity: null }, family).toEqual(bare);
    }
  });

  it("the name bound is 256 CHARACTERS (code points), as the schema and the producer count it: 256 astral characters read, 257 do not", () => {
    // The testkit checker counts UTF-16 units and would refuse the first; the schema (JSON Schema maxLength) and the
    // producer (`[...value].length`) do not, and a reader stricter than the producer would void a body the server may send.
    for (const [family, key, , read] of cases) {
      const body = clone(bodyOf(key));
      body.identity.portfolio_name = "\u{1F600}".repeat(256);
      expect(read(body), family).not.toBeNull();
      body.identity.portfolio_name = "\u{1F600}".repeat(257);
      expect(read(body), family).toBeNull();
    }
  });

  it("a present key with no usable object is a refusal, not 'nothing to show'", () => {
    for (const [family, key, , read] of cases) {
      for (const bad of [null, [], "identity", 0, {}]) {
        const body = clone(bodyOf(key));
        body.identity = bad;
        expect(read(body), `${family} ${JSON.stringify(bad)}`).toBeNull();
      }
    }
  });

  for (const [family, key, def, read] of cases) {
    const states = cartesian(bodyOf(key), dims);
    it(`${family}: ${states.length} identity states; the reader accepts exactly what the published schema accepts`, () => {
      console.info(describeCoverage(`governanceParents K (${family} identity) cartesian`, coverage(dims, states)));
      const looser = states.filter((x) => read(x.value) !== null && violations(def, x.value).length > 0).map((x) => x.name);
      const stricter = states.filter((x) => read(x.value) === null && violations(def, x.value).length === 0).map((x) => x.name);
      expect({ looser }).toEqual({ looser: [] });
      expect({ stricter }).toEqual({ stricter: [] });
      const accepted = states.filter((x) => read(x.value) !== null);
      expect(accepted.length).toBeGreaterThan(0);
      expect(accepted.length).toBeLessThan(states.length / 4);
    });
  }
});

describe("L2 · scale", () => {
  const base = bodyOf("paper_exit_extended");
  const withFindings = (n: number, idLength = 20): Draft => {
    const body = clone(base);
    const kinds = body.evaluation.panels.map((p: Draft) => p.panel_id) as string[];
    body.evaluation.findings = cloneRows(base.evaluation.findings[0] as Draft, n, (f, i) => {
      f.finding_id = `finding_${pad(i)}`.padEnd(idLength, "x");
      f.panel_id = kinds[i % kinds.length]!;
      f.ordinal = i;
    });
    return body;
  };

  it("all 25 published bodies are read inside the budget, repeated 50 times", () => {
    const { ms } = timed(() => {
      for (let n = 0; n < 50; n += 1) for (const b of BODIES) b.read(bodyOf(b.key));
    });
    console.info(`governanceParents 25 bodies x 50: ${ms.toFixed(0)} ms (budget ${BUDGET_ALL_BODIES_MS} ms)`);
    expect(ms).toBeLessThan(BUDGET_ALL_BODIES_MS);
  });

  it("reads 200 findings, in order, inside the budget", () => {
    const body = withFindings(200);
    const { value, ms } = timed(() => readPaperExitParentV2(body));
    expect(value).not.toBeNull();
    if (value!.evaluation.availability === "AVAILABLE") expect(value!.evaluation.findings.map((f) => f.ordinal)).toEqual(Array.from({ length: 200 }, (_, i) => i));
    expect(ms).toBeLessThan(BUDGET_4096_FINDINGS_MS);
  });

  it("reads the schema's bound (256 findings) inside the budget", () => {
    const body = withFindings(256, 191);
    const { value, ms } = timed(() => readPaperExitParentV2(body));
    expect(violations("PaperExitParentReadV2", body)).toEqual([]);
    expect(value).not.toBeNull();
    expect(ms).toBeLessThan(BUDGET_4096_FINDINGS_MS);
  });

  it("refuses a body one finding over the schema bound, and a 4,096 finding body, fast; the read is not paged", () => {
    const over = withFindings(MAX_FINDINGS + 1, 191);
    const { value, ms } = timed(() => readPaperExitParentV2(over));
    expect(value).toBeNull();
    expect(ms).toBeLessThan(BUDGET_4096_FINDINGS_MS);
    expect(readPaperExitParentV2(withFindings(4_096, 191))).toBeNull();
    expect(violations("PaperExitParentReadV2", over).length).toBeGreaterThan(0);
  });

  describe("e19ad906 sections at their schema bounds", () => {
    const activityRows = (n: number): Draft[] => Array.from({ length: n }, (_, i) => ({
      decision_id: `decision_${pad(i)}`.padEnd(191, "x"), operation_id: `op_${pad(i)}`.padEnd(191, "x"), version_before: 1, version_after: 2,
      decided_at_ms: 1_790_812_800_000 - i, kind: "R2_DECISION_RECORDED", decision: "DENY",
    }));
    const verdictRows = (n: number): Draft[] => cloneRows(bodyOf("r2_recorded").recorded_verdicts.items[0] as Draft, n, (row, i) => {
      row.finding_id = `finding_${pad(i)}`;
      row.ordinal = i;
      row.source_ref.finding_id = row.finding_id;
    });
    const criterionRows = (n: number): Draft[] => {
      const template = bodyOf("paper_exit_criteria").criteria.items[0] as Draft;
      return cloneRows(template, n, (row, i) => {
        row.original.finding_id = `finding_${pad(i)}`;
        row.source_ref.finding_id = row.original.finding_id;
      });
    };

    it("32 recorded decisions with ids at the 191 character bound are read, and 33 are refused, inside the budget", () => {
      const body = clone(bodyOf("r2_recorded"));
      body.recorded_activity.items = activityRows(32);
      body.recorded_activity.has_more = true;
      const { value, ms } = timed(() => readR2ParentV2(body));
      expect(violations("R2ParentReadV2", body)).toEqual([]);
      expect(value).not.toBeNull();
      if (value!.recordedActivity.availability === "AVAILABLE") expect(value!.recordedActivity.items).toHaveLength(32);
      expect(ms).toBeLessThan(BUDGET_4096_FINDINGS_MS);
      body.recorded_activity.items = activityRows(33);
      const over = timed(() => readR2ParentV2(body));
      expect(over.value).toBeNull();
      expect(violations("R2ParentReadV2", body).length).toBeGreaterThan(0);
      expect(over.ms).toBeLessThan(BUDGET_4096_FINDINGS_MS);
    });

    it("64 recorded verdicts are read in ordinal order, and 65 are refused, inside the budget", () => {
      const body = clone(bodyOf("r2_recorded"));
      body.recorded_verdicts.items = verdictRows(64);
      const { value, ms } = timed(() => readR2ParentV2(body));
      expect(violations("R2ParentReadV2", body)).toEqual([]);
      expect(value).not.toBeNull();
      if (value!.recordedVerdicts.availability === "AVAILABLE") expect(value!.recordedVerdicts.items.map((v) => v.ordinal)).toEqual(Array.from({ length: 64 }, (_, i) => i));
      expect(ms).toBeLessThan(BUDGET_4096_FINDINGS_MS);
      body.recorded_verdicts.items = verdictRows(65);
      expect(readR2ParentV2(body)).toBeNull();
      expect(violations("R2ParentReadV2", body).length).toBeGreaterThan(0);
    });

    it("256 criteria are read, and 257 are refused, inside the budget", () => {
      const body = clone(bodyOf("paper_exit_criteria"));
      body.criteria.items = criterionRows(256);
      const { value, ms } = timed(() => readPaperExitParentV2(body));
      expect(violations("PaperExitParentReadV2", body)).toEqual([]);
      expect(value).not.toBeNull();
      if (value!.criteria.availability === "AVAILABLE") expect(value!.criteria.items).toHaveLength(256);
      expect(ms).toBeLessThan(BUDGET_4096_FINDINGS_MS);
      body.criteria.items = criterionRows(257);
      const over = timed(() => readPaperExitParentV2(body));
      expect(over.value).toBeNull();
      expect(violations("PaperExitParentReadV2", body).length).toBeGreaterThan(0);
      expect(over.ms).toBeLessThan(BUDGET_4096_FINDINGS_MS);
    });

    it("a 70,000 character id, hash, decimal or text in a new section is refused fast, not scanned", () => {
      const cases: [Reader, string, readonly (string | number)[], string][] = [
        [readR2ParentV2, "r2_recorded", ["actors", "requester_user_id"], "a".repeat(70_000)],
        [readR2ParentV2, "r2_recorded", ["latest_operation", "operation_id"], "a".repeat(70_000)],
        [readR2ParentV2, "r2_recorded", ["recorded_activity", "items", 0, "decision_id"], "a".repeat(70_000)],
        [readR2ParentV2, "r2_followthrough", ["decision_context", "evidence_set_hash"], `sha256:${"a".repeat(70_000)}`],
        [readR2ParentV2, "r2_followthrough", ["decision_context", "evidence_hashes", "value", 0], `sha256:${"a".repeat(70_000)}`],
        [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0, "observed", "value"], "9".repeat(70_000)],
        [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0, "observed", "value"], `1.${"9".repeat(70_000)}`],
        [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0, "unit", "value"], "a".repeat(70_000)],
        [readPaperExitParentV2, "paper_exit_criteria", ["criteria", "items", 0, "currency", "value"], `${"a".repeat(70_000)}://`],
      ];
      for (const [read, key, path, text] of cases) {
        const body = clone(bodyOf(key));
        setPath(body, path, text);
        const { value, ms } = timed(() => read(body));
        expect(value, path.join(".")).toBeNull();
        expect(ms, path.join(".")).toBeLessThan(100);
      }
    });

    it("the URL guard on a criterion text is not a catastrophic pattern: a long run of scheme characters is refused in time", () => {
      const body = clone(bodyOf("paper_exit_criteria"));
      setPath(body, ["criteria", "items", 0, "unit", "value"], "a".repeat(190) + "!");
      const { ms } = timed(() => readPaperExitParentV2(body));
      expect(ms).toBeLessThan(100);
    });
  });

  it("a fifth panel is refused (the bound is four, one per kind)", () => {
    const body = clone(base);
    body.evaluation.panels.push({ ...clone(body.evaluation.panels[0]), panel_id: "panel_TEST_ONLY_5" });
    expect(readPaperExitParentV2(body)).toBeNull();
  });

  it("a 70,000 character id, version or digit string is refused fast, not scanned", () => {
    const cases: [Reader, string, readonly (string | number)[], string][] = [
      [readR2ParentV2, "r2", ["approval", "approval_id"], "a".repeat(70_000)],
      [readR2ParentV2, "r2", ["workspace_id"], "a".repeat(70_000)],
      [readR2ParentV2, "r2", ["approval", "policy_version"], "a".repeat(70_000)],
      [readPaperExitParentV2, "paper_exit_extended", ["lineage", "source_snapshot_hash"], `sha256:${"a".repeat(70_000)}`],
      [readCanaryParentV2, "canary", ["proposal", "capital_cap"], "9".repeat(70_000)],
      [readCanaryParentV2, "canary", ["proposal", "capital_cap"], `1.${"9".repeat(70_000)}`],
    ];
    for (const [read, key, path, text] of cases) {
      const body = clone(bodyOf(key));
      setPath(body, path, text);
      const { value, ms } = timed(() => read(body));
      expect(value, path.join(".")).toBeNull();
      expect(ms, path.join(".")).toBeLessThan(100);
    }
  });
});

/* ═════════════════════════ L3 ═════════════════════════ */
interface Case extends NegativeCase { body: string }

const OBJ_KEYS = (root: unknown, prefix: (string | number)[] = [], depth = 0): (string | number)[][] => {
  if (typeof root !== "object" || root === null || depth > 4) return [];
  if (Array.isArray(root)) return root.length > 0 ? OBJ_KEYS(root[0], [...prefix, 0], depth + 1) : [];
  return Object.entries(root).flatMap(([k, v]) => [[...prefix, k], ...OBJ_KEYS(v, [...prefix, k], depth + 1)]);
};

/** Per body: the enum, integer, string and decimal paths worth generating from (valid words are the published ones). */
interface Plan { enums: [(string | number)[], readonly string[]][]; ints: (string | number)[][]; strs: (string | number)[][]; decs?: (string | number)[][]; arrays?: [(string | number)[], string | undefined][]; containers: (string | number)[][] }
const APPROVAL_INTS = [["approval", "approval_version"], ["approval", "quorum_required"], ["approval", "quorum_met"], ["approval", "created_at_ms"], ["approval", "updated_at_ms"], ["approval", "sla_due_at_ms"], ["approval", "expires_at_ms"], ["approval", "decided_at_ms"], ["observed_at_ms"]];
const APPROVAL_STRS = [["workspace_id"], ["approval", "approval_id"], ["approval", "policy_version"], ["anchors", "deployment_id"]];
const IDENTITY_ENUMS: Plan["enums"] = [
  [["identity", "basis"], ["RETAINED_PROJECTION_ROW_AND_FIELD_POLICY"]],
  [["identity", "alpha_reason_code"], ["ALPHA_NAME_NOT_PUBLISHED"]],
  [["identity", "portfolio_name_reason_code"], []],
];
const PLANS: Record<string, Plan> = {
  r2: {
    enums: [[["approval", "status"], APPROVAL_STATUSES_V2], [["family"], ["R2"]], [["anchors", "environment"], ["PAPER"]], [["lineage", "availability"], ["AVAILABLE", "NOT_PUBLISHED"]]],
    ints: APPROVAL_INTS, strs: [...APPROVAL_STRS, ["lineage", "r1_approval_id"], ["lineage", "observed_risk_grant_id"], ["lineage", "currency"], ["anchors", "portfolio_id"]],
    containers: [[], ["approval"], ["anchors"], ["lineage"], ["source"]],
  },
  paper_exit_extended: {
    enums: [[["approval", "status"], APPROVAL_STATUSES_V2], [["review", "review_state"], REVIEW_STATES_V2], [["evaluation", "panels", 0, "panel_kind"], PANEL_KINDS_V2],
      [["evaluation", "panels", 0, "panel_state"], PANEL_STATES_V2], [["evaluation", "panels", 0, "source_authority"], ["RESEARCH", "EXECUTION", "BROKER", "DERIVED"]],
      [["evaluation", "panels", 0, "freshness_state"], ["OK", "STALE", "UNKNOWN"]], [["evaluation", "panels", 0, "source_completeness"], ["EVENT_SOURCED", "POLL_BOUNDED", "UNKNOWN"]],
      [["evaluation", "findings", 0, "outcome"], FINDING_OUTCOMES_V2], [["review", "promote_to"], ["SANDBOX_VALIDATION"]]],
    ints: [...APPROVAL_INTS, ["review", "review_version"], ["review", "extension_days"], ["review", "extended_until_ms"], ["evaluation", "panels", 0, "ordinal"], ["evaluation", "panels", 0, "poll_interval_ms"], ["evaluation", "findings", 0, "ordinal"]],
    strs: [...APPROVAL_STRS, ["review", "review_id"], ["evaluation", "panels", 0, "panel_id"], ["evaluation", "findings", 0, "finding_id"], ["evaluation", "findings", 0, "panel_id"], ["lineage", "source_snapshot_hash"], ["lineage", "evidence_set_hash"], ["evaluation", "evaluation_policy_version"]],
    arrays: [[["evaluation", "panels"], "panel_id"], [["evaluation", "findings"], "finding_id"]],
    containers: [[], ["approval"], ["review"], ["evaluation"], ["evaluation", "panels", 0], ["evaluation", "findings", 0], ["lineage"]],
  },
  r2_recorded: {
    enums: [
      [["approval", "status"], VOCAB.approvalStatus], [["latest_operation", "stored_status"], VOCAB.operationStatus], [["latest_operation", "command_type"], ["GOVERNANCE_R2_DECISION"]],
      [["latest_operation", "availability"], ["AVAILABLE", "NOT_PUBLISHED"]], [["actors", "availability"], ["AVAILABLE", "NOT_PUBLISHED"]],
      [["recorded_activity", "items", 0, "decision"], VOCAB.r2Decision], [["recorded_activity", "items", 0, "kind"], ["R2_DECISION_RECORDED"]],
      [["recorded_verdicts", "items", 0, "outcome"], VOCAB.verdictOutcome], [["recorded_verdicts", "items", 0, "source_ref", "kind"], ["PORTAL_STORED_R2_FINDING"]],
      [["recorded_verdicts", "items", 0, "observed", "reason_code"], ["SOURCE_STRUCTURED_CRITERION_NOT_RECORDED"]],
      [["recorded_verdicts", "admission", "state"], ["NOT_EVALUATED"]],
    ],
    ints: [
      ...APPROVAL_INTS, ["latest_operation", "created_at_ms"], ["latest_operation", "command_version"], ["recorded_activity", "limit"],
      ["recorded_activity", "items", 0, "version_before"], ["recorded_activity", "items", 0, "version_after"], ["recorded_activity", "items", 0, "decided_at_ms"],
      ["recorded_verdicts", "limit"], ["recorded_verdicts", "items", 0, "ordinal"], ["recorded_verdicts", "items", 0, "evaluated_at_ms"],
    ],
    strs: [
      ...APPROVAL_STRS, ["actors", "requester_user_id"], ["actors", "artifact_creator_user_id"], ["actors", "decided_by_user_id"], ["latest_operation", "operation_id"],
      ["recorded_activity", "items", 0, "decision_id"], ["recorded_activity", "items", 0, "operation_id"], ["recorded_verdicts", "items", 0, "finding_id"],
      ["recorded_verdicts", "items", 0, "source_ref", "approval_id"], ["recorded_verdicts", "items", 0, "source_ref", "finding_id"],
    ],
    arrays: [[["recorded_activity", "items"], "decision_id"], [["recorded_verdicts", "items"], "finding_id"]],
    containers: [
      [], ["actors"], ["latest_operation"], ["recorded_activity"], ["recorded_activity", "items", 0], ["recorded_verdicts"], ["recorded_verdicts", "items", 0],
      ["recorded_verdicts", "items", 0, "observed"], ["recorded_verdicts", "items", 0, "source_ref"], ["recorded_verdicts", "admission"],
    ],
  },
  r2_followthrough: {
    enums: [
      [["latest_operation", "stored_status"], VOCAB.operationStatus], [["decision_context", "gate"], ["R2"]], [["decision_context", "command_type"], ["GOVERNANCE_R2_DECISION"]],
      [["decision_context", "request_schema_version"], ["governance.r2-decision-plan-request.v1"]], [["decision_context", "plan_path"], ["/api/v1/execution/commands/plans"]],
      [["decision_context", "admission", "state"], ["NOT_EVALUATED"]], [["decision_context", "evidence_hashes", "availability"], ["AVAILABLE", "NOT_PUBLISHED"]],
    ],
    ints: [["decision_context", "expected_approval_version"], ["approval", "approval_version"]],
    strs: [
      ["decision_context", "workspace_id"], ["decision_context", "approval_id"], ["decision_context", "evidence_set_hash"], ["decision_context", "evidence_hashes", "value", 0],
    ],
    arrays: [[["decision_context", "evidence_hashes", "value"], undefined]],
    containers: [[], ["decision_context"], ["decision_context", "evidence_hashes"], ["decision_context", "admission"], ["latest_operation"], ["actors"]],
  },
  paper_exit_criteria: {
    enums: [
      [["criteria", "items", 0, "criterion_key", "value"], VOCAB.criterionKey], [["criteria", "items", 0, "label_key", "value"], VOCAB.criterionLabel],
      [["criteria", "items", 0, "original", "outcome"], VOCAB.findingOutcome], [["criteria", "items", 0, "source_ref", "kind"], ["PORTAL_STORED_PAPER_EXIT_FINDING"]],
      [["criteria", "items", 0, "op", "reason_code"], ["SOURCE_COMPARATOR_FIELD_NOT_RECORDED"]], [["criteria", "items", 1, "limit", "reason_code"], ["SOURCE_VALUE_NOT_RECORDED", "SOURCE_VALUE_NOT_DECIMAL"]],
      [["criteria", "items", 1, "unit", "reason_code"], ["SOURCE_TEXT_NOT_RECORDED", "SOURCE_TEXT_NOT_PUBLIC_SAFE"]], [["criteria", "items", 1, "evidence", "reason_code"], ["SOURCE_EVIDENCE_HASH_NOT_RECORDED"]],
      [["criteria", "items", 1, "source_time", "reason_code"], ["SOURCE_TIME_NOT_RECORDED"]], [["criteria", "panels", 0, "panel_kind"], VOCAB.panelKind], [["criteria", "panels", 0, "panel_state"], VOCAB.panelState],
      [["criteria", "basis"], ["VERIFIED_CURRENT_STORED_FINDING_BYTES_NOT_SOURCE_ACCEPTANCE"]], [["actors", "availability"], ["AVAILABLE", "NOT_PUBLISHED"]],
    ],
    ints: [
      ...APPROVAL_INTS, ["criteria", "panels", 0, "ordinal"], ["criteria", "panels", 0, "poll_interval_ms"], ["criteria", "items", 0, "original", "ordinal"],
      ["criteria", "items", 0, "original", "as_of_ms"], ["criteria", "items", 0, "source_time", "value"],
    ],
    strs: [
      ...APPROVAL_STRS, ["criteria", "evaluation_policy_version"], ["criteria", "panels", 0, "panel_id"], ["criteria", "items", 0, "original", "finding_id"],
      ["criteria", "items", 0, "source_ref", "review_id"], ["criteria", "items", 0, "source_ref", "panel_id"], ["criteria", "items", 0, "source_ref", "finding_id"],
      ["criteria", "items", 0, "unit", "value"], ["criteria", "items", 0, "currency", "value"], ["criteria", "items", 0, "evidence", "value"],
    ],
    decs: [["criteria", "items", 0, "observed", "value"], ["criteria", "items", 0, "limit", "value"]],
    arrays: [[["criteria", "panels"], "panel_id"], [["criteria", "items"], "source_ref"]],
    containers: [
      [], ["criteria"], ["criteria", "panels", 0], ["criteria", "items", 0], ["criteria", "items", 0, "original"], ["criteria", "items", 0, "criterion_key"],
      ["criteria", "items", 0, "observed"], ["criteria", "items", 0, "op"], ["criteria", "items", 0, "source_ref"], ["actors"], ["latest_operation"],
    ],
  },
  paper_exit_recorded: {
    enums: [
      [["recorded_activity", "items", 0, "decision"], VOCAB.exitDecision], [["recorded_activity", "items", 0, "kind"], ["PAPER_EXIT_DECISION_RECORDED"]],
      [["latest_operation", "command_type"], ["GOVERNANCE_PAPER_EXIT_DECISION"]], [["latest_operation", "stored_status"], VOCAB.operationStatus],
      [["review", "review_state"], VOCAB.reviewState], [["recorded_activity", "availability"], ["AVAILABLE", "NOT_PUBLISHED"]],
    ],
    ints: [
      ["recorded_activity", "limit"], ["recorded_activity", "items", 0, "version_before"], ["recorded_activity", "items", 0, "version_after"],
      ["recorded_activity", "items", 0, "decided_at_ms"], ["latest_operation", "created_at_ms"],
    ],
    strs: [["recorded_activity", "items", 0, "decision_id"], ["recorded_activity", "items", 0, "operation_id"], ["latest_operation", "operation_id"], ["actors", "decided_by_user_id"]],
    arrays: [[["recorded_activity", "items"], "decision_id"]],
    containers: [[], ["recorded_activity"], ["recorded_activity", "items", 0], ["latest_operation"], ["actors"]],
  },
  live: {
    enums: [[["approval", "status"], APPROVAL_STATUSES_V2], [["family"], ["LIVE_GATE"]], [["anchors", "environment"], ["LIVE"]]],
    ints: APPROVAL_INTS, strs: [...APPROVAL_STRS, ["accepted_manager_facts", "reason_code"]], containers: [[], ["approval"], ["anchors"], ["accepted_manager_facts"], ["source"]],
  },
  sandbox: {
    enums: [[["certification", "workflow_state"], ["DRAFT", "IN_REVIEW", "APPROVED", "DENIED"]], [["steps", "items", 0, "availability"], ["AVAILABLE", "NOT_RECORDED"]],
      [["steps", "items", 0, "stored_evaluation_state"], ["PASS", "FAIL", "STALE", "UNAVAILABLE"]], [["steps", "items", 0, "source_authority"], ["PORTAL", "EXECUTION", "BROKER", "DERIVED"]],
      [["steps", "items", 0, "source_verification_state"], ["VERIFIED", "UNAVAILABLE"]], [["certification", "source_integration_state"], ["UNAVAILABLE", "SHADOW"]], [["certification", "delivery_profile"], ["fixture", "shadow"]],
      [["steps", "items", 0, "step_key"], ["CONNECT", "SYNC", "ORDER_TYPES", "RECONCILIATION", "TIMEBOXED_RUN", "CLEANUP", "EXIT_REVIEW"]]],
    ints: [["certification", "workflow_version"], ["certification", "created_at_ms"], ["certification", "updated_at_ms"], ["certification", "submitted_at_ms"], ["certification", "decided_at_ms"], ["steps", "items", 0, "as_of_ms"], ["observed_at_ms"]],
    strs: [["workspace_id"], ["certification", "certification_id"], ["certification", "policy_version"], ["steps", "items", 0, "evidence_id"], ["lineage", "promotion_grant_id"], ["anchors", "deployment_id"]],
    arrays: [[["steps", "items"], "step_key"]],
    containers: [[], ["certification"], ["anchors"], ["steps"], ["steps", "items", 0], ["lineage"], ["source"]],
  },
  canary: {
    enums: [[["envelope", "status"], ["DRAFT"]], [["envelope", "delivery_profile"], ["fixture"]], [["envelope", "source_integration_state"], ["UNAVAILABLE"]], [["anchors", "environment"], ["LIVE"]], [["proposal", "basis"], ["PROPOSED_NOT_EFFECTIVE"]]],
    ints: [["envelope", "revision"], ["envelope", "expected_certification_version"], ["envelope", "created_at_ms"], ["proposal", "max_open_orders"], ["proposal", "duration_days"], ["observed_at_ms"]],
    strs: [["workspace_id"], ["envelope", "envelope_id"], ["envelope", "previous_envelope_id"], ["proposal", "currency"], ["proposal", "base_risk_profile_revision"], ["lineage", "certification_id"]],
    decs: [["proposal", "capital_cap"], ["proposal", "gross_notional_cap"], ["proposal", "daily_loss_cap"]],
    containers: [[], ["envelope"], ["proposal"], ["lineage"], ["anchors"], ["source"]],
  },
  // BE-P12: the same bodies WITH the opt-in `identity`: its container is closed and each of its words is the published vocabulary.
  sandbox_identity: {
    enums: [...IDENTITY_ENUMS, [["certification", "workflow_state"], ["DRAFT", "IN_REVIEW", "APPROVED", "DENIED"]]],
    ints: [["certification", "workflow_version"], ["observed_at_ms"]], strs: [["workspace_id"], ["identity", "alpha_id"], ["identity", "portfolio_name"]],
    containers: [[], ["identity"], ["certification"], ["anchors"], ["source"]],
  },
  canary_identity: {
    enums: [...IDENTITY_ENUMS, [["envelope", "status"], ["DRAFT"]]],
    ints: [["envelope", "revision"], ["observed_at_ms"]], strs: [["workspace_id"], ["identity", "alpha_id"], ["identity", "portfolio_name"]],
    containers: [[], ["identity"], ["envelope"], ["anchors"], ["source"]],
  },
  r2_operation: {
    enums: [[["status"], ["PLANNED", "APPLIED", "EXPIRED"]], [["decision"], ["APPROVE", "APPROVE_WITH_CONDITION", "DENY"]], [["family"], ["R2", "PAPER_EXIT"]], [["command_type"], ["GOVERNANCE_R2_DECISION"]], [["approval", "status"], APPROVAL_STATUSES_V2]],
    ints: [...APPROVAL_INTS, ["command_version"], ["expected_version"], ["parent_approval_version"], ["created_at_ms"], ["expires_at_ms"], ["applied_at_ms"]],
    strs: [...APPROVAL_STRS, ["operation_id"], ["parent_approval_id"], ["parent_evidence_set_hash"]],
    containers: [[], ["approval"], ["anchors"], ["source"]],
  },
  paper_exit_operation: {
    enums: [[["status"], ["PLANNED", "APPLIED", "EXPIRED"]], [["decision"], ["PROMOTE", "EXTEND_OBSERVATION", "REJECT"]], [["command_type"], ["GOVERNANCE_PAPER_EXIT_DECISION"]]],
    ints: [["command_version"], ["expected_version"], ["created_at_ms"], ["expires_at_ms"], ["applied_at_ms"]],
    strs: [["operation_id"], ["workspace_id"]],
    containers: [[], ["approval"], ["anchors"], ["source"]],
  },
};
const PLAN_BODY: Record<string, { key: string; def: string; read: Reader; schemaVersions: string[] }> = {
  r2_recorded: { key: "r2_recorded", def: "R2ParentReadV2", read: readR2ParentV2 as Reader, schemaVersions: [GOVERNANCE_PARENT_V2_SCHEMA] },
  r2_followthrough: { key: "r2_followthrough", def: "R2ParentReadV2", read: readR2ParentV2 as Reader, schemaVersions: [GOVERNANCE_PARENT_V2_SCHEMA] },
  paper_exit_criteria: { key: "paper_exit_criteria", def: "PaperExitParentReadV2", read: readPaperExitParentV2 as Reader, schemaVersions: [GOVERNANCE_PARENT_V2_SCHEMA] },
  paper_exit_recorded: { key: "paper_exit_recorded", def: "PaperExitParentReadV2", read: readPaperExitParentV2 as Reader, schemaVersions: [GOVERNANCE_PARENT_V2_SCHEMA] },
  r2: { key: "r2", def: "R2ParentReadV2", read: readR2ParentV2 as Reader, schemaVersions: [GOVERNANCE_PARENT_V2_SCHEMA] },
  paper_exit_extended: { key: "paper_exit_extended", def: "PaperExitParentReadV2", read: readPaperExitParentV2 as Reader, schemaVersions: [GOVERNANCE_PARENT_V2_SCHEMA] },
  live: { key: "live", def: "LiveParentReadV2", read: readLiveParentV2 as Reader, schemaVersions: [LIVE_PARENT_V2_SCHEMA] },
  sandbox: { key: "sandbox", def: "SandboxParentReadV2", read: readSandboxParentV2 as Reader, schemaVersions: [FOLLOWING_PARENT_V2_SCHEMA] },
  canary: { key: "canary", def: "CanaryParentReadV2", read: readCanaryParentV2 as Reader, schemaVersions: [FOLLOWING_PARENT_V2_SCHEMA] },
  sandbox_identity: { key: "sandbox_identity", def: "SandboxParentReadV2", read: readSandboxParentV2 as Reader, schemaVersions: [FOLLOWING_PARENT_V2_SCHEMA] },
  canary_identity: { key: "canary_identity", def: "CanaryParentReadV2", read: readCanaryParentV2 as Reader, schemaVersions: [FOLLOWING_PARENT_V2_SCHEMA] },
  r2_operation: { key: "r2_operation", def: "R2ParentOperationReadV2", read: readOperationParentV2 as Reader, schemaVersions: [GOVERNANCE_PARENT_OPERATION_V2_SCHEMA] },
  paper_exit_operation: { key: "paper_exit_operation", def: "PaperExitParentOperationReadV2", read: readOperationParentV2 as Reader, schemaVersions: [GOVERNANCE_PARENT_OPERATION_V2_SCHEMA] },
};

const CASES: (Case & { def: string; read: Reader })[] = Object.entries(PLANS).flatMap(([name, plan]) => {
  const spec = PLAN_BODY[name]!;
  const base = bodyOf(spec.key);
  const tag = (cases: NegativeCase[]) => cases.map((c) => ({ ...c, name: `${name} · ${c.name}`, body: name, def: spec.def, read: spec.read }));
  const enums = plan.enums.flatMap(([path, valid]) => enumCases(base, path, valid).filter((c) => !valid.includes(getPath(c.value, path) as string)));
  return [
    ...tag(enums),
    ...tag(plan.ints.flatMap((p) => integerCases(base, p))),
    ...tag(plan.strs.flatMap((p) => stringCases(base, p))),
    ...tag((plan.decs ?? []).flatMap((p) => decimalCases(base, p))),
    ...tag((plan.arrays ?? []).flatMap(([p, id]) => arrayCases(base, p, id ? { idKey: id } : {}))),
    ...tag(requiredCases(base, OBJ_KEYS(base))),
    ...tag(schemaVersionCases(base, ["schema_version"], spec.schemaVersions[0]!, PARENT_V2_SCHEMAS.filter((v) => v !== spec.schemaVersions[0]))),
    ...tag(pollutionCases(base, plan.containers)),
  ];
});

/**
 * Cases the reader accepts although the published schema refuses them. Each
 * has a DEFECT test; an accepted schema-invalid case outside the list fails.
 */
const KNOWN_GAPS: ((c: Case) => boolean)[] = [];

describe("L3 · negative", () => {
  it("reports the case counts", () => {
    const by = new Map<string, number>();
    for (const c of CASES) by.set(c.category, (by.get(c.category) ?? 0) + 1);
    const gaps = CASES.filter((c) => c.read(c.value) !== null && violations(c.def, c.value).length > 0 && c.category !== "prototype-pollution");
    console.info(`governanceParents L3: ${CASES.length} cases over ${Object.keys(PLANS).length} bodies (${[...by.entries()].map(([k, v]) => `${k} ${v}`).join(", ")}), ${rootCases().length} root cases; ${gaps.length} accepted although schema-invalid`);
    expect(CASES.length).toBeGreaterThan(2500);
  });

  it.each(CASES.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => c.read(c.value)).not.toThrow();
    expect(() => readGovernanceParentV2(c.value)).not.toThrow();
    const read = c.read(c.value);
    expect(leaked(read, c.probe)).toBe(false);
    expect(prototypeIsClean()).toBe(true);
    if (c.category === "schema-swapped") {
      // A body of another version is never read as this family.
      expect(read).toBeNull();
      const routed = readGovernanceParentV2(c.value) as { family?: string } | null;
      const swapped = (c.value as Draft)?.schema_version;
      if (typeof swapped === "string" && !PARENT_V2_SCHEMAS.includes(swapped as never)) expect(routed).toBeNull();
      return;
    }
    if (read === null) return;
    expect(violations(c.def, c.value).length === 0 || KNOWN_GAPS.some((f) => f(c)), `accepted though schema-invalid: ${c.name}`).toBe(true);
  });

  it("an unknown word is never a status or a decision: no enum case yields a read", () => {
    for (const c of CASES.filter((x) => x.category === "unknown-enum" && !/huge/.test(x.name))) expect(c.read(c.value), c.name).toBeNull();
  });

  it("a number where a decimal string belongs is never a cap", () => {
    for (const c of CASES.filter((x) => x.body === "canary" && x.category === "number-as-decimal")) expect(c.read(c.value), c.name).toBeNull();
  });

  it.each(rootCases().map((c) => [c.name, c] as const))("%s is never a parent", (_name, c) => {
    expect(() => readGovernanceParentV2(c.value)).not.toThrow();
    expect(readGovernanceParentV2(c.value)).toBeNull();
    for (const b of Object.values(PLAN_BODY)) expect(b.read(c.value)).toBeNull();
  });

  it("every container is closed: one extra key anywhere voids the read (additionalProperties:false)", () => {
    for (const [name, plan] of Object.entries(PLANS)) {
      const spec = PLAN_BODY[name]!;
      for (const container of plan.containers) {
        const body = clone(bodyOf(spec.key));
        const host = container.reduce<Draft>((node, step) => node[step], body);
        host.extra_key_from_testkit = "x";
        expect(spec.read(body), `${name} ${container.join(".") || "root"}`).toBeNull();
      }
    }
  });

  it("an unreadable section is never repaired into an empty one", () => {
    const body = clone(bodyOf("paper_exit_extended"));
    body.evaluation = { availability: "AVAILABLE" };
    expect(readPaperExitParentV2(body)).toBeNull();
    body.evaluation = { availability: "NOT_PUBLISHED", reason_code: "SOMETHING_ELSE" };
    expect(readPaperExitParentV2(body)).toBeNull();
    body.evaluation = { availability: "NOT_PUBLISHED" };
    expect(readPaperExitParentV2(body)).toBeNull();
    body.evaluation = { availability: "PARTIAL", panels: [], findings: [] };
    expect(readPaperExitParentV2(body)).toBeNull();
    body.evaluation = ABSENT;
    expect(readPaperExitParentV2(body)).toBeNull();
  });
});

/* ═══════════════ fixed defects (F5c), now ordinary tests ═══════════════ */
describe("fixed defects (F5c)", () => {
  /*
   * DEFECT GP-1 (readApproval): quorum_required accepts 0 where the schema's
   * minimum is 1. `0 of 0 approvers` then reads as a met quorum on a request
   * nobody has approved.
   */
  it("FIXED GP-1: quorum_required 0 is refused (schema minimum 1)", () => {
    const body = clone(bodyOf("r2"));
    body.approval.quorum_required = 0;
    body.approval.quorum_met = 0;
    expect(readR2ParentV2(body)).toBeNull();
  });

  /*
   * DEFECT GP-2 (readApproval): the schema's own description says runtime also
   * checks that expires_at and sla_due_at are not before created_at. The
   * reader checks updated_at and decided_at only, so an approval that "expired
   * before it existed" is read and drawn.
   */
  it("FIXED GP-2: expires_at_ms or sla_due_at_ms before created_at_ms is refused", () => {
    for (const field of ["expires_at_ms", "sla_due_at_ms"]) {
      const body = clone(bodyOf("r2"));
      body.approval[field] = body.approval.created_at_ms - 1;
      expect(readR2ParentV2(body), field).toBeNull();
    }
  });

  /*
   * DEFECT GP-3 (readExitPanel, readCanaryParentV2): the reader writes
   * `x === null ? null : natural(x)` and then tests the result for `undefined`,
   * but natural/id/text answer `null` for a bad value. A malformed value is
   * therefore read as "not published": poll_interval_ms 3,600,001 as no
   * interval, a formula_version that is a number as no formula, a
   * previous_envelope_id that is `true` as "first revision".
   */
  it("FIXED GP-3: a poll_interval_ms above its bound is refused, not read as no interval", () => {
    const body = clone(bodyOf("paper_exit_extended"));
    body.evaluation.panels[0].source_completeness = "EVENT_SOURCED";
    body.evaluation.panels[0].poll_interval_ms = 3_600_001;
    expect(readPaperExitParentV2(body)).toBeNull();
  });

  it("FIXED GP-3b: a formula_version that is not text is refused, not read as no formula", () => {
    const body = clone(bodyOf("paper_exit_extended"));
    body.evaluation.panels[0].formula_version = 7;
    expect(readPaperExitParentV2(body)).toBeNull();
  });

  it("FIXED GP-3c: a previous_envelope_id that is not an id is refused, not read as the first revision", () => {
    for (const bad of [true, 0, {}, "", "a b"]) {
      const body = clone(bodyOf("canary"));
      body.envelope.previous_envelope_id = bad;
      expect(readCanaryParentV2(body), JSON.stringify(bad)).toBeNull();
    }
  });

  /*
   * DEFECT GP-4 (readEvaluation): the reader allows 4,096 findings; the schema
   * allows 256 (panels 4 in both).
   */
  it("FIXED GP-4: 257 findings (schema maxItems 256) are refused", () => {
    const body = clone(bodyOf("paper_exit_extended"));
    const panel = body.evaluation.panels[0].panel_id;
    body.evaluation.findings = cloneRows(body.evaluation.findings[0] as Draft, 257, (f, i) => { f.finding_id = `f_${i}`; f.panel_id = panel; f.ordinal = i; });
    expect(readPaperExitParentV2(body)).toBeNull();
  });

  /*
   * DEFECT GP-5 (readParentAnchors, readHeader, canary proposal): anchor ids
   * and the workspace are `text(…, 4096)`; the schema holds anchors to
   * ^[A-Za-z0-9._:-]+$ (191) and the currency to ^[A-Z0-9]{2,12}$. A deployment
   * id with a space or a right-to-left override is read and then reaches a
   * route (`/deployments/{id}/...`).
   */
  it("FIXED GP-5: an anchor id outside the Identifier pattern is refused", () => {
    for (const bad of ["a b", "a/b", "\u202eevil", "   ", "x".repeat(192)]) {
      const body = clone(bodyOf("r2"));
      body.anchors.deployment_id = bad;
      expect(readR2ParentV2(body), JSON.stringify(bad)).toBeNull();
    }
  });

  it("FIXED GP-5b: a canary currency outside ^[A-Z0-9]{2,12}$ is refused", () => {
    for (const bad of ["usdt", "U", "USDT-PERP", "   ", "\u202eevil"]) {
      const body = clone(bodyOf("canary"));
      body.proposal.currency = bad;
      expect(readCanaryParentV2(body), JSON.stringify(bad)).toBeNull();
    }
  });

  it("FIXED GP-5c: workspace_id is 3 to 96 characters (schema minLength 3, maxLength 96)", () => {
    for (const [len, ok] of [[2, false], [3, true], [96, true], [97, false]] as const) {
      const body = clone(bodyOf("r2"));
      body.workspace_id = "w".repeat(len);
      expect(readR2ParentV2(body) !== null, String(len)).toBe(ok);
    }
  });

  /*
   * DEFECT GP-6 (readSandboxParentV2): the schema ties the state to its
   * clocks (DRAFT has no submit clock, any other state has one, APPROVED and
   * DENIED have a decision clock and IN_REVIEW and DRAFT have none). The reader
   * checks the clocks' order only, so an "Approved" certification with no
   * decision time, or a "Draft" that was decided, is read.
   */
  it("FIXED GP-6: an APPROVED certification with no decision clock is refused", () => {
    const body = clone(bodyOf("sandbox"));
    body.certification.workflow_state = "APPROVED";
    body.certification.decided_at_ms = null;
    expect(readSandboxParentV2(body)).toBeNull();
  });

  it("FIXED GP-6b: a DRAFT certification that carries a submit or decision clock is refused", () => {
    const body = clone(bodyOf("sandbox"));
    body.certification.workflow_state = "DRAFT";
    expect(readSandboxParentV2(body)).toBeNull();
  });
});
