/**
 * Row mappers for the governance screens.
 *
 * These sit on top of `adapter.ts`: that module knows the envelope and the
 * keyset page, this one knows what an approval row is. The split matters
 * because the envelope is shared by all seventeen screens and will change
 * rarely, while row shapes are per-endpoint and will change often.
 *
 * Mapping source: `upgrade/backend/EX_BE_05A_GOVERNANCE_EVIDENCE_APPROVAL.md` §5,
 * which is the field map codex published with the implementation, plus the
 * `keyset-page.v1` schema from `885e176`.
 *
 * Four fields were guessed wrong before that map existed and are corrected
 * here: the row flag is `inert` rather than `inert_reason`, the detail nests
 * under `data.approval`, the passport is `data.evidence_manifest.entries[]`,
 * and the locks live under `data.eligibility`. Recorded rather than quietly
 * fixed, because it is the measure of how much guessing the port absorbed —
 * four field names, and no screen changed.
 *
 * Every mapper returns `null` for a row it cannot read rather than a
 * half-populated object. `readKeysetPage` drops those, and because the counts
 * still come from the server the footer will disagree with the visible rows —
 * which is the correct, visible symptom of a contract skew rather than a silent
 * one.
 */
import { readDecimal, readEnum, readId, readTimestamp, type MaybeKnown } from "../adapter";
import type { ApprovalId, EvidenceMark, Sla } from "../contracts";
import type { ApprovalGate, ApprovalRow, InertReason } from "../screens/ApprovalInbox";
import type { ChecklistItem, DecisionLock, PassportEntry } from "../screens/GateR1Review";
import type { CapitalPreview } from "../analytics";

const GATES: readonly ApprovalGate[] = ["R1", "R2", "PAPER_EXIT", "SANDBOX_EXIT", "LIVE_GATE"];
const INERT: readonly InertReason[] = ["SELF", "QUORUM", "BLOCKED"];
const MARKS: readonly EvidenceMark[] = ["pass", "watch", "fail", "insufficient"];

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

/**
 * A person, published as `{user_id, username}` or as a bare string.
 *
 * Two readers rather than one because the two answer different questions: the
 * name is for the sentence a reviewer reads, and the id is the only thing an
 * equality check may ever be based on.
 */
function actorName(raw: unknown): string | null {
  if (typeof raw === "string" && raw.length > 0) return raw;
  const o = obj(raw);
  return o ? (str(o.username) ?? str(o.user_id)) : null;
}

function actorId(raw: unknown): string | null {
  if (typeof raw === "string" && raw.length > 0) return raw;
  const o = obj(raw);
  return o ? str(o.user_id) : null;
}

function int(raw: unknown): number | null {
  return typeof raw === "number" && Number.isInteger(raw) ? raw : null;
}

function str(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * SLA age and budget, both server-computed.
 *
 * The sort key codex chose is `sla_due_at`, which is right for ordering. It is
 * not enough for rendering: turning a due time into "26h / 24h · OVERDUE" needs
 * a clock, and the only clock this build is allowed to use for that belongs to
 * the server (BR-EX-19). So an age is read, never derived — a row carrying only
 * `sla_due_at` returns `null` here and the cell renders as a stated gap instead
 * of a number computed on a laptop whose clock nobody controls.
 */
export function readSla(raw: unknown): Sla | null {
  const o = obj(raw);
  if (!o) return null;
  const ageMinutes = int(o.age_minutes);
  const budgetMinutes = int(o.budget_minutes);
  if (ageMinutes === null || budgetMinutes === null) return null;
  return { ageMinutes, budgetMinutes };
}

/** True when the row carries a due time but no server-computed age. */
export function slaAgeMissing(raw: unknown): boolean {
  const o = obj(raw);
  if (!o) return false;
  return int(o.age_minutes) === null && readTimestamp(o.due_at) !== null;
}

export interface ApprovalRowRead {
  row: ApprovalRow | null;
  /** Fields the server sent that this build could not use. */
  gaps: readonly string[];
}

/** One row of `GET /api/v1/execution/governance/approvals`. */
export function readApprovalRow(raw: Record<string, unknown>): ApprovalRowRead {
  const gaps: string[] = [];

  const id = readId(raw.approval_id) as ApprovalId | null;
  const gateParsed = readEnum(raw.gate, GATES);
  const sla = readSla(raw.sla);

  if (!id) return { row: null, gaps: ["approval_id"] };
  if (!gateParsed) return { row: null, gaps: ["gate"] };
  if (!gateParsed.known) {
    // A gate vocabulary this build does not know cannot be routed to a review
    // screen, so the row is dropped rather than rendered as un-openable.
    return { row: null, gaps: [`gate="${gateParsed.raw}"`] };
  }
  if (!sla) gaps.push(slaAgeMissing(raw.sla) ? "sla.age_minutes (only due_at sent)" : "sla");

  const inertParsed = readEnum(raw.inert, INERT);
  if (inertParsed && !inertParsed.known) gaps.push(`inert_reason="${inertParsed.raw}"`);

  return {
    row: {
      id,
      gate: gateParsed.value,
      subject: str(raw.subject) ?? id,
      target: str(raw.target) ?? "—",
      // A count the server did not send is not zero. Zero blockers is a
      // cleared gate, which is a claim; absence is not.
      blockerCount: int(raw.blocker_count) ?? -1,
      blockerSummary: str(raw.blocker_summary),
      sla: sla ?? { ageMinutes: -1, budgetMinutes: -1 },
      quorumMet: int(raw.quorum_met) ?? 0,
      quorumRequired: int(raw.quorum_required) ?? 0,
      inert: inertParsed?.known ? inertParsed.value : null,
      needsYou: raw.needs_you === true,
    },
    gaps,
  };
}

/** One line of the Gate R1 artifact passport (§10.2, "immutable evidence manifest"). */
export function readPassportEntry(raw: unknown): PassportEntry | null {
  const o = obj(raw);
  if (!o) return null;
  const label = str(o.label);
  const value = str(o.value);
  if (!label || !value) return null;
  return {
    label,
    value,
    // Null on purpose when absent: the screen prints "not verified" rather than
    // leaving a blank that reads as checked-and-fine.
    verification: str(o.verification),
    note: str(o.note),
  };
}

/** One decision-checklist finding. */
export function readChecklistItem(raw: unknown): ChecklistItem | null {
  const o = obj(raw);
  if (!o) return null;
  const label = str(o.label);
  const outcome = readEnum(o.outcome, MARKS);
  if (!label || !outcome) return null;
  if (!outcome.known) {
    // An unknown outcome is treated as `insufficient` — the value that blocks
    // nothing and claims nothing — and the raw token is kept in the label so a
    // reader can see what the server actually said.
    return { label: `${label} — server reported "${outcome.raw}"`, outcome: "insufficient" };
  }
  return { label, outcome: outcome.value, suggestion: str(o.suggestion) };
}

/**
 * The server's own answer on what this actor may do.
 *
 * Three independent booleans, not one. `EX_BE_05A` §5 is explicit that they are
 * obeyed separately, and it is right to be: approve, approve-with-condition and
 * deny are three permissions with different rules — self-denial is allowed
 * where self-approval never is.
 *
 * These are authoritative in one direction only. The client may refuse
 * something the server permitted, because its own derived checks are a floor
 * and a floor can only make things stricter. It must never permit something the
 * server refused. That asymmetry is the whole of rule §3.5 applied here.
 */
export interface Eligibility {
  canApprove: boolean;
  canApproveWithCondition: boolean;
  canDeny: boolean;
}

/** Absent eligibility is not permission. Deny-by-default, as everywhere else. */
export const NO_ELIGIBILITY: Eligibility = {
  canApprove: false,
  canApproveWithCondition: false,
  canDeny: false,
};

export function readEligibility(raw: unknown): Eligibility {
  const o = obj(raw);
  if (!o) return NO_ELIGIBILITY;
  return {
    canApprove: o.can_approve === true,
    canApproveWithCondition: o.can_approve_with_condition === true,
    canDeny: o.can_deny === true,
  };
}

export interface GateR1Detail {
  approvalId: ApprovalId;
  alphaLabel: string;
  releaseCandidate: string | null;
  quorumMet: number;
  quorumRequired: number;
  policyVersion: string;
  creator: string;
  creatorId: string | null;
  actor: string;
  actorId: string | null;
  sla: Sla | null;
  passport: readonly PassportEntry[];
  checklist: readonly ChecklistItem[];
  locks: readonly DecisionLock[];
  /** The server's verdict on the three controls. Never derived here. */
  eligibility: Eligibility;
  decided: { outcome: "APPROVED" | "DENIED" | "APPROVED_WITH_CONDITION"; by: string; at: string } | null;
  /** Optimistic-concurrency token. Apply must echo it (master plan §10.2). */
  /**
   * Optimistic-concurrency version, as the published row carries it.
   *
   * A **number**, not a string, and named `approval_version` — the first
   * version of this reader looked for `expected_version` as a string and found
   * neither, so every plan was made with no version at all.
   */
  expectedVersion: number | null;
  gaps: readonly string[];
}

const DECIDED_OUTCOMES = ["APPROVED", "DENIED", "APPROVED_WITH_CONDITION"] as const;
const LOCKS: readonly DecisionLock[] = [
  "SELF_APPROVAL",
  "BLOCKING_FINDINGS",
  "EXPIRED",
  "NOT_ELIGIBLE",
];

/** `GET /api/v1/execution/governance/approvals/{id}/r1`. */
export function readGateR1Detail(raw: unknown): GateR1Detail | null {
  const o = obj(raw);
  if (!o) return null;
  const data = obj(o.data) ?? o;
  // `data.approval` per the field map. Falling back to `data` keeps the fixture
  // and any flatter response readable rather than failing on shape alone.
  const approval = obj(data.approval) ?? data;
  const eligibility = readEligibility(data.eligibility);
  const approvalId = readId(approval.approval_id ?? data.approval_id) as ApprovalId | null;
  if (!approvalId) return null;

  const gaps: string[] = [];
  const manifest = obj(data.evidence_manifest);
  const passportRaw = Array.isArray(manifest?.entries)
    ? manifest.entries
    : Array.isArray(data.passport)
      ? data.passport
      : [];
  const passport = passportRaw
    .map(readPassportEntry)
    .filter((e): e is PassportEntry => e !== null);
  const checklist = Array.isArray(data.checklist)
    ? data.checklist.map(readChecklistItem).filter((c): c is ChecklistItem => c !== null)
    : [];

  if (passportRaw.length !== passport.length) {
    gaps.push(`${passportRaw.length - passport.length} evidence manifest entries unreadable`);
  }

  const eligibilityObj = obj(data.eligibility);
  const rawLocks = Array.isArray(eligibilityObj?.locks)
    ? eligibilityObj.locks
    : Array.isArray(data.locks)
      ? data.locks
      : [];
  const locks: DecisionLock[] = [];
  for (const entry of rawLocks) {
    const parsed = readEnum(entry, LOCKS);
    if (parsed?.known) locks.push(parsed.value);
    // An unrecognised lock is still a lock. It is kept as NOT_ELIGIBLE, the
    // most restrictive value, because a lock this build cannot name is not a
    // reason to ignore it.
    else if (parsed) {
      locks.push("NOT_ELIGIBLE");
      gaps.push(`lock="${parsed.raw}" treated as NOT_ELIGIBLE`);
    }
  }

  // The last item of `data.decisions[]` is the decision in force. Earlier
  // entries are the quorum's history and must not overwrite it.
  const decisions = Array.isArray(data.decisions) ? data.decisions : [];
  const decidedRaw = decisions.length > 0 ? obj(decisions[decisions.length - 1]) : obj(data.decided);
  const decidedOutcome = decidedRaw ? readEnum(decidedRaw.outcome, DECIDED_OUTCOMES) : null;

  return {
    approvalId,
    alphaLabel: str(approval.subject_label) ?? str(approval.alpha_label) ?? approvalId,
    releaseCandidate: str(approval.release_candidate),
    quorumMet: int(approval.quorum_met ?? data.quorum_met) ?? 0,
    quorumRequired: int(approval.quorum_required ?? data.quorum_required) ?? 0,
    policyVersion: str(approval.policy_version ?? data.policy_version) ?? "unversioned",
    // `creator` is `{user_id, username}` on the wire; `str()` on it returned
    // null, both sides fell back to "unknown", and the screen's equality check
    // then locked every approval as a self-approval.
    creator: actorName(approval.creator ?? data.creator) ?? "unknown",
    creatorId: actorId(approval.creator ?? data.creator),
    actor: actorName(data.actor) ?? "unknown",
    actorId: actorId(data.actor),
    sla: readSla(approval.sla ?? data.sla),
    eligibility,
    passport,
    checklist,
    locks,
    decided:
      decidedRaw && decidedOutcome?.known
        ? {
            outcome: decidedOutcome.value,
            by: str(decidedRaw.by) ?? "unknown",
            at: readTimestamp(decidedRaw.at) ?? "unknown time",
          }
        : null,
    expectedVersion: int(approval.approval_version ?? data.approval_version),
    gaps,
  };
}

/** Re-exported so callers do not reach past this module into the adapter. */
export { readDecimal, type MaybeKnown };

/* ---------------------------------------------------------------------------
 * Gate R2 (§10.3) and Paper Exit Review (§10.5)
 * ------------------------------------------------------------------------ */

import type {
  CapitalDelta,
  R1State,
  R2Lock,
  ReadinessGroup,
} from "../screens/GateR2Review";
import type { EvidencePanelSpec, ExitFinding } from "../screens/PaperExitReview";

const R1_STATES: readonly R1State[] = [
  "APPROVED",
  "APPROVED_WITH_CONDITION",
  "EXPIRED",
  "DENIED",
  "PENDING",
  "MISSING",
];

const R2_LOCKS: readonly R2Lock[] = [
  "SELF_APPROVAL",
  "R1_NOT_VALID",
  "CAPITAL_BREACH",
  "EXPIRED",
  "NOT_ELIGIBLE",
];

/**
 * One row of the capital preview.
 *
 * `currency` is read separately rather than parsed out of the formatted value.
 * Scale-refine note I-4: the capital diff is **per currency**, so a strip that
 * implies one number is wrong the moment a portfolio holds two. A row that does
 * not state its currency is returned with `currency: null` and the screen says
 * so — guessing it from the digits is how a USDT figure and a VND figure end up
 * stacked as though they added up.
 */
export function readCapitalDelta(raw: unknown): CapitalDelta | null {
  const o = obj(raw);
  if (!o) return null;
  const label = str(o.label);
  const before = str(o.before);
  const after = str(o.after);
  if (!label || !before || !after) return null;
  return {
    label,
    before,
    after,
    currency: str(o.currency),
    note: str(o.note),
    breach: o.breach === true,
  };
}

export function readReadinessGroup(raw: unknown): ReadinessGroup | null {
  const o = obj(raw);
  if (!o) return null;
  const title = str(o.title);
  if (!title) return null;
  const entries = Array.isArray(o.entries)
    ? o.entries.flatMap((e) => {
        const eo = obj(e);
        const label = eo && str(eo.label);
        const value = eo && str(eo.value);
        return label && value ? [{ label, value, revision: str(eo!.revision) }] : [];
      })
    : [];
  return { title, entries };
}

export interface GateR2Detail {
  approvalId: ApprovalId;
  subject: string;
  r1Id: ApprovalId | null;
  r1State: R1State;
  /** Where the R1 decision can be read. A reference nobody can open is a claim. */
  r1Href: string | null;
  /** §3's other two R1 reference fields, plus who decided it. */
  r1Expiry: string | null;
  r1Digest: string | null;
  r1DecidedBy: string | null;
  r1DecidedAt: string | null;
  deploymentCandidate: string | null;
  releaseCandidate: string | null;
  artifactDigest: string | null;
  policyVersion: string;
  planAuthor: string;
  actor: string;
  quorumMet: number;
  quorumRequired: number;
  sla: Sla | null;
  readiness: readonly ReadinessGroup[];
  capital: readonly CapitalDelta[];
  grantName: string | null;
  locks: readonly R2Lock[];
  eligibility: Eligibility;
  /**
   * Optimistic-concurrency version, as the published row carries it.
   *
   * A **number**, not a string, and named `approval_version` — the first
   * version of this reader looked for `expected_version` as a string and found
   * neither, so every plan was made with no version at all.
   */
  expectedVersion: number | null;
  /** BR-EX-23: what the capital preview must be computed against. */
  portfolioId: string | null;
  currency: string | null;
  requestedAmount: string | null;
  gaps: readonly string[];
}

export function readGateR2Detail(raw: unknown): GateR2Detail | null {
  const o = obj(raw);
  if (!o) return null;
  const data = obj(o.data) ?? o;
  const approval = obj(data.approval) ?? data;
  const approvalId = readId(approval.approval_id ?? data.approval_id) as ApprovalId | null;
  if (!approvalId) return null;

  const gaps: string[] = [];
  const r1 = obj(data.r1_reference) ?? {};
  const r1Parsed = readEnum(r1.state ?? data.r1_state, R1_STATES);
  if (r1Parsed && !r1Parsed.known) gaps.push(`r1.state="${r1Parsed.raw}"`);

  const capitalRaw = Array.isArray(data.capital) ? data.capital : [];
  const capital = capitalRaw.map(readCapitalDelta).filter((c): c is CapitalDelta => c !== null);
  const unnamed = capital.filter((c) => !c.currency).length;
  if (unnamed > 0) gaps.push(`${unnamed} capital rows did not state a currency`);

  const locks: R2Lock[] = [];
  const eligibilityObj = obj(data.eligibility);
  for (const entry of Array.isArray(eligibilityObj?.locks) ? eligibilityObj.locks : []) {
    const parsed = readEnum(entry, R2_LOCKS);
    if (parsed?.known) locks.push(parsed.value);
    else if (parsed) {
      locks.push("NOT_ELIGIBLE");
      gaps.push(`lock="${parsed.raw}" treated as NOT_ELIGIBLE`);
    }
  }

  return {
    portfolioId: readId(approval.portfolio_id ?? data.portfolio_id),
    currency: str(approval.currency ?? data.currency),
    requestedAmount: readDecimal(approval.requested_amount ?? data.requested_amount),
    approvalId,
    subject: str(approval.subject_label) ?? approvalId,
    r1Id: (readId(r1.approval_id ?? data.r1_id) as ApprovalId | null) ?? null,
    // An unreadable R1 state is MISSING, the value that blocks. A reference we
    // cannot understand is not a reference we may proceed on.
    r1State: r1Parsed?.known ? r1Parsed.value : "MISSING",
    r1Href: str(r1.href),
    r1Expiry: str(r1.expiry),
    r1Digest: str(r1.digest),
    r1DecidedBy: str(r1.decided_by),
    r1DecidedAt: readTimestamp(r1.decided_at) ?? str(r1.decided_at),
    deploymentCandidate: str(approval.deployment_candidate),
    releaseCandidate: str(approval.release_candidate),
    artifactDigest: str(approval.artifact_digest),
    policyVersion: str(approval.policy_version ?? data.policy_version) ?? "unversioned",
    planAuthor: str(approval.plan_author ?? data.plan_author) ?? "unknown",
    actor: str(data.actor) ?? "unknown",
    quorumMet: int(approval.quorum_met) ?? 0,
    quorumRequired: int(approval.quorum_required) ?? 0,
    sla: readSla(approval.sla),
    readiness: (Array.isArray(data.readiness) ? data.readiness : [])
      .map(readReadinessGroup)
      .filter((g): g is ReadinessGroup => g !== null),
    capital,
    grantName: str(data.grant_name),
    locks,
    eligibility: readEligibility(data.eligibility),
    expectedVersion: int(approval.approval_version ?? data.approval_version),
    gaps,
  };
}

/** One evidence finding, with the source it can be checked against. */
export function readExitFinding(raw: unknown): ExitFinding | null {
  const o = obj(raw);
  if (!o) return null;
  const label = str(o.label);
  const outcome = readEnum(o.outcome, MARKS);
  if (!label || !outcome) return null;
  const base = {
    label,
    carriesTo: str(o.carries_to),
    // §5's "Must work": every evidence number links its source. A number with
    // nowhere to check it is an assertion, and this screen decides promotions.
    href: str(o.href),
    sourceLabel: str(o.source_label),
  };
  return outcome.known
    ? { ...base, outcome: outcome.value }
    : { ...base, label: `${label} — server reported "${outcome.raw}"`, outcome: "insufficient" };
}

export function readEvidencePanel(raw: unknown): EvidencePanelSpec | null {
  const o = obj(raw);
  if (!o) return null;
  const title = str(o.title);
  if (!title) return null;
  return {
    title,
    source: str(o.source),
    findings: (Array.isArray(o.findings) ? o.findings : [])
      .map(readExitFinding)
      .filter((f): f is ExitFinding => f !== null),
    status: str(o.status) === "unavailable" ? "unavailable" : undefined,
    reason: str(o.reason) ?? undefined,
  };
}

export interface LineageRef {
  label: string;
  value: string;
  href: string | null;
}

export interface PaperExitDetail {
  reviewId: ApprovalId;
  deploymentId: string;
  subject: string;
  promoteTo: string;
  /** Server-evaluated. Never derived from the coverage numbers beside it. */
  gateMet: boolean;
  gateSummary: string | null;
  policyId: string | null;
  quorumMet: number;
  quorumRequired: number;
  approverRole: string | null;
  sla: Sla | null;
  /** artifact · R1 · R2 · observation policy · evidence pack digest (§5). */
  lineage: readonly LineageRef[];
  panels: readonly EvidencePanelSpec[];
  recommendation: string | null;
  /**
   * Optimistic-concurrency version, as the published row carries it.
   *
   * A **number**, not a string, and named `approval_version` — the first
   * version of this reader looked for `expected_version` as a string and found
   * neither, so every plan was made with no version at all.
   */
  expectedVersion: number | null;
  eligibility: Eligibility;
  gaps: readonly string[];
}

export function readPaperExitDetail(raw: unknown): PaperExitDetail | null {
  const o = obj(raw);
  if (!o) return null;
  const data = obj(o.data) ?? o;
  const review = obj(data.review) ?? data;
  const reviewId = readId(review.review_id ?? data.review_id) as ApprovalId | null;
  if (!reviewId) return null;

  const gaps: string[] = [];
  const lineage = (Array.isArray(data.lineage) ? data.lineage : []).flatMap((e) => {
    const eo = obj(e);
    const label = eo && str(eo.label);
    const value = eo && str(eo.value);
    return label && value ? [{ label, value, href: str(eo!.href) }] : [];
  });

  const panels = (Array.isArray(data.panels) ? data.panels : [])
    .map(readEvidencePanel)
    .filter((p): p is EvidencePanelSpec => p !== null);

  const unlinked = panels.flatMap((p) => p.findings).filter((f) => !f.href).length;
  if (unlinked > 0) gaps.push(`${unlinked} evidence findings carry no source link`);

  // Never inferred from coverage: the policy can require more than the numbers
  // beside it show. Absent means not met, which is the safe direction.
  const gateMet = data.gate_met === true;
  if (typeof data.gate_met !== "boolean") gaps.push("gate_met was not published; treated as unmet");

  return {
    reviewId,
    eligibility: readEligibility(data.eligibility),
    deploymentId: readId(review.deployment_id) ?? "unknown",
    subject: str(review.subject_label) ?? reviewId,
    promoteTo: str(review.promote_to) ?? "the next stage",
    gateMet,
    gateSummary: str(data.gate_summary),
    policyId: str(data.policy_id),
    quorumMet: int(review.quorum_met) ?? 0,
    quorumRequired: int(review.quorum_required) ?? 0,
    approverRole: str(data.approver_role),
    sla: readSla(review.sla),
    lineage,
    panels,
    recommendation: str(data.recommendation),
    expectedVersion: int(review.approval_version ?? review.expected_version),
    gaps,
  };
}

/**
 * Turn an engine capital preview into the rows Gate R2 renders (EX-BE-07a §2.2).
 *
 * A rename and nothing else. Every figure is passed through as the string the
 * engine produced — there is no place in this function where a number could be
 * made, which is the property that matters more than the shape.
 *
 * Lines whose `before` or `after` is absent are dropped rather than rendered
 * blank: a capital row with one side missing reads as a change from nothing,
 * and on this panel that is the most expensive misreading available.
 */
export function capitalDeltasFromPreview(preview: CapitalPreview): CapitalDelta[] {
  return preview.lines.flatMap((line) =>
    line.before !== null && line.after !== null
      ? [
          {
            label: line.label,
            before: line.before,
            after: line.after,
            currency: line.currency ?? preview.currency,
            note: line.note,
            // No per-line breach flag is set here. The published contract does
            // not carry one: the engine states a breach through
            // `decision_eligible` and a blocker sentence, and a client that
            // inferred one from a negative headroom would be deciding what a
            // breach is. Gate R2 locks on the engine's verdict instead.
          },
        ]
      : [],
  );
}
