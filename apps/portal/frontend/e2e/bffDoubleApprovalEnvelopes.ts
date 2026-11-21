/**
 * The Governance list and review envelopes as `execution-governance-product.v1` and `execution-governance-approval-workflow.v1`
 * publish them: approval inbox, approval history, R1 review and the conditions register. Fixture lane, NOT acceptance evidence.
 *
 * The rows, counts and review facts are the ones this double always served (`src/execution/api/fixtureData.ts`, which the unit
 * tests pin and which is not changed). What was missing was the envelope: `actor`, `read_truth`, the applied filters and sort, and for
 * the R1 review the `data` wrapper, the `Approval` fields the producer states, the `Actor` objects and a typed evidence manifest.
 * Where the loose fixture carried a fact the published `Approval` has no field for (`sla`, `expected_version`), it is not served: the
 * contract states `sla_due_at` and `expires_at`, and a screen shows an absent age as absent. Every body is judged against its schema
 * in `src/fixtureBff/server.test.ts`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { R1_DETAIL, R2_DETAIL } from "../src/execution/api/fixtureData";
import { OPERATIONS_V2_DOUBLE_NOW_ISO } from "./bffDoubleV2";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): Json => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")) as Json;

/** The reviewer the envelopes name; the same synthetic principal every double uses. */
export const GOVERNANCE_ACTOR = { user_id: "usr_bobby", username: "bobby", roles: ["ADMIN"] };
export const GOVERNANCE_READ_TRUTH = { state: "AVAILABLE", reason_code: null, scope: "REQUEST" };

/** The sort the producer publishes for each list (read from its canonical fixture, so the names cannot drift). */
const sortOf = (file: string): unknown[] => structuredClone(canonical(file).page.applied_sort);

/**
 * ONE clock (F3b): every instant an approval envelope prints is a distance from the fixture "now" every V2 double and the page share
 * (`OPERATIONS_V2_DOUBLE_NOW_ISO`, the Playwright page clock and the fixture BFF default). Read lazily: bffDoubleV2 reaches the world, which reaches this file.
 */
const nowMs = (): number => Date.parse(OPERATIONS_V2_DOUBLE_NOW_ISO);
const isoAt = (ms: number): string => new Date(ms).toISOString();
const MINUTE_MS = 60_000;
const INBOX_ENVIRONMENT: Readonly<Record<string, string>> = { R1: "RESEARCH", R2: "SANDBOX", PAPER_EXIT: "PAPER", SANDBOX_EXIT: "SANDBOX", LIVE_GATE: "LIVE" };
/** The approval versions the review doubles pin (R1_DETAIL: 7, R2_DETAIL: 3); every other row starts at 1. */
const INBOX_VERSION: Readonly<Record<string, number>> = { "AP-201": 7, "AP-352": 3 };
const FIXTURE_REQUESTER = { user_id: "usr_fixture_requester", username: "fixture-requester" };

/**
 * One loose inbox row (`approval_id`, no requester, no environment) as an `ApprovalInboxItem`. The facts the row states are kept
 * (gate, subject, target, blockers, sla age and budget, quorum, inert, needs_you); the fields the contract requires and the loose row
 * never had are filled with labelled fixture values, never with a derived verdict: no release candidate, no portfolio.
 */
function inboxItem(row: Json): Json {
  const id = String(row.approval_id);
  const sla = (row.sla ?? {}) as Json;
  const budget = Number(sla.budget_minutes);
  const age = Number(sla.age_minutes);
  // F3b: the deadline is the age and budget the row states, against the one fixture "now" (a row's own due_at was a second, older clock that contradicted its age)
  const dueAt = isoAt(nowMs() + (budget - age) * MINUTE_MS);
  return {
    id,
    gate: row.gate,
    subject: row.subject,
    portfolio_id: null,
    subject_id: subjectIdOf(id, String(row.gate), String(row.subject)),
    release_candidate: null,
    target: row.target,
    environment: INBOX_ENVIRONMENT[String(row.gate)] ?? "RESEARCH",
    requester: FIXTURE_REQUESTER,
    creator: FIXTURE_REQUESTER,
    status: "PENDING",
    policy_version: "approval.v3",
    approval_version: INBOX_VERSION[id] ?? 1,
    evidence_set_hash: `sha256:${"a".repeat(64)}`,
    evidence_complete: row.blocker_count === 0,
    blocker_count: row.blocker_count,
    blocker_summary: row.blocker_summary,
    sla: {
      state: age > budget ? "OVERDUE" : "ON_TRACK",
      age_minutes: age,
      budget_minutes: budget,
      due_at: dueAt,
      expires_at: new Date(Date.parse(dueAt) + 86_400_000).toISOString(),
    },
    quorum_met: row.quorum_met,
    quorum_required: row.quorum_required,
    inert: row.inert,
    needs_you: row.needs_you,
    record_authority: "PORTAL",
    updated_at: isoAt(nowMs() - MINUTE_MS),
  };
}

const idHash = (text: string): number => {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};
/**
 * The entity a request decides, as the contract's `subject_id` states it (never the request's own id restated: "subject subject_ap-352"). An exit or Live
 * request names its deployment (the `dep_...` the subject already carries); R1 names the alpha version of its review (the R1 double's own for AP-201),
 * R2 its deployment candidate (the R2 double's own for AP-352); every other row gets a stable id of the same kind.
 */
function subjectIdOf(id: string, gate: string, subject: string): string {
  const deployment = /\b(dep_[A-Za-z0-9_]+)\b/.exec(subject);
  if (deployment !== null) return deployment[1]!;
  const n = idHash(id);
  if (gate === "R1") {
    const own = ((R1_DETAIL as Json).evidence_manifest?.entries as Json[] | undefined)?.find((entry) => entry.label === "alpha version")?.value;
    return id === (R1_DETAIL as Json).approval?.approval_id && typeof own === "string" ? own : `av_${2000 + (n % 900)}`;
  }
  if (gate === "R2") {
    const own = (R2_DETAIL as Json).approval?.deployment_candidate;
    return id === (R2_DETAIL as Json).approval?.approval_id && typeof own === "string" ? own : `DC-${10 + (n % 90)}`;
  }
  return `dep_${10 + (n % 90)}`;
}

/** `GET /governance/approvals`: the double's inbox page inside the published envelope. */
export function approvalInboxEnvelope(page: Json, counts: Json, workspaceId: string): Json {
  return {
    schema_version: "governance.approval-inbox.v1",
    record_authority: "PORTAL",
    workspace_id: workspaceId,
    delivery_profile: "fixture",
    read_at: isoAt(nowMs()),
    actor: GOVERNANCE_ACTOR,
    counts,
    read_truth: GOVERNANCE_READ_TRUTH,
    page: { ...page, rows: (page.rows as Json[]).map(inboxItem), applied_filters: [], applied_sort: sortOf("execution-governance.approval-inbox.valid.json") },
  };
}

/** `GET /governance/approvals/history`: the (empty) history the unit fixture holds, with the envelope fields it lacked. */
export function approvalHistoryEnvelope(history: Json): Json {
  return {
    ...history,
    actor: GOVERNANCE_ACTOR,
    read_truth: GOVERNANCE_READ_TRUTH,
    page: { ...history.page, applied_filters: [], applied_sort: sortOf("execution-governance.approval-history.valid.json") },
  };
}

/** `GET /governance/waivers`: the double's page, with `read_truth` and the sort the register states. */
export function conditionsRegisterEnvelope(envelope: Json, state: string | null): Json {
  return {
    ...envelope,
    read_truth: GOVERNANCE_READ_TRUTH,
    page: {
      ...envelope.page,
      applied_filters: state ? [{ field: "state", op: "eq", value: state }] : [],
      applied_sort: sortOf("execution-governance.conditions-register.valid.json"),
    },
  };
}

/** Entries 0 and 1 carry the two hashes the decision context pins (`R1_DETAIL.decision_context.evidence_hashes`). */
const manifestHash = (index: number): string => `sha256:${"abcdef"[index % 6]!.repeat(64)}`;

/** `GET /governance/approvals/{id}/r1`: the double's AP-201 review as an `R1ReviewResponse`, built on the canonical review. */
export function r1ReviewEnvelope(approvalId: string): Json {
  const canon = canonical("execution-governance.r1-review.valid.json");
  const flat = R1_DETAIL as Json;
  const looseApproval = flat.approval as Json;
  // F3b: the review's clocks are the double's own age and budget against the one fixture "now" (the canonical review was read on 26 Aug, after the page's clock)
  const instant = (ms: number): string => isoAt(ms).replace(/\.000Z$/, "Z");
  const createdMs = nowMs() - Number((looseApproval.sla as Json).age_minutes) * MINUTE_MS;
  const dueMs = createdMs + Number((looseApproval.sla as Json).budget_minutes) * MINUTE_MS;
  const entries = (flat.evidence_manifest.entries as Json[]).map((entry, ordinal) => ({
    evidence_id: `ev_r1_${ordinal}`,
    ordinal,
    kind: "EVIDENCE",
    label: entry.label,
    display_value: entry.value,
    note: entry.note ?? null,
    verification: entry.verification ?? null,
    artifact_id: null,
    sha256: manifestHash(ordinal),
    size_bytes: null,
    media_type: null,
    schema_version: "evidence.v1",
    source_authority: "RESEARCH",
    source_reference: null,
    required: true,
    captured_at: instant(createdMs - 60 * MINUTE_MS),
    retention_class: "GOVERNANCE_LONG_TERM",
    access_policy: "WORKSPACE_APPROVER",
  }));
  const approval: Json = {
    ...canon.data.approval,
    approval_id: approvalId,
    subject_label: looseApproval.subject_label,
    release_candidate: looseApproval.release_candidate,
    quorum_met: looseApproval.quorum_met,
    quorum_required: looseApproval.quorum_required,
    policy_version: looseApproval.policy_version,
    approval_version: looseApproval.approval_version,
    creator: { user_id: "usr_minh", username: looseApproval.creator },
    blocker_count: 0,
    blocker_summary: null,
    created_at: instant(createdMs),
    updated_at: instant(nowMs() - MINUTE_MS),
    sla_due_at: instant(dueMs),
    expires_at: instant(dueMs + 24 * 60 * MINUTE_MS),
  };
  return {
    schema_version: canon.schema_version,
    workspace_id: flat.workspace_id,
    record_authority: canon.record_authority,
    delivery_profile: canon.delivery_profile,
    read_at: isoAt(nowMs()),
    data: {
      approval,
      decision_context: flat.decision_context,
      capture_context: flat.capture_context,
      actor: { user_id: "usr_lan", username: flat.actor, roles: ["ADMIN"] },
      eligibility: { ...flat.eligibility, separation_of_duties: "OK" },
      known_limitations: [],
      evidence_manifest: { manifest_hash: approval.evidence_set_hash, complete: true, entries },
      // F3b: the gate counts SEVEN criteria (the evidence read and the receipt say "6 -> 7"): the double's six plus the manifest pin, so "Checklist 6 of 7" is the same count
      checklist: [...structuredClone(flat.checklist), { label: "release candidate pinned and evidence manifest hash recorded", outcome: "pass" }],
      decisions: [],
      linked_panels: [],
    },
  };
}
