/**
 * Strict reader of `portal.execution.approval-evidence.v1` (WP-K slice 2; operationId `executionApprovalEvidenceGetV1`):
 * the evidence beside one approval request.
 *
 * Four sections, each with the SAME three-way meaning (never a zero, never a guess):
 *   key omitted -> `NO_SOURCE` (the request kind has no owning source: nothing is owed);
 *   `null`      -> `NOT_READ`  (the source exists and the Portal did not read it);
 *   object      -> `PUBLISHED`.
 * A count of 0 is a published true zero. The contract is closed: an unknown key voids the read. Named rules stricter than the JSON Schema
 * (a producer arithmetic JSON Schema cannot state): EV-1 history points strictly ascending and inside the stated window, EV-2 a drawdown is
 * zero or negative, EV-3 a before/after pair is not identical.
 * Never throws: a malformed body is `null`; another schema is `unsupported_shape`.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import { clockMs, exactValue, hasOnly, managerText, oneOf, record } from "./managerMetric";

export const APPROVAL_EVIDENCE_SCHEMA = "portal.execution.approval-evidence.v1";
export const EVIDENCE_HISTORY_METRICS = ["NAV", "NET_PNL", "RETURN", "DRAWDOWN"] as const;
const SUBJECT_TYPES = ["ALPHA", "PORTFOLIO", "ACCOUNT", "DEPLOYMENT"] as const;
const CHANGE_UNITS = ["MONEY", "RATIO", "COUNT", "TEXT", "TIMESTAMP_MS"] as const;
const SCALES = ["FRACTION", "PERCENT"] as const;
const ID = /^[A-Za-z0-9._:-]{1,191}$/;
const MAX_POINTS = 2000;
const MAX_CHANGES = 64;
const OBLIGATION_KEYS = ["open_positions", "working_orders", "reservations", "unknown_outcomes", "settlement_pending"] as const;

export type EvidenceSection<T> = { state: "NO_SOURCE" } | { state: "NOT_READ" } | { state: "PUBLISHED"; value: T };
export interface EvidenceHistory {
  subject: { subjectType: (typeof SUBJECT_TYPES)[number]; subjectId: string };
  metric: (typeof EVIDENCE_HISTORY_METRICS)[number];
  unit: "MONEY" | "RATIO";
  currency: string | null;
  ratioScale: (typeof SCALES)[number] | null;
  window: { fromMs: UtcEpochMs; toMs: UtcEpochMs };
  methodologyRef: string;
  asOfMs: UtcEpochMs;
  /** The source's exact decimal strings, ascending. */
  points: readonly { tsMs: UtcEpochMs; exact: string }[];
}
export interface EvidenceChange { label: string; before: string | null; after: string | null; unit: (typeof CHANGE_UNITS)[number] }
export interface EvidenceDiff { previousRevision: string; changes: readonly EvidenceChange[] }
/** Non-negative integers; 0 is a published zero. */
export interface EvidenceObligations { openPositions: number; workingOrders: number; reservations: number; unknownOutcomes: number; settlementPending: number }
export interface EvidenceReceiptPreview { whatChanges: string; countsAs: { metAfter: number; required: number } }
export interface ApprovalEvidence {
  workspaceId: string;
  approvalId: string;
  /** The Portal's own evaluation time of this answer. */
  readAtMs: UtcEpochMs;
  history: EvidenceSection<EvidenceHistory>;
  diff: EvidenceSection<EvidenceDiff>;
  obligations: EvidenceSection<EvidenceObligations>;
  receipt: EvidenceSection<EvidenceReceiptPreview>;
}
export type ApprovalEvidenceRead = { kind: "approval_evidence"; evidence: ApprovalEvidence } | { kind: "unsupported_shape"; schemaVersion: string | null };

const count = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null);

function readHistory(raw: unknown): EvidenceHistory | null {
  const h = record(raw);
  if (h === null || !hasOnly(h, ["subject", "metric", "unit", "currency", "ratio_scale", "window", "methodology_ref", "points", "as_of_ms"])) return null;
  const subject = record(h.subject);
  const window = record(h.window);
  if (subject === null || window === null || !hasOnly(subject, ["subject_type", "subject_id"]) || !hasOnly(window, ["from_ms", "to_ms"])) return null;
  const subjectType = oneOf(subject.subject_type, SUBJECT_TYPES);
  const subjectId = typeof subject.subject_id === "string" && ID.test(subject.subject_id) ? subject.subject_id : null;
  const metric = oneOf(h.metric, EVIDENCE_HISTORY_METRICS);
  const unit = oneOf(h.unit, ["MONEY", "RATIO"] as const);
  const fromMs = clockMs(window.from_ms);
  const toMs = clockMs(window.to_ms);
  const asOfMs = clockMs(h.as_of_ms);
  const methodologyRef = managerText(h.methodology_ref);
  const currency = h.currency === null ? null : managerText(h.currency);
  const ratioScale = h.ratio_scale === null ? null : oneOf(h.ratio_scale, SCALES);
  if (subjectType === null || subjectId === null || metric === null || unit === null || fromMs === null || toMs === null || asOfMs === null || methodologyRef === null) return null;
  if ((h.currency !== null && currency === null) || (h.ratio_scale !== null && ratioScale === null) || fromMs >= toMs) return null;
  const ratio = metric === "RETURN" || metric === "DRAWDOWN";
  if (ratio ? unit !== "RATIO" || currency !== null || ratioScale === null : unit !== "MONEY" || currency === null || ratioScale !== null) return null;
  if (!Array.isArray(h.points) || h.points.length > MAX_POINTS) return null;
  const points: { tsMs: UtcEpochMs; exact: string }[] = [];
  let previous = -1;
  for (const item of h.points) {
    const point = record(item);
    if (point === null || !hasOnly(point, ["ts_ms", "value"])) return null;
    const tsMs = clockMs(point.ts_ms);
    const value = exactValue(point.value);
    if (tsMs === null || value === null || tsMs <= previous || tsMs < fromMs || tsMs > toMs) return null; // EV-1
    if (metric === "DRAWDOWN" && !value.zero && !value.exact.startsWith("-")) return null; // EV-2
    previous = tsMs;
    points.push({ tsMs, exact: value.exact });
  }
  return { subject: { subjectType, subjectId }, metric, unit, currency, ratioScale, window: { fromMs, toMs }, methodologyRef, asOfMs, points };
}

function readDiff(raw: unknown): EvidenceDiff | null {
  const d = record(raw);
  if (d === null || !hasOnly(d, ["previous_revision", "changes"]) || !Array.isArray(d.changes) || d.changes.length > MAX_CHANGES) return null;
  const previousRevision = managerText(d.previous_revision);
  if (previousRevision === null) return null;
  const changes: EvidenceChange[] = [];
  for (const item of d.changes) {
    const c = record(item);
    if (c === null || !hasOnly(c, ["label", "before", "after", "unit"])) return null;
    const label = managerText(c.label);
    const before = c.before === null ? null : managerText(c.before);
    const after = c.after === null ? null : managerText(c.after);
    const unit = oneOf(c.unit, CHANGE_UNITS);
    if (label === null || unit === null || (c.before !== null && before === null) || (c.after !== null && after === null)) return null;
    if (before === after) return null; // EV-3: a change that changes nothing is not a diff row
    changes.push({ label, before, after, unit });
  }
  return { previousRevision, changes };
}

function readObligations(raw: unknown): EvidenceObligations | null {
  const o = record(raw);
  if (o === null || !hasOnly(o, OBLIGATION_KEYS) || OBLIGATION_KEYS.some((key) => !(key in o))) return null;
  const [openPositions, workingOrders, reservations, unknownOutcomes, settlementPending] = OBLIGATION_KEYS.map((key) => count(o[key]));
  if ([openPositions, workingOrders, reservations, unknownOutcomes, settlementPending].some((n) => n === null)) return null;
  return { openPositions: openPositions!, workingOrders: workingOrders!, reservations: reservations!, unknownOutcomes: unknownOutcomes!, settlementPending: settlementPending! };
}

function readReceipt(raw: unknown): EvidenceReceiptPreview | null {
  const r = record(raw);
  if (r === null || !hasOnly(r, ["what_changes", "counts_as"])) return null;
  const counts = record(r.counts_as);
  const whatChanges = managerText(r.what_changes);
  if (counts === null || whatChanges === null || !hasOnly(counts, ["met_after", "required"])) return null;
  const metAfter = count(counts.met_after);
  const required = count(counts.required);
  return metAfter === null || required === null ? null : { whatChanges, countsAs: { metAfter, required } };
}

/** key omitted -> NO_SOURCE; null -> NOT_READ; else the section reader (a refusal voids the whole read). */
function section<T>(body: Record<string, unknown>, key: string, read: (raw: unknown) => T | null): EvidenceSection<T> | null {
  if (!(key in body)) return { state: "NO_SOURCE" };
  if (body[key] === null) return { state: "NOT_READ" };
  const value = read(body[key]);
  return value === null ? null : { state: "PUBLISHED", value };
}

export function readApprovalEvidenceV1(raw: unknown): ApprovalEvidenceRead | null {
  try {
    const root = record(raw);
    if (root === null) return null;
    const version = typeof root.schema_version === "string" ? root.schema_version : null;
    if (version !== APPROVAL_EVIDENCE_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
    if (!hasOnly(root, ["schema_version", "workspace_id", "approval_id", "record_authority", "read_at_ms", "prior_economic_history", "evidence_diff", "obligations_after_approval", "receipt_preview"])) return null;
    const workspaceId = managerText(root.workspace_id);
    const approvalId = typeof root.approval_id === "string" && ID.test(root.approval_id) ? root.approval_id : null;
    const readAtMs = clockMs(root.read_at_ms);
    if (workspaceId === null || approvalId === null || readAtMs === null || root.record_authority !== "PORTAL_PROJECTION") return null;
    const history = section(root, "prior_economic_history", readHistory);
    const diff = section(root, "evidence_diff", readDiff);
    const obligations = section(root, "obligations_after_approval", readObligations);
    const receipt = section(root, "receipt_preview", readReceipt);
    if (history === null || diff === null || obligations === null || receipt === null) return null;
    return { kind: "approval_evidence", evidence: { workspaceId, approvalId, readAtMs, history, diff, obligations, receipt } };
  } catch {
    return null;
  }
}

/** Whether the body answers the approval asked: another approval's evidence is never shown under this one. */
export const approvalEvidenceAnswers = (evidence: ApprovalEvidence, approvalId: string): boolean => evidence.approvalId === approvalId;

/** The request path (execution base stripped). */
export const approvalEvidencePath = (approvalId: string, workspaceId?: string): string | null =>
  ID.test(approvalId) ? `/governance/approvals/${encodeURIComponent(approvalId)}/evidence${workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ""}` : null;
