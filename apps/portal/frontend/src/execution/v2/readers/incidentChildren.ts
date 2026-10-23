/**
 * Strict readers of the two Operations siblings of WP-K slice 3.
 *
 * `portal.execution.incident-children.v1` (operationId `executionIncidentChildrenGetV1`): the children of one scoped incident the V2 root does not carry:
 * evidence per source, assignee, the resolution gate with its blocker codes, the timeline with versions, and the original target of every linked
 * operation. Sections follow the slice-2 rule (omitted = no owning source, `null` = not read, object = published); an empty list is a published zero.
 * Named rules stricter than the schema: IC-1 an eligible gate lists no blocker, IC-2 timeline versions never go backwards, IC-3 ids are unique.
 *
 * `portal.execution.operations-audit.v1` (operationId `executionOperationsAuditGetV1`): the audit feed, newest first, keyset paged. AU-1 rows are in
 * non-increasing time, AU-2 ids unique, the cursor exists exactly when another page does.
 * Neither reader throws: a malformed body is `null`; another schema is `unsupported_shape`.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import { clockMs, hasOnly, managerText, oneOf, record } from "./managerMetric";
import type { EvidenceSection } from "./approvalEvidence";

export const INCIDENT_CHILDREN_SCHEMA = "portal.execution.incident-children.v1";
export const OPERATIONS_AUDIT_SCHEMA = "portal.execution.operations-audit.v1";
export const INCIDENT_EVIDENCE_SOURCES = ["FINDING", "ALERT", "DEAD_LETTER", "ORDER_TRACE"] as const;
const TARGET_TYPES = ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const;
const AUDIT_SUBJECTS = ["OPERATION", "INCIDENT", "ACCOUNT", "PORTFOLIO", "DEPLOYMENT", "APPROVAL", "CAPITAL_COMMAND", "ACCESS_GRANT"] as const;
const ID = /^[A-Za-z0-9._:-]{1,191}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const CODE = /^[A-Z][A-Z0-9_]{1,63}$/;

export interface ChildEvidence { source: (typeof INCIDENT_EVIDENCE_SOURCES)[number]; digest: string; label: string; addedAtMs: UtcEpochMs }
export interface ChildTimelineEvent { eventId: string; action: string; actor: string | null; versionBefore: number | null; versionAfter: number; atMs: UtcEpochMs }
export interface ChildLinkedOperation { operationId: string; originalTarget: { type: (typeof TARGET_TYPES)[number]; id: string } | null }
export interface IncidentChildren {
  workspaceId: string;
  incidentId: string;
  readAtMs: UtcEpochMs;
  evidence: EvidenceSection<readonly ChildEvidence[]>;
  assignedTo: EvidenceSection<{ actor: string; assignedAtMs: UtcEpochMs }>;
  resolutionGate: EvidenceSection<{ eligible: boolean; blockerCodes: readonly string[] }>;
  timeline: EvidenceSection<readonly ChildTimelineEvent[]>;
  linkedOperations: EvidenceSection<readonly ChildLinkedOperation[]>;
}
export type IncidentChildrenRead = { kind: "incident_children"; children: IncidentChildren } | { kind: "unsupported_shape"; schemaVersion: string | null };

const idOf = (value: unknown): string | null => (typeof value === "string" && ID.test(value) ? value : null);
const version = (value: unknown): number | null => (typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : null);

function readEvidence(raw: unknown): readonly ChildEvidence[] | null {
  if (!Array.isArray(raw) || raw.length > 200) return null;
  const out: ChildEvidence[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const e = record(entry);
    if (e === null || !hasOnly(e, ["source", "digest", "label", "added_at_ms"])) return null;
    const source = oneOf(e.source, INCIDENT_EVIDENCE_SOURCES);
    const label = managerText(e.label);
    const addedAtMs = clockMs(e.added_at_ms);
    if (source === null || typeof e.digest !== "string" || !DIGEST.test(e.digest) || label === null || addedAtMs === null || seen.has(`${source}|${e.digest}`)) return null; // IC-3
    seen.add(`${source}|${e.digest}`);
    out.push({ source, digest: e.digest, label, addedAtMs });
  }
  return out;
}
function readGate(raw: unknown): { eligible: boolean; blockerCodes: readonly string[] } | null {
  const g = record(raw);
  if (g === null || !hasOnly(g, ["eligible", "blocker_codes"]) || typeof g.eligible !== "boolean" || !Array.isArray(g.blocker_codes) || g.blocker_codes.length > 32) return null;
  const codes: string[] = [];
  for (const code of g.blocker_codes) { if (typeof code !== "string" || !CODE.test(code)) return null; codes.push(code); }
  if (g.eligible && codes.length > 0) return null; // IC-1
  return { eligible: g.eligible, blockerCodes: codes };
}
function readTimeline(raw: unknown): readonly ChildTimelineEvent[] | null {
  if (!Array.isArray(raw) || raw.length > 200) return null;
  const out: ChildTimelineEvent[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const entry of raw) {
    const t = record(entry);
    if (t === null || !hasOnly(t, ["event_id", "action", "actor", "version_before", "version_after", "at_ms"])) return null;
    const eventId = idOf(t.event_id);
    const action = managerText(t.action);
    const actor = t.actor === null ? null : managerText(t.actor);
    const versionBefore = t.version_before === null ? null : version(t.version_before);
    const versionAfter = version(t.version_after);
    const atMs = clockMs(t.at_ms);
    if (eventId === null || action === null || (t.actor !== null && actor === null) || (t.version_before !== null && versionBefore === null) || versionAfter === null || atMs === null || seen.has(eventId)) return null;
    if (versionBefore !== null && versionAfter < versionBefore) return null; // IC-2
    if (versionAfter < last) return null; // IC-2
    last = versionAfter;
    seen.add(eventId);
    out.push({ eventId, action, actor, versionBefore, versionAfter, atMs });
  }
  return out;
}
function readLinked(raw: unknown): readonly ChildLinkedOperation[] | null {
  if (!Array.isArray(raw) || raw.length > 100) return null;
  const out: ChildLinkedOperation[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const o = record(entry);
    if (o === null || !hasOnly(o, ["operation_id", "original_target"])) return null;
    const operationId = idOf(o.operation_id);
    let originalTarget: ChildLinkedOperation["originalTarget"] = null;
    if (o.original_target !== null) {
      const t = record(o.original_target);
      const type = t === null || !hasOnly(t, ["type", "id"]) ? null : oneOf(t.type, TARGET_TYPES);
      const id = t === null ? null : idOf(t.id);
      if (type === null || id === null) return null;
      originalTarget = { type, id };
    }
    if (operationId === null || seen.has(operationId)) return null;
    seen.add(operationId);
    out.push({ operationId, originalTarget });
  }
  return out;
}
function readAssignee(raw: unknown): { actor: string; assignedAtMs: UtcEpochMs } | null {
  const a = record(raw);
  if (a === null || !hasOnly(a, ["actor", "assigned_at_ms"])) return null;
  const actor = managerText(a.actor);
  const assignedAtMs = clockMs(a.assigned_at_ms);
  return actor === null || assignedAtMs === null ? null : { actor, assignedAtMs };
}
function section<T>(body: Record<string, unknown>, key: string, read: (raw: unknown) => T | null): EvidenceSection<T> | null {
  if (!(key in body)) return { state: "NO_SOURCE" };
  if (body[key] === null) return { state: "NOT_READ" };
  const value = read(body[key]);
  return value === null ? null : { state: "PUBLISHED", value };
}

export function readIncidentChildrenV1(raw: unknown): IncidentChildrenRead | null {
  try {
    const root = record(raw);
    if (root === null) return null;
    const schemaVersion = typeof root.schema_version === "string" ? root.schema_version : null;
    if (schemaVersion !== INCIDENT_CHILDREN_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
    if (!hasOnly(root, ["schema_version", "workspace_id", "incident_id", "record_authority", "read_at_ms", "evidence", "assigned_to", "resolution_gate", "timeline", "linked_operations"])) return null;
    const workspaceId = managerText(root.workspace_id);
    const incidentId = idOf(root.incident_id);
    const readAtMs = clockMs(root.read_at_ms);
    if (workspaceId === null || incidentId === null || readAtMs === null || root.record_authority !== "PORTAL_PROJECTION") return null;
    const evidence = section(root, "evidence", readEvidence);
    const assignedTo = section(root, "assigned_to", readAssignee);
    const resolutionGate = section(root, "resolution_gate", readGate);
    const timeline = section(root, "timeline", readTimeline);
    const linkedOperations = section(root, "linked_operations", readLinked);
    if (evidence === null || assignedTo === null || resolutionGate === null || timeline === null || linkedOperations === null) return null;
    return { kind: "incident_children", children: { workspaceId, incidentId, readAtMs, evidence, assignedTo, resolutionGate, timeline, linkedOperations } };
  } catch {
    return null;
  }
}
export const incidentChildrenAnswers = (children: IncidentChildren, incidentId: string): boolean => children.incidentId === incidentId;
export const incidentChildrenPath = (incidentId: string, workspaceId?: string): string | null =>
  ID.test(incidentId) ? `/operations/incidents/${encodeURIComponent(incidentId)}/children${workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ""}` : null;

/* ── the audit feed ── */
export interface AuditFeedRow { auditId: string; atMs: UtcEpochMs; actor: string; action: string; subject: { type: (typeof AUDIT_SUBJECTS)[number]; id: string }; receiptRef: string | null;
  /** GAP-18: the policy revision the action was decided under; `undefined` = this producer has no owning source, `null` = the action had none. */
  policyRevision?: string | null }
export interface OperationsAuditPage { workspaceId: string; readAtMs: UtcEpochMs; items: readonly AuditFeedRow[]; hasMore: boolean; nextCursor: string | null }
export type OperationsAuditRead = { kind: "operations_audit"; page: OperationsAuditPage } | { kind: "unsupported_shape"; schemaVersion: string | null };

export function readOperationsAuditV1(raw: unknown): OperationsAuditRead | null {
  try {
    const root = record(raw);
    if (root === null) return null;
    const schemaVersion = typeof root.schema_version === "string" ? root.schema_version : null;
    if (schemaVersion !== OPERATIONS_AUDIT_SCHEMA) return { kind: "unsupported_shape", schemaVersion };
    if (!hasOnly(root, ["schema_version", "workspace_id", "record_authority", "read_at_ms", "items", "has_more", "next_cursor"]) || root.record_authority !== "PORTAL_PROJECTION") return null;
    const workspaceId = managerText(root.workspace_id);
    const readAtMs = clockMs(root.read_at_ms);
    if (workspaceId === null || readAtMs === null || !Array.isArray(root.items) || root.items.length > 250 || typeof root.has_more !== "boolean") return null;
    const nextCursor = root.next_cursor === null ? null : typeof root.next_cursor === "string" && root.next_cursor.length >= 1 && root.next_cursor.length <= 4096 ? root.next_cursor : undefined;
    if (nextCursor === undefined || root.has_more !== (nextCursor !== null)) return null;
    const items: AuditFeedRow[] = [];
    const seen = new Set<string>();
    let previous = Number.POSITIVE_INFINITY;
    for (const entry of root.items) {
      const r = record(entry);
      if (r === null || !hasOnly(r, ["audit_id", "at_ms", "actor", "action", "subject", "receipt_ref", "policy_revision"])) return null;
      const policyRevision = !("policy_revision" in r) ? undefined : r.policy_revision === null ? null : managerText(r.policy_revision);
      if (policyRevision === null && r.policy_revision !== null) return null;
      const subject = record(r.subject);
      const auditId = idOf(r.audit_id);
      const atMs = clockMs(r.at_ms);
      const actor = managerText(r.actor);
      const type = subject === null || !hasOnly(subject, ["type", "id"]) ? null : oneOf(subject.type, AUDIT_SUBJECTS);
      const subjectId = subject === null ? null : idOf(subject.id);
      const receiptRef = r.receipt_ref === null ? null : idOf(r.receipt_ref);
      if (auditId === null || atMs === null || actor === null || typeof r.action !== "string" || !CODE.test(r.action) || type === null || subjectId === null || (r.receipt_ref !== null && receiptRef === null)) return null;
      if (seen.has(auditId) || atMs > previous) return null; // AU-1, AU-2
      seen.add(auditId);
      previous = atMs;
      items.push({ auditId, atMs, actor, action: r.action, subject: { type, id: subjectId }, receiptRef, ...(policyRevision === undefined ? {} : { policyRevision }) });
    }
    return { kind: "operations_audit", page: { workspaceId, readAtMs, items, hasMore: root.has_more, nextCursor } };
  } catch {
    return null;
  }
}
export const operationsAuditPath = (query: { workspaceId?: string; limit?: number; after?: string; incidentId?: string } = {}): string | null => {
  if (query.incidentId !== undefined && !ID.test(query.incidentId)) return null;
  if (query.limit !== undefined && !(Number.isInteger(query.limit) && query.limit >= 1 && query.limit <= 250)) return null;
  const params = new URLSearchParams();
  if (query.workspaceId) params.set("workspace_id", query.workspaceId);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.after) params.set("after", query.after);
  if (query.incidentId) params.set("incident_id", query.incidentId);
  const text = params.toString();
  return `/operations/audit${text === "" ? "" : `?${text}`}`;
};
