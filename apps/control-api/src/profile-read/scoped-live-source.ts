import type {ControlApiConfig} from "../config";
import {querySigningKeys} from "../config";
import type {CurrentSourcePrincipal} from "../execution/current-source.proxy";
import type {DeploymentResourceScope} from "../execution/product-read-source";
import type {ProfileProjectionSnapshot,ProjectionRelation,ProjectionScalar} from "../execution/profile-projection.repository";
import {ExecutionReadScopes,ExecutionReadScopeError,scopeReadPopulation,scopeAllowsField,type AuthorizedExecutionReadScope} from "../execution-v2/read-scope";
import {projectionRowVisible} from "../execution-v2/read-projection";
import {authorizeRetainedRelation,retainedFieldAllowed} from "../execution/retained-operation-page";
import {namedRetainedBusinessResourceId,joinRetainedFindingSessionRows,namedRetainedFindingNeedsSession} from "../execution/retained-business-aliases";
import {managerTimestamp} from "../execution/manager-timestamp";
import {LIVE_SOURCE_PANELS,liveSourcePanelGrain,liveSourceOperationsRead,liveSourceValues,
  type LiveSourceReadQuery,type LiveSourceOperationsRead,type LiveSourcePanel} from "../live/live-source.contract";

// Only the ProductRead owner passes its EXISTING lps2 functions. These pure
// callbacks neither mint a scope nor fetch an upstream/source cursor.
export type LiveSourceCursor={gateFingerprint:string;
  decode:(cursor:string|undefined,binding:string)=>number;
  encode:(offset:number,binding:string)=>string};

type Spec={key:Exclude<keyof LiveSourceOperationsRead["data"],"broker_sync">;source:string;relation:string;
  purpose:"alpha.read"|"account.read";fields:readonly string[]};
// Reuse the ProfileRead collectors, with the CURRENT explicit purpose of each
// family. In particular account/reconciliation fields are NOT Alpha authority.
export const SCOPED_LIVE_SPECS:readonly Spec[]=Object.freeze([
  {key:"deployments",source:"manager.deployments",relation:"strategy_deployments",purpose:"alpha.read",
    fields:["deployment_id","strategy_id","account_id","portfolio_id","mode","venue","currency","state","created_at","updated_at"]},
  {key:"positions",source:"manager.positions",relation:"positions_v2",purpose:"alpha.read",
    fields:["position_id","strategy_id","account_id","mode","venue","instrument_id","side","signed_qty","quantity",
      "avg_px_open","avg_px_close","mark_price","notional","realized_pnl","unrealized_pnl","updated_at"]},
  {key:"sessions",source:"manager.sessions",relation:"execution_sessions",purpose:"alpha.read",
    fields:["strategy_id","account_id","mode","venue","state","submitted_count","risk_rejected_count","broker_rejected_count","filled_count","updated_at"]},
  {key:"orders",source:"manager.orders",relation:"orders",purpose:"alpha.read",
    fields:["order_id","strategy_id","account_id","mode","venue","instrument_id","side","quantity","price","status","submitted_at","updated_at"]},
  {key:"fills",source:"manager.fills",relation:"fills",purpose:"alpha.read",
    fields:["fill_id","strategy_id","account_id","mode","venue","instrument_id","side","price","quantity","realized_pnl","trade_time"]},
  {key:"accounts",source:"manager.accounts",relation:"accounts",purpose:"account.read",
    fields:["account_id","strategy_id","mode","venue","base_currency","created_at","updated_at"]},
  {key:"account_balances",source:"manager.accounts",relation:"account_balances",purpose:"account.read",
    fields:["account_id","currency","total","locked","free","updated_at"]},
  {key:"margin_balances",source:"manager.accounts",relation:"margin_balances",purpose:"account.read",
    fields:["account_id","instrument_id","currency","initial","maintenance","updated_at"]},
  {key:"account_sync",source:"manager.accounts",relation:"account_sync_effective",purpose:"account.read",
    fields:["account_id","mode","currency","status","created_at"]},
  {key:"reconciliation",source:"manager.reconciliation",relation:"reconciliation_findings",purpose:"account.read",
    fields:["account_id","strategy_id","mode","status","created_at"]},
]);
const fail=():never=>{throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);};
const text=(v:unknown):v is string=>typeof v==="string"&&v.length>0&&Buffer.byteLength(v)<=4096&&!/[\u0000-\u001f\u007f]/u.test(v);
const provenance=(spec?:Spec,scope?:AuthorizedExecutionReadScope):LiveSourcePanel["provenance"]=>({
  dataset_id:spec?`relation:${spec.source}:${spec.relation}`:null,purpose:spec?.purpose??null,
  field_contract_revision:"portal.execution.live-source-fields.v2",field_policy_ref:scope?.fieldPolicyRef??null,
  projection_basis:"SAME_RETAINED_DOCUMENT",source_revision:null,source_cursor:null,
  source_completeness:"UNKNOWN",history_semantics:"BOUNDED_RETAINED_NOT_FULL_HISTORY"});
const absent=(reason:LiveSourcePanel["reason_code"],spec?:Spec,scope?:AuthorizedExecutionReadScope):LiveSourcePanel=>({state:"NOT_PUBLISHED",reason_code:reason,
  source_as_of_ms:null,source_clock_reason:"SOURCE_CLOCK_NOT_SCOPED",provenance:provenance(spec,scope),
  grain:liveSourcePanelGrain(spec?.key??"broker_sync"),
  exact_total:null,limit:200,returned_count:0,has_more:false,next_cursor:null,previous_cursor:null,records:[]});
const publicField:Readonly<Record<string,string>>={initial:"margin_initial",maintenance:"margin_maintenance"};
const clocks:Readonly<Record<string,string>>={created_at:"created_at_ms",updated_at:"updated_at_ms",submitted_at:"created_at_ms",trade_time:"trade_time_ms"};
const integerFields=new Set(["submitted_count","risk_rejected_count","broker_rejected_count","filled_count",
  "deployment_id","strategy_id","account_id","portfolio_id","position_id","order_id","fill_id","instrument_id"]);
// A malformed/unknown row with no safe grain supplies no visibility proof.
// Do not decode it or invoke an accessor before the ordinary scope predicate.
const rowFields=(row:unknown):Record<string,ProjectionScalar>|null=>{
  if(!row||typeof row!=="object"||Array.isArray(row))return null;
  const field=Object.getOwnPropertyDescriptor(row,"fields"),value=field&&"value" in field?field.value:null;
  return value&&typeof value==="object"&&!Array.isArray(value)?value:null;
};

/** One immutable retained document, already authorized before loading it.
 * Whole raw population is never public; all projected rows/IDs/counts follow
 * the ORIGINAL relation scope and exact deployment grain before field decode. */
export async function scopedLiveSource(config:ControlApiConfig,scopes:ExecutionReadScopes,
  principal:CurrentSourcePrincipal,snapshot:ProfileProjectionSnapshot,deploymentId:string,
  retain:(scope:AuthorizedExecutionReadScope)=>void,query:LiveSourceReadQuery,
  cursor:LiveSourceCursor):Promise<LiveSourceOperationsRead>{
  const profile=snapshot.document.profile_id,environment="live" as const;
  const issued=new Map<string,AuthorizedExecutionReadScope>();
  const authorize=async(spec:Spec,accountId?:string)=>{
    const scope=await authorizeRetainedRelation(scopes,principal,environment,profile,spec.source,spec.relation,snapshot,
      spec.purpose==="account.read"?{kind:"ACCOUNT",id:accountId!}:{kind:"DEPLOYMENT",id:deploymentId},spec.purpose);
    if(!scope||scope.mode!=="SCOPED_V2")throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
    retain(scope);issued.set(spec.key,scope);return scope;
  };
  const deploymentSpec=SCOPED_LIVE_SPECS[0],deploymentScope=await authorize(deploymentSpec);
  const relation=(spec:Spec):ProjectionRelation|undefined=>snapshot.document.relations[`${spec.source}:${spec.relation}`];
  const lineage=(row:unknown)=>{
    if(!row||typeof row!=="object"||Array.isArray(row))return fail();
    const value=(row as {lineage?:Record<string,unknown>}).lineage;
    if(!value||value.workspace_id!==principal.workspaceId||value.profile_id!==profile||
      value.source_contract_revision!==snapshot.document.source_contract_revision||
      snapshot.sourceCatalogueSha256!==null&&value.source_catalogue_sha256!==snapshot.sourceCatalogueSha256)return fail();
  };
  const deployments=relation(deploymentSpec);
  if(!deployments||deployments.availability!=="AVAILABLE")return fail();
  // Validate only rows whose qualified correlated publication authorizes them.
  // Private identity is used before public redaction, never returned as proof.
  const match=deployments.items.filter(row=>projectionRowVisible(deploymentScope,rowFields(row))&&row.fields.deployment_id===deploymentId);
  if(match.length!==1)throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",404);
  lineage(match[0]);
  const original=match[0].fields;
  if(!text(original.strategy_id)||!text(original.account_id)||!text(original.venue)||original.mode!==environment)return fail();
  const allowed=scopeReadPopulation(deploymentScope).allowedTuples;
  if(!allowed.some(t=>t.deployment_id===deploymentId&&t.account_id===original.account_id))return fail();
  const tupleUnique=deployments.items.filter(row=>{const fields=rowFields(row);return fields&&fields.strategy_id===original.strategy_id&&
    fields.account_id===original.account_id&&fields.mode===environment&&fields.venue===original.venue;}).length===1;
  const target:DeploymentResourceScope={deploymentId,strategyId:original.strategy_id,accountId:original.account_id,
    mode:environment,venue:original.venue,portfolioId:null,externalAccountRef:null,tupleUnique};
  // All original positive purposes remain live until the combined final fence.
  // No blanket business.read_all, ownership or source-row existence is a grant.
  for(const spec of SCOPED_LIVE_SPECS.slice(1))await authorize(spec,target.accountId);
  // All original positives exist BEFORE cursor binding/page/count, including
  // Account even for an Alpha panel. Parsing failures stay in the SAME flight.
  if(query.panel!==undefined&&(typeof query.panel!=="string"||
    !LIVE_SOURCE_PANELS.includes(query.panel as typeof LIVE_SOURCE_PANELS[number]))||
    query.cursor!==undefined&&(typeof query.cursor!=="string"||query.cursor.length<1||query.cursor.length>128||query.panel===undefined))
    throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID",400);
  const scopeProof=SCOPED_LIVE_SPECS.map(spec=>[spec.key,issued.get(spec.key)!.fingerprint]);
  const keys=querySigningKeys(config),key=keys[config.QUERY_CURSOR_ACTIVE_KEY_ID];
  if(!key)return fail();
  const panels={} as LiveSourceOperationsRead["data"];
  const pages=new Map<string,{binding:string;start:number}>();
  for(const spec of SCOPED_LIVE_SPECS){
    const grain=liveSourcePanelGrain(spec.key);
    const binding=JSON.stringify(["portal.execution.live-source.panel-page.v2",
      principal.workspaceId,principal.viewerWorkspaceId??principal.workspaceId,principal.user.userId,principal.user.role,
      principal.session.userId,principal.session.sessionId,principal.session.sessionVersion,environment,profile,
      deploymentId,target.accountId,target.strategyId,target.venue,target.mode,target.tupleUnique,
      spec.key,spec.source,spec.relation,spec.purpose,grain,200,"portal.execution.live-source-fields.v2",
      snapshot.payloadDigest,snapshot.projectionEpoch,snapshot.sourceCatalogueSha256,cursor.gateFingerprint,scopeProof,
      // A retained old signing key must not seek within new-key record IDs.
      config.QUERY_CURSOR_ACTIVE_KEY_ID]);
    const start=cursor.decode(query.panel===spec.key?query.cursor as string|undefined:undefined,binding);
    pages.set(spec.key,{binding,start});
  }
  for(const spec of SCOPED_LIVE_SPECS){
    const {binding,start}=pages.get(spec.key)!,grain=liveSourcePanelGrain(spec.key);
    const scope=issued.get(spec.key)!,source=relation(spec);
    if(!source||source.availability!=="AVAILABLE"){panels[spec.key]=absent("SOURCE_PANEL_NOT_CAPTURED",spec,scope);continue;}
    // These are the accepted fixed collector keys, not browser-selected aliases.
    if(source.source_id!==spec.source||source.relation!==spec.relation)return fail();
    let sourceRows=source.items;
    if(spec.relation==="reconciliation_findings"){
      // Reuse the existing exact session FK adapter, not a second or guessed
      // account/strategy mapping. Both original scopes remain in the group.
      const candidates=source.items.filter(row=>projectionRowVisible(scope,rowFields(row))&&namedRetainedFindingNeedsSession(row.fields));
      if(candidates.length){
        const parent=snapshot.document.relations["manager.sessions:execution_sessions"],parentScope=issued.get("sessions")!;
        if(!parent||parent.availability!=="AVAILABLE"||parent.source_id!=="manager.sessions"||parent.completeness!=="COMPLETE")return fail();
        const parents=parent.items.filter(row=>rowFields(row)!==null);
        const links=joinRetainedFindingSessionRows(candidates,parents).filter(link=>projectionRowVisible(parentScope,link.parent.fields)&&
          projectionRowVisible(scope,link.row.fields)&&projectionRowVisible(parentScope,link.row.fields));
        for(const link of links)lineage(link.parent);
        const dependent=new Set(candidates);sourceRows=source.items.filter(row=>!dependent.has(row)).concat(links.map(link=>link.row));
      }
    }
    const visible=sourceRows.filter(row=>projectionRowVisible(scope,rowFields(row)));
    const accountGrain=["accounts","account_balances","margin_balances","account_sync_effective"].includes(spec.relation);
    if(!accountGrain&&spec.relation!=="strategy_deployments"&&!target.tupleUnique&&
      !visible.some(row=>row.fields.deployment_id===deploymentId)){
      panels[spec.key]=absent("DEPLOYMENT_GRAIN_NOT_PROVEN",spec,scope);continue;
    }
    const rows=visible.filter(({fields:f})=>accountGrain?f.account_id===target.accountId:
      spec.relation==="strategy_deployments"||Object.hasOwn(f,"deployment_id")?f.deployment_id===deploymentId:
        target.tupleUnique&&f.strategy_id===target.strategyId&&f.account_id===target.accountId&&f.mode===environment&&f.venue===target.venue);
    if(rows.length>10000)return fail();
    if(start>rows.length)throw new ExecutionReadScopeError("EXECUTION_READ_CURSOR_INVALID",400);
    const records=rows.slice(start,start+200).map((row,index)=>{
      lineage(row);
      const values:Record<string,string|number|boolean|null>={};
      for(const field of spec.fields){
        // Permission precedes scalar validation; a hidden corrupt value cannot
        // turn this finite reader into a private-field existence oracle.
        const alias=publicField[field];
        if(alias?!scopeAllowsField(scope,alias):!retainedFieldAllowed(scope,field))continue;
        if(!Object.hasOwn(row.fields,field))continue;
        const raw=row.fields[field];
        // The established Manager INTEGER decoder preserves safe integers as
        // numbers and large integers as strings. Never Number() a decimal or
        // accept an unsafe numeric identity/count. Exact strings stay intact.
        if(integerFields.has(field)&&typeof raw==="number"){
          if(!Number.isSafeInteger(raw))return fail();values[field]=String(raw);continue;
        }
        if(clocks[field]){
          const clock=raw===null?null:typeof raw==="string"?managerTimestamp(raw)?.milliseconds:undefined;
          if(clock===undefined)return fail();values[clocks[field]]=clock;continue;
        }
        if(raw!==null&&typeof raw!=="string"&&typeof raw!=="number"&&typeof raw!=="boolean")return fail();
        values[field]=raw;
      }
      const parsed=liveSourceValues.safeParse(values);if(!parsed.success)return fail();
      // Observation ID contains ONLY this authorized public row+visible ordinal,
      // not a hidden source PK, cursor, population digest or raw snapshot hash.
      const identity=JSON.stringify(parsed.data);
      const observation_id=namedRetainedBusinessResourceId(key,principal.workspaceId,environment,profile,
        `portal.execution.live-source.${spec.key}.v2`,[String(start+index),identity]);
      return {observation_id,values:parsed.data};
    });
    panels[spec.key]={state:"PARTIAL",reason_code:records.length?"AUTHORIZED_RETAINED_OBSERVATIONS_ONLY":"NO_AUTHORIZED_RETAINED_OBSERVATION",
      source_as_of_ms:null,source_clock_reason:"SOURCE_CLOCK_NOT_SCOPED",provenance:provenance(spec,scope),grain,exact_total:null,limit:200,
      returned_count:records.length,has_more:start+records.length<rows.length,
      next_cursor:start+records.length<rows.length?cursor.encode(start+records.length,binding):null,
      previous_cursor:start>0?cursor.encode(Math.max(0,start-200),binding):null,records};
  }
  panels.broker_sync=absent("BROKER_PURPOSE_NOT_COMMISSIONED");
  return liveSourceOperationsRead.parse({schema_version:"portal.execution.live-source-operations.v2",
    workspace_id:principal.workspaceId,environment,profile_id:profile,deployment_id:deploymentId,
    record_authority:"PORTAL_RETAINED_OBSERVATION",source_verdict:"NOT_ASSERTED",visibility:"SCOPED",coverage:"AUTHORIZED_ONLY",
    observed_at_ms:Date.now(),source_side_effect_requested:false,runtime_activation_requested:false,data:panels,
    runtime:{state:null,reason_code:"SOURCE_RUNTIME_ACTIVATION_NOT_ASSERTED"},
    realtime:{active:false,reason_code:"FINITE_SCOPED_READ_NOT_STREAM_AUTHORITY"},
    commands:{enabled:false,reason_code:"READ_NOT_COMMAND_AUTHORITY"}});
}
