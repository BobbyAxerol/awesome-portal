/**
 * V2 inbox row reader (S1b, Approvals cockpit).
 *
 * `readApprovalRow` (api/rows.ts) is the V1 reader: it drops `creator` and
 * `requester`, which the canonical inbox contract fixture carries, and it turns
 * an absent count into a sentinel number. The cockpit needs both facts to say
 * who created a request, so it reads the row again here, over `unknown`, and
 * keeps what the source published:
 *
 * - every reader takes `unknown`, never throws, and answers a typed value or
 *   `null`; `null` means the payload is malformed, not "the source said no";
 * - an absent number is `null`, never `0` and never `-1`;
 * - `needsYou` is `true`, `false` or `null`: a source that did not say is not a
 *   source that said "not you".
 *
 * The port still returns V1 rows (`InboxResult.page.rows`). Until it also hands
 * over the raw wire rows (optional `rawRows`, see `mergeInboxRows`), the
 * cockpit builds its rows from the V1 row with creator and requester absent.
 */
import type { ApprovalGate, ApprovalRow, InertReason } from "../../../screens/ApprovalInbox";

const GATES: readonly ApprovalGate[] = ["R1", "R2", "PAPER_EXIT", "SANDBOX_EXIT", "LIVE_GATE"];
const INERT: readonly InertReason[] = ["SELF", "QUORUM", "BLOCKED"];

/** V1's placeholder for a target the server did not publish; it is not a target. */
const V1_TARGET_PLACEHOLDER = "target not published";

export interface InboxActor {
  /** `usr_*`: the only thing an equality check may be based on. */
  userId: string | null;
  username: string | null;
}

export interface InboxSlaV2 {
  /** The server's verdict (`ON_TRACK`, `DUE_SOON`, `OVERDUE`, `EXPIRED`); other words are kept as sent. */
  state: string | null;
  ageMinutes: number;
  budgetMinutes: number;
  dueAt: string | null;
  expiresAt: string | null;
}

export interface InboxRowV2 {
  id: string;
  gate: ApprovalGate;
  subject: string;
  subjectId: string | null;
  target: string | null;
  environment: string | null;
  releaseCandidate: string | null;
  requester: InboxActor | null;
  creator: InboxActor | null;
  /** `PENDING` and so on, as published; `null` when the row carries none. */
  status: string | null;
  policyVersion: string | null;
  blockerCount: number | null;
  blockerSummary: string | null;
  sla: InboxSlaV2 | null;
  quorumMet: number | null;
  quorumRequired: number | null;
  inert: InertReason | null;
  needsYou: boolean | null;
  updatedAt: string | null;
}

function record(raw: unknown): Record<string, unknown> | null {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function text(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/** The published Identifier pattern (`^[A-Za-z0-9._:-]{1,191}$`): an id reaches URLs and React keys. */
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,191}$/;
function identifier(raw: unknown): string | null {
  return typeof raw === "string" && IDENTIFIER.test(raw) ? raw : null;
}

/** A count is a non-negative safe integer; a figure past 2^53 has no exact value to print. */
function whole(raw: unknown): number | null {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
}

/** A person, published as `{user_id, username}` or as a bare name. Anything else is no actor. */
export function readInboxActor(raw: unknown): InboxActor | null {
  if (typeof raw === "string") return raw.length > 0 ? { userId: null, username: raw } : null;
  const o = record(raw);
  if (o === null) return null;
  const userId = text(o.user_id);
  // A user id outside the Identifier pattern is no id: the actor is then unknown, never half-known.
  if (o.user_id !== undefined && o.user_id !== null && identifier(o.user_id) === null) return null;
  const username = text(o.username);
  return userId === null && username === null ? null : { userId, username };
}

export function readInboxSla(raw: unknown): InboxSlaV2 | null {
  const o = record(raw);
  if (o === null) return null;
  const ageMinutes = whole(o.age_minutes);
  const budgetMinutes = whole(o.budget_minutes);
  // An age is read, never derived from a due time on a clock nobody controls.
  if (ageMinutes === null || budgetMinutes === null) return null;
  return {
    state: text(o.state) ?? text(o.sla_state),
    ageMinutes,
    budgetMinutes,
    dueAt: text(o.due_at),
    expiresAt: text(o.expires_at),
  };
}

/** One row of `governance.approval-inbox.v1` `page.rows[]`. `null` when it cannot be placed (no id, unknown gate). */
export function readInboxRowV2(raw: unknown): InboxRowV2 | null {
  const o = record(raw);
  if (o === null) return null;
  // A present id that breaks the pattern is not replaced by the other spelling.
  const id = o.id !== undefined ? identifier(o.id) : identifier(o.approval_id);
  const subjectId = o.subject_id === undefined || o.subject_id === null ? null : identifier(o.subject_id);
  if (o.subject_id !== undefined && o.subject_id !== null && subjectId === null) return null;
  const gate = typeof o.gate === "string" ? GATES.find((candidate) => candidate === o.gate) : undefined;
  if (id === null || gate === undefined) return null;
  const inert = typeof o.inert === "string" ? INERT.find((candidate) => candidate === o.inert) : undefined;
  return {
    id,
    gate,
    subject: text(o.subject) ?? id,
    subjectId,
    target: text(o.target),
    environment: text(o.environment),
    releaseCandidate: text(o.release_candidate),
    requester: readInboxActor(o.requester),
    creator: readInboxActor(o.creator),
    status: text(o.status),
    policyVersion: text(o.policy_version),
    blockerCount: whole(o.blocker_count),
    blockerSummary: text(o.blocker_summary),
    sla: readInboxSla(o.sla),
    quorumMet: whole(o.quorum_met),
    quorumRequired: whole(o.quorum_required),
    inert: inert ?? null,
    needsYou: typeof o.needs_you === "boolean" ? o.needs_you : null,
    updatedAt: text(o.updated_at),
  };
}

export interface InboxPageV2 {
  rows: readonly InboxRowV2[];
  /** Rows that arrived and could not be read, or repeated an id already in the page; the footer says so rather than hiding them. */
  dropped: number;
  totalCount: number | null;
  filteredCount: number | null;
  hasMore: boolean | null;
  nextCursor: string | null;
}

/** The whole envelope (`page.rows[]` or a bare `rows[]`). `null` when there is no row array at all. */
export function readInboxPageV2(raw: unknown): InboxPageV2 | null {
  const root = record(raw);
  if (root === null) return null;
  const page = record(root.page) ?? root;
  if (!Array.isArray(page.rows)) return null;
  const rows: InboxRowV2[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const entry of page.rows) {
    const row = readInboxRowV2(entry);
    // A repeat of an id already in the page is set aside and counted: the queue keys rows by id.
    if (row === null || seen.has(row.id)) dropped += 1;
    else {
      seen.add(row.id);
      rows.push(row);
    }
  }
  return {
    rows,
    dropped,
    totalCount: whole(page.total_count),
    filteredCount: whole(page.filtered_count),
    hasMore: typeof page.has_more === "boolean" ? page.has_more : null,
    nextCursor: text(page.next_cursor),
  };
}

/** The V1 row, widened. Creator, requester and status were dropped by V1, so they are absent here, not guessed. */
export function inboxRowFromV1(row: ApprovalRow): InboxRowV2 {
  const known = row.sla.ageMinutes >= 0 && row.sla.budgetMinutes > 0;
  return {
    id: row.id,
    gate: row.gate,
    subject: row.subject,
    subjectId: null,
    target: row.target === V1_TARGET_PLACEHOLDER ? null : row.target,
    environment: null,
    releaseCandidate: null,
    requester: null,
    creator: null,
    status: null,
    policyVersion: null,
    blockerCount: row.blockerCount >= 0 ? row.blockerCount : null,
    blockerSummary: row.blockerSummary,
    sla: known
      ? { state: row.sla.state ?? null, ageMinutes: row.sla.ageMinutes, budgetMinutes: row.sla.budgetMinutes, dueAt: null, expiresAt: null }
      : null,
    quorumMet: row.quorumMet,
    quorumRequired: row.quorumRequired,
    inert: row.inert,
    needsYou: row.needsYou,
    updatedAt: null,
  };
}

/** Wire rows the port may carry beside the V1 ones. Anything that is not an array is no rows. */
export function readRawRows(result: unknown): readonly unknown[] | null {
  const o = record(result);
  return o !== null && Array.isArray(o.rawRows) ? o.rawRows : null;
}

/**
 * V1 rows in server order, each upgraded with the wire row of the same id when
 * the port supplied one and the V2 reader can read it. A wire row that cannot
 * be read leaves the V1 row as it was; a wire row with no V1 twin is not added
 * (the V1 reader's drop of an unknown gate stands, and `dropped` counts it).
 */
export function mergeInboxRows(v1Rows: readonly ApprovalRow[], rawRows: readonly unknown[] | null): InboxRowV2[] {
  const wire = new Map<string, InboxRowV2>();
  for (const entry of rawRows ?? []) {
    const row = readInboxRowV2(entry);
    if (row !== null) wire.set(row.id, row);
  }
  return v1Rows.map((row) => wire.get(row.id) ?? inboxRowFromV1(row));
}
