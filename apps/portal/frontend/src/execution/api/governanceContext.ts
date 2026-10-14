/**
 * Governance review context — what the server publishes so a screen can bind its writes instead of inventing them.
 *
 *  - `decision_context` (R1 / R2 reads): the exact workspace, approval, version and evidence-hash pins for the ONE commissioned decision command (R1),
 *    or a typed BLOCKED state (R2: no decision executor is commissioned, so there is no command, path or hash).
 *  - `capture_context` (R1 / R2 reads): the parent pins, projection digest and accepted deployment/portfolio/risk choices for the Portal review captures
 *    (`R2_CREATE`, `PAPER_EXIT_CREATE`), or a typed BLOCKED state.
 *
 * Readers validate the published shape at the boundary (generated types name the fields; these functions check the values) and never repair it: an
 * unreadable context is `invalid`, an old response without one is `absent`, and neither is permission. Nothing here reads a label, hash or id prefix
 * to decide what a thing is.
 */
import type { components } from "@portal/contracts-governance";

export type DecisionContextWire = components["schemas"]["DecisionContext"];
export type CaptureContextWire = components["schemas"]["CaptureContext"];

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const ID = /^[A-Za-z0-9._:-]{1,192}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;
const CURRENCY = /^[A-Z0-9]{2,12}$/;
const id = (v: unknown): v is string => typeof v === "string" && ID.test(v);
const hash = (v: unknown): v is string => typeof v === "string" && HASH.test(v);
const version = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;

/** The reasons the server names, in words. The code stays in a tooltip / the typed state; unknown codes are shown as the code itself. */
const REASON_WORDS: Readonly<Record<string, string>> = {
  GOVERNANCE_CAPABILITY_REQUIRED: "your account holds no governance grant for this decision",
  ADMIN_ROLE_REQUIRED: "this needs an administrator role",
  APPROVAL_NOT_PENDING: "this approval is no longer pending",
  APPROVAL_EXPIRED: "this approval has expired",
  EVIDENCE_HASH_LIMIT_EXCEEDED: "the evidence set is larger than one decision can pin",
  R2_EXECUTION_DECISION_NOT_COMMISSIONED: "R2 decisions are not commissioned yet — viewing or capturing this review grants no execution",
  R1_APPROVAL_REQUIRED: "R1 must be approved first",
  R1_EVIDENCE_INCOMPLETE: "the R1 evidence is incomplete",
  R2_ACCEPTED_LINEAGE_UNAVAILABLE: "no accepted R1 lineage is available",
  R2_REVIEW_CLOSED: "this R2 review is closed",
  CAPTURE_RETAINED_REVIEW_READ_ONLY: "this is a retained review — read-only, nothing can be captured from earlier observations",
  CAPTURE_PROJECTION_NOT_AUTHORIZED: "your account may not read the source this capture is bound to",
  CAPTURE_PROJECTION_UNAVAILABLE: "the source review is not available",
  CAPTURE_PROJECTION_SCOPE_MISMATCH: "the source belongs to a different scope",
  CAPTURE_PROJECTION_STALE: "the source review is stale",
  CAPTURE_DEPLOYMENT_SOURCE_UNAVAILABLE: "the deployment source is not available",
  R2_RISK_GRANT_SOURCE_UNAVAILABLE: "the accepted risk grants are not available",
  R2_PORTFOLIO_SCOPE_NOT_FOUND: "no accepted portfolio scope was found",
  CAPTURE_DEPLOYMENT_SCOPE_NOT_FOUND: "no accepted deployment was found",
  PAPER_VENUE_UNAVAILABLE: "the paper venue is not available",
};
export function reasonWords(code: string | null): string | null {
  if (code === null) return null;
  return REASON_WORDS[code] ?? code;
}

export interface Availability {
  available: boolean;
  /** The server's code when blocked; `null` when available. */
  reasonCode: string | null;
}

function readAvailability(raw: unknown): Availability | null {
  const a = obj(raw);
  if (!a) return null;
  if (a.state === "AVAILABLE") return a.reason_code === null ? { available: true, reasonCode: null } : null;
  if (a.state === "BLOCKED") return typeof a.reason_code === "string" && a.reason_code !== "" ? { available: false, reasonCode: a.reason_code } : null;
  return null;
}

export interface DecisionContext {
  gate: "R1" | "R2";
  workspaceId: string;
  approvalId: string;
  expectedVersion: number;
  evidenceSetHash: string;
  /** Sorted-unique pins exactly as published; `null` = the server could not publish them (over the bound) — unavailable, never `[]`. */
  evidenceHashes: readonly string[] | null;
  /** True only for the commissioned R1 command with every pin present. It is a context, not an eligibility: the per-verb flags still apply. */
  commandReady: boolean;
  availability: Availability;
}

export type ContextRead<T> = { kind: "absent" } | { kind: "invalid" } | { kind: "ok"; value: T };

export function readDecisionContext(raw: unknown): ContextRead<DecisionContext> {
  if (raw === undefined) return { kind: "absent" };
  const c = obj(raw);
  if (!c) return { kind: "invalid" };
  const availability = readAvailability(c.availability);
  if (!availability || (c.gate !== "R1" && c.gate !== "R2") || !id(c.workspace_id) || !id(c.approval_id) || !version(c.expected_approval_version) ||
      !hash(c.evidence_set_hash) || c.source_side_effect_requested !== false) return { kind: "invalid" };
  let hashes: string[] | null = null;
  if (c.evidence_hashes !== null) {
    if (!Array.isArray(c.evidence_hashes) || c.evidence_hashes.length > 128 || !c.evidence_hashes.every(hash) || new Set(c.evidence_hashes).size !== c.evidence_hashes.length) return { kind: "invalid" };
    hashes = [...(c.evidence_hashes as string[])];
  }
  const commandWire = c.command_type === "GOVERNANCE_R1_DECISION" && c.request_schema_version === "governance.r1-decision-plan-request.v1" && c.plan_path === "/api/v1/execution/commands/plans";
  const noCommand = c.command_type === null && c.request_schema_version === null && c.plan_path === null;
  if (!commandWire && !noCommand) return { kind: "invalid" };
  // R2 never carries a command; an R1 context that says AVAILABLE must carry one.
  if (c.gate === "R2" && (commandWire || availability.available)) return { kind: "invalid" };
  if (c.gate === "R1" && availability.available && !commandWire) return { kind: "invalid" };
  return {
    kind: "ok",
    value: {
      gate: c.gate,
      workspaceId: c.workspace_id,
      approvalId: c.approval_id,
      expectedVersion: c.expected_approval_version,
      evidenceSetHash: c.evidence_set_hash,
      evidenceHashes: hashes,
      commandReady: c.gate === "R1" && availability.available && commandWire && hashes !== null,
      availability,
    },
  };
}

export interface PaperExitDecisionContext {
  workspaceId: string;
  reviewId: string;
  expectedVersion: number;
  evidenceSetHash: string;
  sourceSnapshotHash: string;
  /** The COMPLETE verified manifest hash set the plan compares against (sorted, unique, ≤ 128), or `null` when it could not be published (over the bound). */
  evidenceHashes: readonly string[] | null;
  availability: Availability;
}

/** `data.decision_context` of the Paper Exit read: its own command, its own pins — never R1's, never lineage or finding digests. */
export function readPaperExitDecisionContext(raw: unknown): ContextRead<PaperExitDecisionContext> {
  if (raw === undefined) return { kind: "absent" };
  const c = obj(raw);
  if (!c) return { kind: "invalid" };
  const availability = readAvailability(c.availability);
  if (!availability || c.gate !== "PAPER_EXIT" || !id(c.workspace_id) || !id(c.review_id) || !version(c.expected_review_version) || !hash(c.evidence_set_hash) ||
      !hash(c.source_snapshot_hash) || c.source_side_effect_requested !== false) return { kind: "invalid" };
  if (c.command_type !== "GOVERNANCE_PAPER_EXIT_DECISION" || c.request_schema_version !== "governance.paper-exit-decision-plan-request.v1" || c.plan_path !== "/api/v1/execution/commands/plans") return { kind: "invalid" };
  let hashes: string[] | null = null;
  if (c.evidence_hashes !== null) {
    if (!Array.isArray(c.evidence_hashes) || c.evidence_hashes.length > 128 || !c.evidence_hashes.every(hash) || new Set(c.evidence_hashes).size !== c.evidence_hashes.length) return { kind: "invalid" };
    hashes = [...(c.evidence_hashes as string[])];
  }
  // pins missing means blocked (oversize becomes null + blocked); an AVAILABLE context with no pins cannot exist
  if (availability.available && hashes === null) return { kind: "invalid" };
  return {
    kind: "ok",
    value: { workspaceId: c.workspace_id, reviewId: c.review_id, expectedVersion: c.expected_review_version, evidenceSetHash: c.evidence_set_hash, sourceSnapshotHash: c.source_snapshot_hash, evidenceHashes: hashes, availability },
  };
}

/** What a screen may send for a Paper Exit decision: the exact pins of this read, or the reason it cannot plan. Per-verb eligibility still applies on top. */
export type ExitBinding =
  | { state: "ready"; workspaceId: string; reviewId: string; expectedVersion: number; evidenceHashes: readonly string[] }
  | { state: "blocked"; reason: string; reasonCode: string | null }
  | { state: "unavailable"; reason: string };

export function bindExitDecision(input: { context: ContextRead<PaperExitDecisionContext>; envelopeWorkspaceId: string | null; reviewId: string }): ExitBinding {
  const { context } = input;
  if (context.kind === "invalid") return { state: "unavailable", reason: "The decision context in this read could not be validated. Reload to read it again." };
  if (context.kind === "absent") {
    // Older read: the full evidence set is not published anywhere else (lineage and finding digests are not it), so nothing is guessed.
    return { state: "unavailable", reason: "This older read published no decision context, so the evidence set a plan must pin is unknown. Reload for a current read; nothing is guessed or defaulted." };
  }
  const c = context.value;
  if (c.reviewId !== input.reviewId || (input.envelopeWorkspaceId !== null && c.workspaceId !== input.envelopeWorkspaceId)) {
    return { state: "unavailable", reason: "The decision context does not match the review and workspace of this read. Reload before deciding." };
  }
  if (!c.availability.available) return { state: "blocked", reasonCode: c.availability.reasonCode, reason: `No decision can be planned: ${EXIT_REASON_WORDS[c.availability.reasonCode ?? ""] ?? reasonWords(c.availability.reasonCode)}.` };
  if (c.evidenceHashes === null) return { state: "unavailable", reason: "The evidence pins for this decision were not published, so a plan cannot be made safely. Reload to read them again." };
  return { state: "ready", workspaceId: c.workspaceId, reviewId: c.reviewId, expectedVersion: c.expectedVersion, evidenceHashes: c.evidenceHashes };
}

const EXIT_REASON_WORDS: Readonly<Record<string, string>> = {
  APPROVER_ROLE_REQUIRED: "this needs an approver role",
  EXIT_REVIEW_NOT_PENDING: "this exit review is no longer pending",
  EXIT_REVIEW_EXPIRED: "this exit review has expired",
  ACTOR_ALREADY_DECIDED: "you have already decided this review",
  PAPER_EXIT_QUORUM_UNSUPPORTED: "this review's quorum is not supported by the decision command",
  EVIDENCE_HASH_LIMIT_EXCEEDED: "the evidence set is larger than one decision can pin",
};

export interface CaptureCandidate {
  deploymentId: string;
  portfolioId: string;
  /** `null` = the source recorded none: an R2 capture cannot be made against this choice. */
  riskGrantId: string | null;
  /** `null` = not recorded; the reviewer must choose one explicitly, it is never defaulted. */
  currency: string | null;
}

export interface CaptureContext {
  action: "R2_CREATE" | "PAPER_EXIT_CREATE";
  workspaceId: string;
  parentApprovalId: string;
  expectedParentVersion: number;
  /** Null exactly when the context is blocked. */
  projectionDigest: string | null;
  availability: Availability;
  candidates: readonly CaptureCandidate[];
  truncated: boolean;
}

export function readCaptureContext(raw: unknown): ContextRead<CaptureContext> {
  if (raw === undefined) return { kind: "absent" };
  const c = obj(raw);
  if (!c) return { kind: "invalid" };
  const availability = readAvailability(c.availability);
  if (!availability || (c.action !== "R2_CREATE" && c.action !== "PAPER_EXIT_CREATE") || !id(c.workspace_id) || !id(c.parent_approval_id) ||
      !version(c.expected_parent_version) || c.source_side_effect_requested !== false || c.currency_semantics !== "REVIEWER_REQUESTED_NOT_FX_CONVERSION" ||
      typeof c.candidates_truncated !== "boolean" || !Array.isArray(c.candidates) || c.candidates.length > 50) return { kind: "invalid" };
  if (c.expected_projection_digest !== null && !hash(c.expected_projection_digest)) return { kind: "invalid" };
  const candidates: CaptureCandidate[] = [];
  const seen = new Set<string>();
  for (const item of c.candidates) {
    const o = obj(item);
    if (!o || !id(o.deployment_id) || !id(o.portfolio_id) || (o.risk_grant_id !== null && !id(o.risk_grant_id)) ||
        (o.currency !== null && !(typeof o.currency === "string" && CURRENCY.test(o.currency)))) return { kind: "invalid" };
    const key = JSON.stringify([o.deployment_id, o.portfolio_id, o.risk_grant_id, o.currency]);
    if (seen.has(key)) return { kind: "invalid" };
    seen.add(key);
    candidates.push({ deploymentId: o.deployment_id, portfolioId: o.portfolio_id, riskGrantId: o.risk_grant_id as string | null, currency: o.currency as string | null });
  }
  // A blocked context carries no digest and no choices; an available one carries a digest.
  if (!availability.available && (c.expected_projection_digest !== null || candidates.length > 0)) return { kind: "invalid" };
  if (availability.available && c.expected_projection_digest === null) return { kind: "invalid" };
  return {
    kind: "ok",
    value: {
      action: c.action,
      workspaceId: c.workspace_id,
      parentApprovalId: c.parent_approval_id,
      expectedParentVersion: c.expected_parent_version,
      projectionDigest: c.expected_projection_digest as string | null,
      availability,
      candidates,
      truncated: c.candidates_truncated,
    },
  };
}

/** What a screen may send for an R1 decision: exact pins from the SAME read, or a stated reason it cannot. */
export type R1Binding =
  | { state: "ready"; workspaceId: string; approvalId: string; expectedVersion: number; evidenceHashes: readonly string[]; source: "context" | "manifest" }
  | { state: "blocked"; reason: string; reasonCode: string | null }
  | { state: "unavailable"; reason: string };

/**
 * Bind an R1 decision to its pins.
 *
 * `context` wins when present: it is the server's own statement of the command's inputs. Otherwise a verified manifest may supply the hashes — but only
 * when EVERY manifest entry carries a valid sha256 (a partial subset is a mismatch waiting to happen), and never silently as `[]`.
 */
export function bindR1Decision(input: {
  context: ContextRead<DecisionContext>;
  envelopeWorkspaceId: string | null;
  approvalId: string;
  /** `null` = no manifest was readable at all. */
  manifest: { entryCount: number; sha256: readonly (string | null)[] } | null;
  legacyVersion: number | null;
}): R1Binding {
  const { context } = input;
  if (context.kind === "invalid") return { state: "unavailable", reason: "The decision context in this read could not be validated. Reload to read it again." };
  if (context.kind === "ok") {
    const c = context.value;
    if (c.gate !== "R1") return { state: "unavailable", reason: "This read's decision context belongs to another gate, so no R1 decision is addressed from it." };
    if (c.approvalId !== input.approvalId || (input.envelopeWorkspaceId !== null && c.workspaceId !== input.envelopeWorkspaceId)) {
      return { state: "unavailable", reason: "The decision context does not match the approval and workspace of this read. Reload before deciding." };
    }
    if (!c.availability.available) {
      return { state: "blocked", reasonCode: c.availability.reasonCode, reason: `No decision can be planned: ${reasonWords(c.availability.reasonCode)}.` };
    }
    if (c.evidenceHashes === null) return { state: "unavailable", reason: "The evidence pins for this decision were not published, so a plan cannot be made safely. Reload to read them again." };
    return { state: "ready", workspaceId: c.workspaceId, approvalId: c.approvalId, expectedVersion: c.expectedVersion, evidenceHashes: c.evidenceHashes, source: "context" };
  }
  // Older response: no context.
  if (input.envelopeWorkspaceId === null) return { state: "unavailable", reason: "This review published no workspace, so a decision cannot be addressed to one." };
  if (input.legacyVersion === null) return { state: "unavailable", reason: "This request published no version to decide against, so a plan cannot be made safely." };
  const m = input.manifest;
  if (m === null || m.sha256.length !== m.entryCount || !m.sha256.every((h): h is string => h !== null && hash(h))) {
    return { state: "unavailable", reason: "This older read did not publish the complete evidence pins. Reload for a current read; hashes are never defaulted to none." };
  }
  const unique = [...new Set(m.sha256)].sort();
  return { state: "ready", workspaceId: input.envelopeWorkspaceId, approvalId: input.approvalId, expectedVersion: input.legacyVersion, evidenceHashes: unique, source: "manifest" };
}

/**
 * The R2 → R1 backlink: a same-origin R1 review path, with at most the one bounded `workspace_id` query. Anything else (another host, another path,
 * extra parameters) is refused and the reference renders unlinked. A legacy href with no query gets the read's own workspace appended.
 */
export function safeR1Href(href: string | null, workspaceId: string | null): string | null {
  if (href === null) return null;
  const m = /^\/governance\/approvals\/([A-Za-z0-9._:-]{1,192})\/r1(?:\?workspace_id=([A-Za-z0-9._:-]{1,192}))?$/.exec(href);
  if (!m) return null;
  const given = m[2] ?? null;
  // a backlink naming another workspace than the read it came from is not this approval's R1
  if (given !== null && workspaceId !== null && given !== workspaceId) return null;
  const chosen = given ?? workspaceId;
  return chosen ? `/governance/approvals/${m[1]}/r1?workspace_id=${encodeURIComponent(chosen)}` : `/governance/approvals/${m[1]}/r1`;
}
