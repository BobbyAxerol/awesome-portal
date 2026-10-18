import { z } from "zod";
import { browserCapitalIntent, pmCounter, pmText, unsignedDecimal, utcMilliseconds } from "./foundation.contract";

const text=z.string().min(1).max(256);
export const commandIntent=browserCapitalIntent.superRefine((i,c)=>{
  const expected={ROOT:"ROOT",PORTFOLIO:"PORTFOLIO",DEPLOYMENT:"DEPLOYMENT_ACCOUNT"}[i.resource.kind];
  if(i.business_payload.recipient_kind!==expected||i.resource.kind==="DEPLOYMENT"&&i.business_payload.recipient_deployment_id!==i.resource.id)
    c.addIssue({code:z.ZodIssueCode.custom,message:"COMMAND_TARGET_MISMATCH",path:["business_payload"]});
});
export type CommandIntent=z.infer<typeof commandIntent>;
export const commandKey=z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/);
export const commandId=z.string().regex(/^ecm_[a-f0-9]{32}$/);
export const commandWorkspace=z.object({workspace_id:text}).strict();
export const commandSubmit=z.object({intent:commandIntent,preview_digest:z.string().regex(/^sha256:[a-f0-9]{64}$/)}).strict();
export const commandReasons=z.enum(["COMMAND_RELAY_NOT_QUALIFIED","COMMAND_OPERATION_NOT_QUALIFIED","COMMAND_CONTEXT_INVALID",
  "COMMAND_CONTEXT_EXPIRED","COMMAND_PREVIEW_CHANGED","COMMAND_IDEMPOTENCY_CONFLICT","COMMAND_RETRY_REQUIRED",
  "COMMAND_RESOURCE_NOT_FOUND","COMMAND_CAPACITY_EXCEEDED","COMMAND_STATUS_UNVERIFIED","COMMAND_APPROVAL_REQUIRED"]);
export type CommandReason=z.infer<typeof commandReasons>;
export class CommandError extends Error {
  constructor(readonly code:CommandReason,readonly status=409){super(code);}
}
export const commandAmounts=z.object({requested:unsignedDecimal,applied:unsignedDecimal,pending:unsignedDecimal,
  cancelled:unsignedDecimal,rejected:unsignedDecimal}).strict();
export const commandBusiness=z.object({state:z.enum(["UNKNOWN","APPLIED","PARTIALLY_APPLIED","WAITING_ENCUMBRANCE",
  "CANCELLED","PARTIALLY_APPLIED_CANCELLED","REJECTED"]),receipt_ref:text.nullable(),source_event_ref:text.nullable(),
  revision:pmCounter.nullable(),amounts:commandAmounts.nullable()}).strict();
export const commandStatus=z.object({schema_version:z.literal("portal.execution.command-status.v1"),command_id:commandId,
  operation:z.enum(["FUND","INITIAL_GRANT","TOP_UP","IMMEDIATE_DECREASE","RECALL_PARTIAL","RECALL_FULL","ADJUST_TARGET_BUDGET","SET_ROOT_LIMIT"]),
  resource:z.object({kind:z.enum(["ROOT","PORTFOLIO","DEPLOYMENT"]),id:text}).strict(),
  environment:z.enum(["paper","sandbox","live"]),profile_ref:text,
  delivery:z.enum(["PREPARED","SENDING","ACKNOWLEDGED","DELIVERY_UNKNOWN","FAILED_BEFORE_SEND"]),
  business:commandBusiness,projection:z.enum(["UNKNOWN","CURRENT","CATCHING_UP","STALE","UNAVAILABLE"]),
  venue:z.enum(["NOT_APPLICABLE","UNKNOWN","PENDING","ACKNOWLEDGED","FILLED","REJECTED"]),
  next_action:z.enum(["REVIEW_PREVIEW","QUERY_SAME_INTENT","REVIEW_RECEIPT","REVIEW_BLOCKER"]),
  created_at_ms:utcMilliseconds,updated_at_ms:utcMilliseconds,
  authority:z.enum(["OWNER_VERIFIED","TEST_ONLY"])}).strict();
export type CommandStatus=z.infer<typeof commandStatus>;
/** Public read/mutation projection only. Persisted commandStatus/events retain
 * their original closed grammar. Currency is the verified original intent's
 * unit, not a receipt guess, exchange quote, implicit USD or execution fact. */
export const publicCommandStatus=commandStatus.extend({currency:pmText});
export type PublicCommandStatus=z.infer<typeof publicCommandStatus>;
export const commandPreview=z.object({schema_version:z.literal("portal.execution.command-preview.v1"),
  allowed:z.boolean(),reason_code:commandReasons.nullable(),preview_digest:z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  expires_at_ms:utcMilliseconds.nullable(),profile_ref:text.nullable(),approval_required:z.boolean().nullable(),
  approval_gate:z.enum(["R1","R2","CANARY","LIVE","CAPITAL"]).nullable(),
  business_applied:z.literal(false),reserved:z.literal(false)}).strict();
