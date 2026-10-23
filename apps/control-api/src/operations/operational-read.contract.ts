import { z } from "zod";
import { IdentifierSchema, OperationQueueQuerySchema } from "./contracts";
import { f0BlockedOperation } from "./f0-read.contract";

/** Portal workflow observations, not source execution or mutation permission. */
export const operationalTargets = ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const;
export const operationalTarget = z.object({ type: z.enum(operationalTargets), id: IdentifierSchema }).strict();
const time = z.string().datetime().refine(value => Date.parse(value) >= 0);
const environment = z.enum(["PAPER", "SANDBOX", "LIVE"]);
export const operationalQueueQuery = OperationQueueQuerySchema.innerType().extend({
  target_type: z.enum(operationalTargets).optional(), target_id: IdentifierSchema.optional(),
}).strict().refine(query => !(query.after && query.before), "CURSORS_ARE_EXCLUSIVE");
/** Closed status vocabularies, shared by the row contract and `status_counts`. */
export const operationalSeverities = ["INFO", "WARNING", "ERROR", "CRITICAL"] as const;
const severity = z.enum(operationalSeverities);
export const operationalSourceStatuses = ["BLOCKED", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "EXPIRED", "UNCERTAIN"] as const;
export const operationalVerificationResults = ["NOT_STARTED", "PENDING", "SUCCEEDED", "FAILED", "PARTIAL", "UNCERTAIN", "DENIED", "EXPIRED"] as const;
export const operationalTriageStates = ["UNACKNOWLEDGED", "ACKNOWLEDGED", "RESOLVED"] as const;
const itemShape = z.object({
  operation_id: IdentifierSchema, operation_kind: z.literal("EXECUTION_COMMAND"),
  command_key: z.string().min(1).max(128).regex(/^[a-z0-9-]+\/(?:[a-z0-9-]+|<root>)$/),
  target: operationalTarget, environment,
  risk_tier: z.enum(["R0_READ", "R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE",
    "R4_LIVE_RISK_INCREASING", "UNCLASSIFIED", "BLOCKED"]), severity,
  source_authority: z.enum(["PORTAL", "EXECUTION", "BROKER"]),
  source_status: z.enum(operationalSourceStatuses),
  verification_result: z.enum(operationalVerificationResults),
  triage_state: z.enum(operationalTriageStates),
  workflow_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  acknowledged_at: time.nullable(), resolved_at: time.nullable(), created_at: time, updated_at: time,
});
type ItemShape = z.infer<typeof itemShape>;
const itemShapeValid = (value: ItemShape) => Date.parse(value.updated_at) >= Date.parse(value.created_at) &&
  (value.triage_state === "UNACKNOWLEDGED" ? value.acknowledged_at === null && value.resolved_at === null :
    value.acknowledged_at !== null && (value.triage_state === "ACKNOWLEDGED" ? value.resolved_at === null : value.resolved_at !== null));
export const operationalQueueItem = itemShape.strict().refine(itemShapeValid);
export type OperationalQueueItem = z.infer<typeof operationalQueueItem>;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** FE-042. Most links returned per operation; the bound is applied AFTER authorization. */
export const OPERATIONAL_INCIDENT_LINK_BOUND = 3;
export const incidentLinkRelationships = ["TRIGGERED_BY", "MITIGATES", "RELATED"] as const;
/** Link rows are current pointers from the append-only many-to-many table. Nothing here attests
 * the incident's original target when the link was written (migration 141 comment). */
const linkHistory = z.object({ availability: z.literal("NOT_PUBLISHED"),
  reason_code: z.literal("ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED") }).strict();
export const operationalIncidentLink = z.discriminatedUnion("state", [
  z.object({ state: z.literal("LINKED"), incident_id: IdentifierSchema, relationship: z.enum(incidentLinkRelationships),
    linked_at: time, incident: z.object({ target: operationalTarget, environment, severity,
      workflow_state: z.enum(["OPEN", "MITIGATED", "RESOLVED"]) }).strict(), link_history: linkHistory }).strict(),
  // Authorized by the incident's own target tuple, but the pointer cannot be represented exactly.
  z.object({ state: z.literal("NOT_ATTESTED"), reason_code: z.literal("INCIDENT_LINK_IDENTITY_NOT_REPRESENTABLE"),
    link_history: linkHistory }).strict(),
]);
export type OperationalIncidentLink = z.infer<typeof operationalIncidentLink>;
export const operationalIncidentLinks = z.object({
  basis: z.literal("CURRENT_LINK_ROWS_AUTHORIZED_INCIDENTS_ONLY"),
  bound: z.literal(OPERATIONAL_INCIDENT_LINK_BOUND),
  /** Links whose incident target the caller is independently authorized for; never a global count. */
  authorized_link_count: count, truncated: z.boolean(),
  items: z.array(operationalIncidentLink).max(OPERATIONAL_INCIDENT_LINK_BOUND),
}).strict().superRefine((value, ctx) => {
  const linked = value.items.flatMap(item => item.state === "LINKED" ? [item] : []);
  if (value.items.length !== Math.min(value.authorized_link_count, OPERATIONAL_INCIDENT_LINK_BOUND) ||
    value.truncated !== value.authorized_link_count > value.items.length ||
    new Set(linked.map(item => item.incident_id)).size !== linked.length)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OPERATIONAL_INCIDENT_LINKS_INVALID" });
});
export type OperationalIncidentLinks = z.infer<typeof operationalIncidentLinks>;
/** FE-CAT-2. Per-row axes, each nullable (null = the owning source did not report it) and optional (omitted = this producer
 * has no owning source). The vocabularies are Portal proposals pending Codex/Edge confirmation. */
export const operationalDeliveryStates = ["NOT_APPLICABLE", "AWAITING_RECEIPT", "RECEIPT_CONFIRMED", "RECEIPT_FAILED"] as const;
export const operationalDisplayStates = ["CURRENT", "CATCHING_UP", "STALE"] as const;
/** Queue page row: the immutable item plus the optional FE-042 link set and the optional FE-CAT-2 axes. */
export const operationalQueueRow = itemShape.extend({ incident_links: operationalIncidentLinks.optional(),
  delivery_state: z.enum(operationalDeliveryStates).nullable().optional(), display_state: z.enum(operationalDisplayStates).nullable().optional() })
  .strict().refine(itemShapeValid);
export type OperationalQueueRow = z.infer<typeof operationalQueueRow>;

/** FE-043. Supported count dimensions, each with its closed, zero-filled domain. */
export const operationalStatusCountDimensions = {
  triage_state: operationalTriageStates, verification_result: operationalVerificationResults,
  source_status: operationalSourceStatuses, severity: operationalSeverities,
} as const;
export type OperationalStatusCountDimension = keyof typeof operationalStatusCountDimensions;
const statusCountDimension = <T extends readonly [string, ...string[]]>(values: T) => z.object({
  own_filter_applied: z.boolean(), total: count,
  counts: z.object(Object.fromEntries(values.map(value => [value, count])) as Record<T[number], typeof count>).strict(),
}).strict();
export const operationalStatusCounts = z.object({
  basis: z.literal("SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS_EXCLUDING_OWN_DIMENSION"),
  succeeded_means: z.literal("PORTAL_QUEUE_RECORD_STATE_ONLY"),
  dimensions: z.object({
    triage_state: statusCountDimension(operationalTriageStates),
    verification_result: statusCountDimension(operationalVerificationResults),
    source_status: statusCountDimension(operationalSourceStatuses),
    severity: statusCountDimension(operationalSeverities),
  }).strict(),
}).strict();
export type OperationalStatusCounts = z.infer<typeof operationalStatusCounts>;
/** FE-CAT-2. One count with its own observation time and coverage. `count` null = not computable (observed_at null,
 * coverage UNKNOWN); a number carries both. PARTIAL = some filtered rows did not report the axis, so it is a floor. */
export const operationalHealthCount = z.object({ count: count.nullable(), observed_at: time.nullable(),
  coverage: z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]) }).strict().refine(value => value.count === null ?
  value.observed_at === null && value.coverage === "UNKNOWN" : value.observed_at !== null && value.coverage !== "UNKNOWN");
export type OperationalHealthCount = z.infer<typeof operationalHealthCount>;
export const operationalQueueHealth = z.object({ basis: z.literal("SAME_SNAPSHOT_AUTHORIZED_SCOPE_AND_FILTERS"),
  pending_receipt_count: operationalHealthCount.optional(), display_lag_count: operationalHealthCount.optional(),
  open_exception_count: operationalHealthCount.optional() }).strict();
export type OperationalQueueHealth = z.infer<typeof operationalQueueHealth>;
export const operationalQueue = z.object({
  schema_version: z.literal("portal.execution.operational-queue.v2"), workspace_id: z.string().min(3).max(96),
  record_authority: z.literal("PORTAL"), record_basis: z.literal("PORTAL_CURRENT_OPERATIONAL_WORKFLOW"),
  coverage: z.literal("AUTHORIZED_SUPPORTED_TARGETS_ONLY"), supported_target_types: z.tuple([
    z.literal("ACCOUNT"), z.literal("PORTFOLIO"), z.literal("DEPLOYMENT")]),
  source_integration_state: z.literal("UNAVAILABLE"), source_side_effect_requested: z.literal(false),
  source_as_of_ms: z.null(), observed_at_ms: count,
  read_truth: z.object({ state: z.enum(["AVAILABLE", "EMPTY"]), reason_code: z.string().nullable(), scope: z.literal("REQUEST") }).strict(),
  page: z.object({ rows: z.array(operationalQueueRow).max(250), total_count: count, filtered_count: count,
    next_cursor: z.string().min(1).max(4096).nullable(), prev_cursor: z.string().min(1).max(4096).nullable(),
    has_more: z.boolean(), has_previous: z.boolean(),
    applied_filters: z.array(z.object({ field: z.string().max(64), op: z.literal("eq"), value: z.string().max(256) }).strict()).max(10),
    applied_sort: z.array(z.object({ field: z.enum(["created_at", "operation_id"]), direction: z.enum(["asc", "desc"]) }).strict()).max(2),
    status_counts: operationalStatusCounts.optional(),
    health: operationalQueueHealth.optional(),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.page.total_count < value.page.filtered_count || value.page.filtered_count < value.page.rows.length ||
    value.read_truth.state !== (value.page.filtered_count ? "AVAILABLE" : "EMPTY") ||
    value.page.has_more !== (value.page.next_cursor !== null) || value.page.has_previous !== (value.page.prev_cursor !== null))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OPERATIONAL_PAGE_INVALID" });
  const health = value.page.health;
  if (health) for (const [key, axis, wanted] of [["pending_receipt_count", "delivery_state", "AWAITING_RECEIPT"],
    ["display_lag_count", "display_state", "CATCHING_UP"]] as const) {
    const entry = health[key];
    // Row-derived counts are over the authorized filtered set, so they bound the loaded rows from above and are bounded by it.
    const onPage = value.page.rows.filter(row => row[axis] === wanted).length;
    if (entry && entry.count !== null && (entry.count > value.page.filtered_count || entry.count < onPage))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OPERATIONAL_HEALTH_COUNTS_INVALID" });
  }
  const counts = value.page.status_counts;
  if (counts) for (const field of Object.keys(operationalStatusCountDimensions) as OperationalStatusCountDimension[]) {
    const dimension = counts.dimensions[field], own = value.page.applied_filters.find(filter => filter.field === field);
    const sum = Object.values(dimension.counts).reduce((a, b) => a + b, 0);
    // A filter value outside the closed domain selects nothing: its bucket is exactly zero.
    const ownCount = own === undefined ? undefined : (dimension.counts as Record<string, number | undefined>)[own.value] ?? 0;
    // Facet invariants: the dimension total is the authorized set under every OTHER filter. With no own
    // filter that is exactly filtered_count; with one, the bucket it selects is exactly filtered_count.
    if (sum !== dimension.total || dimension.total > value.page.total_count || dimension.total < value.page.filtered_count ||
      dimension.own_filter_applied !== (own !== undefined) ||
      (own === undefined ? dimension.total !== value.page.filtered_count : ownCount !== value.page.filtered_count))
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OPERATIONAL_STATUS_COUNTS_INVALID" });
  }
});
export type OperationalQueue = z.infer<typeof operationalQueue>;
export const operationalWorkflow = z.object({
  schema_version: z.literal("portal.execution.operational-workflow.v2"),
  family: z.literal("F0_BACKED_PORTAL_WORKFLOW"), record_authority: z.literal("PORTAL"),
  provenance_basis: z.enum(["SQL_EXACT_SOURCE_TIMESTAMP", "LEGACY_DATE_MILLISECOND_COPY"]),
  source_side_effect_requested: z.literal(false), observed_at_ms: count,
  operation: operationalQueueItem, intent: f0BlockedOperation,
}).strict().refine(value => value.operation.operation_id === value.intent.operation_id);
export type OperationalWorkflow = z.infer<typeof operationalWorkflow>;
export const operationalIncident = z.object({
  schema_version: z.literal("portal.execution.incident-current-root.v2"),
  record_authority: z.literal("PORTAL"), record_basis: z.literal("CURRENT_ROOT_NOT_HISTORICAL_LINEAGE"),
  incident_id: IdentifierSchema, workspace_id: z.string().min(3).max(96), target: operationalTarget, environment,
  severity, workflow_state: z.enum(["OPEN", "MITIGATED", "RESOLVED"]),
  workflow_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), acknowledged_at: time.nullable(), mitigated_at: time.nullable(),
  resolved_at: time.nullable(), created_at: time, updated_at: time, observed_at_ms: count,
  source_integration_state: z.literal("UNAVAILABLE"), source_side_effect_requested: z.literal(false),
  deployment_resume_requested: z.literal(false),
  historical_children: z.object({ availability: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("ORIGINAL_INCIDENT_TARGET_NOT_ATTESTED") }).strict(),
}).strict().refine(value => Date.parse(value.updated_at) >= Date.parse(value.created_at) &&
  (value.workflow_state === "OPEN" ? value.mitigated_at === null && value.resolved_at === null :
    value.acknowledged_at !== null && value.mitigated_at !== null &&
      (value.workflow_state === "MITIGATED" ? value.resolved_at === null : value.resolved_at !== null)));
export type OperationalIncident = z.infer<typeof operationalIncident>;
