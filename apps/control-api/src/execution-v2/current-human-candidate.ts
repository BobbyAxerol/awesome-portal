import { createHash, randomUUID } from "node:crypto";
import { ServerResponse } from "node:http";
import { Socket } from "node:net";
import { types } from "node:util";
import { exportJWK, importJWK, jwtVerify, SignJWT, type KeyLike } from "jose";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { withTransaction } from "../db/pool";
import type { AccessActor } from "./access.contract";
import { accessDigest } from "./access-policy";
import { RestoreIndependentCustodyCandidate } from "./restore-independent-custody-candidate";
import {appendCustodiedOriginal} from "./c2-custody-append-contention";
import {C2CustodyPendingError} from "./c2-custody-pending-error";
import { captureCurrentHumanSnapshot, evaluateManagerDomainRead, lockCurrentHumanSnapshot } from "./current-human-snapshot";
import { currentHumanDrainCounts } from "./current-human-drain-counts";
import {C2P7IssuerFenceCandidate} from "./c2-p7-issuer-fence-candidate";
import { SelectedNativeBusinessReadSource, selectedNativeBusinessReadSelection, selectedNativeBusinessReadObservation,
  selectedNativeBusinessReadInstallationExpiresAtMs,
  type VerifiedSelectedNativeReadObservation, type VerifiedSelectedNativeReadView } from "./native-business-read-selected-source";
import { pmHttpRequestDigest, type PmHttpRequestBytes, type PmHttpRequestBounds } from "./pm-http-request-binding";
import { NativeReadEgress, type NativeReadEgressLimits, type NativeReadEgressObservation, type NativeReadEgressReservation,
  type NativeReadEgressWitness, type HeldNativeReadEgressPermit } from "./native-read-egress";
import { nativeBusinessReadTransportRequest, nativeBusinessReadUtcMicroseconds,
  prepareNativeBusinessReadRequest, type NativeBusinessReadAction, type NativeBusinessReadBase } from "./native-business-read-codec";
import { nativeExecutionNoticeView, revalidateNativeExecutionNotice, assertNativeExecutionNoticeCurrent,
  type PreparedExecutionNativeNotice } from "./read-scope";
import { NativeFrameSettlement, type NativeFrameSettlementTarget, type NativeFrameSettlementProof } from "./native-frame-settlement";
import type { NativeReadEgressStream, NativeReadEgressFrameReservation, NativeReadEgressFrameWitness,
  NativeReadFrameObservation, HeldNativeReadFrameEgressPermit } from "./native-read-egress";

// Capture the implementation, not a mutable prototype lookup supplied during
// an issuance. The witness and its key remain independently pinned below.
const c2P7CheckLocked=C2P7IssuerFenceCandidate.prototype.checkLocked;
const c2P7CheckAuthenticated=C2P7IssuerFenceCandidate.prototype.checkAuthenticatedLocked;
const c2P7ConfirmationKey=C2P7IssuerFenceCandidate.prototype.confirmationKeySha256;
const c2P7BindingDigest=C2P7IssuerFenceCandidate.prototype.bindingDigest;
const id = z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$/).refine(value => value === value.trim());
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().length(71).regex(/^sha256:[a-f0-9]{64}$/);
export const currentHumanBinding = z.object({ workspace_id: id, environment: z.enum(["paper", "sandbox", "live"]),
  workload_id: id, request_digest: digest }).strict();
export type CurrentHumanBinding = z.infer<typeof currentHumanBinding>;
/** Private digest and public nonce correlation supplied by the STATUS authority, not a
 * browser grant, source terminal or proof that Edge received a response. */
const commandStatusContextLink = z.object({ context_digest: digest, context_nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$(?![\s\S])/), original_digest: digest, call_digest: digest,
  binding_digest: digest, authority_fingerprint: digest, status_token_digest: digest, status_request_digest: digest,
  status_issued_at_ms: z.number().int().nonnegative().safe(),
  receiver_id: z.string().min(1).max(256).regex(/^[^\u0000-\u0020\u007f]+$(?![\s\S])/),
  delivery_sequence: z.number().int().min(0).max(63), previous_lease_id: id.nullable(),
  context_expires_at_ms: z.number().int().positive().safe() }).strict()
  .refine(value => value.delivery_sequence === 0 ? value.previous_lease_id === null : value.previous_lease_id !== null)
  .refine(value => value.status_issued_at_ms < value.context_expires_at_ms);
export type CommandStatusContextLink = z.infer<typeof commandStatusContextLink>;
/** SOURCE ONLY: durable financial correlation is not itself authority. */
const c2FinancialOriginalLink=z.object({context_digest:digest,receiver_id:id,binding_digest:digest,
  expires_at_ms:z.number().int().positive().safe()}).strict();
export type C2FinancialOriginalLink=z.infer<typeof c2FinancialOriginalLink>;
const humanClaims = z.object({ iss: id, aud: id, sub: id, sid: id, jti: id, iat: integer, nbf: integer, exp: integer,
  purpose: z.literal("pma.identity.v1"), principal_kind: z.literal("human"), session_revision: integer,
  authority_revision: integer, workspace_id: id, environment: z.enum(["paper", "sandbox", "live"]),
  workload_id: id, request_digest: digest }).strict();
const sourceAttestation = z.object({ iss: id, aud: id, sub: id, jti: id, iat: integer, nbf: integer, exp: integer,
  purpose: z.literal("pma.current-human-lease.v1"), lease_id: id, attempt_id: id,
  workspace_id: id, environment: z.enum(["paper", "sandbox", "live"]), workload_id: id, request_digest: digest,
  phase: z.enum(["ENTER", "COMMITTED", "ROLLED_BACK", "UNKNOWN"]),
  source_receipt_id: id.nullable(), source_receipt_digest: digest.nullable(),
}).strict().refine(v => ["COMMITTED", "ROLLED_BACK"].includes(v.phase)
  ? v.source_receipt_id !== null && v.source_receipt_digest !== null
  : v.source_receipt_id === null && v.source_receipt_digest === null, "SOURCE_RECEIPT_REQUIRED");

export class CurrentHumanLeaseError extends Error {
  constructor(readonly code: string) { super("The current identity operation is not available."); }
}
export interface CurrentHumanCandidateConfig {
  issuer: string; audience: string; key_id: string; private_key: KeyLike;
  source: { issuer: string; audience: string; key_id: string; public_key: KeyLike; workload_id: string };
  /** Explicit correctness-cell limits, not approved production budgets. */
  limits: { ttl_ms: number; maximum_unresolved: number; maximum_retained: number };
  /** Required by selected private installations. Legacy unmounted correctness
   * constructors stay compatible; this does not make them installed authority.
   * Expiry stops new issue/ENTER, NEVER clears an ENTERED/UNKNOWN obligation. */
  installation_scope?: { workspace_id: string; environment: "paper"; valid_until_ms: number };
  /** Private deployment pin, never an HTTP parameter. Once C2 delivery is
   * selected, an older snapshot without its schema must not clear a drain. */
  c2_delivery_schema_required?: true;
  /** Independently provisioned SPKI digest for owner confirmation. Never
   * derive this from the request, P7 witness, or the writable application DB. */
  c2_owner_confirmation_spki_sha256?: string;
  /** Optional CUSTODY selection only, never a read permit or runtime flag. */
  native_read_custody?: CurrentHumanNativeReadSelection;
}
export interface CurrentHumanNativeReadSelection {
  workspace_id: string; environment: "paper" | "sandbox" | "live";
  domain: { profile_id: string; catalogue_sha256: string; profile_sha256: string; field_policy_sha256: string };
  source_identity_digest: string;
}
type NativeFiniteBase={schema_version:"pma.native-business-read.request.v1";binding:{
  lease_id:string;attempt_id:string;human_issuer:string;subject:string;workspace_id:string;
  environment:"paper"|"sandbox"|"live";workload_id:string;request_digest:string;operation:"READ"};
  domain:CurrentHumanNativeReadSelection["domain"];manager_intent:{schema_version:"pma.manager-read-intent.v1";
    action:"catalogue"|"capabilities"|"relation_page"|"relation_record"|"projection_page";digest:string};deadline:string};
type NativeFrameBase=Omit<NativeFiniteBase,"manager_intent"> & {
  manager_intent:Extract<NativeBusinessReadBase["manager_intent"],{schema_version:"pma.manager-read-intent.v2"}> };
type NativeBase=NativeFiniteBase|NativeFrameBase;
type NativeRow = Row & { attempt_id: string; authority_fingerprint: string; base_body: string;
  stable_core_digest: string; binding_digest: string; source_identity_digest: string; phase: NativeHTTPPhase; lifecycle_kind:"CUSTODY_ONLY"|"MANAGER_HTTP"|"MANAGER_SSE_FRAME" };
export interface CurrentHumanNativeReadRecoveryAttempt {
  readonly family: "NATIVE_READ"; readonly lease_id: string; readonly attempt_id: string;
  readonly base_body: string; readonly stable_core_digest: string; readonly binding_digest: string;
  readonly source_identity_digest: string; readonly authority_fingerprint: string;
  readonly subject_id: string; readonly session_id: string; readonly session_revision: number;
  readonly authority_revision: number; readonly expires_at_ms: number; readonly phase: NativeHTTPPhase;
  readonly lifecycle_kind?:"MANAGER_HTTP"|"MANAGER_SSE_FRAME";
}
function nativeAnyBase(input:unknown) {
  const prepared=prepareNativeBusinessReadRequest("status",input,{request_bytes:32768,response_bytes:32768});
  const wire=nativeBusinessReadTransportRequest(prepared);
  return{prepared,body:wire.body,base:JSON.parse(wire.body) as NativeBase};
}
function nativeBase(input: unknown) {
  const captured=nativeAnyBase(input);
  // Preserve finite HTTP/CUSTODY's explicit rejection BEFORE admission/sign/send.
  if(captured.base.manager_intent.schema_version!=="pma.manager-read-intent.v1")
    throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_FRAME_LIFECYCLE_REQUIRED");
  return {...captured,base:captured.base as NativeFiniteBase};
}
/** PM checks original Base deadline <= identity JWT expiry. The smallest
 * representable second must fit independent authority ceilings; the finite
 * send timer remains separately floored and may be shorter after ISSUE. */
function nativeIdentityExpiry(deadline: string): { seconds: number; ms: number } {
  const seconds = (nativeBusinessReadUtcMicroseconds(deadline) + 999999n) / 1000000n;
  if (seconds < 1n || seconds * 1000n > BigInt(Number.MAX_SAFE_INTEGER))
    throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_DEADLINE_INVALID");
  return { seconds: Number(seconds), ms: Number(seconds * 1000n) };
}
function nativeOwn(value: unknown, wanted: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || types.isProxy(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
    throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
  const keys = Reflect.ownKeys(value), data: Record<string, unknown> = Object.create(null);
  if (keys.length !== wanted.length || keys.some(k => typeof k !== "string" || !wanted.includes(k)))
    throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
  for (const key of wanted) {
    const p = Object.getOwnPropertyDescriptor(value, key);
    if (!p || !p.enumerable || !Object.hasOwn(p, "value")) throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    data[key] = p.value;
  }
  return data;
}
function nativeActor(value: AccessActor): AccessActor {
  const data = nativeOwn(value, ["user_id", "session_id", "session_generation"]);
  return { user_id: id.parse(data.user_id), session_id: id.parse(data.session_id),
    session_generation: integer.parse(data.session_generation) };
}
function nativeSelection(value: CurrentHumanNativeReadSelection, issuer: string, workload: string): CurrentHumanNativeReadSelection {
  const data = nativeOwn(value, ["workspace_id", "environment", "domain", "source_identity_digest"]);
  const captured = nativeBase({ schema_version: "pma.native-business-read.request.v1",
    binding: { lease_id: "00000000-0000-0000-0000-000000000000", attempt_id: "00000000-0000-0000-0000-000000000000",
      human_issuer: issuer, subject: "CUSTODY_SELECTION_NOT_AUTHORITY", workspace_id: data.workspace_id,
      environment: data.environment, workload_id: workload, request_digest: "0".repeat(64), operation: "READ" },
    domain: data.domain, manager_intent: { schema_version: "pma.manager-read-intent.v1", action: "catalogue", digest: "0".repeat(64) },
    deadline: "2000-01-01T00:00:00Z" }).base;
  return Object.freeze({ workspace_id: captured.binding.workspace_id, environment: captured.binding.environment,
    domain: Object.freeze(captured.domain), source_identity_digest: digest.parse(data.source_identity_digest) });
}

/** Opt-in finite Manager delivery; never a reverse signer or an app grant. */
export interface CurrentHumanNativeHTTPConfig {
  issuer:string; audience:string; key_id:string; private_key:KeyLike;
  selected_source:SelectedNativeBusinessReadSource;
  limits:CurrentHumanCandidateConfig["limits"];
  installation_scope:{workspace_id:string;environment:"paper"|"sandbox"|"live";valid_until_ms:number};
  terminal:{issuer:string;audience:string;key_id:string;private_key:KeyLike;ttl_seconds:number};
  egress:NativeReadEgressLimits;
}
type NativeHTTPRuntimeConfig=CurrentHumanNativeHTTPConfig & {
  workload_id:string;selection:CurrentHumanNativeReadSelection;
};
/** Capture the exact peer wrapper methods once. Its WeakMap accessor remains
 * the only selected-source identity/authenticated-response authority. */
const selectedMethods=Object.freeze({
  issue:SelectedNativeBusinessReadSource.prototype.issue,
  enter:SelectedNativeBusinessReadSource.prototype.enter,
  unknown:SelectedNativeBusinessReadSource.prototype.unknown,
  status:SelectedNativeBusinessReadSource.prototype.status,
  "cancel-unentered":SelectedNativeBusinessReadSource.prototype.cancelUnentered,
  resolve:SelectedNativeBusinessReadSource.prototype.resolve,
});
type CandidateRuntimeConfig=Omit<CurrentHumanCandidateConfig,"source"|"installation_scope"> & {
  source?:CurrentHumanCandidateConfig["source"];
  installation_scope?:CurrentHumanNativeHTTPConfig["installation_scope"];
};
type NativeHTTPPhase="ADMITTED"|"SENDING"|"UNKNOWN"|"SERVED"|"ABORTED"|"CANCELLED";
type NativeHTTPRow=Omit<NativeRow,"phase"> & {
  lifecycle_kind:"MANAGER_HTTP"|"MANAGER_SSE_FRAME";phase:NativeHTTPPhase;sender_id:string;scope_digest:string;no_send_fenced:boolean;
  frame_domain_scope_digest:string|null;frame_notice_scope_digest:string|null;
  native_source_digest:string|null;native_source_fingerprint:string|null;native_valid_until_ms:string|null;
  issue_response_digest:string|null;enter_response_digest:string|null;status_response_digest:string|null;
  body_digest:string|null;receipt_id:string|null;receipt_digest:string|null;terminal_reason:string|null;
  source_reconciled:boolean;source_ack_action:"cancel-unentered"|"resolve"|null;source_ack_digest:string|null;
};
declare const nativeHTTPBrand:unique symbol;
export type PreparedCurrentHumanNativeHTTP=Readonly<{readonly[nativeHTTPBrand]:true}>;
declare const nativeFrameBrand:unique symbol;
export type PreparedCurrentHumanNativeFrame=Readonly<{readonly[nativeFrameBrand]:true}>;
type NativeHandle=PreparedCurrentHumanNativeHTTP|PreparedCurrentHumanNativeFrame;
type NativeFrameState={notice:PreparedExecutionNativeNotice;stream:NativeReadEgressStream;
  domain_scope_digest:string;notice_scope_digest:string;payload:Buffer;
  reservation?:NativeReadEgressFrameReservation;permit?:HeldNativeReadFrameEgressPermit;
  target?:NativeFrameSettlementTarget};
type NativeHTTPState={actor:AccessActor;context:NativeBase;base_body:string;binding_digest:string;stable_core_digest:string;
  scope_digest:string;valid_until_ms:number;source_digest?:string;source_fingerprint?:string;
  source_entered:boolean;sending:boolean;settled:boolean;response?:ServerResponse;
  reservation?:NativeReadEgressReservation;permit?:HeldNativeReadEgressPermit;body_digest?:string;
  observation?:NativeReadEgressObservation|NativeReadFrameObservation;frame?:NativeFrameState};
export type NativeHTTPRecovery=
  {state:"UNKNOWN"|"UNSENT_FENCED"|"RECONCILED";context:NativeBase}|
  {state:"TERMINAL";phase:"SERVED"|"ABORTED";context:NativeBase;terminal:string};

type Row = { lease_id: string; authority_revision: string; human_issuer: string | null; human_signing_key_digest: string | null; human_assertion_digest: string | null; c2_custody_binding_digest: string | null; c2_p7_binding_digest:string|null; c2_p7_owner_intent_id:string|null; c2_financial_context_digest?:string|null; source_trust_digest: string | null; subject_id: string; session_id: string; session_revision: string;
  workspace_id: string; environment: "paper" | "sandbox" | "live"; workload_id: string; request_digest: string;
  issued_at_ms: string; expires_at_ms: string; phase: string; attempt_id: string | null; terminal_receipt_digest: string | null };

const custodyUsesSourcePool = RestoreIndependentCustodyCandidate.prototype.usesSourcePool;
const custodyInventory = RestoreIndependentCustodyCandidate.prototype.inventory;
const custodyVerifyRetainedProof = RestoreIndependentCustodyCandidate.prototype.verifyRetainedSourceProof;
const custodyBindingDigest = RestoreIndependentCustodyCandidate.prototype.bindingDigest;
const custodyHasVault = RestoreIndependentCustodyCandidate.prototype.hasSourceProofVault;
const custodyHasAuthenticatedJournal = RestoreIndependentCustodyCandidate.prototype.hasAuthenticatedJournal;
const custodyPreflight = RestoreIndependentCustodyCandidate.prototype.preflightOriginal;
const terminalSemanticDigest = (value: Record<string, unknown>): string => {
  const { jti: _jti, iat: _iat, nbf: _nbf, exp: _exp, ...semantic } = value;
  return accessDigest(semantic);
};

/** Candidate fence only: a scope row is not sufficient once its underlying
 * registration expires or no longer matches the current authority revision.
 * The caller already holds the authority lock; retain both row locks until the
 * surrounding transaction ends. This is not P7/source qualification. */
async function lockCurrentC2Registration(db:PoolClient, workspace:string, owner:string, workload:string,
  revision:string):Promise<number> {
  const installed=(await db.query(`SELECT to_regclass('elp210_c2_fence_candidate.scopes') IS NOT NULL
    AND to_regclass('elp210_c2_p7_candidate.registrations') IS NOT NULL AS installed`)).rows[0]?.installed;
  if(installed!==true)throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FENCE_REQUIRED");
  const fence=await db.query(`SELECT s.state AS scope_state,r.state AS registration_state,
    r.authority_revision::text AS registration_revision,r.expires_at_ms::text AS expires_at_ms,
    floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now_ms
    FROM elp210_c2_fence_candidate.scopes s JOIN elp210_c2_p7_candidate.registrations r
      ON r.registration_key=s.registration_key AND r.registration_sha256=s.registration_sha256
      AND r.workspace_id=s.workspace_id AND r.owner_user_id=s.owner_user_id
    WHERE s.workspace_id=$1 AND s.owner_user_id=$2 AND s.workload_id=$3 FOR SHARE OF s,r`,
  [workspace,owner,workload]);
  const row=fence.rows[0],expires=Number(row?.expires_at_ms),now=Number(row?.now_ms);
  if(fence.rowCount!==1||row?.scope_state!=="OPEN"||row.registration_state!=="ACTIVE"||
    row.registration_revision!==String(revision)||!Number.isSafeInteger(expires)||!Number.isSafeInteger(now)||now>=expires)
    throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FENCE_REQUIRED");
  return expires;
}

/** UNMOUNTED internal candidate; no HTTP routes/DI registration/config defaults.
 * Requires its explicit isolated SQL installer and injected Ed25519 trust. JWTs
 * are human identity, NEVER workload credentials or TS economic permissions.
 * All Core transactions end before token signing or source/network I/O. */
export class CurrentHumanCandidate {
  private nativeHTTP?:Readonly<NativeHTTPRuntimeConfig>;
  private nativeEgress?:NativeReadEgress;
  #nativeFrameSettlement?:NativeFrameSettlement;
  #nativeFrameBusy=new WeakMap<object,boolean>();
  private readonly nativeSenderId=randomUUID();
  private readonly nativeHandles=new WeakMap<object,NativeHTTPState>();
  private readonly nativeById=new Map<string,NativeHTTPState>();
  readonly #pool:Pool;
  readonly #config:CandidateRuntimeConfig;
  readonly #humanPublicKey:KeyLike;
  readonly #reverseTrustDigest?:string;
  readonly #humanSigningKeyDigest?:string;
  private constructor(pool:Pool,config:CandidateRuntimeConfig,humanPublicKey:KeyLike,
    reverseTrustDigest?:string,humanSigningKeyDigest?:string) {
    this.#pool=pool;this.#config=config;this.#humanPublicKey=humanPublicKey;
    this.#reverseTrustDigest=reverseTrustDigest;this.#humanSigningKeyDigest=humanSigningKeyDigest;
  }

  /** The writer coordinator must share this exact bounded Core pool. */
  usesPool(pool: Pool): boolean { return pool === this.#pool; }
  requiresC2DeliverySchema():boolean { return this.#config.c2_delivery_schema_required===true; }
  /** Compare against the configured source, without exposing its trust material. */
  matchesCommandStatusWorkload(workload:string):boolean {
    return this.#config.c2_delivery_schema_required===true && this.reverseSource().workload_id===workload;
  }
  /** Configuration identity only; this does not grant access or extend expiry. */
  matchesC2Installation(workspace:string,workload:string):boolean {
    const selected=this.#config.installation_scope;
    return this.#config.c2_delivery_schema_required===true && !!selected &&
      selected.environment==="paper" && selected.workspace_id===workspace &&
      this.reverseSource().workload_id===workload;
  }
  /** A custody writer for this candidate must read the exact same Core pool;
   * a different pool or DSN is not evidence of the same source original. */
  usesCustodySource(custody: RestoreIndependentCustodyCandidate): boolean {
    return !!custody && Object.getPrototypeOf(custody) === RestoreIndependentCustodyCandidate.prototype &&
      custodyUsesSourcePool.call(custody, this.#pool);
  }
  /** Exact registered TS proof key and identifiers; NULL legacy pins cannot be
   * inferred from today's source config. A future successor needs an audited
   * delegation/rotation protocol rather than treating the same workload as proof. */
  matchesReverseTrust(value: unknown): boolean {
    return typeof value === "string" && value === this.#reverseTrustDigest && digest.safeParse(value).success;
  }
  /** Only admission/revalidation needs the original human signing key. Source
   * settlement of an already-entered original must not depend on key rotation. */
  private matchesHumanSigningKey(value: unknown): boolean {
    return typeof value === "string" && value === this.#humanSigningKeyDigest && digest.safeParse(value).success;
  }

  static async create(pool: Pool, input: CurrentHumanCandidateConfig) {
    if ([pool.options.connectionTimeoutMillis, pool.options.query_timeout]
      .some(n => !Number.isSafeInteger(n) || Number(n) < 1 || Number(n) > 60_000))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_POOL_TIMEOUT_REQUIRED");
    const config = { ...input, source: { ...input.source }, limits: { ...input.limits },
      installation_scope: input.installation_scope ? { ...input.installation_scope } : undefined,
      native_read_custody: input.native_read_custody
        ? nativeSelection(input.native_read_custody, input.issuer, input.source.workload_id) : undefined };
    if(config.c2_delivery_schema_required!==undefined&&config.c2_delivery_schema_required!==true)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID");
    if(config.c2_owner_confirmation_spki_sha256!==undefined&&
      !/^[a-f0-9]{64}$/.test(config.c2_owner_confirmation_spki_sha256))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_AUTHORITY_INVALID");
    if (config.installation_scope) {
      const scope = config.installation_scope;
      if (!id.safeParse(scope.workspace_id).success || scope.environment !== "paper"
        || !Number.isSafeInteger(scope.valid_until_ms) || scope.valid_until_ms < 1)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID");
      Object.freeze(scope);
    }
    // Expired SAME-key installations remain constructible for authenticated
    // recovery of persisted source attempts. Fresh issue/ENTER still check
    // installation freshness before admission and under the authority lock.
    // Expiry never proves a held source transaction rolled back.
    for (const value of [config.issuer, config.audience, config.key_id, config.source.issuer,
      config.source.audience, config.source.key_id, config.source.workload_id]) id.parse(value);
    const { ttl_ms, maximum_unresolved, maximum_retained } = config.limits;
    if (![ttl_ms, maximum_unresolved, maximum_retained].every(Number.isSafeInteger)
      || ttl_ms < 1000 || ttl_ms > 60_000 || maximum_unresolved < 1 || maximum_unresolved > 128
      || maximum_retained < maximum_unresolved || maximum_retained > 4096)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_LIMITS_INVALID");
    const own = await exportJWK(config.private_key), source = await exportJWK(config.source.public_key);
    if (own.kty !== "OKP" || own.crv !== "Ed25519" || !own.d || typeof own.x !== "string"
      || source.kty !== "OKP" || source.crv !== "Ed25519" || source.d || typeof source.x !== "string")
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_ED25519_TRUST_REQUIRED");
    const reverseTrustDigest = accessDigest({ domain:"portal.c2-reverse-source-trust.v1", issuer:config.source.issuer,
      audience:config.source.audience, key_id:config.source.key_id, workload_id:config.source.workload_id,
      public_key:{kty:source.kty,crv:source.crv,x:source.x} });
    const humanSigningKeyDigest = accessDigest({domain:"portal.c2-human-signing-key.v1",issuer:config.issuer,
      audience:config.audience,key_id:config.key_id,public_key:{kty:own.kty,crv:own.crv,x:own.x}});
    Object.freeze(config.source);
    Object.freeze(config.limits);
    Object.freeze(config);
    const { d: _secret, ...publicJwk } = own;
    const publicKey = await importJWK(publicJwk, "EdDSA");
    if (publicKey instanceof Uint8Array) throw new CurrentHumanLeaseError("CURRENT_HUMAN_ED25519_TRUST_REQUIRED");
    return new CurrentHumanCandidate(pool, config, publicKey, reverseTrustDigest, humanSigningKeyDigest);
  }

  private async transaction<T>(fn: (db: PoolClient, authority: { revision: string; drain_id: string | null }) => Promise<T>,
    boundIdleTransaction = false) {
    return withTransaction(this.#pool, async db => {
      // PostgreSQL can terminate an idle-in-transaction session while this
      // process awaits the independent custody store. Consume that client's
      // error event until the callback unwinds: the subsequent source query or
      // COMMIT must still fail and withTransaction discards the broken client.
      const onIdleTransactionError = () => {};
      if(boundIdleTransaction)db.on("error",onIdleTransactionError);
      try {
      if(this.nativeHTTP)await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      if(boundIdleTransaction)await db.query("SET LOCAL idle_in_transaction_session_timeout='2000ms'");
      // Lazy fail-closed structural preflight: constructors stay zero-DB, and
      // an old installer may NEVER silently count legacy rows alone.
      const schema = (await db.query(`SELECT to_regclass('elp210_candidate.authority') IS NOT NULL
        AND to_regclass('elp210_candidate.obligations') IS NOT NULL
        AND to_regclass('elp210_candidate.native_read_obligations') IS NOT NULL
        AND to_regclass('elp210_candidate.native_read_events') IS NOT NULL AS installed`)).rows[0];
      if (schema?.installed !== true) throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SCHEMA_NOT_INSTALLED");
      const authority = (await db.query("SELECT revision,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE")).rows[0];
      if (!authority) throw new CurrentHumanLeaseError("CURRENT_HUMAN_CANDIDATE_NOT_INSTALLED");
      return await fn(db, authority);
      } finally {if(boundIdleTransaction)db.removeListener("error",onIdleTransactionError);}
    });
  }

  async issue(actor: AccessActor, untrustedBinding: CurrentHumanBinding): Promise<{ token: string; lease_id: string; expires_at_ms: number; authority_revision: number }> {
    return this.#issueBound(actor, untrustedBinding, false);
  }

  /** C2 internal preparation only; NEVER mount this as a generic signer. The
   * caller still needs an independently accepted P7 request scope, exact
   * native delivery custody and authorised owner session. Here we hash the
   * request bytes ourselves and fence a repeated original durably. The latter
   * stays closed even after a terminal: until a C2-specific delivery ACK and
   * restart recovery exist, source terminal/expiry cannot authorize reissue. */
  async issueC2ProtectedOwner(actor: AccessActor, expectedOwner: string, request: PmHttpRequestBytes,
    bounds: PmHttpRequestBounds, custodyBinding?: string,p7?:C2P7IssuerFenceCandidate,custody?:RestoreIndependentCustodyCandidate,
    financialOriginal?:C2FinancialOriginalLink): Promise<{ token: string; lease_id: string; expires_at_ms: number; authority_revision: number }> {
    if(this.#config.c2_delivery_schema_required===true&&p7===undefined)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
    const owner = id.parse(expectedOwner), selected = this.#config.installation_scope, capturedActor = nativeActor(actor);
    if (!selected || selected.environment !== "paper" || capturedActor.user_id !== owner)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_OWNER_REQUIRED");
    const request_digest = pmHttpRequestDigest(request, bounds);
    const binding: CurrentHumanBinding = { workspace_id: selected.workspace_id, environment: "paper",
      workload_id: this.reverseSource().workload_id, request_digest };
    if (custodyBinding !== undefined) digest.parse(custodyBinding);
    if(this.#config.c2_delivery_schema_required===true) {
      this.#requireC2Custody(custody,custodyBinding);
      // New C2 assertions cannot start on a journal where a DB writer can
      // fabricate an unkeyed chain. A separately qualified key, external
      // monotonic witness and restore barrier are still required before mount.
      // Resume/terminal settlement deliberately remains bound to its exact
      // original, including a legacy original, rather than being discarded.
      if(!custodyHasAuthenticatedJournal.call(custody!))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_CUSTODY_REQUIRED");
      await custodyPreflight.call(custody!);
    }
    if(financialOriginal!==undefined&&(this.#config.c2_delivery_schema_required!==true||!p7||!custody))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_CUSTODY_REQUIRED");
    const issued = await this.#issueBound(capturedActor, binding, false, undefined, owner, custodyBinding,p7,financialOriginal);
    if(this.#config.c2_delivery_schema_required===true) {
      try {
        await appendCustodiedOriginal(custody!,"ISSUED_HUMAN_ASSERTION",issued.lease_id,issued.token);
        await this.#revalidateBoundIssue(capturedActor,binding,issued,owner,custodyBinding,p7,undefined,financialOriginal);
      } catch {throw new C2CustodyPendingError(issued.lease_id);}
    } else await this.#revalidateBoundIssue(capturedActor, binding, issued, owner, custodyBinding,p7);
    return issued;
  }

  #requireC2Custody(custody:RestoreIndependentCustodyCandidate|undefined,binding:string|undefined):void {
    if(!custody||Object.getPrototypeOf(custody)!==RestoreIndependentCustodyCandidate.prototype||
      !custodyUsesSourcePool.call(custody,this.#pool)||!custodyHasVault.call(custody)||
      !binding||custodyBindingDigest.call(custody)!==binding)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_CUSTODY_REQUIRED");
  }

  /** Recreate the same C2 assertion after a lost process/response. This never
   * issues a new lease: a legacy NULL digest, entered/retired lease, revoked
   * session, changed registration or changed serialized bytes all fail closed.
   * The caller must still enforce independent custody before any delivery. */
  async resumeC2ProtectedOwnerIssue(untrustedActor: AccessActor, expectedOwner: string, request: PmHttpRequestBytes,
    bounds: PmHttpRequestBounds, leaseId?: string, custodyBinding?: string,p7?:C2P7IssuerFenceCandidate,custody?:RestoreIndependentCustodyCandidate,
    untrustedStatusLink?:CommandStatusContextLink,untrustedFinancialOriginal?:C2FinancialOriginalLink): Promise<{ token: string; lease_id: string; expires_at_ms: number; authority_revision: number }> {
    if(this.#config.c2_delivery_schema_required===true&&p7===undefined)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
    if (custodyBinding !== undefined) digest.parse(custodyBinding);
    const actor=nativeActor(untrustedActor),owner=id.parse(expectedOwner),lease=leaseId===undefined?null:id.parse(leaseId),selected=this.#config.installation_scope;
    const statusLink=untrustedStatusLink===undefined?undefined:commandStatusContextLink.parse(untrustedStatusLink);
    const financial=untrustedFinancialOriginal===undefined?undefined:c2FinancialOriginalLink.parse(untrustedFinancialOriginal);
    if(financial&&(statusLink||lease===null||this.#config.c2_delivery_schema_required!==true))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID");
    if(statusLink!==undefined&&(request.method!=="POST"||!Buffer.from(request.raw_path).equals(Buffer.from("/internal/elp210/pm-command/status"))||request.query_string.byteLength!==0||lease===null))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID");
    if(!selected||selected.environment!=="paper"||actor.user_id!==owner)throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_OWNER_REQUIRED");
    const binding:CurrentHumanBinding={workspace_id:selected.workspace_id,environment:"paper",
      workload_id:this.reverseSource().workload_id,request_digest:pmHttpRequestDigest(request,bounds)};
    if(this.#config.c2_delivery_schema_required===true)this.#requireC2Custody(custody,custodyBinding);
    this.checkInstallation(binding,true);
    const issued=await this.transaction(async(db,authority)=>{
      const found=await db.query<Row & {authority_fingerprint:string;human_assertion_digest:string|null}>(
        `SELECT * FROM elp210_candidate.leases WHERE workspace_id=$1 AND environment='paper' AND workload_id=$2
          AND request_digest=$3 AND ($4::text IS NULL OR lease_id=$4) LIMIT 2 FOR SHARE`,
        [binding.workspace_id,binding.workload_id,binding.request_digest,lease]);
      const row=found.rows[0];
      const p7Digest=p7===undefined?null:this.#c2P7Digest(p7);
      if(found.rows.length!==1||!row||authority.drain_id||row.phase!=="ISSUED"||row.human_issuer!==this.#config.issuer||
        !this.matchesHumanSigningKey(row.human_signing_key_digest)||!this.matchesReverseTrust(row.source_trust_digest)||
        row.authority_revision!==authority.revision||row.subject_id!==owner||row.session_id!==actor.session_id||
        Number(row.session_revision)!==actor.session_generation||row.workspace_id!==binding.workspace_id||
        row.environment!==binding.environment||row.workload_id!==binding.workload_id||row.request_digest!==binding.request_digest||
        !digest.safeParse(row.human_assertion_digest).success || row.c2_p7_binding_digest!==p7Digest ||
        ((row.c2_custody_binding_digest !== null || custodyBinding !== undefined) &&
          row.c2_custody_binding_digest !== custodyBinding))throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const current=await lockCurrentHumanSnapshot(db,actor,binding.workspace_id);
      const c2Expiry=await lockCurrentC2Registration(db,binding.workspace_id,owner,binding.workload_id,authority.revision);
      if(p7!==undefined&&(await this.#checkC2P7(db,p7,actor,binding)).intent_id!==row.c2_p7_owner_intent_id)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      if(p7===undefined&&row.c2_p7_owner_intent_id!==null)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      this.checkInstallation(binding,true);
      const issuedMs=Number(row.issued_at_ms),expiresMs=Number(row.expires_at_ms);
      if(current.anchor!==owner||current.authority_fingerprint!==row.authority_fingerprint||
        !Number.isSafeInteger(issuedMs)||issuedMs%1000!==0||!Number.isSafeInteger(expiresMs)||expiresMs%1000!==0||
        expiresMs>c2Expiry||current.now>=expiresMs||current.now>=current.lease_until_ms||current.now>=c2Expiry||
        current.now>=selected.valid_until_ms)throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const claims=humanClaims.parse({iss:this.#config.issuer,aud:this.#config.audience,sub:owner,sid:actor.session_id,jti:row.lease_id,
        iat:issuedMs/1000,nbf:issuedMs/1000,exp:expiresMs/1000,purpose:"pma.identity.v1",principal_kind:"human",
        session_revision:actor.session_generation,authority_revision:Number(row.authority_revision),...binding});
      const token=await new SignJWT(claims).setProtectedHeader({alg:"EdDSA",kid:this.#config.key_id,typ:"JWT"}).sign(this.#config.private_key);
      if(accessDigest(token)!==row.human_assertion_digest)throw new CurrentHumanLeaseError("CURRENT_HUMAN_ASSERTION_CHANGED");
      await this.#checkC2StatusLink(db,row.lease_id,binding.request_digest,accessDigest(token),statusLink);
      if(statusLink!==undefined)await this.#checkStatusPreparation(db,actor,binding,statusLink,true);
      await this.#checkFinancialOriginal(db,row,actor,binding,financial);
      return {token,lease_id:row.lease_id,expires_at_ms:expiresMs,authority_revision:Number(row.authority_revision)};
    });
    if(this.#config.c2_delivery_schema_required===true) {
      try {
        await appendCustodiedOriginal(custody!,"ISSUED_HUMAN_ASSERTION",issued.lease_id,issued.token);
        await this.#revalidateBoundIssue(actor,binding,issued,owner,custodyBinding,p7,statusLink,financial);
      } catch {throw new C2CustodyPendingError(issued.lease_id);}
    }
    return issued;
  }

  /** Recheck this exact C2 original after independent custody completes.
   * This is not an HTTP write fence; ENTER must still recheck current rights. */
  async revalidateC2ProtectedOwnerIssue(actor:AccessActor,expectedOwner:string,request:PmHttpRequestBytes,
    bounds:PmHttpRequestBounds,issued:{token:string;lease_id:string;expires_at_ms:number;authority_revision:number},custodyBinding?:string,p7?:C2P7IssuerFenceCandidate,
    financialOriginal?:C2FinancialOriginalLink):Promise<void> {
    if(this.#config.c2_delivery_schema_required===true&&p7===undefined)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
    const owner=id.parse(expectedOwner),selected=this.#config.installation_scope;
    if(!selected||selected.environment!=="paper")throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_OWNER_REQUIRED");
    const binding:CurrentHumanBinding={workspace_id:selected.workspace_id,environment:"paper",
      workload_id:this.reverseSource().workload_id,request_digest:pmHttpRequestDigest(request,bounds)};
    await this.#revalidateBoundIssue(actor,binding,issued,owner,custodyBinding,p7,undefined,financialOriginal);
  }

  /** SOURCE/TEST ONLY: authenticate the same marked financial original and its
   * retained source terminal under current P7/session locks. This is NOT a
   * recipient ACK, HTTP-delivery fence, successor permit, or restore barrier.
   * RESOLVE remains independent and may settle an entered original after revoke. */
  async verifyC2FinancialTerminal(untrustedActor:AccessActor,expectedOwner:string,request:PmHttpRequestBytes,
    bounds:PmHttpRequestBounds,issued:{token:string;lease_id:string;expires_at_ms:number;authority_revision:number},
    untrustedLink:C2FinancialOriginalLink,custody:RestoreIndependentCustodyCandidate,p7:C2P7IssuerFenceCandidate):
    Promise<{state:"VERIFIED_NOT_ACK";phase:"COMMITTED"|"ROLLED_BACK"}> {
    const actor=nativeActor(untrustedActor),owner=id.parse(expectedOwner),link=c2FinancialOriginalLink.parse(untrustedLink);
    const selected=this.#config.installation_scope,captured={token:issued.token,lease_id:issued.lease_id,
      expires_at_ms:issued.expires_at_ms,authority_revision:issued.authority_revision};
    if(!selected||selected.environment!=="paper"||this.#config.c2_delivery_schema_required!==true||actor.user_id!==owner||!p7||
      !custody||Object.getPrototypeOf(custody)!==RestoreIndependentCustodyCandidate.prototype||
      !custodyHasAuthenticatedJournal.call(custody))throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_CUSTODY_REQUIRED");
    const custodyBinding=custodyBindingDigest.call(custody);
    this.#requireC2Custody(custody,custodyBinding);
    const binding:CurrentHumanBinding={workspace_id:selected.workspace_id,environment:"paper",
      workload_id:this.reverseSource().workload_id,request_digest:pmHttpRequestDigest(request,bounds)};
    let signed:z.infer<typeof humanClaims>;
    try {
      if(typeof captured.token!=="string"||Buffer.byteLength(captured.token)>8192)throw new Error();
      const verified=await jwtVerify(captured.token,this.#humanPublicKey,{algorithms:["EdDSA"],
        issuer:this.#config.issuer,audience:this.#config.audience});
      if(verified.protectedHeader.kid!==this.#config.key_id||verified.protectedHeader.typ!=="JWT")throw new Error();
      signed=humanClaims.parse(verified.payload);
      if(signed.jti!==captured.lease_id||signed.sub!==actor.user_id||signed.sid!==actor.session_id||
        signed.session_revision!==actor.session_generation||signed.authority_revision!==captured.authority_revision||
        signed.workspace_id!==binding.workspace_id||signed.environment!==binding.environment||
        signed.workload_id!==binding.workload_id||signed.request_digest!==binding.request_digest||
        signed.exp*1000!==captured.expires_at_ms||signed.nbf!==signed.iat)throw new Error();
    } catch {throw new CurrentHumanLeaseError("CURRENT_HUMAN_ASSERTION_CHANGED");}
    const p7Digest=this.#c2P7Digest(p7);this.checkInstallation(binding,true);
    return this.transaction(async(db,authority)=>{
      const row=(await db.query<Row & {authority_fingerprint:string}>(
        "SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR SHARE",[captured.lease_id])).rows[0];
      if(!row||authority.drain_id||row.human_issuer!==this.#config.issuer||
        !this.matchesHumanSigningKey(row.human_signing_key_digest)||!this.matchesReverseTrust(row.source_trust_digest)||
        row.authority_revision!==authority.revision||Number(row.authority_revision)!==captured.authority_revision||
        row.subject_id!==actor.user_id||row.session_id!==actor.session_id||Number(row.session_revision)!==actor.session_generation||
        row.workspace_id!==binding.workspace_id||row.environment!==binding.environment||row.workload_id!==binding.workload_id||
        row.request_digest!==binding.request_digest||row.c2_custody_binding_digest!==custodyBinding||row.c2_p7_binding_digest!==p7Digest||
        row.human_assertion_digest!==accessDigest(captured.token)||Number(row.issued_at_ms)!==signed.iat*1000||
        Number(row.expires_at_ms)!==captured.expires_at_ms||!row.attempt_id||
        !["COMMITTED","ROLLED_BACK"].includes(row.phase)||!digest.safeParse(row.terminal_receipt_digest).success)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const current=await lockCurrentHumanSnapshot(db,actor,binding.workspace_id);
      if(current.authority_fingerprint!==row.authority_fingerprint||current.anchor!==owner)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      await this.#checkFinancialOriginal(db,row,actor,binding,link);
      const c2Expiry=await lockCurrentC2Registration(db,binding.workspace_id,owner,binding.workload_id,authority.revision);
      if((await this.#checkC2P7(db,p7,actor,binding)).intent_id!==row.c2_p7_owner_intent_id)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
      const snapshot=await custodyInventory.call(custody);
      const original=snapshot.events.filter(e=>e.kind==="ISSUED_HUMAN_ASSERTION"&&e.lease_id===row.lease_id&&
        e.proof_hash===createHash("sha256").update(captured.token,"utf8").digest("hex"));
      const terminals=snapshot.events.filter(e=>e.kind==="SIGNED_SOURCE_TERMINAL"&&e.lease_id===row.lease_id);
      if(original.length!==1||terminals.length!==1)throw new CurrentHumanLeaseError("CURRENT_HUMAN_CUSTODY_PROOF_REQUIRED");
      const proof=await custodyVerifyRetainedProof.call(custody,terminals[0].operation_id);
      if(proof.generation!==terminals[0].generation||proof.event_hash!==terminals[0].event_hash||
        proof.lease_id!==row.lease_id||proof.attempt_id!==row.attempt_id||proof.phase!==row.phase||
        proof.terminal_receipt_digest!==row.terminal_receipt_digest||proof.source_trust_digest!==row.source_trust_digest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_CUSTODY_PROOF_REQUIRED");
      const after=await custodyInventory.call(custody);
      if(after.generation!==snapshot.generation||after.event_hash!==snapshot.event_hash)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_CUSTODY_PROOF_REQUIRED");
      // Recheck the signed owner confirmation and time after custody I/O;
      // a valid historical terminal is not renewed authority for a new read.
      if((await this.#checkC2P7(db,p7,actor,binding)).intent_id!==row.c2_p7_owner_intent_id)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
      const now=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
      if(!Number.isSafeInteger(now)||now<current.now||now>=current.lease_until_ms||now>=Number(row.expires_at_ms)||
        now>=link.expires_at_ms||now>=c2Expiry||now>=selected.valid_until_ms)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      return {state:"VERIFIED_NOT_ACK",phase:row.phase as "COMMITTED"|"ROLLED_BACK"};
    },true);
  }

  /** STATUS has its own durable delivery fence. Unlike a financial read,
   * terminal source custody alone cannot authorize a replacement: an exact
   * authenticated Edge delivery ACK must also have been retained. */
  async issueCommandStatus(actor: AccessActor, untrustedBinding: CurrentHumanBinding, untrustedLink: CommandStatusContextLink): Promise<{ token: string; lease_id: string; expires_at_ms: number; authority_revision: number }> {
    return this.#issueBound(actor, untrustedBinding, true, untrustedLink);
  }

  /** Unmounted C2 STATUS-only candidate. P7 attests the owner preparation;
   * a separate STATUS authority must still authenticate the original and the
   * callback. Neither P7 nor this method grants a command or starts one. */
  async issueC2ProtectedOwnerCommandStatus(actor:AccessActor,expectedOwner:string,request:PmHttpRequestBytes,
    bounds:PmHttpRequestBounds,untrustedLink:CommandStatusContextLink,custodyBinding:string,
    p7:C2P7IssuerFenceCandidate,custody:RestoreIndependentCustodyCandidate):Promise<{
      token:string;lease_id:string;expires_at_ms:number;authority_revision:number}> {
    if(this.#config.c2_delivery_schema_required!==true)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
    const owner=id.parse(expectedOwner),person=nativeActor(actor),selected=this.#config.installation_scope;
    const link=commandStatusContextLink.parse(untrustedLink);
    // Hash and copy caller bytes before any await. Only the published STATUS
    // route is in this candidate; a P7 READ/HISTORY record is not a command
    // permission and cannot be used as a generic request signer here.
    pmHttpRequestDigest(request,bounds);
    const copied={method:request.method,raw_path:Buffer.from(request.raw_path),
      query_string:Buffer.from(request.query_string),body:Buffer.from(request.body)};
    const capturedBounds={request_bytes:bounds.request_bytes};
    if(!selected||selected.environment!=="paper"||person.user_id!==owner||copied.method!=="POST"||
      !copied.raw_path.equals(Buffer.from("/internal/elp210/pm-command/status"))||copied.query_string.length!==0)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID");
    const binding:CurrentHumanBinding={workspace_id:selected.workspace_id,environment:"paper",
      workload_id:this.reverseSource().workload_id,request_digest:pmHttpRequestDigest(copied,capturedBounds)};
    this.#requireC2Custody(custody,custodyBinding);
    if(!custodyHasAuthenticatedJournal.call(custody))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_CUSTODY_REQUIRED");
    await custodyPreflight.call(custody);
    const issued=await this.#issueBound(person,binding,true,link,owner,custodyBinding,p7);
    try {
      await appendCustodiedOriginal(custody,"ISSUED_HUMAN_ASSERTION",issued.lease_id,issued.token);
      await this.#revalidateBoundIssue(person,binding,issued,owner,custodyBinding,p7,link);
    } catch {throw new C2CustodyPendingError(issued.lease_id);}
    return issued;
  }

  /** Revalidate the same retained STATUS assertion immediately before a
   * higher-level delivery. This is not itself an HTTP custody fence. */
  async revalidateC2ProtectedOwnerCommandStatus(actor:AccessActor,expectedOwner:string,binding:CurrentHumanBinding,
    issued:{token:string;lease_id:string;expires_at_ms:number;authority_revision:number},untrustedLink:CommandStatusContextLink,
    custodyBinding:string,p7:C2P7IssuerFenceCandidate,custody:RestoreIndependentCustodyCandidate):Promise<void> {
    if(this.#config.c2_delivery_schema_required!==true)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
    const person=nativeActor(actor),owner=id.parse(expectedOwner),scope=currentHumanBinding.parse(binding),
      link=commandStatusContextLink.parse(untrustedLink);
    if(scope.environment!=="paper"||person.user_id!==owner)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_OWNER_REQUIRED");
    this.#requireC2Custody(custody,custodyBinding);
    await this.#revalidateBoundIssue(person,scope,issued,owner,custodyBinding,p7,link);
  }

  async #issueBound(actor: AccessActor, untrustedBinding: CurrentHumanBinding, commandStatus: boolean,
    untrustedLink?: CommandStatusContextLink, c2Owner?: string, custodyBinding?:string,p7?:C2P7IssuerFenceCandidate,
    untrustedFinancialOriginal?:C2FinancialOriginalLink): Promise<{ token: string; lease_id: string; expires_at_ms: number; authority_revision: number }> {
    // A C2-pinned signer must not expose an alternate generic or STATUS
    // issuance path around the exact-owner P7/custody composition. Other
    // installations retain their existing generic and STATUS behavior.
    if(this.#config.c2_delivery_schema_required===true&&(c2Owner===undefined||p7===undefined))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
    const binding = currentHumanBinding.parse(untrustedBinding);
    const p7Digest=p7===undefined?null:this.#c2P7Digest(p7);
    const link = untrustedLink === undefined ? undefined : commandStatusContextLink.parse(untrustedLink);
    const financial=untrustedFinancialOriginal===undefined?undefined:c2FinancialOriginalLink.parse(untrustedFinancialOriginal);
    // New STATUS leases must always carry the durable correlation required
    // for same-context restart recovery. Older unlinked leases are still
    // fenced by the request-digest lookup below; they are not rewritten.
    if (Boolean(link) !== commandStatus) throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID");
    if(financial&&(commandStatus||!c2Owner||!p7||!custodyBinding||this.#config.c2_delivery_schema_required!==true))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID");
    if (commandStatus && binding.environment !== "paper") throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_PAPER_REQUIRED");
    this.checkInstallation(binding, true);
    if (binding.workload_id !== this.reverseSource().workload_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_WORKLOAD_MISMATCH");
    const issued = await this.transaction(async (db, authority) => {
      if (authority.drain_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
      const current = c2Owner === undefined ? await captureCurrentHumanSnapshot(db, actor, binding.workspace_id)
        : await lockCurrentHumanSnapshot(db, actor, binding.workspace_id);
      let c2Expiry=Number.MAX_SAFE_INTEGER,p7IntentId:string|null=null;
      if (c2Owner !== undefined) {
        if (binding.environment !== "paper" || actor.user_id !== c2Owner || current.anchor !== c2Owner)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_OWNER_REQUIRED");
        // Candidate C2 is fail-closed if its independently provisioned DB
        // fence is missing. This scope/row alone is not owner authorization,
        // source acceptance or proof of upstream token invalidation.
        c2Expiry=await lockCurrentC2Registration(db,binding.workspace_id,c2Owner,binding.workload_id,authority.revision);
        if(p7!==undefined) {
          const checked=await this.#checkC2P7(db,p7,actor,binding);
          p7IntentId=checked.intent_id;c2Expiry=Math.min(c2Expiry,checked.expires_at_ms);
        }
        // The same authority singleton lock serializes this test and INSERT
        // across processes. Include all phases, including retired and terminal:
        // no source terminal proves that the client received the outcome.
        // A new STATUS sequence may use the same source bytes only within
        // the same immutable context/original. The later predecessor check
        // requires the exact source terminal and persisted recipient ACK.
        // Fresh contexts and non-STATUS issuances retain the strict fence.
        const successor=commandStatus&&link!==undefined&&link.delivery_sequence>0;
        const prior = await db.query(`SELECT 1 FROM elp210_candidate.leases l
          LEFT JOIN execution_command_status_context_links c ON c.lease_id=l.lease_id
          WHERE l.workspace_id=$1 AND l.environment=$2 AND l.workload_id=$3 AND l.request_digest=$4
            AND (NOT $5::boolean OR c.context_digest IS DISTINCT FROM $6 OR c.original_digest IS DISTINCT FROM $7)
          LIMIT 1`,
        [binding.workspace_id, binding.environment, binding.workload_id, binding.request_digest,successor,
          link?.context_digest??null,link?.original_digest??null]);
        if (prior.rowCount) throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_SAME_ORIGINAL_RECOVERY_REQUIRED");
      }
      if (link && current.now >= link.context_expires_at_ms)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_LINK_EXPIRED");
      if(financial) {
        const original=await db.query(`SELECT context_digest FROM elp210_c2_financial_candidate.originals
          WHERE context_digest=$1 AND subject_id=$2 AND session_id=$3 AND session_revision=$4 AND workspace_id=$5
            AND workload_id=$6 AND receiver_id=$7 AND binding_digest=$8 AND request_digest=$9 AND expires_at_ms=$10
            AND expires_at_ms>floor(extract(epoch FROM clock_timestamp())*1000) AND lease_id IS NULL FOR UPDATE`,
        [financial.context_digest,actor.user_id,actor.session_id,actor.session_generation,binding.workspace_id,
          binding.workload_id,financial.receiver_id,financial.binding_digest,binding.request_digest,financial.expires_at_ms]);
        if(original.rowCount!==1)throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID");
      }
      if (link) await this.#checkStatusPreparation(db,actor,binding,link,c2Owner!==undefined);
      const counts = (await db.query(`SELECT count(*)::int AS retained,
        count(*) FILTER (WHERE unresolved)::int AS unresolved FROM elp210_candidate.obligations`)).rows[0];
      if (counts.unresolved >= this.#config.limits.maximum_unresolved || counts.retained >= this.#config.limits.maximum_retained)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_CAPACITY_EXHAUSTED");
      if (commandStatus) {
        // The authority singleton is locked by transaction(), so this check
        // and lease INSERT are serialized across Core processes and restarts.
        // RETIRED, UNKNOWN and terminal-without-ACK all remain fenced. The
        // Exact source request AND persisted original own the fence, not the
        // human session. A restarted process must not evade the existing
        // original's unresolved delivery by changing STATUS request bytes.
        // Legacy unlinked leases remain protected by exact request digest.
        const outstanding = await db.query(`SELECT l.lease_id FROM elp210_candidate.leases l
          LEFT JOIN execution_command_status_context_links c ON c.lease_id=l.lease_id
          WHERE l.workspace_id=$1 AND l.environment=$2 AND l.workload_id=$3
            AND (l.request_digest=$4 OR ($5::text IS NOT NULL AND c.original_digest=$5))
            AND NOT EXISTS (SELECT 1 FROM execution_command_status_delivery_acks a
              WHERE a.lease_id=l.lease_id AND a.subject_id=l.subject_id AND a.session_id=l.session_id
                AND a.session_revision=l.session_revision AND a.workspace_id=l.workspace_id
                AND a.environment=l.environment AND a.workload_id=l.workload_id
                AND a.request_digest=l.request_digest AND a.terminal_receipt_digest=l.terminal_receipt_digest
                AND l.phase IN ('COMMITTED','ROLLED_BACK')) LIMIT 1`,
        [binding.workspace_id, binding.environment, binding.workload_id, binding.request_digest, link?.original_digest ?? null]);
        if (outstanding.rowCount) throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_RECOVERY_REQUIRED");
      }
      this.checkInstallation(binding, true);
      if(p7!==undefined) {
        if(c2Owner===undefined)throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_INVALID");
        // Recheck clock and the same locked owner intent immediately before
        // signing; earlier selection may have waited on capacity/other rows.
        const checked=await this.#checkC2P7(db,p7,actor,binding);
        if(checked.intent_id!==p7IntentId)throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_INVALID");
        c2Expiry=Math.min(c2Expiry,checked.expires_at_ms);
      }
      const iat = Math.floor(current.now / 1000), exp = Math.floor(Math.min(current.now + this.#config.limits.ttl_ms,
        current.lease_until_ms, this.#config.installation_scope?.valid_until_ms ?? Number.MAX_SAFE_INTEGER,c2Expiry,
        link?.context_expires_at_ms ?? Number.MAX_SAFE_INTEGER,financial?.expires_at_ms ?? Number.MAX_SAFE_INTEGER) / 1000);
      if (exp <= iat) throw new CurrentHumanLeaseError("CURRENT_HUMAN_SESSION_EXPIRING");
      const body = humanClaims.parse({ iss: this.#config.issuer, aud: this.#config.audience, sub: actor.user_id,
        sid: actor.session_id, jti: randomUUID(), iat, nbf: iat, exp, purpose: "pma.identity.v1", principal_kind: "human",
        session_revision: actor.session_generation, authority_revision: Number(authority.revision), ...binding });
      // C2 can resume only the exact assertion minted with this original.
      // Hash the deterministic signed bytes before committing the lease; never
      // persist the bearer. A legacy NULL row cannot be resumed by guessing.
      let assertion: string | undefined = c2Owner === undefined ? undefined : await new SignJWT(body)
        .setProtectedHeader({ alg: "EdDSA", kid: this.#config.key_id, typ: "JWT" }).sign(this.#config.private_key);
      await db.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms,human_issuer,source_trust_digest,human_signing_key_digest,human_assertion_digest,c2_custody_binding_digest,c2_p7_binding_digest,c2_p7_owner_intent_id${financial?",c2_financial_context_digest":""})
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19${financial?",$20":""})`, [body.jti, body.authority_revision, body.sub, body.sid,
        body.session_revision, body.workspace_id, body.environment, body.workload_id, body.request_digest,
        current.authority_fingerprint, body.iat * 1000, body.exp * 1000, body.iss, this.#reverseTrustDigest, this.#humanSigningKeyDigest,
        assertion === undefined ? null : accessDigest(assertion), custodyBinding ?? null,p7Digest,p7IntentId,...(financial?[financial.context_digest]:[])]);
      if(financial) {
        const bound=await db.query(`UPDATE elp210_c2_financial_candidate.originals SET lease_id=$2
          WHERE context_digest=$1 AND lease_id IS NULL
            AND expires_at_ms>floor(extract(epoch FROM clock_timestamp())*1000) RETURNING lease_id`,[financial.context_digest,body.jti]);
        if(bound.rowCount!==1||bound.rows[0]?.lease_id!==body.jti)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID");
      }
      if (link) {
        if (link.delivery_sequence > 0) {
          const prior = await db.query(`SELECT 1 FROM execution_command_status_context_links p
            JOIN execution_command_status_delivery_acks a ON a.lease_id=p.lease_id
            JOIN elp210_candidate.leases l ON l.lease_id=p.lease_id
            WHERE p.context_digest=$1 AND p.delivery_sequence=$2 AND p.lease_id=$3
              AND p.original_digest=$4 AND p.call_digest=$5 AND p.binding_digest=$6 AND p.authority_fingerprint=$15
              AND p.status_token_digest=$16 AND p.status_request_digest=$17 AND p.status_issued_at_ms=$18 AND p.context_nonce=$19
              AND p.context_expires_at_ms=$23
              AND p.receiver_id=$7 AND p.request_digest=$8 AND a.request_digest=$8
              AND a.workspace_id=$9 AND a.environment=$10 AND a.workload_id=$11
              AND a.subject_id=$12 AND a.session_id=$13 AND a.session_revision=$14
              AND l.phase IN ('COMMITTED','ROLLED_BACK') AND l.attempt_id IS NOT NULL
              AND l.terminal_receipt_digest=a.terminal_receipt_digest
              AND ($20::text IS NULL OR (l.c2_custody_binding_digest=$20 AND l.c2_p7_binding_digest=$21
                AND l.c2_p7_owner_intent_id=$22::uuid AND l.human_assertion_digest=p.assertion_digest))`,
          [link.context_digest, link.delivery_sequence - 1, link.previous_lease_id,
            link.original_digest, link.call_digest, link.binding_digest, link.receiver_id, binding.request_digest,
            body.workspace_id, body.environment, body.workload_id, body.sub, body.sid, body.session_revision, link.authority_fingerprint,
            link.status_token_digest,link.status_request_digest,link.status_issued_at_ms,link.context_nonce,
            c2Owner===undefined?null:custodyBinding,c2Owner===undefined?null:p7Digest,c2Owner===undefined?null:p7IntentId,
            link.context_expires_at_ms]);
          if (prior.rowCount !== 1) throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_LINK_PREVIOUS_REQUIRED");
        }
        // Commit the digest of the exact deterministic EdDSA assertion with
        // its lease before allowing the token to escape this process. This
        // permits a later retry of the same ISSUED lease without persisting
        // the bearer or accidentally minting another authority.
        assertion = await new SignJWT(body).setProtectedHeader({ alg: "EdDSA", kid: this.#config.key_id, typ: "JWT" })
          .sign(this.#config.private_key);
        await db.query(`INSERT INTO execution_command_status_context_links
          (context_digest,delivery_sequence,lease_id,previous_lease_id,original_digest,call_digest,binding_digest,
           request_digest,receiver_id,context_expires_at_ms,authority_fingerprint,assertion_digest,
           status_token_digest,status_request_digest,status_issued_at_ms,context_nonce) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [link.context_digest, link.delivery_sequence, body.jti, link.previous_lease_id, link.original_digest,
          link.call_digest, link.binding_digest, binding.request_digest, link.receiver_id, link.context_expires_at_ms, link.authority_fingerprint,
          accessDigest(assertion),link.status_token_digest,link.status_request_digest,link.status_issued_at_ms,link.context_nonce]);
      }
      return { body, assertion };
    });
    // A concurrent drain can retire this ISSUED lease before it is delivered;
    // enter will refuse it. For linked STATUS only, local signing occurs in
    // the transaction so its exact assertion digest commits with the lease.
    const claims = issued.body;
    return { token: issued.assertion ?? await new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: this.#config.key_id, typ: "JWT" })
      .sign(this.#config.private_key), lease_id: claims.jti, expires_at_ms: claims.exp * 1000, authority_revision: claims.authority_revision };
  }

  /** Reproduce only an already committed ISSUED STATUS assertion. The stored
   * digest checks exact bytes including signing key and header; an entered,
   * retired, expired, revoked, drained, or rotated-key lease cannot resume. */
  async resumeCommandStatusIssue(untrustedActor: AccessActor, untrustedBinding: CurrentHumanBinding, leaseId: string): Promise<{
    token: string; lease_id: string; expires_at_ms: number; authority_revision: number }> {
    if(this.#config.c2_delivery_schema_required===true)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
    const actor = nativeActor(untrustedActor), binding = currentHumanBinding.parse(untrustedBinding), lease = id.parse(leaseId);
    if (binding.environment !== "paper") throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_PAPER_REQUIRED");
    this.checkInstallation(binding, true);
    if (binding.workload_id !== this.reverseSource().workload_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_WORKLOAD_MISMATCH");
    return this.transaction(async (db, authority) => {
      const row = (await db.query(`SELECT l.*, c.assertion_digest, c.context_expires_at_ms
        FROM elp210_candidate.leases l JOIN execution_command_status_context_links c ON c.lease_id=l.lease_id
        WHERE l.lease_id=$1 FOR SHARE OF l`, [lease])).rows[0];
      if (!row || authority.drain_id || row.phase !== "ISSUED" || row.human_issuer !== this.#config.issuer || !this.matchesHumanSigningKey(row.human_signing_key_digest) || !this.matchesReverseTrust(row.source_trust_digest) || Number(row.authority_revision) !== Number(authority.revision) ||
        row.subject_id !== actor.user_id || row.session_id !== actor.session_id || Number(row.session_revision) !== actor.session_generation ||
        row.workspace_id !== binding.workspace_id || row.environment !== binding.environment || row.workload_id !== binding.workload_id ||
        row.request_digest !== binding.request_digest) throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const current = await captureCurrentHumanSnapshot(db, actor, binding.workspace_id);
      this.checkInstallation(binding, true);
      const issuedMs = Number(row.issued_at_ms), expiresMs = Number(row.expires_at_ms), contextExpires = Number(row.context_expires_at_ms);
      if (current.authority_fingerprint !== row.authority_fingerprint || !Number.isSafeInteger(issuedMs) || issuedMs % 1000 !== 0 ||
        !Number.isSafeInteger(expiresMs) || expiresMs % 1000 !== 0 || !Number.isSafeInteger(contextExpires) ||
        current.now >= expiresMs || current.now >= contextExpires)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const claims = humanClaims.parse({ iss: this.#config.issuer, aud: this.#config.audience, sub: actor.user_id,
        sid: actor.session_id, jti: lease, iat: issuedMs / 1000, nbf: issuedMs / 1000, exp: expiresMs / 1000,
        purpose: "pma.identity.v1", principal_kind: "human", session_revision: actor.session_generation,
        authority_revision: Number(row.authority_revision), ...binding });
      const token = await new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: this.#config.key_id, typ: "JWT" })
        .sign(this.#config.private_key);
      if (accessDigest(token) !== row.assertion_digest) throw new CurrentHumanLeaseError("CURRENT_HUMAN_ASSERTION_CHANGED");
      return { token, lease_id: lease, expires_at_ms: expiresMs, authority_revision: Number(row.authority_revision) };
    });
  }

  /** Same-lease delivery fence for the private financial identity issuer.
   * Does not allocate/renew a lease, enter a source transaction, or infer PM
   * economic permission. Cached response retries must recheck CURRENT Core
   * authority; a persisted ENTERED/UNKNOWN lease remains recovery custody. */
  async revalidateIssue(untrustedActor: AccessActor, untrustedBinding: CurrentHumanBinding,
    issued: { token: string; lease_id: string; expires_at_ms: number; authority_revision: number }): Promise<void> {
    return this.#revalidateBoundIssue(untrustedActor,untrustedBinding,issued);
  }

  /** C2 additionally holds/rechecks its scoped fence after signing. This does
   * not hold authority through HTTP delivery and is not source/P5 revocation. */
  async #revalidateBoundIssue(untrustedActor: AccessActor, untrustedBinding: CurrentHumanBinding,
    issued: { token: string; lease_id: string; expires_at_ms: number; authority_revision: number },c2Owner?:string,custodyBinding?:string,p7?:C2P7IssuerFenceCandidate,
    statusLink?:CommandStatusContextLink,financialOriginal?:C2FinancialOriginalLink): Promise<void> {
    if(this.#config.c2_delivery_schema_required===true&&(c2Owner===undefined||p7===undefined))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
    const actor = nativeActor(untrustedActor), binding = currentHumanBinding.parse(untrustedBinding);
    // Keep the exact assertion and coordinates stable across asynchronous
    // verification/locks; a caller must not swap the object while we wait.
    const captured={token:issued.token,lease_id:issued.lease_id,expires_at_ms:issued.expires_at_ms,
      authority_revision:issued.authority_revision};
    let signed:z.infer<typeof humanClaims>|undefined;
    if(c2Owner!==undefined) {
      try {
        if(typeof captured.token!=="string"||Buffer.byteLength(captured.token)>8192)throw new Error("invalid assertion");
        const verified=await jwtVerify(captured.token,this.#humanPublicKey,{algorithms:["EdDSA"],
          issuer:this.#config.issuer,audience:this.#config.audience});
        if(verified.protectedHeader.kid!==this.#config.key_id||verified.protectedHeader.typ!=="JWT")throw new Error("invalid header");
        signed=humanClaims.parse(verified.payload);
        if(signed.jti!==captured.lease_id||signed.sub!==actor.user_id||signed.sid!==actor.session_id||
          signed.session_revision!==actor.session_generation||signed.authority_revision!==captured.authority_revision||
          signed.workspace_id!==binding.workspace_id||signed.environment!==binding.environment||signed.workload_id!==binding.workload_id||
          signed.request_digest!==binding.request_digest||signed.exp*1000!==captured.expires_at_ms)
          throw new Error("assertion binding mismatch");
      } catch {throw new CurrentHumanLeaseError("CURRENT_HUMAN_ASSERTION_CHANGED");}
    }
    const p7Digest=p7===undefined?null:this.#c2P7Digest(p7);
    this.checkInstallation(binding, true);
    if (binding.workload_id !== this.reverseSource().workload_id)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_WORKLOAD_MISMATCH");
    await this.transaction(async (db, authority) => {
      const row = (await db.query<Row & { authority_fingerprint: string }>(
        "SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR SHARE", [captured.lease_id])).rows[0];
      if (!row || authority.drain_id || row.phase !== "ISSUED" || row.human_issuer !== this.#config.issuer || !this.matchesHumanSigningKey(row.human_signing_key_digest) || !this.matchesReverseTrust(row.source_trust_digest) || row.authority_revision !== authority.revision ||
        Number(row.authority_revision) !== captured.authority_revision || row.subject_id !== actor.user_id ||
        row.session_id !== actor.session_id || Number(row.session_revision) !== actor.session_generation ||
        row.workspace_id !== binding.workspace_id || row.environment !== binding.environment ||
        row.workload_id !== binding.workload_id || row.request_digest !== binding.request_digest ||
        (custodyBinding !== undefined && row.c2_custody_binding_digest !== custodyBinding) || row.c2_p7_binding_digest!==p7Digest ||
        Number(row.expires_at_ms) !== captured.expires_at_ms ||
        (signed!==undefined&&(row.human_assertion_digest!==accessDigest(captured.token)||
          Number(row.issued_at_ms)!==signed.iat*1000||signed.nbf!==signed.iat)))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      // Serialize the C2 post-signing check with session and policy changes.
      // This lock ends at COMMIT; it does not fence later HTTP delivery.
      const current = c2Owner === undefined ? await captureCurrentHumanSnapshot(db, actor, binding.workspace_id)
        : await lockCurrentHumanSnapshot(db, actor, binding.workspace_id);
      this.checkInstallation(binding, true);
      if (current.authority_fingerprint !== row.authority_fingerprint || current.now >= Number(row.expires_at_ms))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      if(c2Owner!==undefined) {
        await this.#checkC2StatusLink(db,captured.lease_id,binding.request_digest,accessDigest(captured.token),statusLink);
        if(statusLink!==undefined)await this.#checkStatusPreparation(db,actor,binding,statusLink,true);
        await this.#checkFinancialOriginal(db,row,actor,binding,financialOriginal);
        if(binding.environment!=="paper"||actor.user_id!==c2Owner||current.anchor!==c2Owner)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_OWNER_REQUIRED");
        const c2Expiry=await lockCurrentC2Registration(db,binding.workspace_id,c2Owner,binding.workload_id,authority.revision);
        if(p7!==undefined&&(await this.#checkC2P7(db,p7,actor,binding)).intent_id!==row.c2_p7_owner_intent_id)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
        if(p7===undefined&&row.c2_p7_owner_intent_id!==null)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
        const finalNow=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
        if(!Number.isSafeInteger(finalNow)||finalNow<current.now||finalNow>=current.lease_until_ms||
          finalNow>=Number(row.expires_at_ms)||Number(row.expires_at_ms)>c2Expiry||finalNow>=c2Expiry||
          finalNow>=(this.#config.installation_scope?.valid_until_ms??0))
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      }
    });
  }

  /** A marked financial lease can only be resumed with its exact durable
   * context. Keep the row locked during each authority transaction. */
  async #checkFinancialOriginal(db:PoolClient,row:Row,actor:AccessActor,binding:CurrentHumanBinding,
    untrusted?:C2FinancialOriginalLink):Promise<void> {
    const marked=row.c2_financial_context_digest??null;
    if(marked===null&&untrusted===undefined)return;
    if(marked===null||untrusted===undefined)throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID");
    const link=c2FinancialOriginalLink.parse(untrusted);
    if(marked!==link.context_digest)throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID");
    const found=await db.query(`SELECT 1 FROM elp210_c2_financial_candidate.originals WHERE context_digest=$1 AND lease_id=$2
      AND subject_id=$3 AND session_id=$4 AND session_revision=$5 AND workspace_id=$6 AND workload_id=$7
      AND request_digest=$8 AND receiver_id=$9 AND binding_digest=$10 AND expires_at_ms=$11
      AND expires_at_ms>floor(extract(epoch FROM clock_timestamp())*1000) FOR SHARE`,
    [link.context_digest,row.lease_id,actor.user_id,actor.session_id,actor.session_generation,binding.workspace_id,
      binding.workload_id,binding.request_digest,link.receiver_id,link.binding_digest,link.expires_at_ms]);
    if(found.rowCount!==1)throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_FINANCIAL_ORIGINAL_INVALID");
  }

  /** Called while the authority singleton is held by ISSUE, resume or
   * revalidation. The same durable reservation must still exist and match;
   * a link alone is not proof that its preparation remains current. */
  async #checkStatusPreparation(db:PoolClient,actor:AccessActor,binding:CurrentHumanBinding,
    link:CommandStatusContextLink,required:boolean):Promise<void> {
    const preparation=await db.query(`SELECT p.*,f.original_digest AS fingerprint_original,
      f.pm_status_request_digest AS fingerprint_request,t.workspace_id AS command_workspace
      FROM execution_command_status_preparations p
      LEFT JOIN execution_command_status_original_fingerprints f ON f.command_id=p.command_id
      LEFT JOIN execution_trusted_commands t ON t.command_id=p.command_id
      WHERE p.workspace_id=$1 AND p.workload_id=$2 AND p.original_digest=$3 LIMIT 2 FOR SHARE OF p`,
    [binding.workspace_id,binding.workload_id,link.original_digest]);
    const p=preparation.rows[0];
    if((required && preparation.rowCount!==1) || (preparation.rowCount &&
      (preparation.rowCount!==1 || p.consumed_at!==null || p.context_digest!==link.context_digest ||
      p.subject_id!==actor.user_id || p.session_id!==actor.session_id || String(p.session_revision)!==String(actor.session_generation) ||
      p.context_nonce!==link.context_nonce || p.call_digest!==link.call_digest || p.binding_digest!==link.binding_digest ||
      p.authority_fingerprint!==link.authority_fingerprint || p.receiver_id!==link.receiver_id ||
      p.pm_request_digest!==binding.request_digest || p.fingerprint_original!==p.original_digest || p.command_workspace!==p.workspace_id ||
      p.fingerprint_request!==p.pm_request_digest || p.status_token_digest!==link.status_token_digest ||
      p.status_request_digest!==link.status_request_digest || String(p.status_issued_at_ms)!==String(link.status_issued_at_ms) ||
      String(p.context_expires_at_ms)!==String(link.context_expires_at_ms))))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_PREPARATION_RETIRED");
  }

  /** The immutable STATUS link belongs to the same lease and assertion.
   * A generic C2 resume cannot drop that context; a STATUS retry cannot change
   * its original, sequence, receiver or expiry. No ACK is inferred here. */
  async #checkC2StatusLink(db:PoolClient,lease:string,requestDigest:string,assertionDigest:string,
    expected?:CommandStatusContextLink):Promise<void> {
    const result=await db.query(`SELECT *,floor(extract(epoch FROM clock_timestamp())*1000)::bigint::text AS now_ms
      FROM execution_command_status_context_links WHERE lease_id=$1 FOR SHARE`,[lease]);
    if(expected===undefined) {
      if(result.rowCount!==0)throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID");
      return;
    }
    const row=result.rows[0];
    if(result.rowCount!==1||!row||row.request_digest!==requestDigest||row.assertion_digest!==assertionDigest||
      row.context_digest!==expected.context_digest||row.context_nonce!==expected.context_nonce||
      row.original_digest!==expected.original_digest||row.call_digest!==expected.call_digest||
      row.binding_digest!==expected.binding_digest||row.authority_fingerprint!==expected.authority_fingerprint||
      row.status_token_digest!==expected.status_token_digest||row.status_request_digest!==expected.status_request_digest||
      Number(row.status_issued_at_ms)!==expected.status_issued_at_ms||row.receiver_id!==expected.receiver_id||
      Number(row.delivery_sequence)!==expected.delivery_sequence||row.previous_lease_id!==expected.previous_lease_id||
      Number(row.context_expires_at_ms)!==expected.context_expires_at_ms||!Number.isSafeInteger(Number(row.now_ms))||
      Number(row.now_ms)>=expected.context_expires_at_ms)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_LINK_INVALID");
  }

  /** Unmounted preparation fence. It holds P7 intent/registry and
   * owner locks inside the same DB transaction as issue/resume/revalidation;
   * it is not a qualified grant or an HTTP transport fence. */
  async #checkC2P7(db:PoolClient,p7:C2P7IssuerFenceCandidate,actor:AccessActor,binding:CurrentHumanBinding) {
    this.#c2P7Digest(p7);
    return c2P7CheckAuthenticated.call(p7,db,actor,binding.workspace_id,binding.workload_id);
  }
  #c2P7Digest(p7:C2P7IssuerFenceCandidate):string {
    if(!p7||Object.getPrototypeOf(p7)!==C2P7IssuerFenceCandidate.prototype||
      p7.checkLocked!==c2P7CheckLocked||p7.checkAuthenticatedLocked!==c2P7CheckAuthenticated||
      p7.confirmationKeySha256!==c2P7ConfirmationKey||p7.bindingDigest!==c2P7BindingDigest||
      !this.#config.c2_owner_confirmation_spki_sha256||
      c2P7ConfirmationKey.call(p7)!==this.#config.c2_owner_confirmation_spki_sha256)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_INVALID");
    return c2P7BindingDigest.call(p7);
  }

  /** Proof for the next DISTINCT financial read, never a retry/renewal of the
   * old request. The issuer must additionally have an authenticated delivery
   * acknowledgement for its original sequence. Terminal custody alone cannot
   * tell whether Edge received the PM response. No expiry/retirement inference,
   * new lease, source attempt, receipt or ACK is created here. */
  async canReplaceResolvedIssue(untrustedActor: AccessActor, untrustedBinding: CurrentHumanBinding,
    issued: { lease_id: string; expires_at_ms: number; authority_revision: number }): Promise<boolean> {
    const actor = nativeActor(untrustedActor), binding = currentHumanBinding.parse(untrustedBinding);
    this.checkInstallation(binding, true);
    if (binding.workload_id !== this.reverseSource().workload_id)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_WORKLOAD_MISMATCH");
    return this.transaction(async (db, authority) => {
      const row = (await db.query<Row & { authority_fingerprint: string }>(
        "SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR SHARE", [issued.lease_id])).rows[0];
      // A terminal financial original needs its own context, P7/custody and
      // authenticated financial ACK proof. The generic terminal predicate is
      // also used by STATUS and must never confer cross-purpose authority.
      if (!row || row.c2_financial_context_digest != null || authority.drain_id || row.human_issuer !== this.#config.issuer || !this.matchesHumanSigningKey(row.human_signing_key_digest) || !this.matchesReverseTrust(row.source_trust_digest) || row.authority_revision !== authority.revision ||
        Number(row.authority_revision) !== issued.authority_revision || row.subject_id !== actor.user_id ||
        row.session_id !== actor.session_id || Number(row.session_revision) !== actor.session_generation ||
        row.workspace_id !== binding.workspace_id || row.environment !== binding.environment ||
        row.workload_id !== binding.workload_id || row.request_digest !== binding.request_digest ||
        Number(row.expires_at_ms) !== issued.expires_at_ms)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const current = await captureCurrentHumanSnapshot(db, actor, binding.workspace_id);
      this.checkInstallation(binding, true);
      if (current.authority_fingerprint !== row.authority_fingerprint)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      if (row.phase === "ISSUED") return false;
      // Only resolve(authenticated source proof) persists this terminal digest.
      // Unentered source rollback retains Core phase RETIRED and cannot pass.
      if (!["COMMITTED", "ROLLED_BACK"].includes(row.phase) || !row.attempt_id ||
        !digest.safeParse(row.terminal_receipt_digest).success)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      return true;
    });
  }

  /** Record only the Edge's exact authenticated delivery after persisted
   * source terminal. The row contains digests/identity references, not JWTs
   * or payloads. Repeated ACKs must match; terminal alone is never an ACK. */
  async acknowledgeCommandStatusIssue(untrustedActor: AccessActor, untrustedBinding: CurrentHumanBinding,
    issued: { lease_id: string; expires_at_ms: number; authority_revision: number },
    responseDigest: string): Promise<boolean> {
    const actor=nativeActor(untrustedActor), binding=currentHumanBinding.parse(untrustedBinding);
    if(binding.environment!=="paper" || !digest.safeParse(responseDigest).success)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
    this.checkInstallation(binding,true);
    if(binding.workload_id!==this.reverseSource().workload_id)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_WORKLOAD_MISMATCH");
    return this.transaction(async(db,authority)=>{
      const row=(await db.query<Row & {authority_fingerprint:string}>(
        "SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR SHARE",[issued.lease_id])).rows[0];
      // STATUS ACKs cannot be attached to an exact financial original, even
      // when owner, request and terminal happen to match. Do not infer an
      // authenticated financial delivery from the other ledger.
      if(!row || row.c2_financial_context_digest != null || authority.drain_id || row.human_issuer!==this.#config.issuer || !this.matchesHumanSigningKey(row.human_signing_key_digest) || !this.matchesReverseTrust(row.source_trust_digest) || row.authority_revision!==authority.revision ||
        Number(row.authority_revision)!==issued.authority_revision || row.subject_id!==actor.user_id ||
        row.session_id!==actor.session_id || Number(row.session_revision)!==actor.session_generation ||
        row.workspace_id!==binding.workspace_id || row.environment!==binding.environment ||
        row.workload_id!==binding.workload_id || row.request_digest!==binding.request_digest ||
        Number(row.expires_at_ms)!==issued.expires_at_ms || !["COMMITTED","ROLLED_BACK"].includes(row.phase) ||
        !row.attempt_id || !digest.safeParse(row.terminal_receipt_digest).success)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const current=await captureCurrentHumanSnapshot(db,actor,binding.workspace_id);
      this.checkInstallation(binding,true);
      if(current.authority_fingerprint!==row.authority_fingerprint)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const values=[issued.lease_id,binding.workspace_id,actor.user_id,actor.session_id,actor.session_generation,
        binding.environment,binding.workload_id,binding.request_digest,responseDigest,row.terminal_receipt_digest];
      await db.query(`INSERT INTO execution_command_status_delivery_acks
        (lease_id,workspace_id,subject_id,session_id,session_revision,environment,workload_id,request_digest,response_digest,terminal_receipt_digest)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(lease_id) DO NOTHING`,values);
      const recorded=(await db.query(`SELECT 1 FROM execution_command_status_delivery_acks
        WHERE lease_id=$1 AND workspace_id=$2 AND subject_id=$3 AND session_id=$4 AND session_revision=$5
          AND environment=$6 AND workload_id=$7 AND request_digest=$8 AND response_digest=$9 AND terminal_receipt_digest=$10`,values));
      if(recorded.rowCount!==1)throw new CurrentHumanLeaseError("CURRENT_HUMAN_COMMAND_STATUS_ACK_MISMATCH");
      return true;
    });
  }


  /** NC-01 remains custody-only: default behavior and returned carrier unchanged. */
  async admitNativeRead(untrustedActor:AccessActor,input:unknown):Promise<CurrentHumanNativeReadRecoveryAttempt>{
    if(this.nativeHTTP)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_PURPOSE_REQUIRED");
    return this.nativeAttempt(await this.nativeAdmission(untrustedActor,input,false));
  }
  private async nativeAdmission(untrustedActor:AccessActor,input:unknown,http:boolean,expectedScopeDigest?:string):Promise<NativeRow>{
    if(expectedScopeDigest!==undefined&&(!http||!digest.safeParse(expectedScopeDigest).success))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    const actor=nativeActor(untrustedActor),captured=nativeBase(input),base=captured.base,selected=this.#config.native_read_custody;
    if(!selected)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_NOT_SELECTED");
    if(base.binding.human_issuer!==this.#config.issuer||base.binding.subject!==actor.user_id
      ||base.binding.workload_id!==this.workloadId()||base.binding.workspace_id!==selected.workspace_id
      ||base.binding.environment!==selected.environment||accessDigest(base.domain)!==accessDigest(selected.domain))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    this.checkInstallation(base.binding,true);
    const deadlineUs=nativeBusinessReadUtcMicroseconds(base.deadline),expires=Number(deadlineUs/1000n);
    // Preserve exact legal source microseconds/+00:00. Floor the send ceiling,
    // but require the minimum covering JWT second to fit independent authority.
    return this.transaction(async(db,authority)=>{
      if(authority.drain_id)throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
      const decision=http?await evaluateManagerDomainRead(db,{actor,workspace_id:selected.workspace_id,
        environment:selected.environment,domain:base.domain,expected_scope_digest:expectedScopeDigest}):null;
      const current=decision?{now:decision.now_ms,lease_until_ms:decision.valid_until_ms,
        authority_fingerprint:decision.authority_fingerprint}:await captureCurrentHumanSnapshot(db,actor,selected.workspace_id);
      if(decision&&decision.field_policy_sha256!==base.domain.field_policy_sha256)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
      this.checkInstallation(base.binding,true);
      const ceiling=Math.min(current.now+this.#config.limits.ttl_ms,current.lease_until_ms,
        this.#config.installation_scope?.valid_until_ms??Number.MAX_SAFE_INTEGER);
      if(expires<=current.now||deadlineUs>BigInt(ceiling)*1000n
        ||http&&nativeIdentityExpiry(base.deadline).ms>ceiling)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_DEADLINE_INVALID");
      const prior=await db.query("SELECT 1 FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 OR attempt_id=$2 UNION ALL SELECT 1 FROM elp210_candidate.leases WHERE lease_id=$1",
        [base.binding.lease_id,base.binding.attempt_id]);
      if(prior.rowCount)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_ALREADY_ADMITTED");
      const counts=(await db.query("SELECT count(*)::int AS retained,count(*) FILTER(WHERE unresolved)::int AS unresolved FROM elp210_candidate.obligations")).rows[0];
      if(counts.unresolved>=this.#config.limits.maximum_unresolved||counts.retained>=this.#config.limits.maximum_retained)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_CAPACITY_EXHAUSTED");
      const extraColumns=http?",lifecycle_kind,sender_id,scope_digest":"",extraValues=http?",'MANAGER_HTTP',$19,$20":"";
      const row=(await db.query<NativeRow>(
        "INSERT INTO elp210_candidate.native_read_obligations(lease_id,attempt_id,authority_revision,subject_id,session_id,session_revision,"+
        "workspace_id,environment,workload_id,request_digest,authority_fingerprint,source_identity_digest,base_body,stable_core_digest,binding_digest,deadline,issued_at_ms,expires_at_ms"+
        extraColumns+") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18"+extraValues+") RETURNING *",
        [base.binding.lease_id,base.binding.attempt_id,authority.revision,actor.user_id,actor.session_id,actor.session_generation,
          selected.workspace_id,selected.environment,this.workloadId(),base.binding.request_digest,current.authority_fingerprint,
          selected.source_identity_digest,captured.body,captured.prepared.stable_core_digest,captured.prepared.binding_digest,
          base.deadline,current.now,expires,...(http?[this.nativeSenderId,decision!.scope_digest]:[])])).rows[0];
      const finalNow=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
      this.checkInstallation(base.binding,true);
      if(finalNow>=expires)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_DEADLINE_INVALID");
      return row;
    });
  }
  /** One immutable native-family admission, never custody-then-upgrade. */
  async prepareNativeRead(untrustedActor:AccessActor,input:unknown,expectedScopeDigest?:string):Promise<PreparedCurrentHumanNativeHTTP>{
    const c=this.nativeConfig(),actor=nativeActor(untrustedActor);
    if(this.nativeById.size>=c.limits.maximum_unresolved){
      // A different replica can finish the existing shared recovery queue. Only
      // durable same-selected-source ACK readback retires stale local handles.
      const ids=[...this.nativeById.keys()];
      const completed=await this.transaction(async db=>(await db.query<{lease_id:string}>(
        "SELECT lease_id FROM elp210_candidate.native_read_obligations WHERE lease_id=ANY($1::text[]) "+
        "AND lifecycle_kind='MANAGER_HTTP' AND source_identity_digest=$2 AND source_reconciled",
        [ids,c.selection.source_identity_digest])).rows);
      for(const row of completed){const local=this.nativeById.get(row.lease_id);
        if(local)local.settled=true;this.nativeById.delete(row.lease_id);}
    }
    if(this.nativeById.size>=c.limits.maximum_unresolved)throw new CurrentHumanLeaseError("CURRENT_HUMAN_CAPACITY_EXHAUSTED");
    const row=await this.nativeAdmission(actor,input,true,expectedScopeDigest) as NativeHTTPRow;
    const context=this.selectedNativeRow(row),handle=Object.freeze({}) as PreparedCurrentHumanNativeHTTP;
    const state:NativeHTTPState={actor,context,base_body:row.base_body,binding_digest:row.binding_digest,
      stable_core_digest:row.stable_core_digest,scope_digest:row.scope_digest,valid_until_ms:Number(row.expires_at_ms),
      source_entered:false,sending:false,settled:false};
    this.nativeHandles.set(handle,state);this.nativeById.set(row.lease_id,state);return handle;
  }
  async signNativeReadRequest(handle:PreparedCurrentHumanNativeHTTP,action:"issue"|"enter"){
    if(this.nativeState(handle).frame)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_FINITE_PURPOSE_REQUIRED");
    return this.signNativeRequest(handle,action);
  }
  private async signNativeRequest(handle:NativeHandle,action:"issue"|"enter"){
    if(action!=="issue"&&action!=="enter")throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_PURPOSE_REQUIRED");
    const s=this.nativeState(handle),c=this.nativeConfig();
    if(s.frame)await revalidateNativeExecutionNotice(s.frame.notice); // actual adapter, never under Core lock
    const claims=await this.transaction(async(db,authority)=>{
      const {iat,exp}=await this.nativeSigningEligibility(db,authority,s,action);
      const path="/internal/elp210/business-root-read/"+action;
      const requestDigest=pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(path,"ascii"),
        query_string:new Uint8Array(),body:Buffer.from(s.base_body,"utf8")},{request_bytes:32768});
      return humanClaims.parse({iss:c.issuer,aud:c.audience,sub:s.actor.user_id,sid:s.actor.session_id,jti:randomUUID(),
        iat,nbf:iat,exp,purpose:"pma.identity.v1",principal_kind:"human",session_revision:s.actor.session_generation,
        authority_revision:Number(authority.revision),workspace_id:s.context.binding.workspace_id,
        environment:s.context.binding.environment,workload_id:c.workload_id,request_digest:requestDigest});
    });
    const token=await new SignJWT(claims).setProtectedHeader({alg:"EdDSA",kid:c.key_id,typ:"JWT"}).sign(c.private_key);
    // Real signing is asynchronous and outside locks. It cannot renew a stale
    // decision or ignore a concurrently committed no-send/drain boundary.
    if(s.frame)await revalidateNativeExecutionNotice(s.frame.notice);
    await this.transaction((db,authority)=>this.nativeSigningEligibility(db,authority,s,action));
    this.assertNativeAcquisitionCurrent(s);
    return token;
  }
  private assertNativeAcquisitionCurrent(s:NativeHTTPState):void {
    this.checkInstallation(s.context.binding,true);
    if(s.settled||s.sending||Date.now()>=s.valid_until_ms)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
  }
  private async nativeSigningEligibility(db:PoolClient,authority:{revision:string;drain_id:string|null},
    s:NativeHTTPState,action:"issue"|"enter"){
    const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[s.context.binding.lease_id])).rows[0];
    this.assertNativeRow(row,s);
    if(authority.drain_id||row.phase!=="ADMITTED"||row.no_send_fenced||row.authority_revision!==authority.revision
      ||action==="enter"&&(!row.native_source_digest||!row.issue_response_digest))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
    const d=await this.nativeDecision(db,s),iat=Math.floor(d.now_ms/1000),expiry=nativeIdentityExpiry(s.context.deadline);
    this.assertNativeAcquisitionCurrent(s);
    // Original admission time, NEVER a sliding fresh-now TTL. Earlier actual
    // source lease expiry caps send, not the unchanged Base's identity token.
    const ceiling=Math.min(d.valid_until_ms,Number(row.issued_at_ms)+this.nativeConfig().limits.ttl_ms,
      this.nativeConfig().installation_scope.valid_until_ms);
    if(d.now_ms>=s.valid_until_ms||expiry.ms>ceiling||expiry.seconds<=iat)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
    return{iat,exp:expiry.seconds};
  }
  private async bindNativeRead(handle:NativeHandle,observation:VerifiedSelectedNativeReadObservation){
    const s=this.nativeState(handle),proof=this.nativeObservation(observation),actual=proof.result;
    // Re-check registry identity at the mutation boundary; a copied carrier is
    // not sufficient even if its fields or response hash happen to match.
    if(proof.action!=="issue"||proof.base_body!==s.base_body
      ||proof.binding_digest!==s.binding_digest||proof.stable_core_digest!==s.stable_core_digest||actual.state!=="ISSUED"
      ||actual.human.portal_user_id!==s.actor.user_id)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    const requested=nativeBusinessReadUtcMicroseconds(s.context.deadline);
    const nativeUntil=nativeBusinessReadUtcMicroseconds(actual.native.expires_at),
      leaseUntil=nativeBusinessReadUtcMicroseconds(actual.lease.expires_at);
    // PM's actual lease may be shorter than the request. Keep immutable Base/
    // original deadline; independently shorten final-send currentness.
    if(leaseUntil>requested||leaseUntil>nativeUntil)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    const validUntil=Math.min(s.valid_until_ms,Number(leaseUntil/1000n),Number(nativeUntil/1000n));
    if(s.frame)await revalidateNativeExecutionNotice(s.frame.notice);
    await this.transaction(async(db,authority)=>{
      const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[s.context.binding.lease_id])).rows[0];
      this.assertNativeRow(row,s);
      if(authority.drain_id||row.phase!=="ADMITTED"||row.no_send_fenced||row.authority_revision!==authority.revision
        ||row.native_source_digest!==null||row.issue_response_digest!==null)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const decision=await this.nativeDecision(db,s);
      if(decision.now_ms>=validUntil
        ||nativeBusinessReadUtcMicroseconds(actual.native.effective_from)>BigInt(decision.now_ms)*1000n)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
      await db.query("UPDATE elp210_candidate.native_read_obligations SET native_source_digest=$2,native_source_fingerprint=$3,issue_response_digest=$4,native_valid_until_ms=$5 WHERE lease_id=$1",
        [row.lease_id,actual.lease.source_digest,actual.lease.source_fingerprint,proof.response_sha256,validUntil]);
    });
    s.source_digest=actual.lease.source_digest;s.source_fingerprint=actual.lease.source_fingerprint;s.valid_until_ms=validUntil;
  }
  async acquireNativeRead(actor:AccessActor,input:unknown,expectedScopeDigest?:string):Promise<PreparedCurrentHumanNativeHTTP>{
    const handle=await this.prepareNativeRead(actor,input,expectedScopeDigest);
    await this.acquirePreparedNativeRead(handle);return handle;
  }
  private async acquirePreparedNativeRead(handle:NativeHandle):Promise<void>{
    const s=this.nativeState(handle);
    const issueToken=await this.signNativeRequest(handle,"issue");
    this.assertNativeAcquisitionCurrent(s);
    const issued=await this.nativeCall(s.base_body,"issue",issueToken);
    await this.bindNativeRead(handle,issued);
    // Capture an owned zero-byte reservation after authentic ISSUE, before ENTER.
    if(s.frame)this.reserveNativeFrame(s);
    const enterToken=await this.signNativeRequest(handle,"enter");
    this.assertNativeAcquisitionCurrent(s);
    const entered=this.nativeObservation(await this.nativeCall(s.base_body,"enter",enterToken));
    if(entered.result.state!=="ENTERED")throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    if(s.frame)await revalidateNativeExecutionNotice(s.frame.notice);
    let fenced=false;
    await this.transaction(async(db,authority)=>{
      const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[s.context.binding.lease_id])).rows[0];
      this.assertNativeRow(row,s);
      // Nothing about the source ENTER can be recorded for a SENT/terminal row, another source, or twice. A concurrent mutation's
      // own recovery may already have fenced this still-unsent row to UNKNOWN before the ACK arrived (stage-2f end to end).
      if(!["ADMITTED","UNKNOWN"].includes(row.phase)||row.body_digest!==null||row.native_source_digest!==s.source_digest||row.enter_response_digest!==null)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      if(authority.drain_id||row.no_send_fenced||row.phase!=="ADMITTED"||row.authority_revision!==authority.revision){
        // A shared drain / fence / authority change began AFTER the source ENTER but BEFORE this record. The source ACK
        // was RECEIVED (unlike a lost wire ACK), so its digest is a durable fact of what the source did. Persist it with
        // the no-send fence, admit nothing and send nothing; the caller still gets the typed refusal after COMMIT, and the
        // existing unsent-fence path can settle the lease ABORTED instead of leaving the drain stuck (stage-2f finding).
        await db.query("UPDATE elp210_candidate.native_read_obligations SET enter_response_digest=$2,no_send_fenced=true WHERE lease_id=$1",
          [row.lease_id,entered.response_sha256]);
        fenced=true;return;
      }
      await this.nativeDecision(db,s);
      await db.query("UPDATE elp210_candidate.native_read_obligations SET enter_response_digest=$2 WHERE lease_id=$1",
        [row.lease_id,entered.response_sha256]);
    });
    if(fenced)throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
    s.source_entered=true;
  }

  /** Tightens uncertainty only. There is deliberately no terminal/release API. */
  async markNativeReadUnknown(leaseId: string, attemptId: string): Promise<void> {
    const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/;
    if (typeof leaseId !== "string" || typeof attemptId !== "string" || !uuid.test(leaseId) || !uuid.test(attemptId))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    await this.transaction(async db => {
      const row = (await db.query<NativeRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 AND attempt_id=$2 FOR UPDATE",
        [leaseId,attemptId])).rows[0];
      if (!row) throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_ATTEMPT_NOT_FOUND");
      if (row.phase === "ADMITTED") await db.query("UPDATE elp210_candidate.native_read_obligations SET phase='UNKNOWN' WHERE lease_id=$1", [leaseId]);
    });
  }

  private nativeAttempt(row: NativeRow): CurrentHumanNativeReadRecoveryAttempt {
    const captured = nativeAnyBase(Buffer.from(row.base_body, "utf8")), b = captured.base.binding;
    if((row.lifecycle_kind==="MANAGER_SSE_FRAME")!==(captured.base.manager_intent.schema_version==="pma.manager-read-intent.v2"))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_INVALID");
    if (captured.body !== row.base_body || captured.prepared.stable_core_digest !== row.stable_core_digest
      || captured.prepared.binding_digest !== row.binding_digest || b.lease_id !== row.lease_id || b.attempt_id !== row.attempt_id
      || b.subject !== row.subject_id || b.workspace_id !== row.workspace_id || b.environment !== row.environment
      || b.workload_id !== row.workload_id || b.request_digest !== row.request_digest
      || Number(nativeBusinessReadUtcMicroseconds(captured.base.deadline) / 1000n) !== Number(row.expires_at_ms))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_INVALID");
    digest.parse(row.source_identity_digest); digest.parse(row.authority_fingerprint);
    return Object.freeze({ family: "NATIVE_READ", lease_id: row.lease_id, attempt_id: row.attempt_id,
      base_body: row.base_body, stable_core_digest: row.stable_core_digest, binding_digest: row.binding_digest,
      source_identity_digest: row.source_identity_digest, authority_fingerprint: row.authority_fingerprint,
      subject_id: row.subject_id, session_id: row.session_id, session_revision: Number(row.session_revision),
      authority_revision: Number(row.authority_revision), expires_at_ms: Number(row.expires_at_ms), phase: row.phase,
      ...(row.lifecycle_kind==="MANAGER_HTTP"||row.lifecycle_kind==="MANAGER_SSE_FRAME"?{lifecycle_kind:row.lifecycle_kind}:{}) });
  }

  /** One bounded combined recovery order; old recoverableAttempts is unchanged.
   * Selection is metadata routing, never authority. Filter BEFORE LIMIT so a
   * missing native port cannot starve independent reverse-human recovery. */
  async recoverableObligations(selection: "BOTH" | "REVERSE_ONLY" = "BOTH") {
    if (selection !== "BOTH" && selection !== "REVERSE_ONLY")
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    return this.transaction(async db => {
      const rows = (await db.query<Row & Partial<NativeRow> & {family: string}>(`SELECT * FROM elp210_candidate.obligations
        WHERE workload_id=$1 AND unresolved AND (family='NATIVE_READ' OR phase IN ('ENTERED','UNKNOWN'))
          AND ($2='BOTH' OR family='REVERSE_HUMAN')
        ORDER BY issued_at_ms,family,lease_id LIMIT 128`, [this.workloadId(), selection])).rows;
      return rows.map(row => {
        if (row.family === "NATIVE_READ") return { family: "NATIVE_READ" as const, attempt: this.nativeAttempt(row as NativeRow) };
        return { family: "REVERSE_HUMAN" as const, attempt: {
          lease_id: row.lease_id, attempt_id: row.attempt_id!, workspace_id: row.workspace_id, environment: row.environment,
          workload_id: row.workload_id, request_digest: row.request_digest, human_issuer: this.#config.issuer,
          subject: row.subject_id, session_id: row.session_id, session_revision: Number(row.session_revision),
          authority_revision: Number(row.authority_revision), expires_at: Number(row.expires_at_ms) / 1000 } };
      });
    });
  }

  private async attest(token: string) {
    if (typeof token !== "string" || Buffer.byteLength(token) > 8192) throw new CurrentHumanLeaseError("CURRENT_HUMAN_SOURCE_PROOF_INVALID");
    try {
      const verified = await jwtVerify(token, this.reverseSource().public_key, { algorithms: ["EdDSA"],
        issuer: this.reverseSource().issuer, audience: this.reverseSource().audience, maxTokenAge: "60s" });
      if (verified.protectedHeader.kid !== this.reverseSource().key_id || verified.protectedHeader.typ !== "JWT") throw new Error();
      const body = sourceAttestation.parse(verified.payload);
      if (body.sub !== this.reverseSource().workload_id || body.workload_id !== body.sub || body.nbf !== body.iat
        || body.exp <= body.iat || body.exp - body.iat > 60) throw new Error();
      return body;
    } catch { throw new CurrentHumanLeaseError("CURRENT_HUMAN_SOURCE_PROOF_INVALID"); }
  }

  private checkInstallation(binding: Pick<CurrentHumanBinding, "workspace_id" | "environment">, fresh: boolean): void {
    const scope = this.#config.installation_scope;
    if (scope && (scope.workspace_id !== binding.workspace_id || scope.environment !== binding.environment
      || (fresh && Date.now() >= scope.valid_until_ms)))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID");
  }

  /** Source MUST enter once BEFORE borrowing its TS connection. Replayed entry
   * is refused, not permission for a second TS transaction. Lost enter ACK needs
   * the same source attempt's qualified resolution; never blindly retry a write. */
  async enter(humanToken: string, sourceProof: string): Promise<{ lease_id: string; attempt_id: string }> {
    return this.enterInternal(humanToken, sourceProof);
  }

  /** Original must already be retained before an entered attempt can exist.
   * The caller still must journal ENTER before emitting an ACK. */
  async enterWithCustody(humanToken: string, sourceProof: string, custody: RestoreIndependentCustodyCandidate,p7?:C2P7IssuerFenceCandidate): Promise<{ lease_id: string; attempt_id: string }> {
    if (!custody || Object.getPrototypeOf(custody) !== RestoreIndependentCustodyCandidate.prototype ||
        !custodyUsesSourcePool.call(custody, this.#pool)) throw new CurrentHumanLeaseError("CURRENT_HUMAN_CUSTODY_MISMATCH");
    return this.enterInternal(humanToken, sourceProof, custody,p7);
  }

  private async enterInternal(humanToken: string, sourceProof: string, custody?: RestoreIndependentCustodyCandidate,p7?:C2P7IssuerFenceCandidate): Promise<{ lease_id: string; attempt_id: string }> {
    const source = await this.attest(sourceProof);
    this.checkInstallation(source, true);
    if (typeof humanToken !== "string" || Buffer.byteLength(humanToken) > 8192)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID");
    let human: z.infer<typeof humanClaims>;
    try {
      const verified = await jwtVerify(humanToken, this.#humanPublicKey, { algorithms: ["EdDSA"],
        issuer: this.#config.issuer, audience: this.#config.audience, maxTokenAge: "60s" });
      if (verified.protectedHeader.kid !== this.#config.key_id || verified.protectedHeader.typ !== "JWT") throw new Error();
      human = humanClaims.parse(verified.payload);
      if (human.exp <= human.iat || human.exp - human.iat > 60 || human.nbf !== human.iat) throw new Error();
    } catch { throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID"); }
    if (source.phase !== "ENTER" || source.lease_id !== human.jti) throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
    return this.transaction(async (db, authority) => {
      this.checkInstallation(source, true);
      if (authority.drain_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
      const row = (await db.query<Row>("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR UPDATE", [human.jti])).rows[0];
      if (!row || row.phase !== "ISSUED") throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      // Existing generic leases are not retroactively authorized by enabling
      // C2. Their exact source terminal remains settleable via RESOLVE.
      if(this.#config.c2_delivery_schema_required===true&&
        (row.c2_p7_binding_digest===null||row.human_assertion_digest===null||row.c2_custody_binding_digest===null))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
      // This implementation refuses to omit or replace a bound P7
      // preparation, including after owner-intent revoke. An older process
      // that does not execute this check must be fenced separately before
      // any rollout. Entered originals settle via the separate RESOLVE path.
      if(row.c2_p7_binding_digest!==null) {
        if(p7===undefined||row.c2_p7_binding_digest!==this.#c2P7Digest(p7))
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
        if((await this.#checkC2P7(db,p7,{user_id:row.subject_id,session_id:row.session_id,
          session_generation:Number(row.session_revision)},source)).intent_id!==row.c2_p7_owner_intent_id)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
      }
      if (row.human_assertion_digest !== null) {
        if (!custody || row.human_assertion_digest !== accessDigest(humanToken) ||
            row.c2_custody_binding_digest !== custodyBindingDigest.call(custody))
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_CUSTODY_REQUIRED");
        const snapshot = await custodyInventory.call(custody);
        const proofHash = createHash("sha256").update(humanToken, "utf8").digest("hex");
        if (snapshot.events.filter(event => event.kind === "ISSUED_HUMAN_ASSERTION" && event.lease_id === row.lease_id &&
          event.proof_hash === proofHash).length !== 1) throw new CurrentHumanLeaseError("CURRENT_HUMAN_CUSTODY_PROOF_REQUIRED");
      }
      this.bind(row, source);
      if (row.human_issuer !== human.iss || !this.matchesHumanSigningKey(row.human_signing_key_digest) || !this.matchesReverseTrust(row.source_trust_digest) || Number(row.authority_revision) !== human.authority_revision || row.authority_revision !== authority.revision
        || row.subject_id !== human.sub || row.session_id !== human.sid || Number(row.session_revision) !== human.session_revision
        || Number(row.issued_at_ms) !== human.iat * 1000 || Number(row.expires_at_ms) !== human.exp * 1000
        || row.workspace_id !== human.workspace_id || row.environment !== human.environment
        || row.workload_id !== human.workload_id || row.request_digest !== human.request_digest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
      // Custody inspection above can wait on a separate store. Check the P7
      // owner and step-up clock again just before the ENTER write.
      if(row.c2_p7_binding_digest!==null&&p7!==undefined&&
        (await this.#checkC2P7(db,p7,{user_id:row.subject_id,session_id:row.session_id,
          session_generation:Number(row.session_revision)},source)).intent_id!==row.c2_p7_owner_intent_id)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_C2_P7_FENCE_REQUIRED");
      const now = Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
      if (now >= Number(row.expires_at_ms)) throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
      await db.query("UPDATE elp210_candidate.leases SET phase='ENTERED',attempt_id=$2 WHERE lease_id=$1", [row.lease_id, source.attempt_id]);
      return { lease_id: row.lease_id, attempt_id: source.attempt_id };
    });
  }

  private bind(row: Row, source: z.infer<typeof sourceAttestation>) {
    if (row.workspace_id !== source.workspace_id || row.environment !== source.environment
      || row.workload_id !== source.workload_id || row.request_digest !== source.request_digest
      || row.attempt_id !== null && row.attempt_id !== source.attempt_id)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
  }

  /** Only an authenticated source terminal receipt releases a used lease.
   * UNKNOWN persists/quarantines it. Token expiry and local cancellation do not
   * prove that an async COMMIT did not succeed. No TTL-based auto-release. */
  async resolve(sourceProof: string): Promise<{ replayed: boolean; phase: string }> {
    return this.resolveInternal(sourceProof);
  }

  /** Recovery-only legacy path. The classification must be checked again
   * inside the row-locking transaction, not just by the caller's prior read. */
  async resolveLegacyForRestore(sourceProof: string): Promise<{ replayed: boolean; phase: string }> {
    return this.resolveInternal(sourceProof);
  }

  /** C2 must bind the same authenticated original to its independent journal.
   * This is a source-only candidate, not proof of a qualified failure domain. */
  async resolveWithCustody(sourceProof: string, custody: RestoreIndependentCustodyCandidate): Promise<{ replayed: boolean; phase: string }> {
    if (!custody || Object.getPrototypeOf(custody) !== RestoreIndependentCustodyCandidate.prototype ||
        !custodyUsesSourcePool.call(custody, this.#pool)) throw new CurrentHumanLeaseError("CURRENT_HUMAN_CUSTODY_MISMATCH");
    return this.resolveInternal(sourceProof, custody);
  }

  private async resolveInternal(sourceProof: string, custody?: RestoreIndependentCustodyCandidate): Promise<{ replayed: boolean; phase: string }> {
    const source = await this.attest(sourceProof);
    this.checkInstallation(source, false);
    if (source.phase === "ENTER") throw new CurrentHumanLeaseError("CURRENT_HUMAN_TERMINAL_REQUIRED");
    return this.transaction(async db => {
      const row = (await db.query<Row>("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR UPDATE", [source.lease_id])).rows[0];
      if (!row) throw new CurrentHumanLeaseError("CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE");
      if (row.human_assertion_digest !== null) {
        if (!digest.safeParse(row.human_assertion_digest).success || !custody ||
            row.c2_custody_binding_digest !== custodyBindingDigest.call(custody))
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_RESTORE_C2_CUSTODY_REQUIRED");
        const snapshot = await custodyInventory.call(custody);
        const expectedKind = source.phase === "UNKNOWN" ? "SIGNED_SOURCE_UNKNOWN" : "SIGNED_SOURCE_TERMINAL";
        const matches = snapshot.events.filter(event => event.kind === expectedKind && event.lease_id === source.lease_id &&
          terminalSemanticDigest(event.body) === terminalSemanticDigest(source));
        if (matches.length !== 1) throw new CurrentHumanLeaseError("CURRENT_HUMAN_CUSTODY_PROOF_REQUIRED");
      }
      if (!this.matchesReverseTrust(row.source_trust_digest))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_SOURCE_TRUST_UNAVAILABLE");
      this.bind(row, source);
      const terminal = source.phase === "UNKNOWN" ? null : accessDigest({ lease_id: source.lease_id, attempt_id: source.attempt_id,
        phase: source.phase, source_receipt_id: source.source_receipt_id, source_receipt_digest: source.source_receipt_digest,
        workspace_id: source.workspace_id, environment: source.environment, workload_id: source.workload_id, request_digest: source.request_digest });
      if (row.phase === "ISSUED" || row.phase === "RETIRED") {
        // A signed source rollback is a separate fact, not a manufactured
        // ENTER or an inference from expiry. Keep unused Core leases RETIRED.
        const prior = (await db.query<{ attempt_id: string; terminal_receipt_digest: string }>(
          "SELECT attempt_id,terminal_receipt_digest FROM elp210_candidate.events WHERE lease_id=$1 AND phase='SOURCE_ROLLED_BACK_UNENTERED' ORDER BY event_id LIMIT 2",
          [row.lease_id])).rows;
        if (prior.length) {
          if (source.phase !== "ROLLED_BACK" || prior.length !== 1 || row.phase !== "RETIRED" || prior[0].attempt_id !== source.attempt_id
            || prior[0].terminal_receipt_digest !== terminal)
            throw new CurrentHumanLeaseError("CURRENT_HUMAN_TERMINAL_CONFLICT");
          return { replayed: true, phase: "ROLLED_BACK" };
        }
        if (source.phase === "UNKNOWN") {
          // The source journal predates ENTER. A lost/denied ENTER followed by
          // an uncertain source read is not proof of either entry or rollback.
          // Quarantine this exact attempt, including a previously retired token,
          // so it can neither ENTER later nor disappear from drain/recovery.
          await db.query("UPDATE elp210_candidate.leases SET phase='UNKNOWN',attempt_id=$2 WHERE lease_id=$1", [row.lease_id, source.attempt_id]);
          return { replayed: false, phase: "UNKNOWN" };
        }
        if (source.phase !== "ROLLED_BACK")
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE");
        if (row.phase === "ISSUED")
          await db.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE lease_id=$1", [row.lease_id]);
        await db.query("INSERT INTO elp210_candidate.events(lease_id,phase,attempt_id,terminal_receipt_digest) VALUES($1,'SOURCE_ROLLED_BACK_UNENTERED',$2,$3)",
          [row.lease_id, source.attempt_id, terminal]);
        // ACK describes the verified SOURCE terminal, never Core execution.
        return { replayed: false, phase: "ROLLED_BACK" };
      }
      if (!["ENTERED", "UNKNOWN", "COMMITTED", "ROLLED_BACK"].includes(row.phase))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE");
      if (row.phase === source.phase && row.terminal_receipt_digest === terminal) return { replayed: true, phase: row.phase };
      if (["COMMITTED", "ROLLED_BACK"].includes(row.phase)) throw new CurrentHumanLeaseError("CURRENT_HUMAN_TERMINAL_CONFLICT");
      if (row.phase === "UNKNOWN" && source.phase === "COMMITTED") {
        const entered = await db.query("SELECT 1 FROM elp210_candidate.events WHERE lease_id=$1 AND phase='ENTERED' AND attempt_id=$2 LIMIT 1", [row.lease_id, source.attempt_id]);
        if (entered.rowCount !== 1) throw new CurrentHumanLeaseError("CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE");
      }
      await db.query("UPDATE elp210_candidate.leases SET phase=$2,terminal_receipt_digest=$3 WHERE lease_id=$1",
        [row.lease_id, source.phase, terminal]);
      return { replayed: false, phase: source.phase };
    });
  }

  /** Private operator/provider recovery port, not a browser endpoint. The Core
   * ENTER record survives a PM crash even before it opens its source TX. Hand
   * these exact attempts only to this configured authenticated source provider;
   * no old JWT/session credential or business grant is reconstructed. Reading
   * an attempt never releases it or authorizes another entry/transaction. */
  async recoverableAttempts() {
    if(!this.#config.source)return [];
    return this.transaction(async db => {
      const rows = await db.query<Row>(`SELECT * FROM elp210_candidate.leases
        WHERE workload_id=$1 AND phase IN ('ENTERED','UNKNOWN') ORDER BY issued_at_ms,lease_id LIMIT 128`,
        [this.reverseSource().workload_id]);
      // Do not silently omit unresolved originals whose historical issuer is
      // absent or differs from this installation after a restart/rotation.
      if (rows.rows.some(row => row.human_issuer !== this.#config.issuer))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_ISSUER_UNAVAILABLE");
      if (rows.rows.some(row => !this.matchesReverseTrust(row.source_trust_digest)))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_SOURCE_TRUST_UNAVAILABLE");
      return rows.rows.map(row => ({ lease_id: row.lease_id, attempt_id: row.attempt_id!, workspace_id: row.workspace_id,
        environment: row.environment, workload_id: row.workload_id, request_digest: row.request_digest,
        human_issuer: row.human_issuer!, subject: row.subject_id, session_id: row.session_id,
        session_revision: Number(row.session_revision), authority_revision: Number(row.authority_revision),
        expires_at: Number(row.expires_at_ms) / 1000 }));
    });
  }

  /** Private recovery lookup for one already-known original. No LIMIT-based
   * listing and no authority to create/re-enter a transaction. The configured
   * source workload and installation scope still apply after revocation. */
  async recoverableExactAttempt(leaseId: string, attemptId: string) {
    id.parse(leaseId); id.parse(attemptId);
    if (!this.#config.source) return null;
    // This lookup is the C2 Research recovery seam, not the generic recovery
    // enumeration. Never infer a Paper/workspace scope from the stored row.
    if (!this.#config.installation_scope || this.#config.installation_scope.environment !== "paper")
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID");
    return this.transaction(async db => {
      const rows = await db.query<Row>(`SELECT * FROM elp210_candidate.leases
        WHERE lease_id=$1 AND workload_id=$3 AND
          ((attempt_id=$2 AND phase IN ('ENTERED','UNKNOWN','COMMITTED','ROLLED_BACK')) OR
           (phase='RETIRED' AND attempt_id IS NULL))`,
      [leaseId, attemptId, this.reverseSource().workload_id]);
      if (rows.rows.length > 1) throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
      const row = rows.rows[0];
      if (!row) return null;
      this.checkInstallation(row, false);
      if (row.human_issuer !== this.#config.issuer)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_ISSUER_UNAVAILABLE");
      if (!this.matchesReverseTrust(row.source_trust_digest))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_RECOVERY_SOURCE_TRUST_UNAVAILABLE");
      if (['RETIRED', 'COMMITTED', 'ROLLED_BACK'].includes(row.phase)) {
        // Terminal rows and unentered rollbacks must have one matching event.
        // This detects inconsistent local history; append-only triggers alone
        // do NOT authenticate INSERT provenance or prove a source receipt.
        const events = await db.query<{ phase: string; attempt_id: string | null; terminal_receipt_digest: string | null }>(
          `SELECT phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.events
           WHERE lease_id=$1 AND phase IN ('COMMITTED','ROLLED_BACK','SOURCE_ROLLED_BACK_UNENTERED')
           ORDER BY event_id LIMIT 2`, [row.lease_id]);
        const event = events.rows[0];
        const expectedPhase = row.phase === 'RETIRED' ? 'SOURCE_ROLLED_BACK_UNENTERED' : row.phase;
        if (events.rows.length !== 1 || event.phase !== expectedPhase || event.attempt_id !== attemptId ||
            !digest.safeParse(event.terminal_receipt_digest).success ||
            (row.phase !== 'RETIRED' && event.terminal_receipt_digest !== row.terminal_receipt_digest)) return null;
      }
      return { lease_id: row.lease_id, attempt_id: attemptId, workspace_id: row.workspace_id,
        environment: row.environment, workload_id: row.workload_id, request_digest: row.request_digest,
        human_issuer: row.human_issuer, subject: row.subject_id, session_id: row.session_id,
        session_revision: Number(row.session_revision), authority_revision: Number(row.authority_revision),
        expires_at: Number(row.expires_at_ms) / 1000 };
    });
  }

  /** Persist drain FIRST, in its own committed short transaction. Do not throw
   * because leases are busy here: doing so would roll back the drain itself. */
  async beginDrain(drainId: string) {
    id.parse(drainId);
    return this.transaction(async (db, authority) => {
      if (authority.drain_id && authority.drain_id !== drainId) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      await db.query("UPDATE elp210_candidate.authority SET drain_id=$1 WHERE singleton", [drainId]);
      // Never-used tokens cannot start after drain; retiring these is safe.
      await db.query("UPDATE elp210_candidate.leases SET phase='RETIRED' WHERE phase='ISSUED'");
      return this.drainState(db, drainId, authority.revision);
    });
  }

  private async drainState(db: PoolClient, drainId: string, revision: string) {
    const counts = await currentHumanDrainCounts(db,this.#config.c2_delivery_schema_required===true);
    return { drain_id: drainId, authority_revision: Number(revision),
      status: counts.unknown > 0 ? "DRAIN_UNKNOWN" : counts.pending > 0 ? "DRAIN_PENDING" : "DRAIN_READY",
      pending: Number(counts.pending) };
  }

  async drainStatus(drainId: string) {
    return this.transaction(async (db, authority) => {
      if (authority.drain_id !== drainId) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      return this.drainState(db, drainId, authority.revision);
    });
  }

  /** Call only AFTER the existing authority writer commits. No hidden replay
   * of the mutation; caller must read its actual result before acknowledging. */
  async endDrain(drainId: string, expectedRevision: number) {
    integer.parse(expectedRevision);
    return this.transaction(async (db, authority) => {
      if (authority.drain_id !== drainId || Number(authority.revision) !== expectedRevision)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      if ((await this.drainState(db, drainId, authority.revision)).status !== "DRAIN_READY") throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_UNRESOLVED");
      await db.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton");
    });
  }

  /** Private owner cleanup only: retire/drain must have COMMITTED before this
   * call. The trusted caller retains the exact one-view bearer for AuthService
   * logout AFTER this transaction. This is neither a source terminal receipt
   * nor permission to reconstruct a session, enter TS, or acknowledge COMMIT.
   * Callback witness MUST synchronously throw unless its complete local
   * transport snapshot is known and every counter is zero; never take it from
   * IPC input. No network/callback I/O may run while this Core lock is held. */
  async finishUnusedIdentityDrain(drainId: string, expectedDrainRevision: number,
    original: { lease_id: string; authority_revision: number; actor: AccessActor; binding: CurrentHumanBinding },
    assertNoCallbacks: () => void): Promise<void> {
    id.parse(drainId); integer.parse(expectedDrainRevision);
    const leaseId = id.parse(original.lease_id), originalRevision = integer.parse(original.authority_revision),
      actor = nativeActor(original.actor), binding = currentHumanBinding.parse(original.binding);
    // Expired installations may finish exact retained custody; this creates no
    // fresh identity/grant, and never treats expiry as evidence of rollback.
    this.checkInstallation(binding, false);
    if (binding.workload_id !== this.reverseSource().workload_id)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
    if (typeof assertNoCallbacks !== "function" || types.isAsyncFunction(assertNoCallbacks))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_UNUSED_IDENTITY_WITNESS_REQUIRED");
    return this.transaction(async (db, authority) => {
      if (authority.drain_id !== drainId || Number(authority.revision) !== expectedDrainRevision)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_CONFLICT");
      if ((await this.drainState(db, drainId, authority.revision)).status !== "DRAIN_READY")
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAIN_UNRESOLVED");
      const row = (await db.query<Row>(
        "SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 AND authority_revision=$2 AND subject_id=$3 " +
        "AND session_id=$4 AND session_revision=$5 AND workspace_id=$6 AND environment=$7 " +
        "AND workload_id=$8 AND request_digest=$9 FOR UPDATE",
        [leaseId, originalRevision, actor.user_id, actor.session_id, actor.session_generation,
          binding.workspace_id, binding.environment, binding.workload_id, binding.request_digest])).rows[0];
      if (!row) throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
      if (row.phase !== "RETIRED" || row.attempt_id !== null || row.terminal_receipt_digest !== null)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_UNUSED_IDENTITY_NOT_ELIGIBLE");
      const events = (await db.query<{ phase: string; attempt_id: string | null; terminal_receipt_digest: string | null }>(
        "SELECT phase,attempt_id,terminal_receipt_digest FROM elp210_candidate.events " +
        "WHERE lease_id=$1 ORDER BY event_id LIMIT 3", [leaseId])).rows;
      if (events.length !== 2 || events.some((event, index) =>
        event.phase !== (index === 0 ? "ISSUED" : "RETIRED") ||
        event.attempt_id !== null || event.terminal_receipt_digest !== null))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_UNUSED_IDENTITY_NOT_ELIGIBLE");
      // A synchronous trusted witness is sampled under the SAME authority lock,
      // after immutable history and global (all-family) drain checks. A Promise
      // is not evidence: no async work may escape this decision fence.
      const witness: unknown = assertNoCallbacks();
      if (types.isPromise(witness)) {
        // Observe rejection on an actual native Promise without awaiting it,
        // invoking a thenable or allowing its fulfillment value to propagate.
        void Promise.prototype.then.call(witness, () => undefined, () => undefined);
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_UNUSED_IDENTITY_WITNESS_REQUIRED");
      }
      if (witness !== undefined)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_UNUSED_IDENTITY_WITNESS_REQUIRED");
      await db.query("UPDATE elp210_candidate.authority SET drain_id=NULL WHERE singleton");
    });
  }

  static async createNativeRead(pool:Pool,input:CurrentHumanNativeHTTPConfig){
    if([pool.options.connectionTimeoutMillis,pool.options.query_timeout]
      .some(n=>!Number.isSafeInteger(n)||Number(n)<1||Number(n)>60000))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_POOL_TIMEOUT_REQUIRED");
    const root=nativeOwn(input,["issuer","audience","key_id","private_key","selected_source","limits",
      "installation_scope","terminal","egress"]);
    const source=selectedNativeBusinessReadSelection(root.selected_source);
    if(root.issuer!==source.binding.human_issuer)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CONFIG_INVALID");
    const c:NativeHTTPRuntimeConfig={...input,
      selected_source:root.selected_source as SelectedNativeBusinessReadSource,
      workload_id:source.binding.workload_id,
      limits:{...nativeOwn(root.limits,["ttl_ms","maximum_unresolved","maximum_retained"])} as CurrentHumanCandidateConfig["limits"],
      installation_scope:{...nativeOwn(root.installation_scope,["workspace_id","environment","valid_until_ms"])} as CurrentHumanNativeHTTPConfig["installation_scope"],
      terminal:{...nativeOwn(root.terminal,["issuer","audience","key_id","private_key","ttl_seconds"])} as CurrentHumanNativeHTTPConfig["terminal"],
      egress:{...nativeOwn(root.egress,["maximum_response_bytes","maximum_inflight","send_timeout_ms","quiesce_timeout_ms"])} as unknown as NativeReadEgressLimits,
      selection:nativeSelection({workspace_id:source.binding.workspace_id,environment:source.binding.environment,
        domain:source.domain,source_identity_digest:source.source_identity_digest},String(root.issuer),source.binding.workload_id)};
    for(const v of[c.issuer,c.audience,c.key_id,c.workload_id,c.terminal.issuer,c.terminal.audience,c.terminal.key_id])id.parse(v);
    const l=c.limits,s=c.installation_scope;
    const sourceInstallation=selectedNativeBusinessReadInstallationExpiresAtMs(c.selected_source),
      sourceNativeExpiry=Number(nativeBusinessReadUtcMicroseconds(source.native.expires_at)/1000n);
    if(![l.ttl_ms,l.maximum_unresolved,l.maximum_retained].every(Number.isSafeInteger)
      ||l.ttl_ms<1000||l.ttl_ms>60000||l.maximum_unresolved<1||l.maximum_unresolved>128
      ||l.maximum_retained<l.maximum_unresolved||l.maximum_retained>4096
      ||!id.safeParse(s.workspace_id).success||!["paper","sandbox","live"].includes(s.environment)
      ||!Number.isSafeInteger(s.valid_until_ms)||s.valid_until_ms<1
      ||s.valid_until_ms>sourceInstallation||s.valid_until_ms>sourceNativeExpiry
      ||s.workspace_id!==c.selection.workspace_id||s.environment!==c.selection.environment
      ||!Number.isSafeInteger(c.terminal.ttl_seconds)||c.terminal.ttl_seconds<1||c.terminal.ttl_seconds>60)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CONFIG_INVALID");
    // Expired private installations remain constructible for SAME-key source
    // reconciliation. Every new admission/sign/ENTER/SENDING still checks its
    // active installation; expiry never discards a held external obligation.
    const own=await exportJWK(c.private_key),terminal=await exportJWK(c.terminal.private_key);
    if(own.kty!=="OKP"||own.crv!=="Ed25519"||!own.d||terminal.kty!=="OKP"||terminal.crv!=="Ed25519"||!terminal.d)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_ED25519_TRUST_REQUIRED");
    const{d:_secret,...pub}=own,publicKey=await importJWK(pub,"EdDSA");
    if(publicKey instanceof Uint8Array)throw new CurrentHumanLeaseError("CURRENT_HUMAN_ED25519_TRUST_REQUIRED");
    Object.freeze(c.limits);Object.freeze(c.installation_scope);Object.freeze(c.terminal);Object.freeze(c.egress);
    const candidate=new CurrentHumanCandidate(pool,{
      issuer:c.issuer,audience:c.audience,key_id:c.key_id,private_key:c.private_key,
      limits:c.limits,installation_scope:c.installation_scope,native_read_custody:c.selection},publicKey);
    candidate.nativeHTTP=Object.freeze(c);
    candidate.#nativeFrameSettlement=new NativeFrameSettlement(pool,c.selected_source,candidate.nativeSenderId);
    candidate.nativeEgress=new NativeReadEgress(c.egress,candidate.#nativeFrameSettlement);return candidate;
  }

  /** Private owner API. Opening captures transport only, writes no SSE header or
   * data. The trusted Hub must surrender every other writer/heartbeat and use
   * prepareNativeNotice with this owner's exact next delivery coordinates. */
  openNativeNoticeStream(response:ServerResponse):NativeReadEgressStream{
    this.nativeConfig();return this.nativeEgress!.openStream(response);
  }
  nextNativeNoticeDelivery(stream:NativeReadEgressStream){
    if(this.#nativeFrameBusy.get(stream))throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_STREAM_BUSY");
    return this.nativeEgress!.nextFrameDelivery(stream);
  }
  closeNativeNoticeStream(stream:NativeReadEgressStream):void{this.nativeEgress!.closeStream(stream);}

  async prepareNativeFrame(stream:NativeReadEgressStream,notice:PreparedExecutionNativeNotice):Promise<PreparedCurrentHumanNativeFrame>{
    const c=this.nativeConfig(),view=nativeExecutionNoticeView(notice),
      delivery=this.nextNativeNoticeDelivery(stream),actor=nativeActor(view.actor);
    if(view.manager&&(accessDigest(view.manager.domain)!==accessDigest(c.selection.domain)||
      view.manager.source_identity_digest!==c.selection.source_identity_digest||
      !digest.safeParse(view.manager.read_scope_digest).success))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    if(view.workspace_id!==c.selection.workspace_id||view.environment!==c.selection.environment||
      view.profile_id!==c.selection.domain.profile_id||view.intent.stream_id!==delivery.stream_id||
      view.intent.frame_ordinal!==delivery.frame_ordinal||view.scope_digest!=="sha256:"+view.intent.stream_scope_digest||
      view.payload.length<1||view.payload.length>c.egress.maximum_response_bytes||
      createHash("sha256").update(view.payload).digest("hex")!==view.intent.frame_sha256)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    // Per-stream acquisition lock is taken synchronously before adapter/SQL
    // awaits. No two native admissions can acquire the same delivery ordinal.
    this.#nativeFrameBusy.set(stream,true);
    try{
      if(this.nativeById.size>=c.limits.maximum_unresolved)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_CAPACITY_EXHAUSTED");
      await revalidateNativeExecutionNotice(notice); // actual qualified adapter, no Core lock
      const row=await this.transaction(async(db,authority)=>{
        if(authority.drain_id)throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
        const n=await assertNativeExecutionNoticeCurrent(db,notice,this.#pool);
        const d=n.manager_read_decision??await evaluateManagerDomainRead(db,{actor,workspace_id:view.workspace_id,
          environment:view.environment,domain:c.selection.domain});
        if(Boolean(view.manager)!==Boolean(n.manager_read_decision)||
          view.manager&&view.manager.read_scope_digest!==d.scope_digest)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
        if(d.authority_fingerprint!==n.authority_fingerprint||n.scope_digest!==view.scope_digest||
          d.field_policy_sha256!==c.selection.domain.field_policy_sha256)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
        this.checkInstallation({workspace_id:view.workspace_id,environment:view.environment},true);
        const now=Math.max(d.now_ms,n.now_ms),ceiling=Math.min(now+c.limits.ttl_ms,
          d.valid_until_ms,n.valid_until_ms,c.installation_scope.valid_until_ms),
          expires=Math.floor(ceiling/1000)*1000;
        if(expires<=now)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_DEADLINE_INVALID");
        const binding={lease_id:randomUUID(),attempt_id:randomUUID(),human_issuer:c.issuer,
          subject:actor.user_id,workspace_id:view.workspace_id,environment:view.environment,
          workload_id:c.workload_id,operation:"READ" as const};
        const deadline=new Date(expires).toISOString(),intent={...view.intent},
          requestDigest=accessDigest({binding,domain:c.selection.domain,deadline,manager_intent:intent}).slice(7);
        const captured=nativeAnyBase({schema_version:"pma.native-business-read.request.v1",
          binding:{...binding,request_digest:requestDigest},domain:c.selection.domain,
          deadline,manager_intent:{...intent,digest:requestDigest}}),
          scopeDigest=accessDigest({schema:"portal.native-frame-scope.v1",
            domain_scope_digest:d.scope_digest,notice_scope_digest:n.scope_digest});
        const counts=(await db.query("SELECT count(*)::int AS retained,count(*) FILTER(WHERE unresolved)::int AS unresolved FROM elp210_candidate.obligations")).rows[0];
        if(counts.unresolved>=c.limits.maximum_unresolved||counts.retained>=c.limits.maximum_retained)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_CAPACITY_EXHAUSTED");
        const inserted=(await db.query<NativeHTTPRow>(
          "INSERT INTO elp210_candidate.native_read_obligations(lease_id,attempt_id,authority_revision,subject_id,session_id,session_revision,"+
          "workspace_id,environment,workload_id,request_digest,authority_fingerprint,source_identity_digest,base_body,stable_core_digest,binding_digest,deadline,issued_at_ms,expires_at_ms,"+
          "lifecycle_kind,sender_id,scope_digest,frame_domain_scope_digest,frame_notice_scope_digest) "+
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'MANAGER_SSE_FRAME',$19,$20,$21,$22) RETURNING *",
          [binding.lease_id,binding.attempt_id,authority.revision,actor.user_id,actor.session_id,actor.session_generation,
            view.workspace_id,view.environment,c.workload_id,requestDigest,n.authority_fingerprint,c.selection.source_identity_digest,
            captured.body,captured.prepared.stable_core_digest,captured.prepared.binding_digest,deadline,now,expires,
            this.nativeSenderId,scopeDigest,d.scope_digest,n.scope_digest])).rows[0];
        const finalNow=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
        this.checkInstallation({workspace_id:view.workspace_id,environment:view.environment},true);
        if(Math.max(finalNow,Date.now())>=expires)throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
        return inserted;
      });
      const context=this.selectedNativeRow(row);
      if(context.manager_intent.schema_version!=="pma.manager-read-intent.v2")
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
      const {digest:_intentDigest,...intent}=context.manager_intent;
      if(accessDigest(intent)!==accessDigest(view.intent))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
      const handle=Object.freeze({}) as PreparedCurrentHumanNativeFrame;
      const state:NativeHTTPState={actor,context,base_body:row.base_body,binding_digest:row.binding_digest,
        stable_core_digest:row.stable_core_digest,scope_digest:row.scope_digest,valid_until_ms:Number(row.expires_at_ms),
        source_entered:false,sending:false,settled:false,frame:{notice,stream,
          domain_scope_digest:row.frame_domain_scope_digest!,notice_scope_digest:row.frame_notice_scope_digest!,
          payload:Buffer.from(view.payload)}};
      this.nativeHandles.set(handle,state);this.nativeById.set(row.lease_id,state);return handle;
    }catch(error){
      // A lost SQL ACK may already have admitted the original row. Never clear
      // an uncertain stream/acquisition slot and mint replacement authority.
      this.nativeEgress!.closeStream(stream);throw error;
    }
  }

  async acquireNativeFrame(stream:NativeReadEgressStream,notice:PreparedExecutionNativeNotice):Promise<PreparedCurrentHumanNativeFrame>{
    const handle=await this.prepareNativeFrame(stream,notice),s=this.nativeState(handle);
    try{await this.acquirePreparedNativeRead(handle);return handle;}
    catch(error){
      this.nativeEgress!.closeStream(stream);
      await this.reconcileNativeRead(s.context.binding.lease_id).catch(()=>undefined);throw error;
    }
  }
  private reserveNativeFrame(s:NativeHTTPState):void{
    const f=s.frame;
    if(!f||f.reservation||!s.source_digest||!s.source_fingerprint)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SEND_REFUSED");
    const bodyDigest="sha256:"+createHash("sha256").update(f.payload).digest("hex");
    if(s.context.manager_intent.schema_version!=="pma.manager-read-intent.v2"||
      s.context.manager_intent.frame_sha256!==bodyDigest.slice(7))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    const binding=Object.freeze({lease_id:s.context.binding.lease_id,attempt_id:s.context.binding.attempt_id,
      binding_digest:s.binding_digest,source_digest:s.source_digest,scope_digest:s.scope_digest,
      body_digest:bodyDigest,valid_until_ms:s.valid_until_ms});
    s.body_digest=bodyDigest;f.reservation=this.nativeEgress!.reserveFrame(f.stream,f.payload,binding);
    const d=this.nativeEgress!.frameDelivery(f.reservation);
    if(d.stream_id!==s.context.manager_intent.stream_id||d.frame_ordinal!==s.context.manager_intent.frame_ordinal)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
  }
  private observeNativeFrame(s:NativeHTTPState,witness:NativeReadEgressFrameWitness){
    const f=s.frame;if(!f?.reservation)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_WITNESS_REFUSED");
    const observed=this.nativeEgress!.consumeFrame(witness,f.reservation),b=observed.binding;
    if(s.context.manager_intent.schema_version!=="pma.manager-read-intent.v2"||
      b.lease_id!==s.context.binding.lease_id||b.attempt_id!==s.context.binding.attempt_id||
      b.binding_digest!==s.binding_digest||b.source_digest!==s.source_digest||b.scope_digest!==s.scope_digest||
      b.body_digest!==s.body_digest||observed.delivery.stream_id!==s.context.manager_intent.stream_id||
      observed.delivery.frame_ordinal!==s.context.manager_intent.frame_ordinal)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_WITNESS_REFUSED");
    s.observation=observed;f.target=this.nativeEgress!.frameSettlementTarget(f.reservation);return observed;
  }
  private async beginNativeFrame(handle:PreparedCurrentHumanNativeFrame){
    const s=this.nativeState(handle),f=s.frame;
    if(!f||s.sending||s.settled||!s.source_entered||!s.source_digest||!s.source_fingerprint||!f.reservation)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SEND_REFUSED");
    s.sending=true; // one shot BEFORE the real source revalidation await
    await revalidateNativeExecutionNotice(f.notice);
    await this.transaction(async(db,authority)=>{
      const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[s.context.binding.lease_id])).rows[0];
      this.assertNativeRow(row,s);
      if(authority.drain_id||row.phase!=="ADMITTED"||row.no_send_fenced||row.authority_revision!==authority.revision||
        row.native_source_digest!==s.source_digest||row.native_source_fingerprint!==s.source_fingerprint||
        Number(row.native_valid_until_ms)!==s.valid_until_ms||!row.issue_response_digest||!row.enter_response_digest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const d=await this.nativeDecision(db,s);
      this.checkInstallation(s.context.binding,true);
      const finalNow=Number((await db.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0].ms);
      if(Math.max(d.now_ms,finalNow,Date.now())>=s.valid_until_ms)throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
      await db.query("UPDATE elp210_candidate.native_read_obligations SET phase='SENDING',body_digest=$2 WHERE lease_id=$1",
        [row.lease_id,s.body_digest]);
    });
    // Native PM hold and NC01 app/field/exact-stream obligation are durable.
    // No external I/O/await remains between this local guard and Egress.write.
    const permit:HeldNativeReadFrameEgressPermit=Object.freeze({
      binding:Object.freeze({lease_id:s.context.binding.lease_id,attempt_id:s.context.binding.attempt_id,
        binding_digest:s.binding_digest,source_digest:s.source_digest,scope_digest:s.scope_digest,
        body_digest:s.body_digest!,valid_until_ms:s.valid_until_ms}),
      delivery:this.nativeEgress!.frameDelivery(f.reservation),
      assertCurrent:()=>{
        this.checkInstallation(s.context.binding,true);
        if(s.settled||f.permit!==permit||!s.source_entered||Date.now()>=s.valid_until_ms)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
      }});
    f.permit=permit;return permit;
  }
  async sendNativeFrame(handle:PreparedCurrentHumanNativeFrame):Promise<NativeHTTPRecovery>{
    const s=this.nativeState(handle),f=s.frame;
    if(!f||!f.reservation||s.sending||s.settled)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_FRAME_PURPOSE_REQUIRED");
    try{
      const permit=await this.beginNativeFrame(handle),
        witness=await this.nativeEgress!.dispatchFrame(f.reservation,permit);
      this.observeNativeFrame(s,witness);
    }catch(error){
      try{this.observeNativeFrame(s,await this.nativeEgress!.cancelUnsentFrame(f.reservation));}
      catch{/* Genuine DISPATCHED/uncertain physical send is never replayed. */}
      await this.reconcileNativeRead(s.context.binding.lease_id).catch(()=>undefined);throw error;
    }
    return this.reconcileNativeRead(s.context.binding.lease_id);
  }
  /** Stops this exact prepared obligation without minting a replacement frame
   * or dispatch. A stale settled handle cannot close its live successor. */
  async cancelNativeFrame(handle:PreparedCurrentHumanNativeFrame):Promise<NativeHTTPRecovery>{
    const s=this.nativeState(handle);if(!s.frame)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_FRAME_PURPOSE_REQUIRED");
    if(!s.settled)this.nativeEgress!.closeStream(s.frame.stream);
    return this.reconcileNativeRead(s.context.binding.lease_id);
  }
  private async finishNativeLocal(leaseId:string,proof?:NativeFrameSettlementProof|null):Promise<void>{
    const local=this.nativeById.get(leaseId);if(!local)return;
    const f=local.frame;
    if(f){
      if(proof&&f.reservation)this.nativeEgress!.retireFrame(f.reservation,proof);
      else if(proof===null)this.nativeEgress!.closeStream(f.stream); // actual ACK but no genuine physical target
      else{
        // Only lost-ACK/already-reconciled recovery needs a second durable
        // exact-row readback. Normal ACK path already awaited COMMIT+release.
        const row=await this.transaction(async db=>{
          const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[leaseId])).rows[0];
          this.assertNativeRow(row,local);
          if(!row.source_reconciled||!row.source_ack_action||!row.source_ack_digest)
            throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SETTLEMENT_REFUSED");
          return row;
        });
        if(f.reservation&&f.target&&["SERVED","ABORTED"].includes(row.phase)&&row.source_ack_action==="resolve")
          this.nativeEgress!.retireFrame(f.reservation,await this.#nativeFrameSettlement!.readback(f.target));
        else this.nativeEgress!.closeStream(f.stream); // no physical target => NEVER frame2
      }
      this.#nativeFrameBusy.delete(f.stream);
    }
    local.settled=true;this.nativeById.delete(leaseId);
  }

  private reverseSource(){
    if(!this.#config.source)throw new CurrentHumanLeaseError("CURRENT_HUMAN_REVERSE_PURPOSE_REQUIRED");
    return this.#config.source;
  }
  private workloadId(){return this.nativeHTTP?.workload_id??this.reverseSource().workload_id;}
  private nativeConfig(){
    if(!this.nativeHTTP)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_PURPOSE_REQUIRED");
    return this.nativeHTTP;
  }
  private nativeState(handle:NativeHandle){
    const s=this.nativeHandles.get(handle);
    if(!s)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_HANDLE_REQUIRED");return s;
  }
  private selectedNativeRow(row:NativeHTTPRow|undefined):NativeBase{
    const c=this.nativeConfig();
    if(!row||!["MANAGER_HTTP","MANAGER_SSE_FRAME"].includes(row.lifecycle_kind)||row.source_identity_digest!==c.selection.source_identity_digest)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    const captured=nativeAnyBase(Buffer.from(row.base_body,"utf8")),b=captured.base.binding;
    if((row.lifecycle_kind==="MANAGER_SSE_FRAME")!==(captured.base.manager_intent.schema_version==="pma.manager-read-intent.v2"))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    if(captured.body!==row.base_body||captured.prepared.binding_digest!==row.binding_digest
      ||captured.prepared.stable_core_digest!==row.stable_core_digest
      ||b.lease_id!==row.lease_id||b.attempt_id!==row.attempt_id||b.subject!==row.subject_id
      ||b.human_issuer!==c.issuer||b.workspace_id!==row.workspace_id||b.environment!==row.environment
      ||b.workload_id!==row.workload_id||b.workload_id!==c.workload_id||b.request_digest!==row.request_digest
      ||b.workspace_id!==c.selection.workspace_id||b.environment!==c.selection.environment
      ||accessDigest(captured.base.domain)!==accessDigest(c.selection.domain)
      ||nativeBusinessReadUtcMicroseconds(captured.base.deadline)/1000n!==BigInt(row.expires_at_ms))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    if(row.lifecycle_kind==="MANAGER_SSE_FRAME"){
      if(!digest.safeParse(row.frame_domain_scope_digest).success||!digest.safeParse(row.frame_notice_scope_digest).success||
        row.scope_digest!==accessDigest({schema:"portal.native-frame-scope.v1",
          domain_scope_digest:row.frame_domain_scope_digest,notice_scope_digest:row.frame_notice_scope_digest}))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    }else if(row.frame_domain_scope_digest!==null||row.frame_notice_scope_digest!==null)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    return captured.base;
  }
  private assertNativeRow(row:NativeHTTPRow|undefined,s:NativeHTTPState):asserts row is NativeHTTPRow{
    this.selectedNativeRow(row);
    if(!row||row.sender_id!==this.nativeSenderId||row.subject_id!==s.actor.user_id||row.session_id!==s.actor.session_id
      ||Number(row.session_revision)!==s.actor.session_generation||row.scope_digest!==s.scope_digest
      ||row.base_body!==s.base_body||row.binding_digest!==s.binding_digest||row.stable_core_digest!==s.stable_core_digest
      ||(row.lifecycle_kind==="MANAGER_SSE_FRAME")!==Boolean(s.frame)
      ||s.frame&&(row.frame_domain_scope_digest!==s.frame.domain_scope_digest||row.frame_notice_scope_digest!==s.frame.notice_scope_digest))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
  }
  private async nativeDecision(db:PoolClient,s:NativeHTTPState){
    const notice=s.frame?await assertNativeExecutionNoticeCurrent(db,s.frame.notice,this.#pool):undefined;
    const d=notice?.manager_read_decision??await evaluateManagerDomainRead(db,{actor:s.actor,workspace_id:s.context.binding.workspace_id,
      environment:s.context.binding.environment,domain:s.context.domain,expected_scope_digest:s.frame?.domain_scope_digest??s.scope_digest});
    if(d.scope_digest!==(s.frame?.domain_scope_digest??s.scope_digest))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    if(d.field_policy_sha256!==s.context.domain.field_policy_sha256||d.valid_until_ms<s.valid_until_ms)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    if(!s.frame)return d;
    if(!notice)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    if(notice.authority_fingerprint!==d.authority_fingerprint||notice.scope_digest!==s.frame.notice_scope_digest||
      s.scope_digest!==accessDigest({schema:"portal.native-frame-scope.v1",
        domain_scope_digest:d.scope_digest,notice_scope_digest:notice.scope_digest})||
      notice.valid_until_ms<s.valid_until_ms)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    return{...d,now_ms:Math.max(d.now_ms,notice.now_ms),valid_until_ms:Math.min(d.valid_until_ms,notice.valid_until_ms)};
  }
  /** Source selection/authenticated result uses the peer's sole opaque wrapper.
   * No DTO/config pin or status carrier is a native held grant or egress permit. */
  private nativeObservation(observation:VerifiedSelectedNativeReadObservation):VerifiedSelectedNativeReadView{
    const proof=selectedNativeBusinessReadObservation(this.nativeConfig().selected_source,observation);
    if(proof.source_identity_digest!==this.nativeConfig().selection.source_identity_digest)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    return proof;
  }
  /** All transport calls remain outside Core transactions. Original Base bytes,
   * keys and expired deadlines are preserved for recovery. */
  private async nativeCall(baseBody:string,action:NativeBusinessReadAction,assertion?:string){
    const c=this.nativeConfig(),captured=nativeAnyBase(Buffer.from(baseBody,"utf8"));
    if(captured.body!==baseBody)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    const{schema_version:_schema,...context}=captured.base;
    const observation=await Reflect.apply(selectedMethods[action],c.selected_source,[context,assertion]) as VerifiedSelectedNativeReadObservation;
    const proof=this.nativeObservation(observation);
    if(proof.action!==action||proof.base_body!==baseBody
      ||proof.binding_digest!==captured.prepared.binding_digest||proof.stable_core_digest!==captured.prepared.stable_core_digest)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    digest.parse(proof.response_sha256);return observation;
  }

  private async beginNativeSend(handle:PreparedCurrentHumanNativeHTTP,response:ServerResponse,body:Buffer){
    const s=this.nativeState(handle),c=this.nativeConfig();
    if(s.frame)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_FINITE_PURPOSE_REQUIRED");
    if(s.sending||s.settled||!s.source_entered||!s.source_digest||!s.source_fingerprint
      ||!Buffer.isBuffer(body)||body.length>c.egress.maximum_response_bytes)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SEND_REFUSED");
    s.sending=true; // synchronous one-shot, before the first await
    const bodyDigest="sha256:"+createHash("sha256").update(body).digest("hex");
    const binding=Object.freeze({lease_id:s.context.binding.lease_id,attempt_id:s.context.binding.attempt_id,
      binding_digest:s.binding_digest,source_digest:s.source_digest,scope_digest:s.scope_digest,
      body_digest:bodyDigest,valid_until_ms:s.valid_until_ms});
    s.response=response;s.body_digest=bodyDigest;
    // Captures actual response + copied body WITHOUT writing an HTTP byte.
    s.reservation=this.nativeEgress!.reserveFinite(response,body,binding);
    await this.transaction(async(db,authority)=>{
      const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[s.context.binding.lease_id])).rows[0];
      this.assertNativeRow(row,s);
      if(authority.drain_id||row.phase!=="ADMITTED"||row.no_send_fenced||row.authority_revision!==authority.revision
        ||row.native_source_digest!==s.source_digest||row.native_source_fingerprint!==s.source_fingerprint
        ||Number(row.native_valid_until_ms)!==s.valid_until_ms||!row.issue_response_digest||!row.enter_response_digest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      const d=await this.nativeDecision(db,s);
      this.checkInstallation(s.context.binding,true);
      if(d.now_ms>=s.valid_until_ms)throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
      await db.query("UPDATE elp210_candidate.native_read_obligations SET phase='SENDING',body_digest=$2 WHERE lease_id=$1",
        [row.lease_id,bodyDigest]);
    });
    // Physical COMMIT ACK AND pool release must occur before this capability
    // exists. A lost ACK takes the exact reserved no-send cancellation path.
    const permit:HeldNativeReadEgressPermit=Object.freeze({binding,assertCurrent:()=>{
      if(s.settled||s.permit!==permit||s.response!==response||!s.source_entered||Date.now()>=s.valid_until_ms)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_EXPIRED");
    }});
    s.permit=permit;return permit;
  }
  private observeNativeSend(s:NativeHTTPState,witness:NativeReadEgressWitness){
    if(!s.reservation)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_WITNESS_REFUSED");
    const observed=this.nativeEgress!.consumeReserved(witness,s.reservation),b=observed.binding;
    if(b.lease_id!==s.context.binding.lease_id||b.attempt_id!==s.context.binding.attempt_id
      ||b.binding_digest!==s.binding_digest||b.source_digest!==s.source_digest
      ||b.scope_digest!==s.scope_digest||b.body_digest!==s.body_digest)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_WITNESS_REFUSED");
    // Preserve the actual opaque witness BEFORE any recovery DB operation.
    s.observation=observed;return observed;
  }
  async sendNativeRead(handle:PreparedCurrentHumanNativeHTTP,response:ServerResponse,body:Buffer):Promise<NativeHTTPRecovery>{
    const s=this.nativeState(handle),c=this.nativeConfig();
    if(s.frame)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_FINITE_PURPOSE_REQUIRED");
    if(s.sending||s.settled||!(response instanceof ServerResponse)||!(response.socket instanceof Socket)
      ||response.req.method!=="GET"||response.headersSent||response.writableEnded||response.destroyed||response.socket.destroyed
      ||!Buffer.isBuffer(body)||body.length>c.egress.maximum_response_bytes)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SEND_REFUSED");
    const payload=Buffer.from(body);
    let permit:HeldNativeReadEgressPermit,witness:NativeReadEgressWitness;
    try{
      permit=await this.beginNativeSend(handle,response,payload);
      witness=await this.nativeEgress!.dispatch(s.reservation!,permit);
    }catch(error){
      if(s.reservation){
        try{
          // Permanent synchronous dispatch fence; only the actual captured
          // response/socket's closed witness can prove this reservation unsent.
          this.observeNativeSend(s,await this.nativeEgress!.cancelUnsent(s.reservation));
        }catch{/* DISPATCHED or missing physical closure remains UNKNOWN. */}
        if(!s.observation){
          await this.transaction(async db=>{
            const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[s.context.binding.lease_id])).rows[0];
            this.assertNativeRow(row,s);
            if(row.phase==="SENDING")await db.query("UPDATE elp210_candidate.native_read_obligations SET phase='UNKNOWN' WHERE lease_id=$1",[row.lease_id]);
          }).catch(()=>undefined);
        }
        // No response replay; this exact key stays recoverable after any second
        // DB/source failure. Preserve the ORIGINAL send/COMMIT error for caller.
        await this.reconcileNativeRead(s.context.binding.lease_id).catch(()=>undefined);
      }
      throw error;
    }
    if(s.permit!==permit||s.response!==response)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_WITNESS_REFUSED");
    this.observeNativeSend(s,witness);
    return this.reconcileNativeRead(s.context.binding.lease_id);
  }
  private async writeNativeTerminal(db:PoolClient,row:NativeHTTPRow,phase:"SERVED"|"ABORTED",reason:string,
    unsentBodyDigest?:string):Promise<NativeHTTPRow>{
    const bodyDigest=row.body_digest??unsentBodyDigest;
    if(!row.native_source_digest||row.receipt_id||row.receipt_digest
      ||!bodyDigest||!row.enter_response_digest
      ||unsentBodyDigest!==undefined&&(phase!=="ABORTED"||row.body_digest!==null||!["ADMITTED","UNKNOWN"].includes(row.phase)))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SETTLEMENT_REFUSED");
    const receiptId=randomUUID(),receipt=accessDigest({schema:"portal.native-read-terminal.v1",phase,
      binding:this.selectedNativeRow(row).binding,source_digest:row.native_source_digest,scope_digest:row.scope_digest,
      body_digest:bodyDigest,sender_id:row.sender_id,reason,receipt_id:receiptId});
    const updated=(await db.query<NativeHTTPRow>(
      "UPDATE elp210_candidate.native_read_obligations SET phase=$2,receipt_id=$3,receipt_digest=$4,terminal_reason=$5,body_digest=$6,no_send_fenced=$7 WHERE lease_id=$1 RETURNING *",
      [row.lease_id,phase,receiptId,receipt,reason,bodyDigest,row.no_send_fenced||row.body_digest===null])).rows[0];
    return updated;
  }

  /** Same native-family key. Recovery never reconstructs a delivery permit.
   * Known unsent fences physically commit BEFORE contacting PM. */
  async recoverNativeRead(leaseId:string):Promise<NativeHTTPRecovery>{
    const c=this.nativeConfig();z.string().uuid().refine(v=>v===v.toLowerCase()).parse(leaseId);
    const local=this.nativeById.get(leaseId);
    if(local?.frame?.reservation&&(!local.observation||local.observation.outcome==="UNKNOWN")){
      const closed=this.nativeEgress!.observeFrameClosed(local.frame.reservation);
      if(closed)this.observeNativeFrame(local,closed);
      else try{this.observeNativeFrame(local,await this.nativeEgress!.cancelUnsentFrame(local.frame.reservation));}
      catch{/* Dispatched/unknown physical frame remains held, never resent. */}
    }
    if(local?.reservation&&(!local.observation||local.observation.outcome==="UNKNOWN")){
      const closed=this.nativeEgress!.observeClosed(local.reservation);
      if(closed)this.observeNativeSend(local,closed);
      else try{this.observeNativeSend(local,await this.nativeEgress!.cancelUnsent(local.reservation));}
      catch{/* DISPATCHED/new instance/absent exact physical closure proves nothing. */}
    }
    const result=await this.transaction(async db=>{
      let row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[leaseId])).rows[0];
      const context=this.selectedNativeRow(row);
      if(row.source_reconciled)return{kind:"RECONCILED" as const,row,context};
      if(["SERVED","ABORTED"].includes(row.phase))return{kind:"TERMINAL" as const,row,context};
      // An actual pre-ENTER reservation may close while the ENTER ACK is
      // lost. Socket closure is not evidence that PM never entered. Preserve
      // the original no-send/UNKNOWN recovery path without minting a terminal
      // or fabricating enter_response_digest from an authenticated status.
      if(row.lifecycle_kind==="MANAGER_SSE_FRAME"&&row.body_digest===null&&row.enter_response_digest===null&&
        ["ADMITTED","UNKNOWN"].includes(row.phase)){
        if(!row.no_send_fenced)row=(await db.query<NativeHTTPRow>(
          "UPDATE elp210_candidate.native_read_obligations SET no_send_fenced=true WHERE lease_id=$1 RETURNING *",[leaseId])).rows[0];
        return{kind:"UNSENT_FENCED" as const,row,context};
      }
      const observed=local&&row.sender_id===this.nativeSenderId?local.observation:undefined;
      if(observed&&observed.outcome!=="UNKNOWN"){
        this.assertNativeRow(row,local!);
        const b=observed.binding;
        if(b.lease_id!==row.lease_id||b.attempt_id!==row.attempt_id||b.binding_digest!==row.binding_digest
          ||b.source_digest!==row.native_source_digest||b.scope_digest!==row.scope_digest
          ||b.body_digest!==local!.body_digest||row.body_digest!==null&&b.body_digest!==row.body_digest)
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_WITNESS_REFUSED");
        if(row.body_digest===null){
          // Before a SENDING commit, only the SAME owner's actual reserved
          // response/socket closure can prove abort. A DB fence alone cannot.
          if(observed.outcome==="FINISHED"||!["ADMITTED","UNKNOWN"].includes(row.phase))
            throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_WITNESS_REFUSED");
        }
        row=await this.writeNativeTerminal(db,row,observed.outcome==="FINISHED"?"SERVED":"ABORTED",observed.reason,
          row.body_digest===null?b.body_digest:undefined);
        return{kind:"TERMINAL" as const,row,context};
      }
      if(row.body_digest===null&&["ADMITTED","UNKNOWN"].includes(row.phase)){
        if(!row.no_send_fenced)row=(await db.query<NativeHTTPRow>(
          "UPDATE elp210_candidate.native_read_obligations SET no_send_fenced=true WHERE lease_id=$1 RETURNING *",[leaseId])).rows[0];
        return{kind:"UNSENT_FENCED" as const,row,context};
      }
      if(!["SENDING","UNKNOWN"].includes(row.phase)||row.body_digest===null)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_RECOVERY_REFUSED");
      if(row.phase==="SENDING")await db.query("UPDATE elp210_candidate.native_read_obligations SET phase='UNKNOWN' WHERE lease_id=$1",[leaseId]);
      return{kind:"UNKNOWN" as const,row,context};
    });
    if(result.kind!=="TERMINAL")return{state:result.kind,context:result.context};
    const row=result.row;
    if(!["SERVED","ABORTED"].includes(row.phase)||!row.native_source_digest||!row.receipt_id||!row.receipt_digest)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_RECOVERY_REFUSED");
    // Only after actual terminal COMMIT/readback ACK AND pool release. Its
    // immutable receipt survives lost source/local ACKs without replaying HTTP.
    const now=Math.floor(Date.now()/1000),phase=row.phase as"SERVED"|"ABORTED";
    const terminal=await new SignJWT({iss:c.terminal.issuer,aud:c.terminal.audience,iat:now,nbf:now,
      exp:now+c.terminal.ttl_seconds,jti:randomUUID(),purpose:"pma.native-business-to-core-terminal.v1",
      workload_id:row.workload_id,lease_id:row.lease_id,attempt_id:row.attempt_id,binding_digest:row.binding_digest,
      source_digest:row.native_source_digest,operation:"READ",phase,
      evidence_kind:row.lifecycle_kind==="MANAGER_SSE_FRAME"
        ?phase==="SERVED"?"FINAL_SSE_FRAME_WRITE_COMPLETED":"FINAL_SSE_FRAME_ABORT_CONFIRMED"
        :phase==="SERVED"?"FINAL_HTTP_SEND_COMPLETED":"FINAL_HTTP_ABORT_CONFIRMED",
      receipt_id:row.receipt_id,receipt_digest:row.receipt_digest.slice(7)})
      .setProtectedHeader({alg:"EdDSA",kid:c.terminal.key_id,typ:"JWT"}).sign(c.terminal.private_key);
    return{state:"TERMINAL",phase,context:result.context,terminal};
  }
  private async recordNativeSourceACK(leaseId:string,observation:VerifiedSelectedNativeReadObservation){
    const local=this.nativeById.get(leaseId),proof=this.nativeObservation(observation);
    // Route from actual opaque selected-source Base; helper verifies the SAME
    // immutable SQL purpose/identity again. No extra query on finite ACK path.
    const frame=nativeAnyBase(Buffer.from(proof.base_body,"utf8")).base.manager_intent.schema_version==="pma.manager-read-intent.v2";
    if(frame){
      const settled=await this.#nativeFrameSettlement!.recordACK(leaseId,observation,local?.frame?.target);
      await this.finishNativeLocal(leaseId,settled);return;
    }
    if(!["cancel-unentered","resolve"].includes(proof.action))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    await this.transaction(async db=>{
      const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[leaseId])).rows[0];
      this.selectedNativeRow(row);
      if(proof.base_body!==row.base_body||proof.binding_digest!==row.binding_digest||proof.stable_core_digest!==row.stable_core_digest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
      if(row.source_reconciled)return;
      let phase:NativeHTTPPhase=row.phase;
      if(proof.action==="cancel-unentered"){
        if(!["CANCELLED","RETIRED"].includes(proof.result.state)||row.body_digest!==null||!row.no_send_fenced
          ||!["ADMITTED","UNKNOWN","ABORTED"].includes(row.phase))
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
        phase=row.phase==="ABORTED"?"ABORTED":"CANCELLED";
      }else if(proof.result.state!=="SETTLED"||!["SERVED","ABORTED"].includes(row.phase)
        ||proof.result.recovery.phase!==row.phase)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
      await db.query("UPDATE elp210_candidate.native_read_obligations SET phase=$2,source_reconciled=true,source_ack_action=$3,source_ack_digest=$4 WHERE lease_id=$1",
        [leaseId,phase,proof.action,proof.response_sha256]);
    });
    if(local)local.settled=true;
    this.nativeById.delete(leaseId);
  }
  /** One recovery branch on the existing unified native port; not a poller.
   * OBSERVATION/ABSENT is routing only, never a cancellation/settlement ACK. */
  async reconcileNativeRead(leaseId:string):Promise<NativeHTTPRecovery>{
    let result=await this.recoverNativeRead(leaseId);
    if(result.state==="UNKNOWN")return result;
    if(result.state==="RECONCILED"){
      await this.finishNativeLocal(leaseId);return result;
    }
    const baseBody=nativeAnyBase(result.context).body,status=this.nativeObservation(await this.nativeCall(baseBody,"status"));
    if(status.result.state!=="OBSERVATION")throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    const observed=status.result.recovery;
    const cancellable=observed.state==="ABSENT"||observed.state==="RECORDED"
      &&["CANCELLED","ISSUED","RETIRED"].includes(observed.phase);
    if(cancellable){
      if(result.state==="TERMINAL"&&result.phase==="SERVED")
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
      const acknowledgement=await this.nativeCall(baseBody,"cancel-unentered");
      await this.recordNativeSourceACK(leaseId,acknowledgement);
      return this.recoverNativeRead(leaseId);
    }
    if(observed.state!=="RECORDED"||observed.phase==="CANCELLED")
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    const sourceDigest=observed.source_digest;
    await this.transaction(async db=>{
      let row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[leaseId])).rows[0];
      this.selectedNativeRow(row);
      if(row.base_body!==baseBody||status.binding_digest!==row.binding_digest||status.stable_core_digest!==row.stable_core_digest
        ||row.native_source_digest!==null&&row.native_source_digest!==sourceDigest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
      if(row.source_reconciled)return;
      if(row.native_source_digest===null){
        if(!row.no_send_fenced||row.body_digest!==null||!["ADMITTED","UNKNOWN"].includes(row.phase))
          throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_RECOVERY_REFUSED");
        row=(await db.query<NativeHTTPRow>("UPDATE elp210_candidate.native_read_obligations SET native_source_digest=$2,status_response_digest=$3 WHERE lease_id=$1 RETURNING *",
          [leaseId,sourceDigest,status.response_sha256])).rows[0];
      }
      if(row.body_digest===null&&row.no_send_fenced&&["ADMITTED","UNKNOWN"].includes(row.phase)){
        // Source status is authenticated routing, not final-egress evidence.
        // With no owning HTTP closure, cold recovery must stay pending.
        if(row.phase!=="UNKNOWN")await db.query(
          "UPDATE elp210_candidate.native_read_obligations SET phase='UNKNOWN' WHERE lease_id=$1",[leaseId]);
      }
    });
    if(result.state!=="TERMINAL")return{state:"UNKNOWN",context:result.context};
    result=await this.recoverNativeRead(leaseId);
    if(result.state==="RECONCILED")return result;
    if(result.state!=="TERMINAL")throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_RECOVERY_REFUSED");
    const acknowledgement=await this.nativeCall(baseBody,"resolve",result.terminal);
    await this.recordNativeSourceACK(leaseId,acknowledgement);
    return this.recoverNativeRead(leaseId);
  }

}
