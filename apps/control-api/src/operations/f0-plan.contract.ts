import { z } from "zod";
import { costImpact } from "../execution-v2/command.contract";

const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const operationId = z.string().regex(/^[A-Za-z0-9._:-]{1,191}$/);

/**
 * The F0 plan response `POST /api/v1/execution/commands/plans` actually sends (201), as a runtime
 * parser the service validates its own output with. BE-P13 found that the wire carried
 * `current_primitive` (null for every command but ops/emergency-close) while the published schema,
 * the canonical fixture and the strict consumer reader did not list it, so the served plan was not
 * schema-valid. It also adds `cost_impact` (FE-020): a plan carries no cost, fee or impact
 * estimate, and the client never computes one, so the only honest value is a typed absence.
 */
export const executionCommandPlanResponse = z.object({
  schema_version: z.literal("execution.command-plan.v1"),
  operation_id: operationId,
  command_type: z.literal("EXECUTION_COMMAND"),
  command_version: z.literal(1),
  command_key: z.string().min(3).max(128),
  risk_tier: z.enum(["R0_READ", "R1_PAPER_MUTATION", "R2_SANDBOX", "R3_LIVE_PROTECTIVE",
    "R4_LIVE_RISK_INCREASING", "UNCLASSIFIED", "BLOCKED"]),
  payload_hash: hash,
  plan_digest: hash,
  status: z.literal("BLOCKED"),
  blockers: z.array(z.string().min(1).max(128)).min(1).refine((values) => new Set(values).size === values.length),
  warnings: z.array(z.string().min(1).max(128)).refine((values) => new Set(values).size === values.length),
  apply_token: z.null(),
  expires_at: z.string().datetime(),
  payload_storage_policy: z.literal("HASH_ONLY_NO_RAW"),
  relay_capability: z.literal("DISABLED"),
  source_side_effect_requested: z.literal(false),
  current_primitive: z.union([z.null(), z.object({
    id: z.literal("live.emergency-close"),
    source_environment: z.literal("LIVE_FULL"),
    target_types: z.tuple([z.literal("ACCOUNT")]),
    runtime_active: z.literal(false),
    source_side_effect_requested: z.literal(false),
  }).strict()]),
  cost_impact: costImpact,
  replayed: z.boolean(),
}).strict();
export type ExecutionCommandPlanResponse = z.infer<typeof executionCommandPlanResponse>;
