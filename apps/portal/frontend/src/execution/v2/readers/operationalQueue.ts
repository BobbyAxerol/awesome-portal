/**
 * V2 operations readers: the Portal's current operational queue and the
 * current incident root (Codex 49bdc6e1, `execution-operations.d.ts`).
 *
 * Both routes can answer either the legacy shape or the V2 one on the same
 * path, so every reader here starts from `schema_version` and answers one of
 * three things:
 *
 * - `ok`: a V2 body that passed every check below;
 * - `unsupported_shape`: a readable body of another shape (the legacy queue,
 *   a later version). It is never fed to a V2 reader and never mis-rendered;
 * - `null`: the body claims V2 and is malformed, or is not an object at all.
 *   One bad row voids the whole page, because a silently dropped row would
 *   make the stated counts a lie.
 *
 * Boundary rules (review2/04, 06):
 * - the queue grain is `operation_id`; there is no actor, assignee, ladder or
 *   SLA, so none is read or invented;
 * - `environment` arrives UPPERCASE and is normalised to the URL spelling for
 *   display and filters only; the wire value is kept beside it;
 * - times are ISO instants with up to nine fractional digits. Seconds and
 *   below are kept in `iso`; `ms` is for ordering and `formatAsOf`;
 * - MITIGATED and RESOLVED are local triage records, never broker safety.
 */
import { readUtcEpochMs, type UtcEpochMs } from "../../screenDataContract";
import { type ExecEnv } from "../urlState";

export const OPERATIONAL_QUEUE_V2_SCHEMA = "portal.execution.operational-queue.v2";
export const INCIDENT_ROOT_V2_SCHEMA = "portal.execution.incident-current-root.v2";

export const SEVERITIES_V2 = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const;
export type SeverityV2 = (typeof SEVERITIES_V2)[number];

export const TARGET_TYPES_V2 = ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const;
export type TargetTypeV2 = (typeof TARGET_TYPES_V2)[number];

export const RISK_TIERS_V2 = [
  "R0_READ",
  "R1_PAPER_MUTATION",
  "R2_SANDBOX",
  "R3_LIVE_PROTECTIVE",
  "R4_LIVE_RISK_INCREASING",
  "UNCLASSIFIED",
  "BLOCKED",
] as const;
export type RiskTierV2 = (typeof RISK_TIERS_V2)[number];

export const SOURCE_AUTHORITIES_V2 = ["PORTAL", "EXECUTION", "BROKER"] as const;
export type SourceAuthorityV2 = (typeof SOURCE_AUTHORITIES_V2)[number];

export const SOURCE_STATUSES_V2 = ["BLOCKED", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "EXPIRED", "UNCERTAIN"] as const;
export type SourceStatusV2 = (typeof SOURCE_STATUSES_V2)[number];

export const VERIFICATION_RESULTS_V2 = [
  "NOT_STARTED",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "PARTIAL",
  "UNCERTAIN",
  "DENIED",
  "EXPIRED",
] as const;
export type VerificationResultV2 = (typeof VERIFICATION_RESULTS_V2)[number];

export const TRIAGE_STATES_V2 = ["UNACKNOWLEDGED", "ACKNOWLEDGED", "RESOLVED"] as const;
export type TriageStateV2 = (typeof TRIAGE_STATES_V2)[number];

export const INCIDENT_STATES_V2 = ["OPEN", "MITIGATED", "RESOLVED"] as const;
export type IncidentStateV2 = (typeof INCIDENT_STATES_V2)[number];

const WIRE_ENVIRONMENTS = ["PAPER", "SANDBOX", "LIVE"] as const;
type WireEnvironment = (typeof WIRE_ENVIRONMENTS)[number];

/** An ISO instant: sortable `ms` for display and ordering, the original text kept for the record. */
export interface InstantV2 {
  iso: string;
  ms: UtcEpochMs;
}

export interface OperationV2 {
  operationId: string;
  commandKey: string;
  targetType: TargetTypeV2;
  targetId: string;
  /** URL spelling (`live`), for display and filters only. */
  environment: ExecEnv;
  /** As the server wrote it (`LIVE`). */
  environmentWire: WireEnvironment;
  riskTier: RiskTierV2;
  severity: SeverityV2;
  sourceAuthority: SourceAuthorityV2;
  sourceStatus: SourceStatusV2;
  verificationResult: VerificationResultV2;
  triageState: TriageStateV2;
  workflowVersion: number;
  acknowledgedAt: InstantV2 | null;
  resolvedAt: InstantV2 | null;
  createdAt: InstantV2;
  updatedAt: InstantV2;
}

export interface QueuePageV2 {
  rows: readonly OperationV2[];
  /** Scoped before filters, page and sort. */
  totalCount: number;
  filteredCount: number;
  nextCursor: string | null;
  prevCursor: string | null;
  hasMore: boolean;
  hasPrevious: boolean;
  appliedFilters: readonly { field: string; value: string }[];
  appliedSort: readonly { field: "created_at" | "operation_id"; direction: "asc" | "desc" }[];
}

export interface OperationalQueueV2 {
  workspaceId: string;
  /** `null` when the source published none; the queue's own value is always null today. */
  sourceAsOfMs: UtcEpochMs | null;
  observedAtMs: UtcEpochMs;
  readTruth: { state: "AVAILABLE" | "EMPTY"; reasonCode: string | null };
  /** UNAVAILABLE today: no source journal is qualified. */
  sourceIntegrationState: "UNAVAILABLE";
  supportedTargetTypes: readonly TargetTypeV2[];
  page: QueuePageV2;
}

export interface IncidentRootV2 {
  incidentId: string;
  workspaceId: string;
  targetType: TargetTypeV2;
  targetId: string;
  environment: ExecEnv;
  environmentWire: WireEnvironment;
  severity: SeverityV2;
  workflowState: IncidentStateV2;
  workflowVersion: number;
  acknowledgedAt: InstantV2 | null;
  mitigatedAt: InstantV2 | null;
  resolvedAt: InstantV2 | null;
  createdAt: InstantV2;
  updatedAt: InstantV2;
  observedAtMs: UtcEpochMs;
  sourceIntegrationState: "UNAVAILABLE";
  /** Evidence, operations, gates, timeline and assignee are not published; this is the stated reason. */
  historicalChildren: { availability: "NOT_PUBLISHED"; reasonCode: string };
}

/** What a port method hands back for a body that was readable but not V2. */
export interface UnsupportedShapeV2 {
  kind: "unsupported_shape";
  /** The `schema_version` the body carried, or null when it carried none. */
  schemaVersion: string | null;
}

export type OperationalQueueReadV2 = { kind: "queue"; queue: OperationalQueueV2 } | UnsupportedShapeV2;
export type IncidentRootReadV2 = { kind: "incident"; incident: IncidentRootV2 } | UnsupportedShapeV2;

/** Query the V2 queue accepts. Environment is the URL spelling; the adapter writes the wire one. */
export interface OperationalQueueQueryV2 {
  workspaceId?: string;
  after?: string;
  before?: string;
  limit?: number;
  triageState?: TriageStateV2;
  environment?: ExecEnv;
  sourceStatus?: SourceStatusV2;
  verificationResult?: VerificationResultV2;
  severity?: SeverityV2;
  targetType?: TargetTypeV2;
  commandKey?: string;
  targetId?: string;
  sort?: "created_at:asc" | "created_at:desc";
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 512 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00)$/;

/** Strict ISO instant. The fraction is cut to milliseconds for `ms` only. */
export function readInstant(value: unknown): InstantV2 | null {
  if (typeof value !== "string") return null;
  const m = ISO.exec(value);
  if (m === null) return null;
  const millis = (m[7] ?? "").slice(0, 3).padEnd(3, "0");
  const ms = readUtcEpochMs(Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${millis}Z`));
  return ms === null ? null : { iso: value, ms };
}

function nullableInstant(value: unknown): InstantV2 | null | undefined {
  if (value === null) return null;
  const instant = readInstant(value);
  return instant === null ? undefined : instant;
}

function environmentOf(value: unknown): { wire: WireEnvironment; env: ExecEnv } | null {
  const wire = oneOf(value, WIRE_ENVIRONMENTS);
  return wire === null ? null : { wire, env: wire.toLowerCase() as ExecEnv };
}

function targetOf(value: unknown): { type: TargetTypeV2; id: string } | null {
  const target = record(value);
  if (target === null) return null;
  const type = oneOf(target.type, TARGET_TYPES_V2);
  const id = text(target.id);
  return type === null || id === null ? null : { type, id };
}

function readOperation(raw: unknown): OperationV2 | null {
  const row = record(raw);
  if (row === null) return null;
  const operationId = text(row.operation_id);
  const commandKey = text(row.command_key);
  const target = targetOf(row.target);
  const env = environmentOf(row.environment);
  const riskTier = oneOf(row.risk_tier, RISK_TIERS_V2);
  const severity = oneOf(row.severity, SEVERITIES_V2);
  const sourceAuthority = oneOf(row.source_authority, SOURCE_AUTHORITIES_V2);
  const sourceStatus = oneOf(row.source_status, SOURCE_STATUSES_V2);
  const verificationResult = oneOf(row.verification_result, VERIFICATION_RESULTS_V2);
  const triageState = oneOf(row.triage_state, TRIAGE_STATES_V2);
  const workflowVersion = count(row.workflow_version);
  const acknowledgedAt = nullableInstant(row.acknowledged_at);
  const resolvedAt = nullableInstant(row.resolved_at);
  const createdAt = readInstant(row.created_at);
  const updatedAt = readInstant(row.updated_at);
  if (
    operationId === null || commandKey === null || target === null || env === null || riskTier === null
    || severity === null || sourceAuthority === null || sourceStatus === null || verificationResult === null
    || triageState === null || workflowVersion === null || acknowledgedAt === undefined || resolvedAt === undefined
    || createdAt === null || updatedAt === null
  ) return null;
  if (row.operation_kind !== "EXECUTION_COMMAND") return null;
  if (updatedAt.ms < createdAt.ms) return null;
  // Triage shape: a row that says UNACKNOWLEDGED cannot carry a resolution,
  // and RESOLVED must say when.
  if (triageState === "UNACKNOWLEDGED" && (acknowledgedAt !== null || resolvedAt !== null)) return null;
  if (triageState === "ACKNOWLEDGED" && resolvedAt !== null) return null;
  if (triageState === "RESOLVED" && resolvedAt === null) return null;
  return {
    operationId, commandKey, targetType: target.type, targetId: target.id,
    environment: env.env, environmentWire: env.wire,
    riskTier, severity, sourceAuthority, sourceStatus, verificationResult, triageState, workflowVersion,
    acknowledgedAt, resolvedAt, createdAt, updatedAt,
  };
}

function readAppliedFilters(raw: unknown): QueuePageV2["appliedFilters"] | null {
  if (!Array.isArray(raw)) return null;
  const out: { field: string; value: string }[] = [];
  for (const entry of raw) {
    const filter = record(entry);
    const field = text(filter?.field);
    const value = text(filter?.value);
    if (filter === null || field === null || value === null || filter.op !== "eq") return null;
    out.push({ field, value });
  }
  return out;
}

function readAppliedSort(raw: unknown): QueuePageV2["appliedSort"] | null {
  if (!Array.isArray(raw)) return null;
  const out: { field: "created_at" | "operation_id"; direction: "asc" | "desc" }[] = [];
  for (const entry of raw) {
    const sort = record(entry);
    const field = oneOf(sort?.field, ["created_at", "operation_id"] as const);
    const direction = oneOf(sort?.direction, ["asc", "desc"] as const);
    if (field === null || direction === null) return null;
    out.push({ field, direction });
  }
  return out;
}

function readPage(raw: unknown): QueuePageV2 | null {
  const page = record(raw);
  if (page === null || !Array.isArray(page.rows)) return null;
  const rows: OperationV2[] = [];
  for (const entry of page.rows) {
    const row = readOperation(entry);
    if (row === null) return null;
    rows.push(row);
  }
  const totalCount = count(page.total_count);
  const filteredCount = count(page.filtered_count);
  const nextCursor = page.next_cursor === null ? null : text(page.next_cursor);
  const prevCursor = page.prev_cursor === null ? null : text(page.prev_cursor);
  const appliedFilters = readAppliedFilters(page.applied_filters);
  const appliedSort = readAppliedSort(page.applied_sort);
  if (
    totalCount === null || filteredCount === null || appliedFilters === null || appliedSort === null
    || (page.next_cursor !== null && nextCursor === null) || (page.prev_cursor !== null && prevCursor === null)
    || typeof page.has_more !== "boolean" || typeof page.has_previous !== "boolean"
  ) return null;
  // The server's own invariants: total >= filtered >= page rows, and a
  // continuation flag exists exactly when its cursor does.
  if (totalCount < filteredCount || filteredCount < rows.length) return null;
  if (page.has_more !== (nextCursor !== null) || page.has_previous !== (prevCursor !== null)) return null;
  return {
    rows, totalCount, filteredCount, nextCursor, prevCursor,
    hasMore: page.has_more, hasPrevious: page.has_previous, appliedFilters, appliedSort,
  };
}

function schemaOf(raw: unknown): string | null {
  const version = record(raw)?.schema_version;
  return typeof version === "string" ? version : null;
}

/**
 * Queue body -> typed read.
 *
 * `null` is "malformed"; a legacy or newer shape is `unsupported_shape`
 * and never reaches the V2 reader.
 */
export function readOperationalQueueV2(raw: unknown): OperationalQueueReadV2 | null {
  const root = record(raw);
  if (root === null) return null;
  const version = schemaOf(root);
  if (version !== OPERATIONAL_QUEUE_V2_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };

  const workspaceId = text(root.workspace_id);
  const observedAtMs = readUtcEpochMs(root.observed_at_ms);
  const sourceAsOfMs = root.source_as_of_ms === null ? null : readUtcEpochMs(root.source_as_of_ms);
  const truth = record(root.read_truth);
  const truthState = oneOf(truth?.state, ["AVAILABLE", "EMPTY"] as const);
  const reasonCode = truth?.reason_code === null ? null : text(truth?.reason_code);
  const supported = Array.isArray(root.supported_target_types)
    ? root.supported_target_types.map((t) => oneOf(t, TARGET_TYPES_V2))
    : null;
  const page = readPage(root.page);
  if (
    workspaceId === null || observedAtMs === null || (root.source_as_of_ms !== null && sourceAsOfMs === null)
    || truth === null || truthState === null || (truth.reason_code !== null && reasonCode === null)
    || truth.scope !== "REQUEST" || supported === null || supported.some((t) => t === null) || page === null
    || root.record_authority !== "PORTAL" || root.source_integration_state !== "UNAVAILABLE"
    // Absent or malformed must read as "a request may have been made".
    || root.source_side_effect_requested !== false
  ) return null;
  // EMPTY means no rows were returned for the request; rows with an EMPTY
  // truth are a contradiction, not a page.
  if (truthState === "EMPTY" && page.rows.length > 0) return null;
  return {
    kind: "queue",
    queue: {
      workspaceId, sourceAsOfMs, observedAtMs,
      readTruth: { state: truthState, reasonCode },
      sourceIntegrationState: "UNAVAILABLE",
      supportedTargetTypes: supported as TargetTypeV2[],
      page,
    },
  };
}

/** Incident root body -> typed read. Same three outcomes as the queue. */
export function readIncidentRootV2(raw: unknown): IncidentRootReadV2 | null {
  const root = record(raw);
  if (root === null) return null;
  const version = schemaOf(root);
  if (version !== INCIDENT_ROOT_V2_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };

  const incidentId = text(root.incident_id);
  const workspaceId = text(root.workspace_id);
  const target = targetOf(root.target);
  const env = environmentOf(root.environment);
  const severity = oneOf(root.severity, SEVERITIES_V2);
  const workflowState = oneOf(root.workflow_state, INCIDENT_STATES_V2);
  const workflowVersion = count(root.workflow_version);
  const acknowledgedAt = nullableInstant(root.acknowledged_at);
  const mitigatedAt = nullableInstant(root.mitigated_at);
  const resolvedAt = nullableInstant(root.resolved_at);
  const createdAt = readInstant(root.created_at);
  const updatedAt = readInstant(root.updated_at);
  const observedAtMs = readUtcEpochMs(root.observed_at_ms);
  const children = record(root.historical_children);
  const reasonCode = text(children?.reason_code);
  if (
    incidentId === null || workspaceId === null || target === null || env === null || severity === null
    || workflowState === null || workflowVersion === null || acknowledgedAt === undefined
    || mitigatedAt === undefined || resolvedAt === undefined || createdAt === null || updatedAt === null
    || observedAtMs === null || children === null || children.availability !== "NOT_PUBLISHED" || reasonCode === null
    || root.record_authority !== "PORTAL" || root.record_basis !== "CURRENT_ROOT_NOT_HISTORICAL_LINEAGE"
    || root.source_integration_state !== "UNAVAILABLE"
    || root.source_side_effect_requested !== false || root.deployment_resume_requested !== false
  ) return null;
  if (updatedAt.ms < createdAt.ms) return null;
  // Lifecycle shape: the state and the timestamps that prove it agree.
  if (workflowState === "OPEN" && (mitigatedAt !== null || resolvedAt !== null)) return null;
  if (workflowState === "MITIGATED" && (mitigatedAt === null || resolvedAt !== null)) return null;
  if (workflowState === "RESOLVED" && resolvedAt === null) return null;
  return {
    kind: "incident",
    incident: {
      incidentId, workspaceId, targetType: target.type, targetId: target.id,
      environment: env.env, environmentWire: env.wire, severity, workflowState, workflowVersion,
      acknowledgedAt, mitigatedAt, resolvedAt, createdAt, updatedAt, observedAtMs,
      sourceIntegrationState: "UNAVAILABLE",
      historicalChildren: { availability: "NOT_PUBLISHED", reasonCode },
    },
  };
}

/** The query string for `GET /operations`. Environment is written UPPERCASE; empty values are dropped. */
export function operationalQueueSearch(query: OperationalQueueQueryV2): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of [
    ["workspace_id", query.workspaceId],
    ["after", query.after],
    ["before", query.before],
    ["triage_state", query.triageState],
    ["environment", query.environment?.toUpperCase()],
    ["source_status", query.sourceStatus],
    ["verification_result", query.verificationResult],
    ["severity", query.severity],
    ["target_type", query.targetType],
    ["command_key", query.commandKey?.trim()],
    ["target_id", query.targetId?.trim()],
    ["sort", query.sort],
  ] as const) {
    if (value) params.set(key, value);
  }
  if (query.limit) params.set("limit", String(query.limit));
  return params;
}
