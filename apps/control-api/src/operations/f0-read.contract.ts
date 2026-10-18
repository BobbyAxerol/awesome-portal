import { z } from "zod";
import { IdentifierSchema } from "./contracts";
import { EXECUTION_COMMAND_CATALOG } from "./catalog.generated";
import type { F0ReadCandidate } from "./operations.repository";
import type { AccessActor, AccessResource } from "../execution-v2/access.contract";
import type { AccessEnvironment } from "../execution-v2/access-current-relations";
import { CommandError } from "../execution-v2/command.contract";

export const f0ReadId = IdentifierSchema;
export const f0ReadQuery = z.object({ workspace_id: z.string().min(3).max(96) }).strict();

const codes = new Set<string>([
  ...EXECUTION_COMMAND_CATALOG.entries.map(entry => entry.blocked_reason),
  "COMMAND_RELAY_DISABLED", "OWNER_REVIEW_REQUIRED", "N16B_TARGET_SCOPE_UNSUPPORTED",
  "N16B_CURRENT_PRIMITIVE_PLAN_INVALID", "N16B_RUNTIME_ACTIVATION_PENDING",
]);
const keys = new Set<string>(EXECUTION_COMMAND_CATALOG.entries.map(entry => entry.key));
const code = z.string().min(1).max(128).refine(value => codes.has(value));
export const f0BlockedOperation = z.object({
  schema_version: z.literal("execution.command-operation.v1"), operation_id: f0ReadId,
  command_type: z.literal("EXECUTION_COMMAND"), command_key: z.string().min(3).max(128).refine(value => keys.has(value)),
  status: z.literal("BLOCKED"), verification_result: z.literal("NOT_STARTED"),
  blockers: z.array(code).min(1).max(3).refine(values => new Set(values).size === values.length && values.includes("COMMAND_RELAY_DISABLED")),
  warnings: z.array(z.never()).max(0), relay_receipt: z.null(), source_side_effect_requested: z.literal(false),
  created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict().refine(value => Date.parse(value.created_at) >= 0
  && Date.parse(value.updated_at) >= Date.parse(value.created_at));
export type F0BlockedOperation = z.infer<typeof f0BlockedOperation>;
export type F0ReadTarget = { resource: AccessResource; environment: AccessEnvironment };

/** Stored target is a requested label, never an original TS attestation.
 * Only narrow identity/target is decoded before current read authorization;
 * unrelated private/public corruption cannot make a hidden record a503 oracle.
 */
export function f0ReadTarget(row: F0ReadCandidate, actor: AccessActor, workspace: string, id: string): F0ReadTarget {
  const absent = (): never => { throw new CommandError("COMMAND_RESOURCE_NOT_FOUND", 404); };
  if (row.operation_id !== id || row.workspace_id !== workspace || row.actor_user_id !== actor.user_id) return absent();
  const targetId = IdentifierSchema.safeParse(row.target_id);
  if (!targetId.success) return absent();
  const kind = row.target_type;
  if (kind !== "ACCOUNT" && kind !== "PORTFOLIO" && kind !== "DEPLOYMENT") return absent();
  const environment = row.environment === "PAPER" ? "paper" : row.environment === "SANDBOX" ? "sandbox" :
    row.environment === "LIVE" ? "live" : null;
  if (!environment) return absent();
  return { resource: { kind, id: targetId.data }, environment };
}

/** Called ONLY after exact current audit authority. Refuse corrupt historical
 * codes instead of recomputing/replacing them from today's catalogue.
 */
export function f0ReadRecord(row: F0ReadCandidate): F0BlockedOperation {
  const bad = (): never => { throw new CommandError("COMMAND_STATUS_UNVERIFIED", 503); };
  const date = (value: unknown) => value instanceof Date && Number.isFinite(value.getTime())
    && value.getTime() >= 0 ? value.toISOString() : null;
  const parsed = f0BlockedOperation.safeParse({
    schema_version: "execution.command-operation.v1", operation_id: row.operation_id,
    command_type: "EXECUTION_COMMAND", command_key: row.command_key, status: row.status,
    verification_result: "NOT_STARTED", blockers: row.blocker_codes, warnings: row.warning_codes,
    relay_receipt: null, source_side_effect_requested: false,
    created_at: date(row.created_at), updated_at: date(row.updated_at),
  });
  return parsed.success ? parsed.data : bad();
}
