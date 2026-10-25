import { createHash,createPublicKey,KeyObject,randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool,PoolClient } from "pg";
import { SignJWT } from "jose";
import { z } from "zod";
import { withTransaction } from "../db/pool";
import { accessDigest } from "./access-digest";
import { tsRootMembershipAcceptance,type TsRootMembershipAcceptance } from "./access.contract";
import type { AccessTrustProvider } from "./access-trust";
import type { QualifiedRootMembershipReceipt,RootReceiptVerificationContext } from "./access-root-receipt";
import type { CurrentHumanMutationHooks } from "./current-human-mutations";
import { nativeRootBase,nativeRootCanonical,nativeRootDecode,nativeRootMutation,nativeRootOriginal,nativeRootRegistration,
  prepareNativeRootSourceRequest,type NativeRootSourceBase,type NativeRootSourceAction,type NativeRootSourceIssued } from "./native-root-codec";
import { NativeRootSourceClient,nativeRootSourceAuthenticatedResult,type AuthenticatedNativeRootSourceResult } from "./native-root-source-client";
import { nativeBusinessReadUtcMicroseconds } from "./native-business-read-codec";

/** SOURCE_ONLY private native ROOT composition. Caller supplies an independently
 * reviewed registration/original locator, NOT a grant, graph or human JWT. The
 * actual held native source supplies fact+current HUMAN/membership. Installing
 * this class alone does not install policy, acceptance, permissions or runtime. */
export interface NativeRootProviderConfig {
  source:{human_issuer:string;subject:string;workspace_id:string;environment:"paper";workload_id:string};
  registration:z.infer<typeof nativeRootRegistration>;
  original:z.infer<typeof nativeRootOriginal>;
  correspondence:{registry_revision:string;payload_sha256:string;approval_ref:string};
  maximum_retained:number; maximum_unresolved:number; maximum_recoveries:number; attempt_ms:number;
  terminal:{issuer:string;audience:string;key_id:string;private_key:KeyObject;ttl_seconds:number};
}
type Phase="PREPARED"|"ISSUE_REQUESTED"|"ISSUED"|"ENTERING"|"ENTERED"|"UNKNOWN"|"COMMITTED"|"ROLLED_BACK"|"CANCELLED";
type Row={lease_id:string;attempt_id:string;mutation_id:string|null;purpose:"QUALIFY"|"COMMIT";source_config_digest:string;
  base_digest:string;base_body:string;phase:Phase;source_digest:string|null;source_fingerprint:string|null;source_expires_at:string|null;
  root_operation_id:string|null;terminal_receipt_id:string|null;terminal_receipt_digest:string|null;terminal_fact:unknown;
  source_settled:boolean;source_ack_digest:string|null;};
export class NativeRootProviderError extends Error {
  constructor(readonly code:"NATIVE_ROOT_CONFIG_INVALID"|"NATIVE_ROOT_NOT_QUALIFIED"|"NATIVE_ROOT_CAPACITY_EXHAUSTED"|
    "NATIVE_ROOT_RECOVERY_REQUIRED"|"NATIVE_ROOT_ORIGINAL_CHANGED"|"NATIVE_ROOT_CUSTODY_CONFLICT") {super("The native root authority is not available.");}
}
const fail=(code:NativeRootProviderError["code"]="NATIVE_ROOT_NOT_QUALIFIED"):never=>{throw new NativeRootProviderError(code);};
const text=z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const hash=z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/),digest=z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const configSchema=z.object({source:z.object({human_issuer:text,subject:text,workspace_id:text,environment:z.literal("paper"),workload_id:text}).strict(),
  registration:nativeRootRegistration,original:nativeRootOriginal,
  correspondence:z.object({registry_revision:digest,payload_sha256:hash,approval_ref:text}).strict(),
  maximum_retained:z.number().int().min(1).max(4096),maximum_unresolved:z.number().int().min(1).max(64),
  maximum_recoveries:z.number().int().min(1).max(16),attempt_ms:z.number().int().min(1).max(60000)}).strict();
const terminalSchema=z.object({issuer:text,audience:text,key_id:text,ttl_seconds:z.number().int().min(1).max(60)}).strict();
type TerminalFact={schema_version:"portal.native-root-terminal.v1";phase:"COMMITTED"|"ROLLED_BACK";
  source_base_digest:string;mutation_id:string;mutation_binding_digest:string;accepted_fact_digest:string;receipt_ref:string|null;};

export class NativeRootReceiptProvider {
  private readonly config:Readonly<NativeRootProviderConfig>;
  readonly source_config_digest:string;
  constructor(private readonly pool:Pool,private readonly client:NativeRootSourceClient,input:NativeRootProviderConfig) {
    try {
      // Explicit bounds/source/terminal trust, never fixture constants/defaults.
      const {terminal,...configuration}=input,parsed=configSchema.parse(configuration);
      const {private_key,...terminalPublic}=terminal,t=terminalSchema.parse(terminalPublic);
      if(!(private_key instanceof KeyObject)||private_key.type!=="private"||private_key.asymmetricKeyType!=="ed25519"||
        parsed.maximum_unresolved>parsed.maximum_retained||client.provenance().workload_id!==parsed.source.workload_id)throw new Error();
      this.config=Object.freeze({...parsed,terminal:Object.freeze({...t,private_key})});
      const public_key_sha256=createHash("sha256").update(createPublicKey(private_key).export({type:"spki",format:"der"})).digest("hex");
      this.source_config_digest=accessDigest({...parsed,terminal:{...t,public_key_sha256},transport:client.provenance()});
    } catch {throw new NativeRootProviderError("NATIVE_ROOT_CONFIG_INVALID");}
  }
  usesPool(pool:Pool):boolean{return this.pool===pool;}
  /** Actual production composition, preserving every other independent trust
   * surface. READ/STREAM/HISTORY remain with their own providers and grants. */
  compose(base:AccessTrustProvider):AccessTrustProvider {
    return {verifyPolicy:base.verifyPolicy.bind(base),verifyReceipt:base.verifyReceipt.bind(base),
      relations:base.relations.bind(base),verifiedHumanMapping:base.verifiedHumanMapping.bind(base),
      ...(base.qualifyDelegatedReceipt?{qualifyDelegatedReceipt:base.qualifyDelegatedReceipt.bind(base)}:{}),
      ...(base.readPublication?{readPublication:base.readPublication.bind(base)}:{}),
      verifyRootReceipt:(input,context)=>this.verify(input,context)};
  }
  private async transaction<T>(f:(db:PoolClient)=>Promise<T>):Promise<T> {
    return withTransaction(this.pool,async db=>{await db.query("SET LOCAL lock_timeout='1500ms'");
      await db.query("SET LOCAL statement_timeout='5000ms'");return f(db);});
  }
  private checkRow(row:Row|undefined):{row:Row;base:Readonly<NativeRootSourceBase>} {
    if(!row||row.source_config_digest!==this.source_config_digest)return fail("NATIVE_ROOT_ORIGINAL_CHANGED");
    const base=nativeRootBase(nativeRootDecode(Buffer.from(row.base_body,"utf8"),32768));
    if(accessDigest(base)!==row.base_digest||nativeRootCanonical(base)!==row.base_body||
      base.binding.lease_id!==row.lease_id||base.binding.attempt_id!==row.attempt_id||base.phase!==row.purpose||
      (base.mutation?.mutation_id??null)!==row.mutation_id||
      accessDigest(base.registration)!==accessDigest(this.config.registration)||accessDigest(base.original)!==accessDigest(this.config.original)||
      accessDigest({human_issuer:base.binding.human_issuer,subject:base.binding.subject,workspace_id:base.binding.workspace_id,
        environment:base.binding.environment,workload_id:base.binding.workload_id})!==accessDigest(this.config.source))
      return fail("NATIVE_ROOT_ORIGINAL_CHANGED");
    return{row,base};
  }
  private async call(base:Readonly<NativeRootSourceBase>,action:NativeRootSourceAction,terminal?:string):Promise<Readonly<AuthenticatedNativeRootSourceResult>> {
    const prepared=prepareNativeRootSourceRequest(base,action,terminal),result=await this.client.call(prepared);
    const proof=nativeRootSourceAuthenticatedResult(this.client,result);
    if(proof.base_body!==nativeRootCanonical(base))return fail("NATIVE_ROOT_ORIGINAL_CHANGED");return proof;
  }
  private async reserve(context:RootReceiptVerificationContext):Promise<Readonly<NativeRootSourceBase>> {
    const now=Date.now(),mutation=context.phase==="COMMIT"?nativeRootMutation.parse(context.mutation):null;
    const {source,registration,original}=this.config;
    const binding={lease_id:randomUUID(),attempt_id:randomUUID(),...source,operation:"MUTATION" as const};
    const body={schema_version:"pma.registered-native-relations.request.v1" as const,phase:context.phase,registration,original,mutation,deadline:new Date(now+this.config.attempt_ms).toISOString()};
    // The exact wire digest excludes schema_version and action, not a second
    // request identity or replacement attempt during recovery.
    const base=nativeRootBase({...body,binding:{...binding,request_digest:accessDigest({phase:body.phase,registration,original,mutation,deadline:body.deadline,binding}).slice(7)}});
    await this.transaction(async db=>{
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended('portal-native-root-capacity-v1',0))");
      if(mutation) {
        const m=(await db.query("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1 FOR UPDATE",[mutation.mutation_id])).rows[0];
        if(!m||m.binding_digest!==mutation.binding_digest||m.key_digest!==mutation.key_digest||m.family!==mutation.family||
          !["PENDING","FINISHED"].includes(m.state))return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
      }
      const counts=(await db.query("SELECT count(*)::int AS retained,count(*) FILTER (WHERE NOT source_settled)::int AS unresolved FROM portal_native_root_obligations")).rows[0];
      if(counts.retained>=this.config.maximum_retained||counts.unresolved>=this.config.maximum_unresolved)return fail("NATIVE_ROOT_CAPACITY_EXHAUSTED");
      await db.query(`INSERT INTO portal_native_root_obligations
        (lease_id,attempt_id,mutation_id,purpose,source_config_digest,base_digest,base_body,phase)
        VALUES($1,$2,$3,$4,$5,$6,$7,'PREPARED')`,[binding.lease_id,binding.attempt_id,mutation?.mutation_id??null,
        context.phase,this.source_config_digest,accessDigest(base),nativeRootCanonical(base)]);
    });return base;
  }
  private async transition(base:Readonly<NativeRootSourceBase>,from:readonly Phase[],to:Phase):Promise<void> {
    const r=await this.transaction(db=>db.query("UPDATE portal_native_root_obligations SET phase=$2 WHERE lease_id=$1 AND phase=ANY($3::text[]) AND NOT source_settled RETURNING *",[base.binding.lease_id,to,from]));
    if(r.rowCount!==1)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");this.checkRow(r.rows[0]);
  }
  private validateIssue(base:Readonly<NativeRootSourceBase>,issued:NativeRootSourceIssued):TsRootMembershipAcceptance {
    if(accessDigest(issued.correspondence)!==accessDigest({...this.config.correspondence,manifest_sha256:this.config.registration.manifest_sha256}))return fail("NATIVE_ROOT_ORIGINAL_CHANGED");
    const entries=issued.relations.grants.filter(g=>g.grant_id===base.original.grant_id&&accessDigest(g.accepted)===base.original.accepted_fact_digest);
    if(entries.length!==1)return fail("NATIVE_ROOT_ORIGINAL_CHANGED");
    const fact=tsRootMembershipAcceptance.parse(entries[0].accepted);
    if(fact.outcome!=="ACCEPTED"||fact.workspace_id!==base.binding.workspace_id||
      issued.relations.subject_user_id!==fact.portal_user_id||issued.relations.ts_user_id!==fact.ts_user_id||
      issued.relations.mapping_revision!==fact.mapping_revision)return fail("NATIVE_ROOT_ORIGINAL_CHANGED");
    if(base.mutation){const key=accessDigest(["ROOT_RECEIPT",fact.source,fact.receipt_id]);
      if(base.mutation.key_digest!==key||base.mutation.request_digest!==base.original.accepted_fact_digest||
        base.mutation.binding_digest!==accessDigest({family:"QUALIFIED_ROOT_RECEIPT",operation:"ROOT_RECEIPT",key_digest:key,
          request_digest:base.original.accepted_fact_digest,target_id:fact.workspace_id}))return fail("NATIVE_ROOT_CUSTODY_CONFLICT");}
    return fact;
  }
  async verify(input:unknown,context:RootReceiptVerificationContext):Promise<QualifiedRootMembershipReceipt|null> {
    const original=nativeRootOriginal.safeParse(input);
    if(!original.success||accessDigest(original.data)!==accessDigest(this.config.original))return fail("NATIVE_ROOT_ORIGINAL_CHANGED");
    // Recovery is same-original only and never returns authority; a NEW native
    // held ISSUE below is mandatory after every resolved/retired observation.
    await this.recover();
    const base=await this.reserve(context);
    try {
      await this.transition(base,["PREPARED"],"ISSUE_REQUESTED");
      const proof=await this.call(base,"issue");if(proof.result.state!=="ISSUED")return fail();
      const issued=proof.result,fact=this.validateIssue(base,issued);
      const saved=await this.transaction(db=>db.query(`UPDATE portal_native_root_obligations
        SET phase='ISSUED',source_digest=$2,source_fingerprint=$3,source_expires_at=$4
        WHERE lease_id=$1 AND phase='ISSUE_REQUESTED' AND NOT source_settled RETURNING *`,
        [base.binding.lease_id,issued.lease.source_digest,issued.lease.source_fingerprint,issued.lease.expires_at]));
      if(saved.rowCount!==1)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");this.checkRow(saved.rows[0]);
      if(context.phase==="COMMIT") {
        await this.transition(base,["ISSUED"],"ENTERING");
        const entered=await this.call(base,"enter");if(entered.result.state!=="ENTERED")return fail();
        await this.transition(base,["ENTERING"],"ENTERED");
      }
      const expires=Number(nativeBusinessReadUtcMicroseconds(issued.lease.expires_at)/1000n),issuedWall=Date.now(),issuedMono=performance.now();
      let released=false;
      const assertCurrent=()=>{if(released||Date.now()>=expires||performance.now()-issuedMono>=expires-issuedWall)return fail();};
      assertCurrent();
      return {fact,mapping:{ts_user_id:issued.relations.ts_user_id,revision:issued.relations.mapping_revision},
        membership:{revision:fact.membership_revision,receipt_id:fact.receipt_id,mapping_revision:fact.mapping_revision},
        current_authority:structuredClone(issued.relations),requiresCoordinatedCommit:true,assertCurrent,
        ...(context.phase==="COMMIT"?{beforeApply:(db:PoolClient)=>this.beforeApply(db,base,assertCurrent),
          afterApply:(db:PoolClient,terminal:ReturnType<CurrentHumanMutationHooks<unknown>["terminal"]>)=>this.afterApply(db,base,fact,terminal)}:{}),
        release:async()=>{released=true;await this.recoverOne(base.binding.lease_id);}};
    } catch(error) {
      // A lost ISSUE/ENTER response keeps exact frozen custody; never mint a
      // substitute held object, ACK, source receipt or attempt to hide UNKNOWN.
      try{await this.recoverOne(base.binding.lease_id);}catch{/* Same unresolved original is retained. */}
      throw error;
    }
  }
  private async beforeApply(db:PoolClient,base:Readonly<NativeRootSourceBase>,assertCurrent:()=>void):Promise<void> {
    const {row}=this.checkRow((await db.query<Row>("SELECT * FROM portal_native_root_obligations WHERE lease_id=$1 FOR UPDATE",[base.binding.lease_id])).rows[0]);
    if(row.phase!=="ENTERED"||row.source_settled||!base.mutation)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
    const m=(await db.query("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1",[base.mutation.mutation_id])).rows[0];
    if(!m||m.binding_digest!==base.mutation.binding_digest||m.key_digest!==base.mutation.key_digest||
      !["PENDING","FINISHED"].includes(m.state))return fail("NATIVE_ROOT_CUSTODY_CONFLICT");assertCurrent();
  }
  private async afterApply(db:PoolClient,base:Readonly<NativeRootSourceBase>,fact:TsRootMembershipAcceptance,
    terminal:ReturnType<CurrentHumanMutationHooks<unknown>["terminal"]>):Promise<void> {
    if(!base.mutation||terminal.outcome!=="APPLIED"||!terminal.receipt_ref||terminal.reason_code!==null)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
    const e=(await db.query("SELECT * FROM portal_access_policy_events WHERE event_id=$1",[terminal.receipt_ref])).rows[0];
    if(!e||e.operation!=="TS_RECEIPT"||e.workspace_id!==base.binding.workspace_id||e.grant_id!==base.original.grant_id||
      e.request_digest!==base.original.accepted_fact_digest||e.source!==fact.source||e.source_receipt_id!==fact.receipt_id||
      accessDigest(e.after_fact?.root_context??null)!==base.original.accepted_fact_digest)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
    const terminalFact:TerminalFact={schema_version:"portal.native-root-terminal.v1",phase:"COMMITTED",source_base_digest:accessDigest(base),
      mutation_id:base.mutation.mutation_id,mutation_binding_digest:base.mutation.binding_digest,
      accepted_fact_digest:base.original.accepted_fact_digest,receipt_ref:terminal.receipt_ref};
    const updated=await db.query(`UPDATE portal_native_root_obligations SET phase='COMMITTED',root_operation_id=$2,
      terminal_receipt_id=$3,terminal_receipt_digest=$4,terminal_fact=$5::jsonb
      WHERE lease_id=$1 AND phase='ENTERED' AND NOT source_settled`,[base.binding.lease_id,terminal.receipt_ref,randomUUID(),accessDigest(terminalFact),JSON.stringify(terminalFact)]);
    if(updated.rowCount!==1)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
  }
  /** Recovery has no root/policy/application callback and cannot create or
   * reactivate a grant. A physical serialized tombstone blocks the old apply. */
  async recover():Promise<{remaining:number}> {
    const rows=(await this.pool.query<Row>("SELECT * FROM portal_native_root_obligations WHERE NOT source_settled AND source_config_digest=$1 ORDER BY created_at,lease_id LIMIT $2",[this.source_config_digest,this.config.maximum_recoveries])).rows;
    for(const row of rows)await this.recoverOne(row.lease_id);
    const remaining=Number((await this.pool.query("SELECT count(*)::int AS n FROM portal_native_root_obligations WHERE NOT source_settled AND source_config_digest=$1",[this.source_config_digest])).rows[0].n);
    if(remaining)return fail("NATIVE_ROOT_RECOVERY_REQUIRED");return{remaining};
  }
  private async recoverOne(leaseId:string):Promise<void> {
    let {row,base}=this.checkRow((await this.pool.query<Row>("SELECT * FROM portal_native_root_obligations WHERE lease_id=$1",[leaseId])).rows[0]);
    if(row.source_settled)return;
    if(["PREPARED","ISSUE_REQUESTED","ISSUED","CANCELLED"].includes(row.phase)) {
      // No ENTER was admitted locally. Source cancellation/tombstone, not TTL
      // or an ABSENT status, is the only successful source release here.
      const proof=await this.call(base,"cancel-unentered");
      if(!["CANCELLED","RETIRED"].includes(proof.result.state))return fail("NATIVE_ROOT_RECOVERY_REQUIRED");
      await this.transaction(async db=>{const r=await db.query(`UPDATE portal_native_root_obligations SET phase='CANCELLED',source_settled=true,source_ack_digest=$2
        WHERE lease_id=$1 AND phase=ANY($3::text[]) AND NOT source_settled RETURNING *`,[leaseId,proof.response_sha256,["PREPARED","ISSUE_REQUESTED","ISSUED","CANCELLED"]]);
        if(r.rowCount!==1){const prior=this.checkRow((await db.query<Row>("SELECT * FROM portal_native_root_obligations WHERE lease_id=$1",[leaseId])).rows[0]).row;
          if(!prior.source_settled||prior.phase!=="CANCELLED")return fail("NATIVE_ROOT_CUSTODY_CONFLICT");}
        else this.checkRow(r.rows[0]);});return;
    }
    // A same-original status may recover the missing source digest after a
    // transport loss. It never proves Core COMMIT/ROLLBACK or current authority.
    const observed=await this.call(base,"status");
    if(observed.result.state!=="OBSERVATION"||observed.result.recovery.state!=="RECORDED")return fail("NATIVE_ROOT_RECOVERY_REQUIRED");
    const recovery=observed.result.recovery;
    if(!row.source_digest||"source_digest" in recovery &&
      (recovery.source_digest!==row.source_digest||recovery.expires_at!==row.source_expires_at))return fail("NATIVE_ROOT_ORIGINAL_CHANGED");
    row=await this.transaction(async db=>{
      if(!base.mutation)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
      // Same lock ordering as owning coordinator: mutation, then source custody.
      const m=(await db.query("SELECT * FROM elp210_candidate.mutations WHERE mutation_id=$1 FOR UPDATE",[base.mutation.mutation_id])).rows[0];
      const selected=this.checkRow((await db.query<Row>("SELECT * FROM portal_native_root_obligations WHERE lease_id=$1 FOR UPDATE",[leaseId])).rows[0]);
      if(!m||m.binding_digest!==base.mutation.binding_digest||m.key_digest!==base.mutation.key_digest)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
      const r=selected.row;if(r.source_settled)return r;
      if(r.phase==="COMMITTED") {
        const e=(await db.query("SELECT * FROM portal_access_policy_events WHERE event_id=$1",[r.root_operation_id])).rows[0];
        if(m.state!=="FINISHED"||m.terminal_digest!==accessDigest({outcome:"APPLIED",receipt_ref:r.root_operation_id,reason_code:null})||
          !e||e.operation!=="TS_RECEIPT"||e.workspace_id!==base.binding.workspace_id||e.grant_id!==base.original.grant_id||
          e.request_digest!==base.original.accepted_fact_digest||accessDigest(e.after_fact?.root_context??null)!==base.original.accepted_fact_digest)
          return fail("NATIVE_ROOT_CUSTODY_CONFLICT");return r;
      }
      if(r.phase==="ROLLED_BACK")return r;
      if(!["ENTERING","ENTERED","UNKNOWN"].includes(r.phase)||m.state!=="PENDING")return fail("NATIVE_ROOT_RECOVERY_REQUIRED");
      const fact:TerminalFact={schema_version:"portal.native-root-terminal.v1",phase:"ROLLED_BACK",source_base_digest:r.base_digest,
        mutation_id:m.mutation_id,mutation_binding_digest:m.binding_digest,accepted_fact_digest:base.original.accepted_fact_digest,receipt_ref:null};
      return this.checkRow((await db.query<Row>(`UPDATE portal_native_root_obligations SET phase='ROLLED_BACK',terminal_receipt_id=$2,
        terminal_receipt_digest=$3,terminal_fact=$4::jsonb WHERE lease_id=$1 RETURNING *`,[leaseId,randomUUID(),accessDigest(fact),JSON.stringify(fact)])).rows[0]).row;
    });
    if(row.source_settled)return;
    if(row.phase==="ROLLED_BACK"&&["ISSUED","RETIRED","CANCELLED"].includes(recovery.phase)) {
      // ENTER may never have reached the source. Core's serialized tombstone
      // first prevents late apply; native serialized cancellation then retires
      // that same original. Do not invent ENTER/terminal authority to resolve
      // a source which has honestly remained unentered.
      const cancelled=await this.call(base,"cancel-unentered");
      if(!["CANCELLED","RETIRED"].includes(cancelled.result.state))return fail("NATIVE_ROOT_RECOVERY_REQUIRED");
      await this.transaction(async db=>{const changed=await db.query(`UPDATE portal_native_root_obligations SET source_settled=true,source_ack_digest=$2
        WHERE lease_id=$1 AND phase='ROLLED_BACK' AND NOT source_settled`,[leaseId,cancelled.response_sha256]);
        if(changed.rowCount!==1){const prior=this.checkRow((await db.query<Row>("SELECT * FROM portal_native_root_obligations WHERE lease_id=$1",[leaseId])).rows[0]).row;
          if(!prior.source_settled||prior.phase!=="ROLLED_BACK")return fail("NATIVE_ROOT_CUSTODY_CONFLICT");}});return;
    }
    if(!["ENTERED","UNKNOWN",row.phase].includes(recovery.phase))return fail("NATIVE_ROOT_ORIGINAL_CHANGED");
    if(!["COMMITTED","ROLLED_BACK"].includes(row.phase)||!row.terminal_receipt_id||!row.terminal_receipt_digest||
      accessDigest(row.terminal_fact)!==row.terminal_receipt_digest)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
    const expected:TerminalFact={schema_version:"portal.native-root-terminal.v1",phase:row.phase as "COMMITTED"|"ROLLED_BACK",
      source_base_digest:row.base_digest,mutation_id:base.mutation!.mutation_id,mutation_binding_digest:base.mutation!.binding_digest,
      accepted_fact_digest:base.original.accepted_fact_digest,receipt_ref:row.phase==="COMMITTED"?row.root_operation_id:null};
    if(accessDigest(expected)!==row.terminal_receipt_digest)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");
    // Physical COMMIT/readback above completed and its Core client was released.
    // Signing is an exact terminal attestation, never login/root issuance.
    const now=Math.floor(Date.now()/1000),t=this.config.terminal;
    const signed=await new SignJWT({iss:t.issuer,aud:t.audience,iat:now,nbf:now,exp:now+t.ttl_seconds,jti:randomUUID(),
      purpose:"pma.native-business-to-core-terminal.v1",workload_id:base.binding.workload_id,
      lease_id:base.binding.lease_id,attempt_id:base.binding.attempt_id,binding_digest:accessDigest(base.binding).slice(7),
      source_digest:row.source_digest,operation:"MUTATION",phase:row.phase,
      evidence_kind:row.phase==="COMMITTED"?"PHYSICAL_CORE_COMMIT_OR_SERIALIZED_READBACK":"SERIALIZED_CORE_ROLLBACK_TOMBSTONE",
      receipt_id:row.terminal_receipt_id,receipt_digest:row.terminal_receipt_digest.slice(7)})
      .setProtectedHeader({alg:"EdDSA",kid:t.key_id,typ:"JWT"}).sign(t.private_key);
    const resolved=await this.call(base,"resolve",signed);
    if(resolved.result.state!=="SETTLED"||resolved.result.recovery.phase!==row.phase)return fail("NATIVE_ROOT_RECOVERY_REQUIRED");
    await this.transaction(async db=>{const r=await db.query<Row>(`UPDATE portal_native_root_obligations SET source_settled=true,source_ack_digest=$2
      WHERE lease_id=$1 AND phase=$3 AND terminal_receipt_digest=$4 AND NOT source_settled RETURNING *`,[leaseId,resolved.response_sha256,row.phase,row.terminal_receipt_digest]);
      if(r.rowCount!==1){const prior=this.checkRow((await db.query<Row>("SELECT * FROM portal_native_root_obligations WHERE lease_id=$1",[leaseId])).rows[0]).row;
        if(!prior.source_settled||prior.terminal_receipt_digest!==row.terminal_receipt_digest)return fail("NATIVE_ROOT_CUSTODY_CONFLICT");}
      else this.checkRow(r.rows[0]);});
  }
}
