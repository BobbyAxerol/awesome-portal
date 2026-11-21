import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import type { AccessActor } from "./access.contract";
import { AccessPolicyError } from "./access.contract";
import { inspectPinnedC2B1NotAuthorized } from "./c2-b1-preflight";
import { lockCurrentHumanSnapshot } from "./current-human-snapshot";
import { ACCESS_STEP_UP_PROOFS, AccountLifecycleRepository } from "../repos/account-lifecycle";
import { createC2P7LockedRegistrationCandidate } from "./c2-p7-locked-registration-candidate";

/**
 * Internal, unmounted P7 preparation. The caller MUST have authenticated actor,
 * own a short writable transaction, and supply an independently verified B1 pin.
 * The held DB snapshot ends with the caller's transaction: this diagnostic is
 * not an acceptance, delegation, capability, signer authorization or permit.
 * It never writes a record, and MUST NOT be used to authorize B2 publication.
 */
export async function inspectC2P7Prerequisites(
  db: PoolClient, actor: AccessActor, workspaceId: string, b1Bytes: Uint8Array, pinnedSha256: string,
) {
  // Validate/copy caller-owned bytes before the first await; B1 is a proposal,
  // not evidence of owner approval or existing resource grants.
  const b1 = inspectPinnedC2B1NotAuthorized(b1Bytes, pinnedSha256);
  // Do not allow caller mutation while the database lock is pending to change
  // which owner is checked against the authenticated session.
  const currentActor = { user_id: actor.user_id, session_id: actor.session_id,
    session_generation: actor.session_generation };
  const snapshot = await lockCurrentHumanSnapshot(db, currentActor, workspaceId);
  if (!snapshot.anchor || snapshot.anchor !== currentActor.user_id || !snapshot.policy ||
      snapshot.policy.protected_owner_user_id !== snapshot.anchor) {
    throw new AccessPolicyError("ACCESS_DENIED");
  }
  const document = b1.acceptance.document;
  const missing: string[] = [
    "OWNER_APPROVED_IMMUTABLE_ACCEPTANCE_RECORD_REQUIRED",
    "EXACT_WORKLOAD_DELEGATION_AND_PORTAL_SCOPE_PROOF_REQUIRED",
    "P7_CURRENT_AUTHORITY_VERIFIER_NOT_INSTALLED",
  ];
  // Portal's current portfolio.read has no authority to grant TS HISTORY.
  if (document.operations.includes("HISTORY")) missing.push("HISTORY_ACTION_MAPPING_NOT_QUALIFIED");
  return Object.freeze({
    state: "NOT_AUTHORIZED" as const,
    b1_sha256: pinnedSha256,
    workspace_id: workspaceId,
    policy_revision: snapshot.policy.revision,
    authority_fingerprint: snapshot.authority_fingerprint,
    scope_count: document.scopes.length,
    operations: Object.freeze([...document.operations]),
    missing: Object.freeze(missing),
  });
}

const hex = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(128).refine(s => s.trim() === s && !/[\u0000-\u001f\u007f]/u.test(s));
export const verifiedBinding = z.object({ b1_sha256:hex, workspace_id:id, owner_user_id:id,
  issuer:id, subject:id, current_workload_ref:id, source_workload_id:id,
  ts_user_id:z.literal("b2b70006-2373-4f10-b2d4-5e4c32af9204"),
  environment:z.literal("paper"), visibility:z.literal("BUSINESS"), fields:z.tuple([z.literal("business_report")]),
  operations:z.array(z.enum(["READ","HISTORY"])).length(2),
  scopes:z.array(z.object({environment:z.literal("paper"),portfolio_id:id}).strict()).length(2),
  application_revision:id, authority_revision:z.number().int().nonnegative().safe(),
  mapping_sha256:hex, source_evidence_sha256:hex, signer_kid:id,
  effective_from_ms:z.number().int().nonnegative().safe(), expires_at_ms:z.number().int().nonnegative().safe(),
}).strict();
type VerifiedBinding = z.infer<typeof verifiedBinding>;

/** Server-only implementation must synchronously authenticate the qualified
 * Portal-side owner approval, configured P1 issuer, registered P6 workload,
 * application revision, P8 signer, A1/B1 pin and field/action mapping.
 * Current issuer uses Portal user_id as the stable subject; an alternative
 * mapping requires a qualified contract, not an assumption. P7 precedes TS
 * import: TS DB/head/current membership must NOT be a prerequisite. It must
 * not perform I/O, return a Promise or trust a caller claim. No production
 * implementation or held source fence is installed. */
export interface C2P7SourceVerifier { verify(proof: Uint8Array): unknown }
const fail = (code:string):never => { throw new Error(code); };
const sha = (v:string|Uint8Array) => createHash("sha256").update(v).digest("hex");
const exact = (a:unknown,b:unknown) => JSON.stringify(a) === JSON.stringify(b);
const approvedScopes = ["paper-portfolio-g1", "paper-root-g1"];

/** Unmounted candidate: no source verifier means no writes. Actor must come
 * from the server-authenticated session, not request JSON. An ACCESS_ADMIN
 * step-up and current owner/session/workspace/authority lock are rechecked in
 * the same bounded transaction. Records alone never authorize a publication;
 * B2 independently needs the live source fence and C2_SEALED. */
export class C2P7RecordCandidate {
  readonly #pool:Pool;
  readonly #source?:C2P7SourceVerifier;
  readonly #verify?:C2P7SourceVerifier["verify"];
  readonly #registration?:ReturnType<typeof createC2P7LockedRegistrationCandidate>;
  readonly #registrationKey?:string;
  constructor(pool:Pool, source?:C2P7SourceVerifier, registrationKey?:string) {
    const bounded = (n:unknown) => typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 30_000;
    if (!pool?.options || !bounded(pool.options.connectionTimeoutMillis) || !bounded(pool.options.query_timeout))
      fail("C2_P7_POOL_TIMEOUTS_REQUIRED");
    this.#pool=pool;this.#source=source;
    const verifier=source?.verify;
    this.#verify=typeof verifier==="function"?verifier:undefined;
    if(source && registrationKey) {
      if(!this.#verify) return fail("C2_P7_REGISTRATION_NOT_CURRENT");
      const selected=this.#verify;
      this.#registration=createC2P7LockedRegistrationCandidate(
        Object.freeze({verify:(proof:Uint8Array)=>selected.call(source,proof)}),registrationKey);
      this.#registrationKey=registrationKey;
    }
  }
  matchesComposition(pool:Pool,source:C2P7SourceVerifier,key:string):boolean {
    return this.#pool===pool&&this.#source===source&&this.#verify===source.verify&&this.#registrationKey===key&&!!this.#registration;
  }
  async record(actor:AccessActor, workspace:string, cycleSha256:string, b1Bytes:Uint8Array,
    pin:string, sourceProof:Uint8Array):Promise<{state:"RECORDED_NOT_AUTHORIZED"; acceptance_id:string;
      acceptance_record_digest:string; delegation_id:string; delegation_record_digest:string}> {
    return this.#write(actor,workspace,cycleSha256,b1Bytes,pin,sourceProof);
  }
  /** Recover only the same recorded owner intent, never its one-view proof.
   * This still creates preparation records, not an accepted grant. */
  async recordFromIntent(actor:AccessActor, workspace:string, cycleSha256:string, b1Bytes:Uint8Array,
    pin:string, sourceProof:Uint8Array, intentId:string, confirmationSha:string) {
    if(!z.string().uuid().safeParse(intentId).success||!hex.safeParse(confirmationSha).success)return fail("C2_P7_INTENT_INVALID");
    return this.#write(actor,workspace,cycleSha256,b1Bytes,pin,sourceProof,{intentId,confirmationSha});
  }
  async #write(actor:AccessActor, workspace:string, cycleSha256:string, b1Bytes:Uint8Array,
    pin:string, sourceProof:Uint8Array, recovery?:{intentId:string;confirmationSha:string}):Promise<{state:"RECORDED_NOT_AUTHORIZED"; acceptance_id:string;
      acceptance_record_digest:string; delegation_id:string; delegation_record_digest:string}> {
    if (!this.#source || !this.#verify || this.#source.verify!==this.#verify) return fail("C2_P7_SOURCE_VERIFIER_NOT_INSTALLED");
    if (!this.#registration) return fail("C2_P7_REGISTRATION_NOT_INSTALLED");
    if (!hex.safeParse(cycleSha256).success || !(sourceProof instanceof Uint8Array) || !sourceProof.byteLength ||
        sourceProof.byteLength > 65536) return fail("C2_P7_INVALID_INPUT");
    const b1=inspectPinnedC2B1NotAuthorized(b1Bytes,pin), doc=b1.acceptance.document;
    if (!exact([...doc.operations].sort(),["HISTORY","READ"]) ||
        !exact(doc.scopes.map(s=>s.portfolio_id).sort(),approvedScopes)) return fail("C2_P7_SCOPE_NOT_APPROVED");
    const capturedActor={user_id:actor.user_id,session_id:actor.session_id,session_generation:actor.session_generation};
    const capturedProof=Buffer.from(sourceProof), proofHash=sha(capturedProof);
    try {
    const raw=this.#verify.call(this.#source,capturedProof);
    // A thenable is not awaited or accepted; implementations cannot hold this
    // transaction open on an unbounded network callback.
    const parsed=verifiedBinding.safeParse(raw);
    if (!parsed.success) return fail("C2_P7_SOURCE_PROOF_INVALID");
    const v:VerifiedBinding=parsed.data;
    if (v.source_evidence_sha256!==proofHash || v.b1_sha256!==pin ||
        v.workspace_id!==workspace || v.owner_user_id!==capturedActor.user_id || v.subject!==capturedActor.user_id ||
        v.ts_user_id!==b1.head.user_id || !exact(v.operations,doc.operations) || !exact(v.scopes,doc.scopes) ||
        !exact(v.fields,doc.fields) || v.visibility!==doc.visibility) return fail("C2_P7_SOURCE_BINDING_MISMATCH");
    const client=await this.#pool.connect(); let discard=false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='1000ms'; SET LOCAL statement_timeout='3000ms'");
      const current=await lockCurrentHumanSnapshot(client,capturedActor,workspace);
      if (!current.anchor || current.anchor!==capturedActor.user_id || !current.policy ||
          current.policy.state!=="REVIEWED" || current.policy.qualification!=="OWNER_VERIFIED" ||
          current.policy.protected_owner_user_id!==current.anchor) return fail("C2_P7_OWNER_REQUIRED");
      // This revalidates the signed registration while holding the same
      // authority/registry locks and the same transaction as the candidate
      // record. It remains NOT_AUTHORIZED until registry writers, authority
      // provenance and transactional revocation are independently qualified.
      const registered=await this.#registration.revalidate(client,capturedActor,workspace,capturedProof);
      if(registered.authority_revision!==v.authority_revision || registered.application_revision!==v.application_revision)
        return fail("C2_P7_REGISTRATION_NOT_CURRENT");
      const stepUp=await new AccountLifecycleRepository(client).lockActiveStepUpExpiry(
        capturedActor.session_id,capturedActor.user_id,ACCESS_STEP_UP_PROOFS);
      if (!stepUp) return fail("C2_P7_STEP_UP_REQUIRED");
      const authority=await client.query("SELECT revision::text,drain_id FROM elp210_candidate.authority WHERE singleton");
      const revision=authority.rows[0]?.revision;
      if (authority.rowCount!==1 || authority.rows[0]?.drain_id!==null || !/^(0|[1-9][0-9]*)$/.test(revision) ||
          Number(revision)!==v.authority_revision) return fail("C2_P7_AUTHORITY_CHANGED");
      let intentExpiry=Number.MAX_SAFE_INTEGER;
      if(recovery!==undefined) {
        // Lock the same immutable intent before a fresh revocation read. The
        // revoke writer takes this row lock too; no proof bearer is recreated.
        let registrationSha:string;
        try {
          const env=JSON.parse(capturedProof.toString("utf8")) as {payload?:unknown};
          if(typeof env.payload!=="string"||!/^[A-Za-z0-9_-]+$/.test(env.payload))return fail("C2_P7_INTENT_MISMATCH");
          const payload=Buffer.from(env.payload,"base64url");
          if(payload.toString("base64url")!==env.payload)return fail("C2_P7_INTENT_MISMATCH");
          registrationSha=sha(payload);
        } catch {return fail("C2_P7_INTENT_MISMATCH");}
        const decision={schema:"portal.c2-p7-owner-intent.v1",b1_sha256:pin,source:v,action:"REGISTER",
          registration_key:this.#registrationKey,registration_sha256:registrationSha,
          session_generation:capturedActor.session_generation,
          review_binding:{cycle_sha256:cycleSha256,confirmation_sha256:recovery.confirmationSha}};
        const intent=await client.query(`SELECT expires_at_ms::text FROM elp210_c2_p7_candidate.lock_owner_intent_by_id($1)
          WHERE action='REGISTER' AND workspace_id=$2 AND owner_user_id=$3 AND session_id=$4
            AND session_generation=$5 AND registration_key=$6 AND registration_sha256=$7
            AND source_evidence_sha256=$8 AND b1_sha256=$9 AND authority_revision=$10
            AND decision_json=$11::jsonb`,[recovery.intentId,workspace,capturedActor.user_id,capturedActor.session_id,
          capturedActor.session_generation,this.#registrationKey,registrationSha,proofHash,pin,revision,JSON.stringify(decision)]);
        if(intent.rowCount!==1)return fail("C2_P7_INTENT_MISMATCH");
        const revoked=await client.query("SELECT 1 FROM elp210_c2_p7_candidate.owner_intent_revocations WHERE intent_id=$1",[recovery.intentId]);
        intentExpiry=Number(intent.rows[0]?.expires_at_ms);
        if(revoked.rowCount!==0||!Number.isSafeInteger(intentExpiry))return fail("C2_P7_INTENT_MISMATCH");
      }
      const now=Number((await client.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
      if (!Number.isSafeInteger(now) || v.effective_from_ms>now || now>=v.expires_at_ms ||
          v.expires_at_ms-v.effective_from_ms>90*86400_000 || now>=current.lease_until_ms || now>=stepUp.getTime() || now>=intentExpiry)
        return fail("C2_P7_EXPIRED");
      // An existing diagnostic/older intent must not satisfy a resumed
      // confirmation merely because it describes the same public scope.
      const binding=sha(JSON.stringify([cycleSha256,pin,v,current.authority_fingerprint,
        ...(recovery?[recovery.intentId,recovery.confirmationSha]:[])]));
      const acceptanceId=randomUUID(),delegationId=randomUUID();
      const common={schema:"portal.pm-current-access.p7-binding.v1",b1_sha256:pin,workspace_id:workspace,
        environment:"paper",owner_user_id:capturedActor.user_id,grantor:{issuer:v.issuer,subject:v.subject},
        grantee_workload:{current_workload_ref:v.current_workload_ref,source_workload_id:v.source_workload_id},
        application_revision:v.application_revision,authority_revision:v.authority_revision,
        mapping_sha256:v.mapping_sha256,source_evidence_sha256:v.source_evidence_sha256,
        effective_from_ms:v.effective_from_ms,expires_at_ms:v.expires_at_ms,signer_kid:v.signer_kid,
        operations:doc.operations,fields:doc.fields,visibility:doc.visibility,scopes:doc.scopes};
      const delegation=JSON.stringify({...common,record_kind:"DELEGATION_PREPARATION_NOT_AUTHORIZED",delegation_id:delegationId});
      const delegationDigest=sha(delegation);
      const acceptance=JSON.stringify({...common,record_kind:"ACCEPTANCE_PREPARATION_NOT_AUTHORIZED",acceptance_id:acceptanceId,
        delegation_id:delegationId,delegation_record_digest:delegationDigest});
      const inserted=await client.query(`INSERT INTO elp210_c2_p7_candidate.records
        (cycle_sha256,binding_sha256,b1_sha256,acceptance_id,delegation_id,acceptance_json,acceptance_sha256,delegation_json,delegation_sha256,
          owner_intent_id,confirmation_sha256)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(cycle_sha256) DO NOTHING RETURNING acceptance_id`,
      [cycleSha256,binding,pin,acceptanceId,delegationId,acceptance,sha(acceptance),delegation,delegationDigest,
        recovery?.intentId??null,recovery?.confirmationSha??null]);
      if (inserted.rowCount!==0 && inserted.rowCount!==1) return fail("C2_P7_WRITE_FAILED");
      const result=await client.query(`SELECT binding_sha256,b1_sha256,acceptance_id,delegation_id,
        acceptance_json,acceptance_sha256,delegation_json,delegation_sha256,owner_intent_id::text,confirmation_sha256
        FROM elp210_c2_p7_candidate.lock_record_by_cycle($1)`,[cycleSha256]);
      const row=result.rows[0];
      if (result.rowCount!==1 || !row || row.binding_sha256!==binding || row.b1_sha256!==pin ||
          typeof row.acceptance_json!=="string" || typeof row.delegation_json!=="string" ||
          sha(row.acceptance_json)!==row.acceptance_sha256 || sha(row.delegation_json)!==row.delegation_sha256 ||
          row.owner_intent_id!==(recovery?.intentId??null) || row.confirmation_sha256!==(recovery?.confirmationSha??null) ||
          !z.string().uuid().safeParse(row.acceptance_id).success || !z.string().uuid().safeParse(row.delegation_id).success)
        return fail("C2_P7_RECORD_BINDING_MISMATCH");
      const finalNow=Number((await client.query("SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint AS ms")).rows[0]?.ms);
      if (!Number.isSafeInteger(finalNow) || finalNow>=v.expires_at_ms || finalNow>=current.lease_until_ms ||
          finalNow>=stepUp.getTime() || finalNow>=intentExpiry) return fail("C2_P7_EXPIRED");
      await client.query("COMMIT");
      return {state:"RECORDED_NOT_AUTHORIZED",acceptance_id:row.acceptance_id,acceptance_record_digest:row.acceptance_sha256,
        delegation_id:row.delegation_id,delegation_record_digest:row.delegation_sha256};
    } catch (error) { try { await client.query("ROLLBACK"); } catch { discard=true; } throw error; }
    finally { client.release(discard); }
    } finally { capturedProof.fill(0); }
  }
}
