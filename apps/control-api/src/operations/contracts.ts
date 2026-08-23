import { z } from "zod";

const ExecutionEnvironmentSchema = z.enum(["PAPER", "SANDBOX", "LIVE"]);
const ExecutionTargetTypeSchema = z.enum([
  "ACCOUNT", "BROKER_BINDING", "DEPLOYMENT", "ORDER", "PORTFOLIO", "SYSTEM",
]);
const ExecutionRiskTierSchema = z.enum([
  "R0_READ", "R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE",
  "R4_LIVE_RISK_INCREASING", "UNCLASSIFIED", "BLOCKED",
]);
const IdentifierSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,191}$/);

const PAYLOAD_MAX_UTF8_BYTES = 32_768;
const PAYLOAD_MAX_DEPTH = 6;
const PAYLOAD_MAX_NODES = 512;
const PAYLOAD_MAX_ARRAY_ITEMS = 128;
const PAYLOAD_MAX_STRING_UTF8_BYTES = 4_096;
const PAYLOAD_MAX_OBJECT_PROPERTIES = 64;
const PAYLOAD_MAX_KEY_LENGTH = 128;
const SENSITIVE_KEY_FRAGMENTS = [
  "password", "secret", "token", "apikey", "privatekey", "credential",
  "authorization", "cookie",
];

function containsCredentialLikeAssignment(value: string): boolean {
  return /(?:password|secret|token|api[ _-]?key|private[ _-]?key|authorization|cookie)\s*[:=]/i
    .test(value);
}

const SafeOperatorTextSchema = (minimum: number, maximum: number) => z
  .string()
  .trim()
  .min(minimum)
  .max(maximum)
  .refine((value) => !containsCredentialLikeAssignment(value), "SENSITIVE_OPERATOR_TEXT_FORBIDDEN");

function payloadPolicyIssue(payload: Record<string, unknown>): string | null {
  let nodes = 0;
  const visit = (value: unknown, depth: number): string | null => {
    nodes += 1;
    if (nodes > PAYLOAD_MAX_NODES || depth > PAYLOAD_MAX_DEPTH) {
      return "PAYLOAD_LIMIT_EXCEEDED";
    }
    if (typeof value === "string") {
      return Buffer.byteLength(value, "utf8") <= PAYLOAD_MAX_STRING_UTF8_BYTES
        ? null
        : "PAYLOAD_LIMIT_EXCEEDED";
    }
    if (typeof value === "number") {
      return Number.isFinite(value) ? null : "PAYLOAD_INVALID_JSON_VALUE";
    }
    if (value === null || typeof value === "boolean") return null;
    if (Array.isArray(value)) {
      if (value.length > PAYLOAD_MAX_ARRAY_ITEMS) return "PAYLOAD_LIMIT_EXCEEDED";
      for (const item of value) {
        const issue = visit(item, depth + 1);
        if (issue) return issue;
      }
      return null;
    }
    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length > PAYLOAD_MAX_OBJECT_PROPERTIES) return "PAYLOAD_LIMIT_EXCEEDED";
      for (const [key, item] of entries) {
        if (key.length > PAYLOAD_MAX_KEY_LENGTH) return "PAYLOAD_LIMIT_EXCEEDED";
        const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))) {
          return "SENSITIVE_PAYLOAD_FIELD_FORBIDDEN";
        }
        const issue = visit(item, depth + 1);
        if (issue) return issue;
      }
      return null;
    }
    return "PAYLOAD_INVALID_JSON_VALUE";
  };

  const structuralIssue = visit(payload, 0);
  if (structuralIssue) return structuralIssue;
  let encoded: string;
  try {
    encoded = JSON.stringify(payload);
  } catch {
    return "PAYLOAD_INVALID_JSON_VALUE";
  }
  return Buffer.byteLength(encoded, "utf8") <= PAYLOAD_MAX_UTF8_BYTES
    ? null
    : "PAYLOAD_LIMIT_EXCEEDED";
}

export const ExecutionCommandPayloadSchema = z
  .record(z.string(), z.unknown())
  .superRefine((payload, context) => {
    const issue = payloadPolicyIssue(payload);
    if (issue) context.addIssue({ code: z.ZodIssueCode.custom, message: issue });
  });

export const TypedConditionSchema = z
  .object({
    text: z.string().trim().min(8).max(2000),
    owner: z.string().trim().min(1).max(128),
    deadline: z.string().date().nullable(),
    expires_at: z.string().date().nullable(),
    blocking: z.boolean(),
  })
  .strict()
  .superRefine((condition, context) => {
    if (
      condition.deadline !== null &&
      condition.expires_at !== null &&
      condition.expires_at < condition.deadline
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expires_at"],
        message: "condition expiry cannot precede its deadline",
      });
    }
  });

export type TypedCondition = z.infer<typeof TypedConditionSchema>;

export const ExecutionCommandCatalogueQuerySchema = z
  .object({
    workspace_id: z.string().min(3).max(96).optional(),
    environment: ExecutionEnvironmentSchema.default("PAPER"),
    target_type: ExecutionTargetTypeSchema.optional(),
    target_id: IdentifierSchema.optional(),
    risk_tier: ExecutionRiskTierSchema.optional(),
  })
  .strict()
  .superRefine((query, context) => {
    if ((query.target_type === undefined) !== (query.target_id === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [query.target_type === undefined ? "target_type" : "target_id"],
        message: "target_type and target_id must be supplied together",
      });
    }
  });

export type ExecutionCommandCatalogueQuery = z.infer<typeof ExecutionCommandCatalogueQuerySchema>;

export const ExecutionCommandPlanRequestSchema = z
  .object({
    schema_version: z.literal("execution.command-plan-request.v1"),
    workspace_id: z.string().min(3).max(96),
    request_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/),
    command_type: z.literal("EXECUTION_COMMAND"),
    command_version: z.literal(1),
    command_key: z.string().regex(/^[a-z0-9-]+\/(?:[a-z0-9-]+|<root>)$/),
    environment: ExecutionEnvironmentSchema,
    target: z
      .object({
        type: ExecutionTargetTypeSchema,
        id: IdentifierSchema,
      })
      .strict(),
    expected_target_version: z.number().int().positive(),
    payload: ExecutionCommandPayloadSchema,
    conditions: z.array(TypedConditionSchema).max(16).refine(
      (conditions) =>
        new Set(conditions.map((condition) => JSON.stringify(condition))).size === conditions.length,
      "conditions must be unique",
    ),
  })
  .strict();

export type ExecutionCommandPlanRequest = z.infer<typeof ExecutionCommandPlanRequestSchema>;

export const ExecutionCommandApplyRequestSchema = z
  .object({
    schema_version: z.literal("execution.command-apply-request.v1"),
    workspace_id: z.string().min(3).max(96),
    command_type: z.literal("EXECUTION_COMMAND"),
  })
  .strict();

export const OperationQueueQuerySchema = z
  .object({
    workspace_id: z.string().min(3).max(96).optional(),
    after: z.string().min(1).max(4096).optional(),
    before: z.string().min(1).max(4096).optional(),
    limit: z.coerce.number().int().min(1).max(250).optional(),
    triage_state: z.enum(["UNACKNOWLEDGED", "ACKNOWLEDGED", "RESOLVED"]).optional(),
    environment: ExecutionEnvironmentSchema.optional(),
    source_status: z.enum([
      "BLOCKED", "PENDING", "RUNNING", "SUCCEEDED", "FAILED", "EXPIRED", "UNCERTAIN",
    ]).optional(),
    verification_result: z.enum([
      "NOT_STARTED", "PENDING", "SUCCEEDED", "FAILED", "PARTIAL", "UNCERTAIN", "DENIED", "EXPIRED",
    ]).optional(),
    severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]).optional(),
    target_type: ExecutionTargetTypeSchema.optional(),
    command_key: z.string().regex(/^[a-z0-9-]+\/(?:[a-z0-9-]+|<root>)$/).optional(),
    sort: z.enum(["created_at:asc", "created_at:desc"]).default("created_at:desc"),
  })
  .strict()
  .refine((query) => !(query.after && query.before), "after and before are mutually exclusive");

export type OperationQueueQuery = z.infer<typeof OperationQueueQuerySchema>;

export const OperationAcknowledgeRequestSchema = z
  .object({
    schema_version: z.literal("execution.operation-acknowledge-request.v1"),
    workspace_id: z.string().min(3).max(96),
    request_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/),
    expected_workflow_version: z.number().int().positive(),
  })
  .strict();

export type OperationAcknowledgeRequest = z.infer<typeof OperationAcknowledgeRequestSchema>;

export const OperationResolveRequestSchema = z
  .object({
    schema_version: z.literal("execution.operation-resolve-request.v1"),
    workspace_id: z.string().min(3).max(96),
    request_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/),
    expected_workflow_version: z.number().int().positive(),
    reason: z.string().trim().min(8).max(2000),
    evidence_hash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  })
  .strict();

export type OperationResolveRequest = z.infer<typeof OperationResolveRequestSchema>;

const IncidentRequestKeySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/);
const IncidentHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

export const IncidentCreateRequestSchema = z
  .object({
    schema_version: z.literal("execution.incident-create-request.v1"),
    workspace_id: z.string().min(3).max(96),
    request_key: IncidentRequestKeySchema,
    title: SafeOperatorTextSchema(8, 200),
    summary: SafeOperatorTextSchema(8, 2000),
    severity: z.enum(["INFO", "WARNING", "ERROR", "CRITICAL"]),
    environment: ExecutionEnvironmentSchema,
    target: z.object({ type: ExecutionTargetTypeSchema, id: IdentifierSchema }).strict(),
    correlated_operation_ids: z.array(IdentifierSchema).max(20).default([]),
  })
  .strict()
  .refine(
    (request) => new Set(request.correlated_operation_ids).size === request.correlated_operation_ids.length,
    "correlated_operation_ids must be unique",
  );

export type IncidentCreateRequest = z.infer<typeof IncidentCreateRequestSchema>;

const IncidentMutationBaseSchema = z.object({
  workspace_id: z.string().min(3).max(96),
  request_key: IncidentRequestKeySchema,
  expected_workflow_version: z.number().int().positive(),
});

export const IncidentAcknowledgeRequestSchema = IncidentMutationBaseSchema.extend({
  schema_version: z.literal("execution.incident-acknowledge-request.v1"),
}).strict();
export type IncidentAcknowledgeRequest = z.infer<typeof IncidentAcknowledgeRequestSchema>;

export const IncidentAssignRequestSchema = IncidentMutationBaseSchema.extend({
  schema_version: z.literal("execution.incident-assign-request.v1"),
  assignee_user_id: IdentifierSchema,
}).strict();
export type IncidentAssignRequest = z.infer<typeof IncidentAssignRequestSchema>;

export const IncidentAnnotateRequestSchema = IncidentMutationBaseSchema.extend({
  schema_version: z.literal("execution.incident-annotate-request.v1"),
  body: SafeOperatorTextSchema(1, 4000),
}).strict();
export type IncidentAnnotateRequest = z.infer<typeof IncidentAnnotateRequestSchema>;

export const IncidentEvidenceRequestSchema = IncidentMutationBaseSchema.extend({
  schema_version: z.literal("execution.incident-evidence-request.v1"),
  evidence_kind: z.enum([
    "MITIGATION_ATTESTATION", "CLEAN_DRY_RUN", "SYNC_SNAPSHOT",
    "FINDING_REFERENCE", "BLAST_RADIUS", "PROBABLE_CAUSE", "OTHER",
  ]),
  sha256: IncidentHashSchema,
  evidence_schema_version: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
  declared_source_authority: z.enum(["PORTAL", "EXECUTION", "BROKER", "DERIVED"]),
  summary: SafeOperatorTextSchema(8, 1000),
  captured_at: z.string().datetime({ offset: true }),
}).strict();
export type IncidentEvidenceRequest = z.infer<typeof IncidentEvidenceRequestSchema>;

export const IncidentCorrelateOperationRequestSchema = IncidentMutationBaseSchema.extend({
  schema_version: z.literal("execution.incident-correlate-operation-request.v1"),
  operation_id: IdentifierSchema,
  relationship: z.enum(["TRIGGERED_BY", "MITIGATES", "RELATED"]),
}).strict();
export type IncidentCorrelateOperationRequest = z.infer<typeof IncidentCorrelateOperationRequestSchema>;

export const IncidentMitigateRequestSchema = IncidentMutationBaseSchema.extend({
  schema_version: z.literal("execution.incident-mitigate-request.v1"),
  mitigation_evidence_hash: IncidentHashSchema,
}).strict();
export type IncidentMitigateRequest = z.infer<typeof IncidentMitigateRequestSchema>;

export const IncidentResolveRequestSchema = IncidentMutationBaseSchema.extend({
  schema_version: z.literal("execution.incident-resolve-request.v1"),
  reason: SafeOperatorTextSchema(8, 2000),
  clean_dry_run_evidence_hash: IncidentHashSchema,
}).strict();
export type IncidentResolveRequest = z.infer<typeof IncidentResolveRequestSchema>;
