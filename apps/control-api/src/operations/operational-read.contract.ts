import { z } from "zod";
import { IdentifierSchema, OperationQueueQuerySchema } from "./contracts";
import { f0BlockedOperation } from "./f0-read.contract";

/** Portal workflow observations, not source execution or mutation permission. */
export const operationalTargets = ["ACCOUNT", "PORTFOLIO", "DEPLOYMENT"] as const;
export const operationalTarget = z.object({ type: z.enum(operationalTargets), id: IdentifierSchema }).strict();
const time = z.string().datetime().refine(value => Date.parse(value) >= 0);
const environment = z.enum(["PAPER", "SANDBOX", "LIVE"]);
const severity = z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]);
export const operationalQueueQuery = OperationQueueQuerySchema.innerType().extend({
  target_type: z.enum(operationalTargets).optional(), target_id: IdentifierSchema.optional(),
}).strict().refine(query => !(query.after && query.before), "CURSORS_ARE_EXCLUSIVE");
export const operationalQueueItem = z.object({
  operation_id: IdentifierSchema, operation_kind: z.literal("EXECUTION_COMMAND"),
  command_key: z.string().min(1).max(128).regex(/^[a-z0-9-]+\/(?:[a-z0-9-]+|<root>)$/),
  target: operationalTarget, environment,
  risk_tier: z.enum(["R0_READ", "R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE",
    "R4_LIVE_RISK_INCREASING", "UNCLASSIFIED", "BLOCKED"]), severity,
  source_authority: z.enum(["PORTAL", "EXECUTION", "BROKER"]),
  source_status: z.enum(["BLOCKED", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "EXPIRED", "UNCERTAIN"]),
  verification_result: z.enum(["NOT_STARTED", "PENDING", "SUCCEEDED", "FAILED", "PARTIAL", "UNCERTAIN", "DENIED", "EXPIRED"]),
  triage_state: z.enum(["UNACKNOWLEDGED", "ACKNOWLEDGED", "RESOLVED"]),
  workflow_version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  acknowledged_at: time.nullable(), resolved_at: time.nullable(), created_at: time, updated_at: time,
}).strict().refine(value => Date.parse(value.updated_at) >= Date.parse(value.created_at) &&
  (value.triage_state === "UNACKNOWLEDGED" ? value.acknowledged_at === null && value.resolved_at === null :
    value.acknowledged_at !== null && (value.triage_state === "ACKNOWLEDGED" ? value.resolved_at === null : value.resolved_at !== null)));
export type OperationalQueueItem = z.infer<typeof operationalQueueItem>;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const operationalQueue = z.object({
  schema_version: z.literal("portal.execution.operational-queue.v2"), workspace_id: z.string().min(3).max(96),
  record_authority: z.literal("PORTAL"), record_basis: z.literal("PORTAL_CURRENT_OPERATIONAL_WORKFLOW"),
  coverage: z.literal("AUTHORIZED_SUPPORTED_TARGETS_ONLY"), supported_target_types: z.tuple([
    z.literal("ACCOUNT"), z.literal("PORTFOLIO"), z.literal("DEPLOYMENT")]),
  source_integration_state: z.literal("UNAVAILABLE"), source_side_effect_requested: z.literal(false),
  source_as_of_ms: z.null(), observed_at_ms: count,
  read_truth: z.object({ state: z.enum(["AVAILABLE", "EMPTY"]), reason_code: z.string().nullable(), scope: z.literal("REQUEST") }).strict(),
  page: z.object({ rows: z.array(operationalQueueItem).max(250), total_count: count, filtered_count: count,
    next_cursor: z.string().min(1).max(4096).nullable(), prev_cursor: z.string().min(1).max(4096).nullable(),
    has_more: z.boolean(), has_previous: z.boolean(),
    applied_filters: z.array(z.object({ field: z.string().max(64), op: z.literal("eq"), value: z.string().max(256) }).strict()).max(10),
    applied_sort: z.array(z.object({ field: z.enum(["created_at", "operation_id"]), direction: z.enum(["asc", "desc"]) }).strict()).max(2),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.page.total_count < value.page.filtered_count || value.page.filtered_count < value.page.rows.length ||
    value.read_truth.state !== (value.page.filtered_count ? "AVAILABLE" : "EMPTY") ||
    value.page.has_more !== (value.page.next_cursor !== null) || value.page.has_previous !== (value.page.prev_cursor !== null))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "OPERATIONAL_PAGE_INVALID" });
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
