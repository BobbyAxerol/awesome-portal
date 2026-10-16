import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { pmCounter, unsignedDecimal, utcMilliseconds } from "./foundation.contract";
import { commandBusiness, type CommandIntent } from "./command.contract";

const text=z.string().min(1).max(256),digest=z.string().regex(/^sha256:[a-f0-9]{64}$/),pmDigest=z.string().regex(/^[a-f0-9]{64}$/);
/** Internal verified evidence, NEVER a body/header deserializer or public install API.
 * The adapter must authenticate issuer/audience/signature/mTLS, exact source scope,
 * current TS human AND workload leases through TS commit and canonical PM digest.
 * Portal's intent_hash is NOT PM's resolved-recipient/authority canonical digest. */
export const commandAuthorization=z.object({qualification:z.enum(["OWNER_VERIFIED","TEST_ONLY"]),
  reference:text,authority_ref:text,profile_ref:text,audience:z.literal("pma.management.v1"),
  actor_id:text,ts_user_id:text,workload_ref:text,delegation_ref:text,mapping_revision:text,membership_revision:text,
  membership_receipt_ref:text,workspace_id:text,environment:z.enum(["paper","sandbox","live"]),
  operation:text,resource_kind:text,resource_id:text,policy_revision:text,intent_hash:digest,
  source_intent_digest:pmDigest,expected_versions:z.record(pmCounter),
  issued_at_ms:utcMilliseconds,expires_at_ms:utcMilliseconds,idempotency_retained_until_ms:utcMilliseconds,
  approval_required:z.boolean(),
  required_approval_gate:z.enum(["R1","R2","CANARY","LIVE","CAPITAL"]).nullable(),
  commit_checks:z.object({human:z.literal(true),workload:z.literal(true),membership:z.literal(true),
    scope:z.literal(true),versions:z.literal(true),capacity:z.literal(true),approval:z.literal(true)}).strict(),
  approval:z.object({receipt_ref:text,intent_hash:digest,expires_at_ms:utcMilliseconds,
  policy_revision:text,gate:z.enum(["R1","R2","CANARY","LIVE","CAPITAL"])}).strict().nullable(),
  // Independent dimensions: no leverage=1x inference or budget-as-money conversion.
  r2_basis:z.object({economic_backing:unsignedDecimal,margin_risk_budget:unsignedDecimal,exposure_cap:unsignedDecimal,
    currency:text,source_receipt_ref:text}).strict().nullable()}).strict();
export type CommandAuthorization=z.infer<typeof commandAuthorization>;
export const sourceCommandResult=z.object({authority_ref:text,profile_ref:text,workspace_id:text,
  environment:z.enum(["paper","sandbox","live"]),operation:text,resource_kind:text,resource_id:text,
  idempotency_key:text,source_intent_digest:pmDigest,
  delivery:z.enum(["ACKNOWLEDGED","DELIVERY_UNKNOWN","FAILED_BEFORE_SEND"]),business:commandBusiness,
  projection:z.enum(["UNKNOWN","CURRENT","CATCHING_UP","STALE","UNAVAILABLE"]),
  venue:z.enum(["NOT_APPLICABLE","UNKNOWN","PENDING","ACKNOWLEDGED","FILLED","REJECTED"])}).strict();
export type SourceCommandResult=z.infer<typeof sourceCommandResult>;
export interface CommandTrust {
  /** No browser-controlled URL/profile/actor. Qualification is deployment-bound. */
  prepare(input:{actor:AccessActor;intent:CommandIntent;intent_hash:string;signal:AbortSignal}):Promise<CommandAuthorization|null>;
  /** Send once. Implement bounded timeout; thrown/ambiguous failures mean UNKNOWN, never retry. */
  send(input:{authorization:CommandAuthorization;intent:CommandIntent;signal:AbortSignal}):Promise<SourceCommandResult>;
  /** Authoritative same-key lookup only, NOT resend. Missing/expired receipt stays UNKNOWN.
   * Accepted recovery uses explicit service authority, independent of expired human login.
   * Current requester report rights are verified separately before public disclosure. */
  lookup(input:{authorization:CommandAuthorization;intent:CommandIntent;signal:AbortSignal}):Promise<SourceCommandResult|null>;
}
export const unqualifiedCommandTrust:CommandTrust={prepare:async()=>null,
  send:async()=>{throw new Error("COMMAND_RELAY_NOT_QUALIFIED");},lookup:async()=>null};
