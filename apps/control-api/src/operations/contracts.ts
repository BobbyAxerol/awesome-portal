import { z } from "zod";

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

export const ExecutionCommandPlanRequestSchema = z
  .object({
    schema_version: z.literal("execution.command-plan-request.v1"),
    workspace_id: z.string().min(3).max(96),
    request_key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/),
    command_type: z.literal("EXECUTION_COMMAND"),
    command_version: z.literal(1),
    command_key: z.string().regex(/^[a-z0-9-]+\/(?:[a-z0-9-]+|<root>)$/),
    environment: z.enum(["PAPER", "SANDBOX", "LIVE"]),
    target: z
      .object({
        type: z.enum(["ACCOUNT", "BROKER_BINDING", "DEPLOYMENT", "ORDER", "PORTFOLIO", "SYSTEM"]),
        id: z.string().regex(/^[A-Za-z0-9._:-]{1,191}$/),
      })
      .strict(),
    expected_target_version: z.number().int().positive(),
    payload: z.record(z.string(), z.unknown()).refine(
      (payload) => Object.keys(payload).length <= 64,
      "payload cannot exceed 64 properties",
    ),
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
