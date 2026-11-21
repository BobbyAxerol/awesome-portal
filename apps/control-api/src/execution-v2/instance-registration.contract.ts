import { z } from "zod";
import { executionEnvironment, opaqueRevision, utcMilliseconds } from "./foundation.contract";
import { commandKey } from "./command.contract";
import { pmaInstanceRegistrationWireSchema } from "./pm-instance-registration-adapter";

/** Registry transport correlation only; the selected provider is source-dark
 * by default. Never financial/activation authority. */
const digest = z.string().regex(/^sha256:[a-f0-9]{64}(?![\s\S])/u);
// JS `$` accepts a position before a final line break. Registration uses a
// whole-value control/UTF-8 check, without changing older policy vocabularies.
const wholeText = (value: string) => !/[\u0000-\u001f\u007f]/u.test(value) &&
  Buffer.from(value, "utf8").toString("utf8") === value;
export const registrationText = z.string().min(1).regex(/^[^\u0000-\u001f\u007f]+(?![\s\S])/u)
  .refine(value => [...value].length <= 256 && wholeText(value), "REGISTRATION_TEXT_INVALID");
const exactCounter = /^(?:0|[1-9][0-9]{0,18})(?![\s\S])/u;
export const registrationCounter = z.string().regex(exactCounter)
  .refine(value => exactCounter.test(value) && BigInt(value) <= 9223372036854775807n, "PM_COUNTER_OVERFLOW");
export const instanceRegistrationBody = pmaInstanceRegistrationWireSchema.extend({
  idempotency_key: commandKey.refine(wholeText, "REGISTRATION_TEXT_INVALID"),
  expected_version: z.literal("0"),
  expected_policy_revision: registrationCounter,
  parameters: pmaInstanceRegistrationWireSchema.shape.parameters.extend({
    account_type: z.enum(["CASH", "MARGIN", "BETTING"]),
  }),
}).strict();
export const instanceRegistrationIntent = z.object({
  schema_version: z.literal("portal.execution.instance-registration-intent.v1"),
  workspace_id: registrationText,
  resource: z.object({ kind: z.literal("PORTFOLIO"), id: registrationText }).strict(),
  environment: executionEnvironment,
  expected_policy_revision: opaqueRevision.refine(wholeText, "REGISTRATION_TEXT_INVALID"),
  business_payload: instanceRegistrationBody,
}).strict();
export type InstanceRegistrationIntent = z.infer<typeof instanceRegistrationIntent>;
export const instanceRegistrationSubmit = z.object({
  intent: instanceRegistrationIntent, preview_digest: digest,
}).strict();
export const instanceRegistrationQuery = z.object({ workspace_id: registrationText }).strict();
export const instanceRegistrationId = z.string().regex(/^ecm_[a-f0-9]{32}(?![\s\S])/u);
export const instanceRegistrationReason = z.enum([
  "REGISTRATION_NOT_QUALIFIED", "REGISTRATION_CONTEXT_INVALID", "REGISTRATION_CONTEXT_EXPIRED",
  "REGISTRATION_PREVIEW_CHANGED", "REGISTRATION_IDEMPOTENCY_CONFLICT", "REGISTRATION_NOT_FOUND",
  "REGISTRATION_CAPACITY_EXCEEDED", "REGISTRATION_RECEIPT_UNVERIFIED", "REGISTRATION_UNAVAILABLE",
]);
export class InstanceRegistrationError extends Error {
  constructor(readonly code: z.infer<typeof instanceRegistrationReason>, readonly status = 409) { super(code); }
}
export const instanceRegistrationPreview = z.object({
  schema_version: z.literal("portal.execution.instance-registration-preview.v1"),
  operation: z.literal("REGISTER_INSTANCE"),
  allowed: z.boolean(), reason_code: instanceRegistrationReason.nullable(),
  preview_digest: digest.nullable(), expires_at_ms: utcMilliseconds.nullable(),
  profile_ref: registrationText.nullable(),
  business_applied: z.literal(false), reserved: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.allowed !== (value.reason_code === null && value.preview_digest !== null &&
    value.expires_at_ms !== null && value.profile_ref !== null) ||
    !value.allowed && (value.reason_code === null ||
      [value.preview_digest, value.expires_at_ms, value.profile_ref].some(field => field !== null)))
    context.addIssue({ code: z.ZodIssueCode.custom, message: "REGISTRATION_PREVIEW_INVALID" });
});
const receipt = z.object({
  kind: z.literal("PM_REGISTRY_RECEIPT"), key: registrationText,
  // The pinned REGISTER_INSTANCE expected_version0 produces generation1.
  // Do not accept a mismatched historical receipt as this registration.
  version: z.literal("1"),
}).strict();
export const instanceRegistrationStatus = z.object({
  schema_version: z.literal("portal.execution.instance-registration-status.v1"),
  family: z.literal("INSTANCE_REGISTRATION"), command_id: instanceRegistrationId,
  operation: z.literal("REGISTER_INSTANCE"), resource: instanceRegistrationIntent.shape.resource,
  environment: executionEnvironment, profile_ref: registrationText,
  delivery: z.enum(["PREPARED", "SENDING", "ACKNOWLEDGED", "DELIVERY_UNKNOWN", "FAILED_BEFORE_SEND"]),
  business: z.object({
    state: z.enum(["UNKNOWN", "APPLIED"]), business_applied: z.boolean().nullable(),
    receipt: receipt.nullable(), source_instance_ref: registrationText.nullable(),
  }).strict(),
  canonical_identity: z.object({ availability: z.literal("NOT_PUBLISHED"),
    reason_code: z.literal("SOURCE_CANONICAL_ACCOUNT_DEPLOYMENT_PAIR_NOT_PUBLISHED"),
    account_id: z.null(), deployment_id: z.null() }).strict(),
  projection: z.enum(["UNKNOWN", "CURRENT", "CATCHING_UP", "STALE", "UNAVAILABLE"]),
  venue: z.literal("NOT_APPLICABLE"),
  next_action: z.enum(["QUERY_SAME_INTENT", "REVIEW_RECEIPT", "REVIEW_BLOCKER"]),
  authority: z.enum(["OWNER_VERIFIED", "TEST_ONLY"]),
  created_at_ms: utcMilliseconds, updated_at_ms: utcMilliseconds,
}).strict().superRefine((value, context) => {
  const b = value.business;
  if (b.state === "UNKNOWN" ? b.business_applied !== null || b.receipt !== null || b.source_instance_ref !== null :
    b.business_applied !== true || b.receipt === null || b.source_instance_ref === null || value.delivery !== "ACKNOWLEDGED")
    context.addIssue({ code: z.ZodIssueCode.custom, message: "REGISTRATION_RECEIPT_REQUIRED" });
  if (value.updated_at_ms < value.created_at_ms ||
    ["PREPARED", "SENDING", "DELIVERY_UNKNOWN", "FAILED_BEFORE_SEND"].includes(value.delivery) && b.state !== "UNKNOWN")
    context.addIssue({ code: z.ZodIssueCode.custom, message: "REGISTRATION_STATUS_INVALID" });
});
export type InstanceRegistrationStatus = z.infer<typeof instanceRegistrationStatus>;
