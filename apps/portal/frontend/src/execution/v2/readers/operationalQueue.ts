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
 * - MITIGATED and RESOLVED are local triage records, never broker safety;
 * - `incident_links` (FE-042) and `status_counts` (FE-043) are OPTIONAL and
 *   additive. Absent means the server predates them and is exposed as
 *   `undefined` ("Not published"), never as zero links or zero counts. Present
 *   and malformed voids the page like any other bad row. Links are at most 3
 *   per operation and list ONLY incidents the caller may read; a short list
 *   never proves no other incident exists. Counts come from the same server
 *   snapshot, scope and filters as `filtered_count`, each dimension ignoring
 *   its own filter, and are never recomputed from the loaded page. A queue
 *   SUCCEEDED is the Portal queue record's state only: not financial APPLIED,
 *   not projection convergence, not venue success.
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

export const INCIDENT_LINK_RELATIONSHIPS_V2 = ["TRIGGERED_BY", "MITIGATES", "RELATED"] as const;
export type IncidentLinkRelationshipV2 = (typeof INCIDENT_LINK_RELATIONSHIPS_V2)[number];
/** Most links the server returns per operation (FE-042). */
export const INCIDENT_LINK_BOUND_V2 = 3;

/** FE-CAT-2. Per-row axes; each is optional (omitted: no owning source) and nullable (null: the source did not report it). */
export const DELIVERY_STATES_V2 = ["NOT_APPLICABLE", "AWAITING_RECEIPT", "RECEIPT_CONFIRMED", "RECEIPT_FAILED"] as const;
export type DeliveryStateV2 = (typeof DELIVERY_STATES_V2)[number];
export const DISPLAY_STATES_V2 = ["CURRENT", "CATCHING_UP", "STALE"] as const;
export type DisplayStateV2 = (typeof DISPLAY_STATES_V2)[number];

/** An ISO instant: sortable `ms` for display and ordering, the original text kept for the record. */
export interface InstantV2 {
  iso: string;
  ms: UtcEpochMs;
}

/**
 * One authorized operation-to-incident link. `NOT_ATTESTED` keeps its slot and
 * count but names no incident: its identity could not be represented exactly.
 * `historyReasonCode` is the typed absence: a link is a current pointer, not
 * proof of the incident's target when the link was written.
 */
export type IncidentLinkV2 =
  | {
    state: "LINKED";
    incidentId: string;
    relationship: IncidentLinkRelationshipV2;
    linkedAt: InstantV2;
    incident: {
      targetType: TargetTypeV2;
      targetId: string;
      environment: ExecEnv;
      environmentWire: WireEnvironment;
      severity: SeverityV2;
      workflowState: IncidentStateV2;
    };
    historyReasonCode: string;
  }
  | { state: "NOT_ATTESTED"; reasonCode: string; historyReasonCode: string };

export interface IncidentLinksV2 {
  /** Authorized links only, newest first. Never more than `INCIDENT_LINK_BOUND_V2`. */
  items: readonly IncidentLinkV2[];
  /** Links to incidents the caller may read; unauthorized links are neither listed nor counted. */
  authorizedLinkCount: number;
  /** True exactly when `authorizedLinkCount` exceeds `items.length`. */
  truncated: boolean;
}

export interface StatusCountDimensionV2<K extends string> {
  /** True when this dimension's own filter was dropped to count it. */
  ownFilterApplied: boolean;
  /** The authorized set under every OTHER applied filter (sum of `counts`). */
  total: number;
  /** Zero-filled over the closed domain. */
  counts: Readonly<Record<K, number>>;
}

/**
 * Server-counted over the same snapshot, scope and filters as the page. With
 * no own filter a dimension's `total` equals `filteredCount`; with one, the
 * selected bucket equals `filteredCount`.
 */
export interface StatusCountsV2 {
  triageState: StatusCountDimensionV2<TriageStateV2>;
  verificationResult: StatusCountDimensionV2<VerificationResultV2>;
  sourceStatus: StatusCountDimensionV2<SourceStatusV2>;
  severity: StatusCountDimensionV2<SeverityV2>;
}

/**
 * FE-CAT-2. One health count over the authorized filtered set. `count === null` = the owning source did not report it (never 0);
 * `coverage` PARTIAL = some rows did not report the axis, so the number is a floor. `observedAt` is when the Portal counted it.
 */
export interface HealthCountV2 {
  count: number | null;
  observedAt: InstantV2 | null;
  coverage: "COMPLETE" | "PARTIAL" | "UNKNOWN";
}

/** Each key is `undefined` when the producer has no owning source for it. */
export interface QueueHealthV2 {
  pendingReceipt?: HealthCountV2;
  displayLag?: HealthCountV2;
  openException?: HealthCountV2;
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
  /** FE-042. `undefined` = the server did not publish links (render "Not published (FE-042)"). */
  incidentLinks?: IncidentLinksV2;
  /** FE-CAT-2. `undefined` = not published for this row; `null` = the source did not report it. */
  deliveryState?: DeliveryStateV2 | null;
  displayState?: DisplayStateV2 | null;
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
  /** Rows dropped because their `operation_id` repeated an earlier row of the same page (first wins). */
  droppedDuplicateRows: number;
  appliedFilters: readonly { field: string; value: string }[];
  appliedSort: readonly { field: "created_at" | "operation_id"; direction: "asc" | "desc" }[];
  /** FE-043. `undefined` = the server did not publish counts (render "Not published (FE-043)"); never derive them from `rows`. */
  statusCounts?: StatusCountsV2;
  /** FE-CAT-2. `undefined` = the server published no health (render "Not published"); never derive it from `rows`. */
  health?: QueueHealthV2;
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

/** `workflow_version`: schema `integer`, minimum 1 (execution-operations.v1 OperationalQueueRowV2 / OperationalIncidentCurrentV2). */
function positiveCount(value: unknown): number | null {
  const n = count(value);
  return n === null || n < 1 ? null : n;
}

/** `observed_at_ms`: schema `integer`, minimum 0 (OperationalQueueV2 / OperationalIncidentCurrentV2). */
function nonNegativeEpochMs(value: unknown): UtcEpochMs | null {
  return typeof value === "number" && value >= 0 ? readUtcEpochMs(value) : null;
}

/** The schema's `Identifier` pattern, used by operation_id, target.id and incident_id. */
const IDENTIFIER = /^[A-Za-z0-9._:-]{1,191}$/;
function identifier(value: unknown): string | null {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : null;
}

/** `OperationalQueueRowV2.command_key`: maxLength 128 and `^[a-z0-9-]+/(?:[a-z0-9-]+|<root>)$`. */
const COMMAND_KEY = /^[a-z0-9-]+\/(?:[a-z0-9-]+|<root>)$/;
function commandKeyOf(value: unknown): string | null {
  return typeof value === "string" && value.length <= 128 && COMMAND_KEY.test(value) ? value : null;
}

/** `workspace_id`: schema string, minLength 3, maxLength 96. */
function workspaceIdOf(value: unknown): string | null {
  return typeof value === "string" && value.length >= 3 && value.length <= 96 ? value : null;
}

/** Typed-absence constants the schema pins (`link_history`, `historical_children`, NOT_ATTESTED slot). */
const HISTORY_NOT_ATTESTED = "ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED";
const LINK_IDENTITY_NOT_REPRESENTABLE = "INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE";

/** Largest page, applied-filter list and sort list the schema allows. */
const MAX_PAGE_ROWS = 250;
const MAX_APPLIED_FILTERS = 10;
const MAX_APPLIED_SORT = 2;

/** `supported_target_types` is fixed by the schema (prefixItems, minItems = maxItems = 3). */
const PUBLISHED_TARGET_TYPES = TARGET_TYPES_V2;

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|\+00:00)$/;

/** Strict ISO instant. The fraction is cut to milliseconds for `ms` only. */
export function readInstant(value: unknown): InstantV2 | null {
  if (typeof value !== "string") return null;
  const m = ISO.exec(value);
  if (m === null) return null;
  const millis = (m[7] ?? "").slice(0, 3).padEnd(3, "0");
  const parsed = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}.${millis}Z`);
  // Date.parse rolls 2026-02-30 over to 2 March. Keeping the original text beside a
  // different day would be two answers for one instant, so a date that does not
  // survive the round trip is refused.
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 19) !== value.slice(0, 19)) return null;
  const ms = readUtcEpochMs(parsed);
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
  const id = identifier(target.id);
  return type === null || id === null ? null : { type, id };
}

function readLink(raw: unknown): IncidentLinkV2 | null {
  const link = record(raw);
  if (link === null) return null;
  const history = record(link.link_history);
  if (history === null || history.availability !== "NOT_PUBLISHED") return null;
  if (history.reason_code !== HISTORY_NOT_ATTESTED) return null;
  const historyReasonCode = HISTORY_NOT_ATTESTED;
  if (link.state === "NOT_ATTESTED") {
    const reasonCode = link.reason_code === LINK_IDENTITY_NOT_REPRESENTABLE ? LINK_IDENTITY_NOT_REPRESENTABLE : null;
    // A slot with no identity must not carry one: that would be a guessed incident.
    return reasonCode === null || "incident_id" in link ? null : { state: "NOT_ATTESTED", reasonCode, historyReasonCode };
  }
  if (link.state !== "LINKED") return null;
  const incidentId = identifier(link.incident_id);
  const relationship = oneOf(link.relationship, INCIDENT_LINK_RELATIONSHIPS_V2);
  const linkedAt = readInstant(link.linked_at);
  const summary = record(link.incident);
  const target = targetOf(summary?.target);
  const env = environmentOf(summary?.environment);
  const severity = oneOf(summary?.severity, SEVERITIES_V2);
  const workflowState = oneOf(summary?.workflow_state, INCIDENT_STATES_V2);
  if (
    incidentId === null || relationship === null || linkedAt === null || target === null || env === null
    || severity === null || workflowState === null
  ) return null;
  return {
    state: "LINKED", incidentId, relationship, linkedAt, historyReasonCode,
    incident: {
      targetType: target.type, targetId: target.id, environment: env.env, environmentWire: env.wire,
      severity, workflowState,
    },
  };
}

function readIncidentLinks(raw: unknown): IncidentLinksV2 | null {
  const links = record(raw);
  if (links === null || !Array.isArray(links.items)) return null;
  if (links.basis !== "CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY" || links.bound !== INCIDENT_LINK_BOUND_V2) return null;
  const authorizedLinkCount = count(links.authorized_link_count);
  if (authorizedLinkCount === null || typeof links.truncated !== "boolean" || links.items.length > INCIDENT_LINK_BOUND_V2) return null;
  const items: IncidentLinkV2[] = [];
  for (const entry of links.items) {
    const item = readLink(entry);
    if (item === null) return null;
    items.push(item);
  }
  const ids = items.flatMap((item) => (item.state === "LINKED" ? [item.incidentId] : []));
  // The server's own arithmetic: a short list is only legitimate when it is the whole authorized set.
  if (
    items.length !== Math.min(authorizedLinkCount, INCIDENT_LINK_BOUND_V2)
    || links.truncated !== authorizedLinkCount > items.length || new Set(ids).size !== ids.length
  ) return null;
  return { items, authorizedLinkCount, truncated: links.truncated };
}

function readOperation(raw: unknown): OperationV2 | null {
  const row = record(raw);
  if (row === null) return null;
  const operationId = identifier(row.operation_id);
  const commandKey = commandKeyOf(row.command_key);
  const target = targetOf(row.target);
  const env = environmentOf(row.environment);
  const riskTier = oneOf(row.risk_tier, RISK_TIERS_V2);
  const severity = oneOf(row.severity, SEVERITIES_V2);
  const sourceAuthority = oneOf(row.source_authority, SOURCE_AUTHORITIES_V2);
  const sourceStatus = oneOf(row.source_status, SOURCE_STATUSES_V2);
  const verificationResult = oneOf(row.verification_result, VERIFICATION_RESULTS_V2);
  const triageState = oneOf(row.triage_state, TRIAGE_STATES_V2);
  const workflowVersion = positiveCount(row.workflow_version);
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
  // Optional additive FE-042. Absent -> undefined; present-but-bad voids the page.
  let incidentLinks: IncidentLinksV2 | undefined;
  if (row.incident_links !== undefined) {
    const links = readIncidentLinks(row.incident_links);
    if (links === null) return null;
    incidentLinks = links;
  }
  // Optional additive FE-CAT-2 axes. Absent -> undefined, null -> null; any other value voids the page.
  const axes: { deliveryState?: DeliveryStateV2 | null; displayState?: DisplayStateV2 | null } = {};
  if (row.delivery_state !== undefined) {
    const value = row.delivery_state === null ? null : oneOf(row.delivery_state, DELIVERY_STATES_V2);
    if (value === null && row.delivery_state !== null) return null;
    axes.deliveryState = value;
  }
  if (row.display_state !== undefined) {
    const value = row.display_state === null ? null : oneOf(row.display_state, DISPLAY_STATES_V2);
    if (value === null && row.display_state !== null) return null;
    axes.displayState = value;
  }
  return {
    operationId, commandKey, targetType: target.type, targetId: target.id,
    environment: env.env, environmentWire: env.wire,
    riskTier, severity, sourceAuthority, sourceStatus, verificationResult, triageState, workflowVersion,
    acknowledgedAt, resolvedAt, createdAt, updatedAt,
    ...(incidentLinks === undefined ? {} : { incidentLinks }),
    ...axes,
  };
}

function readHealthCount(raw: unknown): HealthCountV2 | null {
  const entry = record(raw);
  if (entry === null || Object.keys(entry).length !== 3) return null;
  const coverage = oneOf(entry.coverage, ["COMPLETE", "PARTIAL", "UNKNOWN"] as const);
  if (coverage === null) return null;
  if (entry.count === null) {
    // Not computable: no instant and no claim of coverage.
    return entry.observed_at === null && coverage === "UNKNOWN" ? { count: null, observedAt: null, coverage } : null;
  }
  const n = count(entry.count);
  const observedAt = readInstant(entry.observed_at);
  return n === null || observedAt === null || coverage === "UNKNOWN" ? null : { count: n, observedAt, coverage };
}

function readQueueHealth(raw: unknown, filteredCount: number, rows: readonly OperationV2[]): QueueHealthV2 | null {
  const health = record(raw);
  if (health === null || health.basis !== "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS") return null;
  if (Object.keys(health).some((key) => !["basis", "pending_receipt_count", "display_lag_count", "open_exception_count"].includes(key))) return null;
  const out: { pendingReceipt?: HealthCountV2; displayLag?: HealthCountV2; openException?: HealthCountV2 } = {};
  for (const [wire, key, axis, wanted] of [
    ["pending_receipt_count", "pendingReceipt", "deliveryState", "AWAITING_RECEIPT"],
    ["display_lag_count", "displayLag", "displayState", "CATCHING_UP"],
  ] as const) {
    if (health[wire] === undefined) continue;
    const entry = readHealthCount(health[wire]);
    if (entry === null) return null;
    // Counted over the authorized filtered set: never above it, and never below the rows already on this page.
    if (entry.count !== null && (entry.count > filteredCount || entry.count < rows.filter((r) => r[axis] === wanted).length)) return null;
    out[key] = entry;
  }
  if (health.open_exception_count !== undefined) {
    const entry = readHealthCount(health.open_exception_count);
    if (entry === null) return null;
    out.openException = entry;
  }
  return out;
}

function readDimension<K extends string>(
  raw: unknown, domain: readonly K[],
): StatusCountDimensionV2<K> | null {
  const dimension = record(raw);
  const counts = record(dimension?.counts);
  const total = count(dimension?.total);
  if (dimension === null || counts === null || total === null || typeof dimension.own_filter_applied !== "boolean") return null;
  // Closed and zero-filled: a missing or extra bucket is a malformed distribution, not a smaller one.
  if (Object.keys(counts).length !== domain.length) return null;
  const out = {} as Record<K, number>;
  let sum = 0;
  for (const key of domain) {
    const value = count(counts[key]);
    if (value === null) return null;
    out[key] = value;
    sum += value;
  }
  return sum === total ? { ownFilterApplied: dimension.own_filter_applied, total, counts: out } : null;
}

function readStatusCounts(
  raw: unknown, totalCount: number, filteredCount: number, appliedFilters: QueuePageV2["appliedFilters"],
): StatusCountsV2 | null {
  const counts = record(raw);
  const dimensions = record(counts?.dimensions);
  if (
    counts === null || dimensions === null
    || counts.basis !== "SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION"
    // SUCCEEDED here is a Portal queue record state; any other meaning is refused.
    || counts.succeeded_means !== "PORTAL_QUEUE_RECORD_STATE_ONLY"
    || Object.keys(dimensions).length !== 4
  ) return null;
  const read = {
    triage_state: readDimension(dimensions.triage_state, TRIAGE_STATES_V2),
    verification_result: readDimension(dimensions.verification_result, VERIFICATION_RESULTS_V2),
    source_status: readDimension(dimensions.source_status, SOURCE_STATUSES_V2),
    severity: readDimension(dimensions.severity, SEVERITIES_V2),
  };
  for (const [field, dimension] of Object.entries(read)) {
    if (dimension === null) return null;
    const own = appliedFilters.find((filter) => filter.field === field);
    // A filter value outside the closed domain selects nothing: its bucket is exactly zero.
    const selected = own === undefined ? undefined : (dimension.counts as Record<string, number | undefined>)[own.value] ?? 0;
    // Facet arithmetic (server-enforced too): no own filter -> the dimension is the filtered set;
    // an own filter -> the bucket it selects is the filtered set.
    if (
      dimension.total > totalCount || dimension.total < filteredCount || dimension.ownFilterApplied !== (own !== undefined)
      || (own === undefined ? dimension.total !== filteredCount : selected !== filteredCount)
    ) return null;
  }
  return {
    triageState: read.triage_state!, verificationResult: read.verification_result!,
    sourceStatus: read.source_status!, severity: read.severity!,
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
  if (page === null || !Array.isArray(page.rows) || page.rows.length > MAX_PAGE_ROWS) return null;
  const rows: OperationV2[] = [];
  const seen = new Set<string>();
  let droppedDuplicateRows = 0;
  for (const entry of page.rows) {
    const row = readOperation(entry);
    if (row === null) return null;
    // One operation is one table key. A repeat inside a page keeps the first row and is counted.
    if (seen.has(row.operationId)) {
      droppedDuplicateRows += 1;
      continue;
    }
    seen.add(row.operationId);
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
  if (totalCount < filteredCount || filteredCount < rows.length + droppedDuplicateRows) return null;
  if (appliedFilters.length > MAX_APPLIED_FILTERS || appliedSort.length > MAX_APPLIED_SORT) return null;
  if (page.has_more !== (nextCursor !== null) || page.has_previous !== (prevCursor !== null)) return null;
  // Optional additive FE-043. Absent -> undefined; present-but-bad voids the page.
  let statusCounts: StatusCountsV2 | undefined;
  if (page.status_counts !== undefined) {
    const counts = readStatusCounts(page.status_counts, totalCount, filteredCount, appliedFilters);
    if (counts === null) return null;
    statusCounts = counts;
  }
  // Optional additive FE-CAT-2. Absent -> undefined; present-but-bad voids the page.
  let health: QueueHealthV2 | undefined;
  if (page.health !== undefined) {
    const read = readQueueHealth(page.health, filteredCount, rows);
    if (read === null) return null;
    health = read;
  }
  return {
    rows, totalCount, filteredCount, nextCursor, prevCursor,
    hasMore: page.has_more, hasPrevious: page.has_previous, droppedDuplicateRows, appliedFilters, appliedSort,
    ...(statusCounts === undefined ? {} : { statusCounts }),
    ...(health === undefined ? {} : { health }),
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

  const workspaceId = workspaceIdOf(root.workspace_id);
  const observedAtMs = nonNegativeEpochMs(root.observed_at_ms);
  const sourceAsOfMs = root.source_as_of_ms === null ? null : readUtcEpochMs(root.source_as_of_ms);
  const truth = record(root.read_truth);
  const truthState = oneOf(truth?.state, ["AVAILABLE", "EMPTY"] as const);
  const reasonCode = truth?.reason_code === null ? null : text(truth?.reason_code);
  // Fixed by the schema: exactly ACCOUNT, PORTFOLIO, DEPLOYMENT, in that order.
  const supported = Array.isArray(root.supported_target_types)
    && root.supported_target_types.length === PUBLISHED_TARGET_TYPES.length
    && PUBLISHED_TARGET_TYPES.every((t, i) => (root.supported_target_types as unknown[])[i] === t)
    ? [...PUBLISHED_TARGET_TYPES]
    : null;
  const page = readPage(root.page);
  if (
    workspaceId === null || observedAtMs === null || (root.source_as_of_ms !== null && sourceAsOfMs === null)
    || truth === null || truthState === null || (truth.reason_code !== null && reasonCode === null)
    || truth.scope !== "REQUEST" || supported === null || page === null
    || root.record_authority !== "PORTAL" || root.source_integration_state !== "UNAVAILABLE"
    // Constants in the schema: what the queue is (a Portal workflow record) and what it covers.
    || root.record_basis !== "PORTAL_CURRENT_OPERATIONAL_WORKFLOW" || root.coverage !== "AUTHORIZED_SUPPORTED_TARGETS_ONLY"
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
      supportedTargetTypes: supported,
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

  const incidentId = identifier(root.incident_id);
  const workspaceId = workspaceIdOf(root.workspace_id);
  const target = targetOf(root.target);
  const env = environmentOf(root.environment);
  const severity = oneOf(root.severity, SEVERITIES_V2);
  const workflowState = oneOf(root.workflow_state, INCIDENT_STATES_V2);
  const workflowVersion = positiveCount(root.workflow_version);
  const acknowledgedAt = nullableInstant(root.acknowledged_at);
  const mitigatedAt = nullableInstant(root.mitigated_at);
  const resolvedAt = nullableInstant(root.resolved_at);
  const createdAt = readInstant(root.created_at);
  const updatedAt = readInstant(root.updated_at);
  const observedAtMs = nonNegativeEpochMs(root.observed_at_ms);
  const children = record(root.historical_children);
  const reasonCode = children?.reason_code === HISTORY_NOT_ATTESTED ? HISTORY_NOT_ATTESTED : null;
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
