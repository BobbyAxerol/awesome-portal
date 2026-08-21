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

const GATES: readonly ApprovalGate[] = ["R1", "R2", "PAPER_EXIT", "SANDBOX_EXIT", "LIVE_GATE"];
const INERT: readonly InertReason[] = ["SELF", "QUORUM", "BLOCKED"];
const MARKS: readonly EvidenceMark[] = ["pass", "watch", "fail", "insufficient"];

function obj(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
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
  actor: string;
  sla: Sla | null;
  passport: readonly PassportEntry[];
  checklist: readonly ChecklistItem[];
  locks: readonly DecisionLock[];
  /** The server's verdict on the three controls. Never derived here. */
  eligibility: Eligibility;
  decided: { outcome: "APPROVED" | "DENIED" | "APPROVED_WITH_CONDITION"; by: string; at: string } | null;
  /** Optimistic-concurrency token. Apply must echo it (master plan §10.2). */
  expectedVersion: string | null;
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
    creator: str(approval.creator ?? data.creator) ?? "unknown",
    actor: str(data.actor) ?? "unknown",
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
    expectedVersion: str(approval.expected_version ?? data.expected_version),
    gaps,
  };
}

/** Re-exported so callers do not reach past this module into the adapter. */
export { readDecimal, type MaybeKnown };
