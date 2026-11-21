import {createHash,createPublicKey,KeyObject,randomUUID} from "node:crypto";
import type {ServerResponse} from "node:http";
import {performance} from "node:perf_hooks";
import type {Pool,PoolClient} from "pg";
import {SignJWT} from "jose";
import {z} from "zod";
import {withTransaction} from "../db/pool";
import {accessAction,accessResource,type AccessActor,type AccessAction,type AccessResource} from "./access.contract";
import {accessDigest,type AccessRelations,type AccessEvaluationContext} from "./access-policy";
import type {AccessTrustProvider} from "./access-trust";
import {captureCurrentHumanSnapshot,lockCurrentHumanSnapshot} from "./current-human-snapshot";
import type {NativeCurrentRelationsPort,NativeCurrentRelationsComposition} from "./native-current-relations-port";
import {nativeCurrentRelationsBase,nativeCurrentRelationsCanonical,nativeCurrentRelationsDecode,
 nativeCurrentRelationsRegistration,nativeCurrentRelationsOriginal,prepareNativeCurrentRelationsSourceRequest,
 type NativeCurrentRelationsSourceBase,type NativeCurrentRelationsSourceAction,type NativeCurrentRelationsSourceIssued} from "./native-current-relations-codec";
import {NativeCurrentRelationsSourceClient,nativeCurrentRelationsSourceAuthenticatedResult} from "./native-current-relations-source-client";
import {nativeBusinessReadUtcMicroseconds} from "./native-business-read-codec";
import {NativeReadEgress,type NativeReadEgressReservation,type NativeReadEgressObservation,type NativeReadEgressBinding} from "./native-read-egress";

const text=z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const hash=z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/),digest=z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/);
const cut=z.object({actor_id:text,principal_id:text,source:z.object({human_issuer:text,subject:text,workspace_id:text,
 environment:z.literal("paper"),workload_id:text}).strict(),registration:nativeCurrentRelationsRegistration,
 original:nativeCurrentRelationsOriginal,correspondence:z.object({registry_revision:digest,payload_sha256:hash,approval_ref:text}).strict(),
 allowed_actions:z.array(accessAction).min(1).max(100).refine(v=>new Set(v).size===v.length)}).strict();
const settings=z.object({bindings:z.array(cut).min(1).max(64),maximum_retained:z.number().int().min(1).max(4096),
 maximum_unresolved:z.number().int().min(1).max(64),maximum_recoveries:z.number().int().min(1).max(64),
 attempt_ms:z.number().int().min(1).max(60000),maximum_principals:z.number().int().min(1).max(64)}).strict();
const terminalSettings=z.object({issuer:text,audience:text,key_id:text,ttl_seconds:z.number().int().min(1).max(60)}).strict();
export const nativeCurrentRelationsSettings=settings;
export const nativeCurrentRelationsTerminalSettings=terminalSettings;
export interface NativeCurrentRelationsProviderConfig extends z.infer<typeof settings> {
 terminal:z.infer<typeof terminalSettings>&{private_key:KeyObject};
}
type Cut=z.infer<typeof cut>;
type Phase="PREPARED"|"ISSUE_REQUESTED"|"ISSUED"|"ENTERING"|"ENTERED"|"SENDING"|"UNKNOWN"|"SERVED"|"ABORTED"|"CANCELLED";
type Row={lease_id:string;attempt_id:string;flight_id:string;source_config_digest:string;base_digest:string;base_body:string;
 authority_fingerprint:string;phase:Phase;source_digest:string|null;source_fingerprint:string|null;source_expires_at:string|null;
 body_digest:string|null;terminal_receipt_id:string|null;terminal_receipt_digest:string|null;terminal_fact:unknown;
 source_settled:boolean;source_ack_digest:string|null;};
type Held={base:Readonly<NativeCurrentRelationsSourceBase>;issued:NativeCurrentRelationsSourceIssued;relations:AccessRelations};
type Snapshot=Awaited<ReturnType<typeof captureCurrentHumanSnapshot>>;
type Input={actor:AccessActor;workspace_id:string;action:AccessAction;resource_digest:string};
export class NativeCurrentRelationsProviderError extends Error {
 constructor(readonly code:"NATIVE_CURRENT_CONFIG_INVALID"|"NATIVE_CURRENT_NOT_QUALIFIED"|"NATIVE_CURRENT_ORIGINAL_CHANGED"|
 "NATIVE_CURRENT_CAPACITY_EXHAUSTED"|"NATIVE_CURRENT_CUSTODY_CONFLICT"|"NATIVE_CURRENT_RECOVERY_REQUIRED"|
 "NATIVE_CURRENT_FINITE_ONLY"|"NATIVE_CURRENT_AUTHORITY_CHANGED") {super("The current native permission source is not available.");}
}
const fail=(code:NativeCurrentRelationsProviderError["code"]="NATIVE_CURRENT_NOT_QUALIFIED"):never=>{throw new NativeCurrentRelationsProviderError(code);};
const actorSchema=z.object({user_id:text,session_id:text,session_generation:z.number().int().nonnegative().safe()}).strict();

/** Actual native READ composition. No ROOT terminal/history/JWT is a source
 * fact here. Each independently configured principal cut is acquired under
 * the actual caller, held through physical local HTTP egress, and settled only
 * from this egress instance's one-use witness. Constructor installs nothing. */
export class NativeCurrentRelationsProvider implements NativeCurrentRelationsPort {
 private readonly config:Readonly<NativeCurrentRelationsProviderConfig>;
 readonly source_config_digest:string;
 private readonly reservations=new Map<string,{reservation:NativeReadEgressReservation;binding:NativeReadEgressBinding}>();
 private readonly activeFlights=new Set<string>();
 private readonly pending=new Set<Promise<unknown>>();
 private stopping=false;
 constructor(private readonly pool:Pool,private readonly client:NativeCurrentRelationsSourceClient,
  private readonly egress:NativeReadEgress,input:NativeCurrentRelationsProviderConfig) {
  try {
   // Strict own JSON capture rejects caller getters/proxies before Zod.
   const {terminal,...values}=input,{private_key,...terminalValues}=terminal;
   const parsed=settings.parse(nativeCurrentRelationsDecode(Buffer.from(nativeCurrentRelationsCanonical(values)),32768));
   const t=terminalSettings.parse(terminalValues);
   if(!(private_key instanceof KeyObject)||private_key.type!=="private"||private_key.asymmetricKeyType!=="ed25519"||
    parsed.maximum_unresolved>parsed.maximum_retained||parsed.maximum_principals>parsed.maximum_unresolved||
    new Set(parsed.bindings.map(b=>accessDigest([b.actor_id,b.principal_id,b.source.workspace_id]))).size!==parsed.bindings.length||
    parsed.bindings.some(b=>b.source.workload_id!==client.provenance().workload_id))throw new Error();
   this.config=Object.freeze({...parsed,terminal:Object.freeze({...t,private_key})});
   const public_key_sha256=createHash("sha256").update(createPublicKey(private_key).export({type:"spki",format:"der"})).digest("hex");
   this.source_config_digest=accessDigest({...parsed,terminal:{...t,public_key_sha256},transport:client.provenance()});
  }catch{throw new NativeCurrentRelationsProviderError("NATIVE_CURRENT_CONFIG_INVALID");}
 }
 usesPool(pool:unknown):boolean{return pool===this.pool;}
 compose(base:AccessTrustProvider):AccessTrustProvider {
  // Preserve unrelated private ports. The plain relations/mapping methods are
  // deliberately NOT replaced: they lack the actual caller/purpose lifetime.
  return {...base,verifyPolicy:base.verifyPolicy.bind(base),verifyReceipt:base.verifyReceipt.bind(base),
   relations:base.relations.bind(base),verifiedHumanMapping:base.verifiedHumanMapping.bind(base),
   ...(base.verifyRootReceipt?{verifyRootReceipt:base.verifyRootReceipt.bind(base)}:{}),
   ...(base.qualifyDelegatedReceipt?{qualifyDelegatedReceipt:base.qualifyDelegatedReceipt.bind(base)}:{}),
   ...(base.readPublication?{readPublication:base.readPublication.bind(base)}:{}),currentRelations:this};
 }
 private transaction<T>(f:(db:PoolClient)=>Promise<T>):Promise<T>{return withTransaction(this.pool,async db=>{
  await db.query("SET LOCAL lock_timeout='1500ms'; SET LOCAL statement_timeout='5000ms'");return f(db);});}
 private async snapshot(actor:AccessActor,workspace:string):Promise<Snapshot>{return this.transaction(async db=>{
  await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");return captureCurrentHumanSnapshot(db,actor,workspace);});}
 private capture(input:Input):Input {
  try{return JSON.parse(nativeCurrentRelationsCanonical({actor:actorSchema.parse(input.actor),workspace_id:text.parse(input.workspace_id),
   action:accessAction.parse(input.action),resource_digest:digest.parse(input.resource_digest)})) as Input;}catch{return fail();}
 }
 private configured(input:Input,principal:string):Cut {
  const matches=this.config.bindings.filter(b=>b.actor_id===input.actor.user_id&&b.principal_id===principal&&
   b.source.workspace_id===input.workspace_id&&b.allowed_actions.includes(input.action));
  if(matches.length!==1)return fail();return matches[0];
 }
 private checkRow(row:Row|undefined):{row:Row;base:Readonly<NativeCurrentRelationsSourceBase>} {
  if(!row||row.source_config_digest!==this.source_config_digest)return fail("NATIVE_CURRENT_ORIGINAL_CHANGED");
  const base=nativeCurrentRelationsBase(nativeCurrentRelationsDecode(Buffer.from(row.base_body),32768));
  const b=this.configured({actor:{user_id:base.purpose.actor_id,session_id:"locator-only",session_generation:0},
   workspace_id:base.purpose.workspace_id,action:base.purpose.action,resource_digest:base.purpose.resource_digest},base.purpose.principal_id);
  if(accessDigest(base)!==row.base_digest||nativeCurrentRelationsCanonical(base)!==row.base_body||
   base.binding.lease_id!==row.lease_id||base.binding.attempt_id!==row.attempt_id||base.purpose.flight_id!==row.flight_id||
   accessDigest(base.registration)!==accessDigest(b.registration)||accessDigest(base.original)!==accessDigest(b.original)||
   accessDigest({human_issuer:base.binding.human_issuer,subject:base.binding.subject,workspace_id:base.binding.workspace_id,
    environment:base.binding.environment,workload_id:base.binding.workload_id})!==accessDigest(b.source))return fail("NATIVE_CURRENT_ORIGINAL_CHANGED");
  return{row,base};
 }
 private async row(id:string):Promise<Row>{return this.checkRow((await this.pool.query<Row>(
  "SELECT * FROM portal_native_current_read_obligations WHERE lease_id=$1",[id])).rows[0]).row;}
 private async call(base:Readonly<NativeCurrentRelationsSourceBase>,action:NativeCurrentRelationsSourceAction,terminal?:string) {
  const prepared=prepareNativeCurrentRelationsSourceRequest(base,action,terminal),result=await this.client.call(prepared),
   proof=nativeCurrentRelationsSourceAuthenticatedResult(this.client,result);
  if(proof.base_body!==nativeCurrentRelationsCanonical(base))return fail("NATIVE_CURRENT_ORIGINAL_CHANGED");return proof;
 }
 private async transition(base:Readonly<NativeCurrentRelationsSourceBase>,from:readonly Phase[],to:Phase):Promise<void>{
  const changed=await this.transaction(db=>db.query<Row>("UPDATE portal_native_current_read_obligations SET phase=$2 WHERE lease_id=$1 AND phase=ANY($3::text[]) AND NOT source_settled RETURNING *",
   [base.binding.lease_id,to,from]));if(changed.rowCount!==1)return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");this.checkRow(changed.rows[0]);
 }
 private async reserve(input:Input,principals:readonly string[],snapshot:Snapshot):Promise<Readonly<NativeCurrentRelationsSourceBase>[]> {
  return this.reservePurposes([input],principals,snapshot);
 }
 private async reservePurposes(inputs:readonly Input[],principals:readonly string[],snapshot:Snapshot):Promise<Readonly<NativeCurrentRelationsSourceBase>[]> {
  const ids=[...new Set(principals)].sort();if(ids.length<1||ids.length>this.config.maximum_principals)return fail("NATIVE_CURRENT_CAPACITY_EXHAUSTED");
  // Resolve the complete configured closure BEFORE any source call. Never ask
  // the actual caller's mapping to impersonate a missing grant issuer, nor use
  // the first subject's allowed_actions for a later purpose in a batch.
  const input=inputs[0];
  if(!input||inputs.length>4||inputs.some(v=>accessDigest(v.actor)!==accessDigest(input.actor)||v.workspace_id!==input.workspace_id))return fail();
  const cuts=inputs.flatMap(purpose=>ids.map(id=>({input:purpose,cut:this.configured(purpose,id)}))),flight=randomUUID(),now=Date.now();
  const bases=cuts.map(({input,cut:b})=>{const binding={lease_id:randomUUID(),attempt_id:randomUUID(),...b.source,operation:"READ" as const},
   purpose={kind:"CURRENT_POLICY" as const,actor_id:input.actor.user_id,principal_id:b.principal_id,workspace_id:input.workspace_id,
    environment:"paper" as const,action:input.action,resource_digest:input.resource_digest,flight_id:flight},
   values={registration:b.registration,original:b.original,purpose,deadline:new Date(now+this.config.attempt_ms).toISOString()};
   return nativeCurrentRelationsBase({schema_version:"pma.registered-current-relations.request.v1",...values,
    binding:{...binding,request_digest:accessDigest({...values,binding}).slice(7)}});});
  await this.transaction(async db=>{
   const current=await lockCurrentHumanSnapshot(db,input.actor,input.workspace_id);
   if(current.authority_fingerprint!==snapshot.authority_fingerprint)return fail("NATIVE_CURRENT_AUTHORITY_CHANGED");
   if((await db.query("SELECT drain_id FROM elp210_candidate.authority WHERE singleton")).rows[0]?.drain_id)
    return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
   await db.query("SELECT pg_advisory_xact_lock(hashtextextended('portal-native-current-read-capacity-v1',0))");
   const counts=(await db.query("SELECT count(*)::int AS retained,count(*) FILTER(WHERE NOT source_settled)::int AS unresolved FROM portal_native_current_read_obligations")).rows[0];
   if((await db.query("SELECT 1 FROM portal_native_current_read_obligations WHERE NOT source_settled AND source_config_digest<>$1 LIMIT 1",[this.source_config_digest])).rowCount)
    return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
   if(counts.retained+bases.length>this.config.maximum_retained||counts.unresolved+bases.length>this.config.maximum_unresolved)return fail("NATIVE_CURRENT_CAPACITY_EXHAUSTED");
   for(const base of bases)await db.query(`INSERT INTO portal_native_current_read_obligations
    (lease_id,attempt_id,flight_id,source_config_digest,base_digest,base_body,authority_fingerprint,phase) VALUES($1,$2,$3,$4,$5,$6,$7,'PREPARED')`,
    [base.binding.lease_id,base.binding.attempt_id,flight,this.source_config_digest,accessDigest(base),nativeCurrentRelationsCanonical(base),snapshot.authority_fingerprint]);
  });this.activeFlights.add(flight);return bases;
 }
 private relations(input:Input,base:Readonly<NativeCurrentRelationsSourceBase>,issued:NativeCurrentRelationsSourceIssued):AccessRelations {
  const cfg=this.configured(input,base.purpose.principal_id);
  if(accessDigest(issued.correspondence)!==accessDigest({...cfg.correspondence,manifest_sha256:cfg.registration.manifest_sha256}))return fail("NATIVE_CURRENT_ORIGINAL_CHANGED");
  const originals=issued.relations.grants.filter(g=>g.grant_id===cfg.original.grant_id&&accessDigest(g.accepted)===cfg.original.accepted_fact_digest);
  if(originals.length!==1||originals[0].accepted.portal_user_id!==base.purpose.principal_id||
   originals[0].accepted.workspace_id!==input.workspace_id||originals[0].accepted.ts_user_id!==issued.relations.ts_user_id||
   originals[0].accepted.mapping_revision!==issued.relations.mapping_revision)return fail("NATIVE_CURRENT_ORIGINAL_CHANGED");
  return Object.freeze({qualified:true,revision:accessDigest(issued.relations),own_alpha_ids:Object.freeze([]),
   member_portfolio_ids:Object.freeze([]),roots:Object.freeze({}),membership:null,current_authority:issued.relations});
 }
 private async issue(input:Input,base:Readonly<NativeCurrentRelationsSourceBase>):Promise<Held> {
  await this.transition(base,["PREPARED"],"ISSUE_REQUESTED");const proof=await this.call(base,"issue");
  if(proof.result.state!=="ISSUED")return fail();const issued=proof.result,relations=this.relations(input,base,issued);
  const updated=await this.transaction(db=>db.query<Row>(`UPDATE portal_native_current_read_obligations SET phase='ISSUED',
   source_digest=$2,source_fingerprint=$3,source_expires_at=$4 WHERE lease_id=$1 AND phase='ISSUE_REQUESTED' AND NOT source_settled RETURNING *`,
   [base.binding.lease_id,issued.lease.source_digest,issued.lease.source_fingerprint,issued.lease.expires_at]));
  if(updated.rowCount!==1)return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");this.checkRow(updated.rows[0]);return{base,issued,relations};
 }
 private async cancel(base:Readonly<NativeCurrentRelationsSourceBase>):Promise<void>{
  const proof=await this.call(base,"cancel-unentered");if(!["CANCELLED","RETIRED"].includes(proof.result.state))return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
  const changed=await this.transaction(db=>db.query<Row>(`UPDATE portal_native_current_read_obligations SET phase='CANCELLED',source_settled=true,source_ack_digest=$2
   WHERE lease_id=$1 AND phase IN ('PREPARED','ISSUE_REQUESTED','ISSUED','CANCELLED') AND NOT source_settled RETURNING *`,[base.binding.lease_id,proof.response_sha256]));
  if(changed.rowCount!==1){const row=await this.row(base.binding.lease_id);if(!row.source_settled||row.phase!=="CANCELLED")return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");}
 }
 private tracked<T>(operation:()=>Promise<T>):Promise<T>{
  if(this.stopping)return Promise.reject(new NativeCurrentRelationsProviderError("NATIVE_CURRENT_RECOVERY_REQUIRED"));
  const result=Promise.resolve().then(operation);this.pending.add(result);
  void result.finally(()=>this.pending.delete(result)).catch(()=>undefined);return result;
 }
 /** Stop admission, join real requests/settlement, then permit pool teardown.
  * Timeout is NOT a source terminal and never clears UNKNOWN custody. */
 async shutdown(deadlineMs:number):Promise<void>{
  if(!Number.isSafeInteger(deadlineMs)||deadlineMs<1||deadlineMs>10000)return fail("NATIVE_CURRENT_CONFIG_INVALID");
  this.stopping=true;const until=performance.now()+deadlineMs;
  while(this.pending.size||this.client.snapshot().in_flight){
   if(performance.now()>=until)return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
   await new Promise<void>(resolve=>setTimeout(resolve,5));
  }
 }
 observe(input:Parameters<NativeCurrentRelationsPort["observe"]>[0]):Promise<ReadonlyMap<string,AccessRelations>>{
  return this.tracked(()=>this.observeOwned(input));
 }
 private async observeOwned(input:Parameters<NativeCurrentRelationsPort["observe"]>[0]):Promise<ReadonlyMap<string,AccessRelations>>{
  const request=this.capture(input),ids=[...input.principal_ids];await this.recoverForAdmission();const before=await this.snapshot(request.actor,request.workspace_id),
   bases=await this.reserve(request,ids,before),map=new Map<string,AccessRelations>();
  try{for(const base of bases){const held=await this.issue(request,base);map.set(base.purpose.principal_id,held.relations);}
   for(const base of bases)await this.cancel(base);
   const after=await this.snapshot(request.actor,request.workspace_id);if(after.authority_fingerprint!==before.authority_fingerprint)return fail("NATIVE_CURRENT_AUTHORITY_CHANGED");
   return map;
  }catch(error){for(const base of bases){const row=await this.row(base.binding.lease_id);if(!row.source_settled&&["PREPARED","ISSUE_REQUESTED","ISSUED"].includes(row.phase))await this.cancel(base);}throw error;}
  finally{this.activeFlights.delete(bases[0].purpose.flight_id);}
 }
 private context(snapshot:Snapshot,input:Input,held:readonly Held[]):AccessEvaluationContext {
  const map=new Map(held.map(h=>[h.base.purpose.principal_id,h.relations]));return{principal_id:input.actor.user_id,workspace_id:input.workspace_id,
   now_ms:snapshot.now,actor_current:true,authority_fingerprint:snapshot.authority_fingerprint,actor_lease_until_ms:snapshot.lease_until_ms,
   actor_role:snapshot.actor_role,actor_member:snapshot.actor_member,policy:snapshot.policy,grants:snapshot.grants,
   manager_domain_grants:snapshot.manager_domain_grants,active_principals:new Set(snapshot.active),relationsFor:id=>map.get(id)??{
    qualified:false,revision:"UNQUALIFIED",own_alpha_ids:[],member_portfolio_ids:[],roots:{},membership:null}};
 }
 private validUntil(snapshot:Snapshot,held:readonly Held[]):number{
  let until=Math.min(snapshot.lease_until_ms,...held.map(h=>Number(nativeBusinessReadUtcMicroseconds(h.issued.lease.expires_at)/1000n)));
  const transition=(value:number|null|undefined)=>{if(typeof value==="number"&&Number.isSafeInteger(value)&&value>snapshot.now)
   until=Math.min(until,value);};
  // Conservatively cap at every future authority transition in the actual
  // captured closure, including future DENY/receipt/target activation. This
  // is a temporal ceiling, NOT a source fact or a permission grant. Keep the
  // same semantics as nativeNoticeValidUntil, never just session/source TTL.
  for(const grant of snapshot.grants){if(grant.workspace_id!==held[0].base.binding.workspace_id||!grant.environments.includes("paper"))continue;
   transition(grant.valid_from_ms);transition(grant.valid_until_ms);transition(grant.revoked_at_ms);
   transition(grant.ts_receipt?.effective_at_ms);transition(grant.ts_receipt?.expires_at_ms);}
  for(const h of held)for(const grant of h.issued.relations.grants){transition(grant.accepted.effective_at_ms);transition(grant.accepted.expires_at_ms);
   for(const target of grant.targets)if(target.environment==="paper"){transition(target.valid_from_ms);transition(target.valid_until_ms);}}
  if(!Number.isSafeInteger(until)||until<=Math.max(snapshot.now,Date.now()))return fail("NATIVE_CURRENT_AUTHORITY_CHANGED");return until;
 }
 sendFinite(input:Parameters<NativeCurrentRelationsPort["sendFinite"]>[0]):Promise<void>{
  return this.tracked(()=>this.sendFiniteOwned(input));
 }
 sendFiniteComposition(input:NativeCurrentRelationsComposition):Promise<void>{
  return this.tracked(()=>this.sendFiniteCompositionOwned(input));
 }
 private async sendFiniteOwned(input:Parameters<NativeCurrentRelationsPort["sendFinite"]>[0]):Promise<void>{
  const resources=JSON.parse(nativeCurrentRelationsCanonical(input.resources)) as AccessResource[];
  if(resources.length<1||resources.length>200||!resources.every(r=>accessResource.safeParse(r).success)||input.action==="stream.subscribe")return fail("NATIVE_CURRENT_FINITE_ONLY");
  const request=this.capture({...input,resource_digest:accessDigest(resources)}),response:ServerResponse=input.response;
  const build=input.build,assertAllowed=input.assertAllowed,afterEnter=input.afterEnter,beforeDispatch=input.beforeDispatch;
  return this.sendFinitePurposes([request],response,contexts=>build(contexts[0]),contexts=>assertAllowed(contexts[0]),afterEnter,beforeDispatch);
 }
 private async sendFiniteCompositionOwned(input:NativeCurrentRelationsComposition):Promise<void>{
  // Capture the complete bounded composition before any await. The source
  // still receives its existing one-purpose wire; its resource digest binds
  // that purpose AND the full response composition, never a first-scope alias.
  const purposes=JSON.parse(nativeCurrentRelationsCanonical(input.purposes)) as NativeCurrentRelationsComposition["purposes"];
  if(!Array.isArray(purposes)||purposes.length<1||purposes.length>4||purposes.some(p=>
    !p||Object.keys(p).sort().join(",")!=="action,resources"||!accessAction.safeParse(p.action).success||
    p.action==="stream.subscribe"||!Array.isArray(p.resources)||p.resources.length<1||p.resources.length>200||
    !p.resources.every((r:unknown)=>accessResource.safeParse(r).success))||
    new Set(purposes.map(p=>accessDigest(p))).size!==purposes.length)return fail("NATIVE_CURRENT_FINITE_ONLY");
  const identity=this.capture({actor:input.actor,workspace_id:input.workspace_id,action:purposes[0].action,resource_digest:accessDigest(purposes)});
  const composition=accessDigest({actor:identity.actor,workspace_id:identity.workspace_id,purposes,scope_digest:digest.parse(input.scope_digest)});
  const requests=purposes.map((purpose,index)=>this.capture({actor:identity.actor,workspace_id:identity.workspace_id,action:purpose.action,
    resource_digest:accessDigest({composition,purpose_index:index,action:purpose.action,resources:purpose.resources})}));
  return this.sendFinitePurposes(requests,input.response,input.build,input.assertAllowed,input.afterEnter,input.beforeDispatch,composition);
 }
 private async sendFinitePurposes(requests:readonly Input[],response:ServerResponse,
  build:(contexts:readonly AccessEvaluationContext[])=>Promise<Buffer>,assertAllowed:(contexts:readonly AccessEvaluationContext[])=>void,
  afterEnter?:()=>Promise<void>,beforeDispatch?:()=>void,composition?:string):Promise<void>{
  const request=requests[0];
  await this.recoverForAdmission();const before=await this.snapshot(request.actor,request.workspace_id),
   bases=await this.reservePurposes(requests,before.ids,before),held:Held[]=[];
  // Each context contains ONLY the cuts issued for its own purpose. Sources
  // may legitimately return different relations for the same principal on two
  // actions/resources; merging by principal would silently borrow authority.
  const contexts=(snapshot:Snapshot)=>requests.map(purpose=>this.context(snapshot,purpose,held.filter(h=>
   h.base.purpose.action===purpose.action&&h.base.purpose.resource_digest===purpose.resource_digest)));
  let reservation:NativeReadEgressReservation|undefined,binding:NativeReadEgressBinding|undefined;
  try{
   for(const base of bases){const purpose=requests.find(p=>p.action===base.purpose.action&&p.resource_digest===base.purpose.resource_digest);
    if(!purpose)return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");held.push(await this.issue(purpose,base));}
   const body=await build(contexts(before));if(!Buffer.isBuffer(body))return fail();
   const until=this.validUntil(before,held);
   const first=held[0],issuedWall=Date.now(),issuedMono=performance.now();
   binding={lease_id:first.base.binding.lease_id,attempt_id:first.base.binding.attempt_id,binding_digest:accessDigest(first.base.binding).slice(7),
    source_digest:accessDigest(held.map(h=>h.issued.lease.source_digest)).slice(7),scope_digest:accessDigest({authority:before.authority_fingerprint,
     ...(composition?{composition,requests:requests.map(p=>({action:p.action,resource_digest:p.resource_digest}))}:{request:request.resource_digest}),
     bases:bases.map(b=>accessDigest(b))}),body_digest:`sha256:${createHash("sha256").update(body).digest("hex")}`,valid_until_ms:until};
   // Actual transport ownership BEFORE source ENTER. No send has happened.
   reservation=this.egress.reserveFinite(response,body,binding);
   const own={reservation,binding};for(const base of bases)this.reservations.set(base.binding.lease_id,own);
   for(const base of bases){await this.transition(base,["ISSUED"],"ENTERING");const entered=await this.call(base,"enter");
    if(entered.result.state!=="ENTERED")return fail();await this.transition(base,["ENTERING"],"ENTERED");}
   const assertCurrent=()=>{if(Date.now()>=until||performance.now()-issuedMono>=until-issuedWall)return fail("NATIVE_CURRENT_AUTHORITY_CHANGED");};
   // Publication/head checks may await only here: actual source fences are
   // ENTERED, but no Core connection/transaction is retained. The prepared
   // physical reservation already owns the exact immutable response bytes.
   assertCurrent();await afterEnter?.();assertCurrent();
   await this.transaction(async db=>{
    const final=await lockCurrentHumanSnapshot(db,request.actor,request.workspace_id);
    if(final.authority_fingerprint!==before.authority_fingerprint)return fail("NATIVE_CURRENT_AUTHORITY_CHANGED");
    const checked:unknown=assertAllowed(contexts(final));
    if(checked!==undefined)return fail("NATIVE_CURRENT_NOT_QUALIFIED");assertCurrent();
    for(const base of bases){const row=this.checkRow((await db.query<Row>("SELECT * FROM portal_native_current_read_obligations WHERE lease_id=$1 FOR UPDATE",[base.binding.lease_id])).rows[0]).row;
     if(row.phase!=="ENTERED"||row.source_settled||row.authority_fingerprint!==before.authority_fingerprint)return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");
     await db.query("UPDATE portal_native_current_read_obligations SET phase='SENDING',body_digest=$2 WHERE lease_id=$1",[base.binding.lease_id,binding!.body_digest]);}
    assertCurrent();
   }); // physical Core COMMIT + pool release precedes dispatch.
   const dispatchCurrent=()=>{assertCurrent();const result:unknown=beforeDispatch?.();
    if(result!==undefined){if(result&&typeof (result as {then?:unknown}).then==="function")void Promise.resolve(result).catch(()=>undefined);
     return fail("NATIVE_CURRENT_NOT_QUALIFIED");}assertCurrent();};
   // Synchronous only: publication expiry and Fastify transport ownership are
   // checked at dispatch as well as while the physical writer remains active.
   // A failed check closes this reservation and retains real ABORTED/UNKNOWN.
   const witness=await this.egress.dispatch(reservation,{binding,assertCurrent:dispatchCurrent}),observation=this.egress.consumeReserved(witness,reservation);
   for(const base of bases)await this.recordObservation(base,observation);
   for(const base of bases)await this.recoverOne(base.binding.lease_id);
  }catch(error){
   if(reservation){const witness=await this.egress.cancelUnsent(reservation).catch(()=>null);
    if(witness){const observation=this.egress.consumeReserved(witness,reservation);for(const base of bases)await this.recordObservation(base,observation);}}
   for(const base of bases)await this.recoverOne(base.binding.lease_id);
   throw error;
  }finally{this.activeFlights.delete(bases[0].purpose.flight_id);}
 }
 private async recordObservation(base:Readonly<NativeCurrentRelationsSourceBase>,observation:NativeReadEgressObservation):Promise<void>{
  const row=await this.row(base.binding.lease_id);if(row.source_settled||["SERVED","ABORTED"].includes(row.phase))return;
  if(["PREPARED","ISSUE_REQUESTED","ISSUED"].includes(row.phase))return;
  if(!row.source_digest)return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");
  if(observation.outcome==="UNKNOWN"){
   if(row.phase!=="UNKNOWN")await this.transition(base,["ENTERING","ENTERED","SENDING"],"UNKNOWN");
   const unknown=await this.call(base,"unknown");if(unknown.result.state!=="UNKNOWN")return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");return;
  }
  const own=this.reservations.get(base.binding.lease_id);if(!own||accessDigest(own.binding)!==accessDigest(observation.binding))return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");
  const phase=observation.outcome==="FINISHED"?"SERVED":"ABORTED";
  if(phase==="SERVED"&&row.phase!=="SENDING")return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");
  const fact={schema_version:"portal.native-current-read-terminal.v1",phase,source_base_digest:row.base_digest,flight_id:row.flight_id,
   observation:{...observation,binding:{...observation.binding}},semantics:"LOCAL_CORE_HTTP_EGRESS_ONLY"};
  const changed=await this.transaction(db=>db.query<Row>(`UPDATE portal_native_current_read_obligations SET phase=$2,terminal_receipt_id=$3,
   terminal_receipt_digest=$4,terminal_fact=$5::jsonb WHERE lease_id=$1 AND phase=ANY($6::text[]) AND NOT source_settled RETURNING *`,
   [row.lease_id,phase,randomUUID(),accessDigest(fact),JSON.stringify(fact),["ENTERING","ENTERED","SENDING","UNKNOWN"]]));
  if(changed.rowCount!==1)return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");this.checkRow(changed.rows[0]);
 }
 /** No reconstructed body or new lease. Restart without an actual local
  * transport witness leaves ENTERED/SENDING/UNKNOWN unresolved, never expires
  * it into ABORTED. Actual same-instance closure can complete the old attempt. */
 private async recoverForAdmission():Promise<void>{
  const rows=(await this.pool.query<Row>("SELECT * FROM portal_native_current_read_obligations WHERE NOT source_settled ORDER BY created_at,lease_id LIMIT $1",
   [this.config.maximum_recoveries])).rows;
  for(const row of rows){if(row.source_config_digest!==this.source_config_digest)return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
   if(!this.activeFlights.has(row.flight_id))await this.recoverOne(row.lease_id);}
  const remaining=(await this.pool.query("SELECT count(*)::int AS n FROM portal_native_current_read_obligations WHERE NOT source_settled AND (source_config_digest<>$1 OR NOT(flight_id=ANY($2::uuid[])))",
   [this.source_config_digest,[...this.activeFlights]])).rows[0].n;
  if(remaining>0)return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
 }
 recover():Promise<{remaining:number}>{return this.tracked(()=>this.recoverOwned());}
 private async recoverOwned():Promise<{remaining:number}>{
  const rows=(await this.pool.query<Row>("SELECT * FROM portal_native_current_read_obligations WHERE NOT source_settled AND source_config_digest=$1 ORDER BY created_at,lease_id LIMIT $2",
   [this.source_config_digest,this.config.maximum_recoveries])).rows;
  for(const row of rows)if(!this.activeFlights.has(row.flight_id))await this.recoverOne(row.lease_id);
  const remaining=Number((await this.pool.query("SELECT count(*)::int AS n FROM portal_native_current_read_obligations WHERE NOT source_settled")).rows[0].n);
  if(remaining)return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");return{remaining};
 }
 private async recoverOne(id:string):Promise<void>{
  let row=await this.row(id);if(row.source_settled)return;const {base}=this.checkRow(row);
  if(["PREPARED","ISSUE_REQUESTED","ISSUED","CANCELLED"].includes(row.phase)){await this.cancel(base);return;}
  const own=this.reservations.get(id);
  if(own&&!row.terminal_receipt_id){const witness=this.egress.observeClosed(own.reservation);
   if(witness)await this.recordObservation(base,this.egress.consumeReserved(witness,own.reservation));row=await this.row(id);}
  if(!["SERVED","ABORTED"].includes(row.phase)||!row.terminal_receipt_id||!row.terminal_receipt_digest||
   accessDigest(row.terminal_fact)!==row.terminal_receipt_digest)return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
  // Receipt identity/bytes survive lost ACK. Re-signing authenticates that SAME
  // durable terminal; it never makes an observation, new intent or source fact.
  const observed=await this.call(base,"status");if(observed.result.state!=="OBSERVATION"||observed.result.recovery.state!=="RECORDED")return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
  const status=observed.result.recovery;
  // Source cancellation may have physically committed while its response or
  // Core ACK commit was lost. RECORDED/CANCELLED has no digest/expiry fields;
  // it is an observation only, never the authority to clear Core custody.
  if(row.phase==="ABORTED"&&status.phase==="CANCELLED"){
   const cancelled=await this.call(base,"cancel-unentered");
   if(!["CANCELLED","RETIRED"].includes(cancelled.result.state))return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
   await this.ack(row,cancelled.response_sha256);return;
  }
  if(!("source_digest" in status)||status.source_digest!==row.source_digest||status.expires_at!==row.source_expires_at)return fail("NATIVE_CURRENT_ORIGINAL_CHANGED");
  if(row.phase==="ABORTED"&&["ISSUED","RETIRED","CANCELLED"].includes(status.phase)){
   const cancelled=await this.call(base,"cancel-unentered");if(!["CANCELLED","RETIRED"].includes(cancelled.result.state))return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
   await this.ack(row,cancelled.response_sha256);return;
  }
  if(!["ENTERED","UNKNOWN",row.phase].includes(status.phase))return fail("NATIVE_CURRENT_ORIGINAL_CHANGED");
  const now=Math.floor(Date.now()/1000),t=this.config.terminal;
  const terminal=await new SignJWT({iss:t.issuer,aud:t.audience,iat:now,nbf:now,exp:now+t.ttl_seconds,jti:randomUUID(),
   purpose:"pma.native-business-to-core-terminal.v1",workload_id:base.binding.workload_id,lease_id:row.lease_id,attempt_id:row.attempt_id,
   binding_digest:accessDigest(base.binding).slice(7),source_digest:row.source_digest,operation:"READ",phase:row.phase,
   evidence_kind:row.phase==="SERVED"?"FINAL_HTTP_SEND_COMPLETED":"FINAL_HTTP_ABORT_CONFIRMED",receipt_id:row.terminal_receipt_id,
   receipt_digest:row.terminal_receipt_digest.slice(7)}).setProtectedHeader({alg:"EdDSA",kid:t.key_id,typ:"JWT"}).sign(t.private_key);
  const resolved=await this.call(base,"resolve",terminal);if(resolved.result.state!=="SETTLED"||resolved.result.recovery.phase!==row.phase)return fail("NATIVE_CURRENT_RECOVERY_REQUIRED");
  await this.ack(row,resolved.response_sha256);
 }
 private async ack(row:Row,ack:string):Promise<void>{
  const changed=await this.transaction(db=>db.query<Row>("UPDATE portal_native_current_read_obligations SET source_settled=true,source_ack_digest=$2 WHERE lease_id=$1 AND phase=$3 AND terminal_receipt_digest=$4 AND NOT source_settled RETURNING *",
   [row.lease_id,ack,row.phase,row.terminal_receipt_digest]));
  if(changed.rowCount!==1){const prior=await this.row(row.lease_id);if(!prior.source_settled||prior.terminal_receipt_digest!==row.terminal_receipt_digest)return fail("NATIVE_CURRENT_CUSTODY_CONFLICT");}
  this.reservations.delete(row.lease_id);
 }
}
