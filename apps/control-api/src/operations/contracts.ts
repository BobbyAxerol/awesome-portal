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
