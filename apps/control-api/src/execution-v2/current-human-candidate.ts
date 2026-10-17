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
import { captureCurrentHumanSnapshot, evaluateManagerDomainRead } from "./current-human-snapshot";
import { SelectedNativeBusinessReadSource, selectedNativeBusinessReadSelection, selectedNativeBusinessReadObservation,
  selectedNativeBusinessReadInstallationExpiresAtMs,
  type VerifiedSelectedNativeReadObservation, type VerifiedSelectedNativeReadView } from "./native-business-read-selected-source";
import { pmHttpRequestDigest } from "./pm-http-request-binding";
import { NativeReadEgress, type NativeReadEgressLimits, type NativeReadEgressObservation, type NativeReadEgressReservation,
  type NativeReadEgressWitness, type HeldNativeReadEgressPermit } from "./native-read-egress";
import { nativeBusinessReadTransportRequest, nativeBusinessReadUtcMicroseconds,
  prepareNativeBusinessReadRequest, type NativeBusinessReadAction } from "./native-business-read-codec";

const id = z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$/).refine(value => value === value.trim());
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().length(71).regex(/^sha256:[a-f0-9]{64}$/);
export const currentHumanBinding = z.object({ workspace_id: id, environment: z.enum(["paper", "sandbox", "live"]),
  workload_id: id, request_digest: digest }).strict();
export type CurrentHumanBinding = z.infer<typeof currentHumanBinding>;
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
  /** Optional CUSTODY selection only, never a read permit or runtime flag. */
  native_read_custody?: CurrentHumanNativeReadSelection;
}
export interface CurrentHumanNativeReadSelection {
  workspace_id: string; environment: "paper" | "sandbox" | "live";
  domain: { profile_id: string; catalogue_sha256: string; profile_sha256: string; field_policy_sha256: string };
  source_identity_digest: string;
}
type NativeBase={schema_version:"pma.native-business-read.request.v1";binding:{
  lease_id:string;attempt_id:string;human_issuer:string;subject:string;workspace_id:string;
  environment:"paper"|"sandbox"|"live";workload_id:string;request_digest:string;operation:"READ"};
  domain:CurrentHumanNativeReadSelection["domain"];manager_intent:{schema_version:"pma.manager-read-intent.v1";
    action:"catalogue"|"capabilities"|"relation_page"|"relation_record"|"projection_page";digest:string};deadline:string};
type NativeRow = Row & { attempt_id: string; authority_fingerprint: string; base_body: string;
  stable_core_digest: string; binding_digest: string; source_identity_digest: string; phase: NativeHTTPPhase; lifecycle_kind:"CUSTODY_ONLY"|"MANAGER_HTTP" };
export interface CurrentHumanNativeReadRecoveryAttempt {
  readonly family: "NATIVE_READ"; readonly lease_id: string; readonly attempt_id: string;
  readonly base_body: string; readonly stable_core_digest: string; readonly binding_digest: string;
  readonly source_identity_digest: string; readonly authority_fingerprint: string;
  readonly subject_id: string; readonly session_id: string; readonly session_revision: number;
  readonly authority_revision: number; readonly expires_at_ms: number; readonly phase: NativeHTTPPhase;
  readonly lifecycle_kind?:"MANAGER_HTTP";
}
function nativeBase(input: unknown) {
  const prepared = prepareNativeBusinessReadRequest("status", input, { request_bytes: 32768, response_bytes: 32768 });
  const wire = nativeBusinessReadTransportRequest(prepared);
  return { prepared, body: wire.body, base: JSON.parse(wire.body) as NativeBase };
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
  lifecycle_kind:"MANAGER_HTTP";phase:NativeHTTPPhase;sender_id:string;scope_digest:string;no_send_fenced:boolean;
  native_source_digest:string|null;native_source_fingerprint:string|null;native_valid_until_ms:string|null;
  issue_response_digest:string|null;enter_response_digest:string|null;status_response_digest:string|null;
  body_digest:string|null;receipt_id:string|null;receipt_digest:string|null;terminal_reason:string|null;
  source_reconciled:boolean;source_ack_action:"cancel-unentered"|"resolve"|null;source_ack_digest:string|null;
};
declare const nativeHTTPBrand:unique symbol;
export type PreparedCurrentHumanNativeHTTP=Readonly<{readonly[nativeHTTPBrand]:true}>;
type NativeHTTPState={actor:AccessActor;context:NativeBase;base_body:string;binding_digest:string;stable_core_digest:string;
  scope_digest:string;valid_until_ms:number;source_digest?:string;source_fingerprint?:string;
  source_entered:boolean;sending:boolean;settled:boolean;response?:ServerResponse;
  reservation?:NativeReadEgressReservation;permit?:HeldNativeReadEgressPermit;body_digest?:string;
  observation?:NativeReadEgressObservation};
export type NativeHTTPRecovery=
  {state:"UNKNOWN"|"UNSENT_FENCED"|"RECONCILED";context:NativeBase}|
  {state:"TERMINAL";phase:"SERVED"|"ABORTED";context:NativeBase;terminal:string};

type Row = { lease_id: string; authority_revision: string; subject_id: string; session_id: string; session_revision: string;
  workspace_id: string; environment: "paper" | "sandbox" | "live"; workload_id: string; request_digest: string;
  issued_at_ms: string; expires_at_ms: string; phase: string; attempt_id: string | null; terminal_receipt_digest: string | null };

/** UNMOUNTED internal candidate; no HTTP routes/DI registration/config defaults.
 * Requires its explicit isolated SQL installer and injected Ed25519 trust. JWTs
 * are human identity, NEVER workload credentials or TS economic permissions.
 * All Core transactions end before token signing or source/network I/O. */
export class CurrentHumanCandidate {
  private nativeHTTP?:Readonly<NativeHTTPRuntimeConfig>;
  private nativeEgress?:NativeReadEgress;
  private readonly nativeSenderId=randomUUID();
  private readonly nativeHandles=new WeakMap<object,NativeHTTPState>();
  private readonly nativeById=new Map<string,NativeHTTPState>();
  private constructor(private readonly pool: Pool, private readonly config: CandidateRuntimeConfig,
    private readonly humanPublicKey: KeyLike) {}

  /** The writer coordinator must share this exact bounded Core pool. */
  usesPool(pool: Pool): boolean { return pool === this.pool; }

  static async create(pool: Pool, input: CurrentHumanCandidateConfig) {
    if ([pool.options.connectionTimeoutMillis, pool.options.query_timeout]
      .some(n => !Number.isSafeInteger(n) || Number(n) < 1 || Number(n) > 60_000))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_POOL_TIMEOUT_REQUIRED");
    const config = { ...input, source: { ...input.source }, limits: { ...input.limits },
      installation_scope: input.installation_scope ? { ...input.installation_scope } : undefined,
      native_read_custody: input.native_read_custody
        ? nativeSelection(input.native_read_custody, input.issuer, input.source.workload_id) : undefined };
    if (config.installation_scope) {
      const scope = config.installation_scope;
      if (!id.safeParse(scope.workspace_id).success || scope.environment !== "paper"
        || !Number.isSafeInteger(scope.valid_until_ms) || scope.valid_until_ms <= Date.now())
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID");
      Object.freeze(scope);
    }
    for (const value of [config.issuer, config.audience, config.key_id, config.source.issuer,
      config.source.audience, config.source.key_id, config.source.workload_id]) id.parse(value);
    const { ttl_ms, maximum_unresolved, maximum_retained } = config.limits;
    if (![ttl_ms, maximum_unresolved, maximum_retained].every(Number.isSafeInteger)
      || ttl_ms < 1000 || ttl_ms > 60_000 || maximum_unresolved < 1 || maximum_unresolved > 128
      || maximum_retained < maximum_unresolved || maximum_retained > 4096)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_LIMITS_INVALID");
    const own = await exportJWK(config.private_key), source = await exportJWK(config.source.public_key);
    if (own.kty !== "OKP" || own.crv !== "Ed25519" || !own.d
      || source.kty !== "OKP" || source.crv !== "Ed25519" || source.d)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_ED25519_TRUST_REQUIRED");
    const { d: _secret, ...publicJwk } = own;
    const publicKey = await importJWK(publicJwk, "EdDSA");
    if (publicKey instanceof Uint8Array) throw new CurrentHumanLeaseError("CURRENT_HUMAN_ED25519_TRUST_REQUIRED");
    return new CurrentHumanCandidate(pool, config, publicKey);
  }

  private async transaction<T>(fn: (db: PoolClient, authority: { revision: string; drain_id: string | null }) => Promise<T>) {
    return withTransaction(this.pool, async db => {
      if(this.nativeHTTP)await db.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await db.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      // Lazy fail-closed structural preflight: constructors stay zero-DB, and
      // an old installer may NEVER silently count legacy rows alone.
      const schema = (await db.query(`SELECT to_regclass('elp210_candidate.authority') IS NOT NULL
        AND to_regclass('elp210_candidate.obligations') IS NOT NULL
        AND to_regclass('elp210_candidate.native_read_obligations') IS NOT NULL
        AND to_regclass('elp210_candidate.native_read_events') IS NOT NULL AS installed`)).rows[0];
      if (schema?.installed !== true) throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SCHEMA_NOT_INSTALLED");
      const authority = (await db.query("SELECT revision,drain_id FROM elp210_candidate.authority WHERE singleton FOR UPDATE")).rows[0];
      if (!authority) throw new CurrentHumanLeaseError("CURRENT_HUMAN_CANDIDATE_NOT_INSTALLED");
      return fn(db, authority);
    });
  }

  async issue(actor: AccessActor, untrustedBinding: CurrentHumanBinding): Promise<{ token: string; lease_id: string; expires_at_ms: number }> {
    const binding = currentHumanBinding.parse(untrustedBinding);
    this.checkInstallation(binding, true);
    if (binding.workload_id !== this.reverseSource().workload_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_WORKLOAD_MISMATCH");
    const claims = await this.transaction(async (db, authority) => {
      if (authority.drain_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
      const current = await captureCurrentHumanSnapshot(db, actor, binding.workspace_id);
      const counts = (await db.query(`SELECT count(*)::int AS retained,
        count(*) FILTER (WHERE unresolved)::int AS unresolved FROM elp210_candidate.obligations`)).rows[0];
      if (counts.unresolved >= this.config.limits.maximum_unresolved || counts.retained >= this.config.limits.maximum_retained)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_CAPACITY_EXHAUSTED");
      this.checkInstallation(binding, true);
      const iat = Math.floor(current.now / 1000), exp = Math.floor(Math.min(current.now + this.config.limits.ttl_ms,
        current.lease_until_ms, this.config.installation_scope?.valid_until_ms ?? Number.MAX_SAFE_INTEGER) / 1000);
      if (exp <= iat) throw new CurrentHumanLeaseError("CURRENT_HUMAN_SESSION_EXPIRING");
      const body = humanClaims.parse({ iss: this.config.issuer, aud: this.config.audience, sub: actor.user_id,
        sid: actor.session_id, jti: randomUUID(), iat, nbf: iat, exp, purpose: "pma.identity.v1", principal_kind: "human",
        session_revision: actor.session_generation, authority_revision: Number(authority.revision), ...binding });
      await db.query(`INSERT INTO elp210_candidate.leases(lease_id,authority_revision,subject_id,session_id,session_revision,
        workspace_id,environment,workload_id,request_digest,authority_fingerprint,issued_at_ms,expires_at_ms)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [body.jti, body.authority_revision, body.sub, body.sid,
        body.session_revision, body.workspace_id, body.environment, body.workload_id, body.request_digest,
        current.authority_fingerprint, body.iat * 1000, body.exp * 1000]);
      return body;
    });
    // A concurrent drain can retire this ISSUED lease before signing completes;
    // enter will refuse it. Signing is never performed under a Core lock.
    return { token: await new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: this.config.key_id, typ: "JWT" })
      .sign(this.config.private_key), lease_id: claims.jti, expires_at_ms: claims.exp * 1000 };
  }


  /** NC-01 remains custody-only: default behavior and returned carrier unchanged. */
  async admitNativeRead(untrustedActor:AccessActor,input:unknown):Promise<CurrentHumanNativeReadRecoveryAttempt>{
    if(this.nativeHTTP)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_PURPOSE_REQUIRED");
    return this.nativeAttempt(await this.nativeAdmission(untrustedActor,input,false));
  }
  private async nativeAdmission(untrustedActor:AccessActor,input:unknown,http:boolean):Promise<NativeRow>{
    const actor=nativeActor(untrustedActor),captured=nativeBase(input),base=captured.base,selected=this.config.native_read_custody;
    if(!selected)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_CUSTODY_NOT_SELECTED");
    if(base.binding.human_issuer!==this.config.issuer||base.binding.subject!==actor.user_id
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
        environment:selected.environment,domain:base.domain}):null;
      const current=decision?{now:decision.now_ms,lease_until_ms:decision.valid_until_ms,
        authority_fingerprint:decision.authority_fingerprint}:await captureCurrentHumanSnapshot(db,actor,selected.workspace_id);
      if(decision&&decision.field_policy_sha256!==base.domain.field_policy_sha256)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
      this.checkInstallation(base.binding,true);
      const ceiling=Math.min(current.now+this.config.limits.ttl_ms,current.lease_until_ms,
        this.config.installation_scope?.valid_until_ms??Number.MAX_SAFE_INTEGER);
      if(expires<=current.now||deadlineUs>BigInt(ceiling)*1000n
        ||http&&nativeIdentityExpiry(base.deadline).ms>ceiling)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_DEADLINE_INVALID");
      const prior=await db.query("SELECT 1 FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 OR attempt_id=$2 UNION ALL SELECT 1 FROM elp210_candidate.leases WHERE lease_id=$1",
        [base.binding.lease_id,base.binding.attempt_id]);
      if(prior.rowCount)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_ALREADY_ADMITTED");
      const counts=(await db.query("SELECT count(*)::int AS retained,count(*) FILTER(WHERE unresolved)::int AS unresolved FROM elp210_candidate.obligations")).rows[0];
      if(counts.unresolved>=this.config.limits.maximum_unresolved||counts.retained>=this.config.limits.maximum_retained)
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
  async prepareNativeRead(untrustedActor:AccessActor,input:unknown):Promise<PreparedCurrentHumanNativeHTTP>{
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
    const row=await this.nativeAdmission(actor,input,true) as NativeHTTPRow;
    const context=this.selectedNativeRow(row),handle=Object.freeze({}) as PreparedCurrentHumanNativeHTTP;
    const state:NativeHTTPState={actor,context,base_body:row.base_body,binding_digest:row.binding_digest,
      stable_core_digest:row.stable_core_digest,scope_digest:row.scope_digest,valid_until_ms:Number(row.expires_at_ms),
      source_entered:false,sending:false,settled:false};
    this.nativeHandles.set(handle,state);this.nativeById.set(row.lease_id,state);return handle;
  }
  async signNativeReadRequest(handle:PreparedCurrentHumanNativeHTTP,action:"issue"|"enter"){
    if(action!=="issue"&&action!=="enter")throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_PURPOSE_REQUIRED");
    const s=this.nativeState(handle),c=this.nativeConfig();
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
  private async bindNativeRead(handle:PreparedCurrentHumanNativeHTTP,observation:VerifiedSelectedNativeReadObservation){
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
  async acquireNativeRead(actor:AccessActor,input:unknown):Promise<PreparedCurrentHumanNativeHTTP>{
    const handle=await this.prepareNativeRead(actor,input),s=this.nativeState(handle);
    const issueToken=await this.signNativeReadRequest(handle,"issue");
    this.assertNativeAcquisitionCurrent(s);
    const issued=await this.nativeCall(s.base_body,"issue",issueToken);
    await this.bindNativeRead(handle,issued);
    const enterToken=await this.signNativeReadRequest(handle,"enter");
    this.assertNativeAcquisitionCurrent(s);
    const entered=this.nativeObservation(await this.nativeCall(s.base_body,"enter",enterToken));
    if(entered.result.state!=="ENTERED")throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_SOURCE_PROOF_INVALID");
    await this.transaction(async(db,authority)=>{
      const row=(await db.query<NativeHTTPRow>("SELECT * FROM elp210_candidate.native_read_obligations WHERE lease_id=$1 FOR UPDATE",[s.context.binding.lease_id])).rows[0];
      this.assertNativeRow(row,s);
      if(authority.drain_id||row.phase!=="ADMITTED"||row.no_send_fenced||row.authority_revision!==authority.revision
        ||row.native_source_digest!==s.source_digest||row.enter_response_digest!==null)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      await this.nativeDecision(db,s);
      await db.query("UPDATE elp210_candidate.native_read_obligations SET enter_response_digest=$2 WHERE lease_id=$1",
        [row.lease_id,entered.response_sha256]);
    });
    s.source_entered=true;return handle;
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
    const captured = nativeBase(Buffer.from(row.base_body, "utf8")), b = captured.base.binding;
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
      ...(row.lifecycle_kind==="MANAGER_HTTP"?{lifecycle_kind:"MANAGER_HTTP" as const}:{}) });
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
          workload_id: row.workload_id, request_digest: row.request_digest, human_issuer: this.config.issuer,
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
    const scope = this.config.installation_scope;
    if (scope && (scope.workspace_id !== binding.workspace_id || scope.environment !== binding.environment
      || (fresh && Date.now() >= scope.valid_until_ms)))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_INSTALLATION_SCOPE_INVALID");
  }

  /** Source MUST enter once BEFORE borrowing its TS connection. Replayed entry
   * is refused, not permission for a second TS transaction. Lost enter ACK needs
   * the same source attempt's qualified resolution; never blindly retry a write. */
  async enter(humanToken: string, sourceProof: string): Promise<{ lease_id: string; attempt_id: string }> {
    const source = await this.attest(sourceProof);
    this.checkInstallation(source, true);
    if (typeof humanToken !== "string" || Buffer.byteLength(humanToken) > 8192)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID");
    let human: z.infer<typeof humanClaims>;
    try {
      const verified = await jwtVerify(humanToken, this.humanPublicKey, { algorithms: ["EdDSA"],
        issuer: this.config.issuer, audience: this.config.audience, maxTokenAge: "60s" });
      if (verified.protectedHeader.kid !== this.config.key_id || verified.protectedHeader.typ !== "JWT") throw new Error();
      human = humanClaims.parse(verified.payload);
      if (human.exp <= human.iat || human.exp - human.iat > 60 || human.nbf !== human.iat) throw new Error();
    } catch { throw new CurrentHumanLeaseError("CURRENT_HUMAN_TOKEN_INVALID"); }
    if (source.phase !== "ENTER" || source.lease_id !== human.jti) throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
    return this.transaction(async (db, authority) => {
      this.checkInstallation(source, true);
      if (authority.drain_id) throw new CurrentHumanLeaseError("CURRENT_HUMAN_DRAINING");
      const row = (await db.query<Row>("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR UPDATE", [human.jti])).rows[0];
      if (!row || row.phase !== "ISSUED") throw new CurrentHumanLeaseError("CURRENT_HUMAN_ENTRY_NOT_AVAILABLE");
      this.bind(row, source);
      if (Number(row.authority_revision) !== human.authority_revision || row.authority_revision !== authority.revision
        || row.subject_id !== human.sub || row.session_id !== human.sid || Number(row.session_revision) !== human.session_revision
        || Number(row.issued_at_ms) !== human.iat * 1000 || Number(row.expires_at_ms) !== human.exp * 1000
        || row.workspace_id !== human.workspace_id || row.environment !== human.environment
        || row.workload_id !== human.workload_id || row.request_digest !== human.request_digest)
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_BINDING_MISMATCH");
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
    const source = await this.attest(sourceProof);
    this.checkInstallation(source, false);
    if (source.phase === "ENTER") throw new CurrentHumanLeaseError("CURRENT_HUMAN_TERMINAL_REQUIRED");
    return this.transaction(async db => {
      const row = (await db.query<Row>("SELECT * FROM elp210_candidate.leases WHERE lease_id=$1 FOR UPDATE", [source.lease_id])).rows[0];
      if (!row || !["ENTERED", "UNKNOWN", "COMMITTED", "ROLLED_BACK"].includes(row.phase))
        throw new CurrentHumanLeaseError("CURRENT_HUMAN_RESOLUTION_NOT_AVAILABLE");
      this.bind(row, source);
      const terminal = source.phase === "UNKNOWN" ? null : accessDigest({ lease_id: source.lease_id, attempt_id: source.attempt_id,
        phase: source.phase, source_receipt_id: source.source_receipt_id, source_receipt_digest: source.source_receipt_digest,
        workspace_id: source.workspace_id, environment: source.environment, workload_id: source.workload_id, request_digest: source.request_digest });
      if (row.phase === source.phase && row.terminal_receipt_digest === terminal) return { replayed: true, phase: row.phase };
      if (["COMMITTED", "ROLLED_BACK"].includes(row.phase)) throw new CurrentHumanLeaseError("CURRENT_HUMAN_TERMINAL_CONFLICT");
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
    if(!this.config.source)return [];
    return this.transaction(async db => {
      const rows = await db.query<Row>(`SELECT * FROM elp210_candidate.leases
        WHERE workload_id=$1 AND phase IN ('ENTERED','UNKNOWN') ORDER BY issued_at_ms,lease_id LIMIT 128`,
        [this.reverseSource().workload_id]);
      return rows.rows.map(row => ({ lease_id: row.lease_id, attempt_id: row.attempt_id!, workspace_id: row.workspace_id,
        environment: row.environment, workload_id: row.workload_id, request_digest: row.request_digest,
        human_issuer: this.config.issuer, subject: row.subject_id, session_id: row.session_id,
        session_revision: Number(row.session_revision), authority_revision: Number(row.authority_revision),
        expires_at: Number(row.expires_at_ms) / 1000 }));
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
    const counts = (await db.query(`SELECT count(*)::int AS pending,
      count(*) FILTER (WHERE phase='UNKNOWN' OR expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000))::int AS unknown
      FROM elp210_candidate.obligations WHERE unresolved`)).rows[0];
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
    candidate.nativeHTTP=Object.freeze(c);candidate.nativeEgress=new NativeReadEgress(c.egress);return candidate;
  }
  private reverseSource(){
    if(!this.config.source)throw new CurrentHumanLeaseError("CURRENT_HUMAN_REVERSE_PURPOSE_REQUIRED");
    return this.config.source;
  }
  private workloadId(){return this.nativeHTTP?.workload_id??this.reverseSource().workload_id;}
  private nativeConfig(){
    if(!this.nativeHTTP)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_PURPOSE_REQUIRED");
    return this.nativeHTTP;
  }
  private nativeState(handle:PreparedCurrentHumanNativeHTTP){
    const s=this.nativeHandles.get(handle);
    if(!s)throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_HANDLE_REQUIRED");return s;
  }
  private selectedNativeRow(row:NativeHTTPRow|undefined):NativeBase{
    const c=this.nativeConfig();
    if(!row||row.lifecycle_kind!=="MANAGER_HTTP"||row.source_identity_digest!==c.selection.source_identity_digest)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    const captured=nativeBase(Buffer.from(row.base_body,"utf8")),b=captured.base.binding;
    if(captured.body!==row.base_body||captured.prepared.binding_digest!==row.binding_digest
      ||captured.prepared.stable_core_digest!==row.stable_core_digest
      ||b.lease_id!==row.lease_id||b.attempt_id!==row.attempt_id||b.subject!==row.subject_id
      ||b.human_issuer!==c.issuer||b.workspace_id!==row.workspace_id||b.environment!==row.environment
      ||b.workload_id!==row.workload_id||b.workload_id!==c.workload_id||b.request_digest!==row.request_digest
      ||b.workspace_id!==c.selection.workspace_id||b.environment!==c.selection.environment
      ||accessDigest(captured.base.domain)!==accessDigest(c.selection.domain)
      ||nativeBusinessReadUtcMicroseconds(captured.base.deadline)/1000n!==BigInt(row.expires_at_ms))
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    return captured.base;
  }
  private assertNativeRow(row:NativeHTTPRow|undefined,s:NativeHTTPState):asserts row is NativeHTTPRow{
    this.selectedNativeRow(row);
    if(!row||row.sender_id!==this.nativeSenderId||row.subject_id!==s.actor.user_id||row.session_id!==s.actor.session_id
      ||Number(row.session_revision)!==s.actor.session_generation||row.scope_digest!==s.scope_digest
      ||row.base_body!==s.base_body||row.binding_digest!==s.binding_digest||row.stable_core_digest!==s.stable_core_digest)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
  }
  private async nativeDecision(db:PoolClient,s:NativeHTTPState){
    const d=await evaluateManagerDomainRead(db,{actor:s.actor,workspace_id:s.context.binding.workspace_id,
      environment:s.context.binding.environment,domain:s.context.domain,expected_scope_digest:s.scope_digest});
    if(d.field_policy_sha256!==s.context.domain.field_policy_sha256||d.valid_until_ms<s.valid_until_ms)
      throw new CurrentHumanLeaseError("CURRENT_HUMAN_NATIVE_BINDING_INVALID");
    return d;
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
    const c=this.nativeConfig(),captured=nativeBase(Buffer.from(baseBody,"utf8"));
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
      evidence_kind:phase==="SERVED"?"FINAL_HTTP_SEND_COMPLETED":"FINAL_HTTP_ABORT_CONFIRMED",
      receipt_id:row.receipt_id,receipt_digest:row.receipt_digest.slice(7)})
      .setProtectedHeader({alg:"EdDSA",kid:c.terminal.key_id,typ:"JWT"}).sign(c.terminal.private_key);
    return{state:"TERMINAL",phase,context:result.context,terminal};
  }
  private async recordNativeSourceACK(leaseId:string,observation:VerifiedSelectedNativeReadObservation){
    const proof=this.nativeObservation(observation);
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
    const local=this.nativeById.get(leaseId);
    if(local)local.settled=true;
    this.nativeById.delete(leaseId);
  }
  /** One recovery branch on the existing unified native port; not a poller.
   * OBSERVATION/ABSENT is routing only, never a cancellation/settlement ACK. */
  async reconcileNativeRead(leaseId:string):Promise<NativeHTTPRecovery>{
    let result=await this.recoverNativeRead(leaseId);
    if(result.state==="UNKNOWN")return result;
    if(result.state==="RECONCILED"){
      const local=this.nativeById.get(leaseId);if(local)local.settled=true;
      this.nativeById.delete(leaseId);return result;
    }
    const baseBody=nativeBase(result.context).body,status=this.nativeObservation(await this.nativeCall(baseBody,"status"));
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
