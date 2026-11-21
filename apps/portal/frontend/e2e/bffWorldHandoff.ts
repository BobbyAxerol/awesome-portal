/**
 * The Research -> Execution handoff chain as ONE linked, SIMULATED scenario (`handoff`), FIXTURE_LAB. NOT acceptance evidence.
 *
 * Execution has no trading-server data yet, and the Research half (RC publication) is real and stays on the real Control API, so a
 * reviewer who runs the fixture lane could not walk "release candidate -> R1 -> R1 decided -> R2 -> evidence" in one go. This module
 * answers the three Execution reads of that walk for a closed set of clearly synthetic approval ids:
 *
 *   GET /api/v1/execution/governance/approvals/{id}/r1        (R1ReviewResponse)
 *   GET /api/v1/execution/governance/approvals/{id}/r2        (R2 review)
 *   GET /api/v1/execution/governance/approvals/{id}/evidence  (portal.execution.approval-evidence.v1)
 *
 * Nothing is invented: every body is the published synthetic contract fixture
 * (`execution-governance.r1-review`, `execution-governance.r2-review`, `execution-approval-evidence.{published,drawdown,no-source,not-read}`)
 * with ids, hashes and instants replaced so the reads agree with each other. The Research read
 * `/api/v1/research/release-candidates/{id}/publication` is NOT served here (Research stays real; see fixture-bff/ROUTES.md).
 * Reads only: a write to these paths falls through to the normal write rules (refused by default).
 * The register is `upgrade/execution_loop/evidence/UXM-07/SIMULATED_DATA_REGISTER_2026-10-22.md`, section 2h.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { WORLD_NOW_MS } from "./bffWorld";

// ===== WP-H begin
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CONTRACTS = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/contracts/fixtures");
const canonical = (name: string): Json => JSON.parse(readFileSync(join(CONTRACTS, name), "utf8")) as Json;
const clone = <T,>(value: T): T => structuredClone(value);

export const HANDOFF_WORKSPACE = "ws_TEST_ONLY_shared";
/** The one instant every read of the chain states (`read_at`, `read_at_ms`, `as_of_ms`): the world clock. */
export const HANDOFF_AS_OF_MS = WORLD_NOW_MS;
const AS_OF_ISO = new Date(HANDOFF_AS_OF_MS).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (offsetMs: number): string => new Date(HANDOFF_AS_OF_MS + offsetMs).toISOString();
export const handoffHash = (seed: string): string => `sha256:${createHash("sha256").update(`TEST_ONLY:handoff:${seed}`).digest("hex")}`;

/** The synthetic Research subject of the chain; the real RC id shape is `rc_<ULID>` and is never copied here. */
export const HANDOFF_RC = "rc_TEST_ONLY_handoff";
const HANDOFF_VERSION = "av_TEST_ONLY_handoff";

export const HANDOFF_IDS = {
  r1Pending: "apr_TEST_ONLY_r1_pending",
  r1Approved: "apr_TEST_ONLY_r1_approved",
  r1Expired: "apr_TEST_ONLY_r1_expired",
  r2: "apr_TEST_ONLY_r2",
  r2Satellite: "apr_TEST_ONLY_r2_satellite",
} as const;

interface R1Spec { id: string; status: "PENDING" | "APPROVED" | "EXPIRED"; rc: string; version: string; label: string; createdMs: number }
const R1_SPECS: readonly R1Spec[] = [
  { id: HANDOFF_IDS.r1Pending, status: "PENDING", rc: "rc_TEST_ONLY_handoff_pending", version: "av_TEST_ONLY_handoff_pending", label: "Handoff candidate (pending)", createdMs: -3 * HOUR },
  { id: HANDOFF_IDS.r1Approved, status: "APPROVED", rc: HANDOFF_RC, version: HANDOFF_VERSION, label: "Handoff candidate", createdMs: -30 * HOUR },
  { id: HANDOFF_IDS.r1Expired, status: "EXPIRED", rc: "rc_TEST_ONLY_handoff_expired", version: "av_TEST_ONLY_handoff_expired", label: "Handoff candidate (expired)", createdMs: -5 * DAY },
];
const APPROVED_DECIDED_MS = -26 * HOUR;
const APPROVED_EXPIRES_MS = APPROVED_DECIDED_MS + 180 * DAY;

interface R2Spec { id: string; portfolio: string; deployment: string; label: string; evidence: "published" | "drawdown" }
const R2_SPECS: readonly R2Spec[] = [
  { id: HANDOFF_IDS.r2, portfolio: "pf_TEST_ONLY_core", deployment: "dep_TEST_ONLY_handoff_paper", label: "Handoff paper deployment", evidence: "published" },
  { id: HANDOFF_IDS.r2Satellite, portfolio: "pf_TEST_ONLY_satellite", deployment: "dep_TEST_ONLY_handoff_satellite", label: "Handoff satellite deployment", evidence: "drawdown" },
];

const r1Spec = (id: string): R1Spec | undefined => R1_SPECS.find((s) => s.id === id);
const r2Spec = (id: string): R2Spec | undefined => R2_SPECS.find((s) => s.id === id);
const r2EvidenceHash = (id: string): string => handoffHash(`${id}:evidence-set`);

/* ── R1 ─────────────────────────────────────────────────────────────────── */

export function handoffR1(id: string): Json | null {
  const spec = r1Spec(id);
  if (spec === undefined) return null;
  const canon = canonical("execution-governance.r1-review.valid.json");
  const decidedBy = { user_id: "usr_lan", username: "lan" };
  const setHash = handoffHash(`${id}:evidence-set`);
  const entries = (canon.data.evidence_manifest.entries as Json[]).map((entry, ordinal) => ({
    ...clone(entry),
    evidence_id: `ev_${id}_${ordinal}`,
    display_value: ordinal === 0 ? spec.version : entry.display_value,
    note: null,
    sha256: handoffHash(`${id}:entry:${ordinal}`),
    artifact_id: entry.artifact_id === null ? null : `artifact_${spec.version}`,
    captured_at: iso(spec.createdMs),
  }));
  const decided = spec.status === "APPROVED";
  const expired = spec.status === "EXPIRED";
  const approval: Json = {
    ...clone(canon.data.approval),
    approval_id: id,
    subject_id: spec.version,
    subject_label: spec.label,
    release_candidate: spec.rc,
    status: spec.status,
    quorum_met: decided ? 1 : 0,
    quorum_required: 1,
    evidence_set_hash: setHash,
    sla_due_at: iso(spec.createdMs + 6 * HOUR),
    expires_at: decided ? iso(APPROVED_EXPIRES_MS) : expired ? iso(spec.createdMs + 2 * DAY) : iso(spec.createdMs + 24 * HOUR),
    created_at: iso(spec.createdMs),
    updated_at: decided ? iso(APPROVED_DECIDED_MS) : expired ? iso(spec.createdMs + 2 * DAY) : iso(spec.createdMs),
  };
  const open = spec.status === "PENDING";
  const r2Panels = decided
    ? R2_SPECS.map((r2) => ({ kind: "R2_REQUEST", approval_id: r2.id, href: `/governance/approvals/${r2.id}/r2`, state: "PENDING", portfolio_id: r2.portfolio }))
    : [];
  return {
    schema_version: canon.schema_version,
    record_authority: canon.record_authority,
    delivery_profile: canon.delivery_profile,
    read_at: AS_OF_ISO,
    data: {
      approval,
      actor: clone(canon.data.actor),
      eligibility: { can_approve: open, can_approve_with_condition: open, can_deny: open, can_request_changes: open, locks: open ? [] : [decided ? "ALREADY_DECIDED" : "EXPIRED"], separation_of_duties: "OK" },
      known_limitations: clone(canon.data.known_limitations),
      evidence_manifest: { manifest_hash: setHash, complete: true, entries },
      checklist: [],
      decisions: decided ? [{ decision: "APPROVED", decided_by: decidedBy, decided_at: iso(APPROVED_DECIDED_MS), approval_version: approval.approval_version }] : [],
      linked_panels: r2Panels,
    },
  };
}

/* ── R2 ─────────────────────────────────────────────────────────────────── */

export function handoffR2(id: string): Json | null {
  const spec = r2Spec(id);
  if (spec === undefined) return null;
  const canon = canonical("execution-governance.r2-review.valid.json");
  const setHash = r2EvidenceHash(id);
  const r1 = handoffR1(HANDOFF_IDS.r1Approved)!.data.approval as Json;
  const data = clone(canon.data);
  Object.assign(data.approval, {
    approval_id: id,
    subject_id: spec.deployment,
    subject_label: spec.label,
    release_candidate: HANDOFF_RC, // the same release candidate the approved R1 decided: non-null, equal on both sides
    portfolio_id: spec.portfolio,
    evidence_set_hash: setHash,
    sla_due_at: iso(6 * HOUR),
    expires_at: iso(24 * HOUR),
    created_at: iso(-2 * HOUR),
    updated_at: iso(-2 * HOUR),
  });
  data.r1_reference = {
    approval_id: HANDOFF_IDS.r1Approved,
    state: "APPROVED",
    href: `/governance/approvals/${HANDOFF_IDS.r1Approved}/r1`,
    expiry: r1.expires_at,
    digest: r1.evidence_set_hash,
    decided_by: "lan",
    decided_at: iso(APPROVED_DECIDED_MS),
  };
  data.r1_state = "APPROVED";
  data.r1_id = HANDOFF_IDS.r1Approved;
  data.grant_id = `grant_TEST_ONLY_${spec.deployment}`;
  data.evidence_manifest = {
    manifest_hash: setHash,
    complete: true,
    entries: (data.evidence_manifest.entries as Json[]).map((entry, ordinal) => ({
      ...entry,
      evidence_id: `ev_${id}_${ordinal}`,
      sha256: ordinal === 0 ? r1.evidence_set_hash : handoffHash(`${id}:entry:${ordinal}`), // entry 0 IS the approved R1 evidence set
      captured_at: iso(APPROVED_DECIDED_MS),
    })),
  };
  return { schema_version: canon.schema_version, record_authority: canon.record_authority, delivery_profile: canon.delivery_profile, read_at: AS_OF_ISO, data };
}

/* ── evidence ───────────────────────────────────────────────────────────── */

/** Which published evidence fixture each approval's evidence read is: published, drawdown, no-source or not-read. */
export const HANDOFF_EVIDENCE_KIND: Readonly<Record<string, "published" | "drawdown" | "no-source" | "not-read">> = {
  [HANDOFF_IDS.r2]: "published",
  [HANDOFF_IDS.r2Satellite]: "drawdown",
  [HANDOFF_IDS.r1Pending]: "no-source", // R1 has no capital: no owning source for an economic history
  [HANDOFF_IDS.r1Approved]: "no-source",
  [HANDOFF_IDS.r1Expired]: "not-read", // the source exists but was not read
};

export function handoffEvidence(id: string, workspaceId: string | null): Json | null {
  const kind = HANDOFF_EVIDENCE_KIND[id];
  if (kind === undefined) return null;
  const body = clone(canonical(`execution-approval-evidence.${kind}.synthetic.valid.json`).value) as Json;
  const shift = HANDOFF_AS_OF_MS - (body.read_at_ms as number);
  body.workspace_id = workspaceId ?? HANDOFF_WORKSPACE;
  body.approval_id = id;
  body.read_at_ms = HANDOFF_AS_OF_MS;
  const history = body.prior_economic_history as Json | null | undefined;
  if (history) {
    const spec = r2Spec(id)!;
    history.subject = { subject_type: "PORTFOLIO", subject_id: spec.portfolio };
    history.window = { from_ms: history.window.from_ms + shift, to_ms: history.window.to_ms + shift };
    history.as_of_ms = HANDOFF_AS_OF_MS;
    history.methodology_ref = String(history.methodology_ref).replace("TEST_ONLY:", "FIXTURE_LAB:");
    history.points = (history.points as Json[]).map((point) => ({ ...point, ts_ms: point.ts_ms + shift }));
  }
  if (body.evidence_diff) body.evidence_diff.previous_revision = String(body.evidence_diff.previous_revision).replace("TEST_ONLY:", "FIXTURE_LAB:");
  if (body.receipt_preview) body.receipt_preview.what_changes = String(body.receipt_preview.what_changes).replace("portfolio A", r2Spec(id)?.portfolio ?? "the portfolio");
  return body;
}

/* ── the answerer ───────────────────────────────────────────────────────── */

const READ = /^\/api\/v1\/execution\/governance\/approvals\/([A-Za-z0-9._:-]{1,191})\/(r1|r2|evidence)$/;

export interface HandoffAnswer { status: number; body: unknown }

/** Null when the path is not one of the chain's reads (the normal world answers it); GET and HEAD only. */
export function answerHandoff(method: string, path: string, search: URLSearchParams): HandoffAnswer | null {
  const match = READ.exec(path);
  if (match === null || (method !== "GET" && method !== "HEAD")) return null;
  const [, id, kind] = match as unknown as [string, string, string];
  const body = kind === "r1" ? handoffR1(id) : kind === "r2" ? handoffR2(id) : handoffEvidence(id, search.get("workspace_id"));
  return body === null ? null : { status: 200, body };
}

/** Every synthetic approval id the scenario serves, with its gate and state: what the register and the review page list. */
export const HANDOFF_CHAIN: readonly { id: string; gate: "R1" | "R2"; state: string; release_candidate: string; evidence: string }[] = [
  ...R1_SPECS.map((s) => ({ id: s.id, gate: "R1" as const, state: s.status, release_candidate: s.rc, evidence: HANDOFF_EVIDENCE_KIND[s.id]! })),
  ...R2_SPECS.map((s) => ({ id: s.id, gate: "R2" as const, state: "PENDING", release_candidate: HANDOFF_RC, evidence: HANDOFF_EVIDENCE_KIND[s.id]! })),
];
// ===== WP-H end
