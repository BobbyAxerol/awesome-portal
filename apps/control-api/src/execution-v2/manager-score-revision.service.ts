import {Inject,Injectable,Optional} from "@nestjs/common";
import {Pool} from "pg";
import {createHmac} from "node:crypto";
import {ZodError} from "zod";
import {KeysetCursorCodec} from "../query/cursor";
import {QueryContractError} from "../query/contracts";
import {CONTROL_API_CONFIG,EXECUTION_DATA_POOL} from "../tokens";
import {querySigningKeys,type ControlApiConfig} from "../config";
import {accessDigest} from "./access-policy";
import {ExecutionManagerRuntime} from "./manager-runtime";
import {ManagerModelRepository,type ManagerModelHead} from "./manager-model.store";
import type {ManagerMember,ManagerModelDocument} from "./manager-model.contract";
import {managerScorePopulationDigest} from "./manager-score-publication";
import {managerScorePublication,type ManagerScorePublication} from "./manager-score-publication.contract";
import type {ManagerCompositionBinding} from "./manager-composition-publication.contract";
import type {ManagerScoreRestatementSnapshot} from "./manager-score-restatement";
import type {ManagerRegimeRestatementSnapshot} from "./manager-regime-restatement";
import {projectManagerHistoricalRegime,ManagerRegimePublicProjectionError} from "./manager-regime-history";
import {ManagerScoreHistoryStore,ManagerScoreHistoryStoreError,type ManagerScoreHistorySnapshot} from "./manager-score-history.store";
import {projectionRowVisible} from "./read-projection";
import {ExecutionReadScopes,ExecutionReadScopeError,scopeAllowsField,scopeAllowsFullAccountingPopulation,scopeReadPopulation,scopeResources,
  type AuthorizedExecutionReadScope,type ReadScopePrincipal,type ReadScopeRequirement} from "./read-scope";
import {managerScoreRevisionQuery,managerScoreRevisionHistoryQuery,managerScoreRevisionView,managerScoreRevisionHistory,
  type ManagerScoreRevisionQuery,type ManagerScoreRevisionHistoryQuery,type ManagerScoreRevisionView} from "./manager-score-revision.contract";

type Query=ManagerScoreRevisionQuery|ManagerScoreRevisionHistoryQuery;
type Gate={q:Query;scope:AuthorizedExecutionReadScope;document:ManagerModelDocument;head:ManagerModelHead|null;digest:string};
type Entry=ManagerScoreRevisionView["score_details"][number];
type Composition=ManagerScoreRevisionView["composition"];
type Regime=ManagerScoreRevisionView["regime"];
type Projected={view:ManagerScoreRevisionView;retained:ManagerScoreRestatementSnapshot|null;
  regimeRetained?:ManagerRegimeRestatementSnapshot|null;unpublished?:true;
  historyUnavailable?:"REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED"};
const notFound=():never=>{throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",404);};
const changed=():never=>{throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);};
const subject=(q:Query)=>({type:({FUND:"manager_book",PORTFOLIO:"portfolio",ALPHA:"alpha",ACCOUNT:"account",DEPLOYMENT:"deployment"} as const)[q.surface],
  id:q.id});
const memberTarget=(m:ManagerMember,q:Query)=>q.surface==="FUND"||m.tuple[
  q.surface==="PORTFOLIO"?"portfolio_id":q.surface==="ALPHA"?"alpha_id":q.surface==="ACCOUNT"?"account_id":"deployment_id"]===q.id;
const plainScore=(p:ManagerScorePublication,ref:(label:string,value:unknown)=>string)=>({quality:p.quality,raw_metrics:p.raw_metrics,input_ref:ref("input",p.provenance.input_digest),
  computed_at_ms:p.provenance.computed_at_ms,calculation_revision:p.provenance.calculation_revision,
  policy_revision:p.provenance.policy_revision,config_ref:p.provenance.config_hash===null?null:ref("config",p.provenance.config_hash)});
/** Separate historical BFF only. Never puts a historical value into an ordinary
 * Manager document/current-score selector. No calculator/scheduler/send/ACK. */
@Injectable()
export class ManagerScoreRevisionService {
  private readonly repository:ManagerModelRepository;
  private readonly referenceKey:string;
  private readonly historyStore:ManagerScoreHistoryStore;
  private readonly cursors:KeysetCursorCodec;
  constructor(@Inject(EXECUTION_DATA_POOL) private readonly pool:Pool,
    @Inject(ExecutionReadScopes) private readonly scopes:ExecutionReadScopes,
    @Inject(CONTROL_API_CONFIG) private readonly config:ControlApiConfig,
    @Optional() @Inject(ExecutionManagerRuntime) private readonly runtime?:ExecutionManagerRuntime){
    this.repository=new ManagerModelRepository(pool);
    this.referenceKey=querySigningKeys(config)[config.QUERY_CURSOR_ACTIVE_KEY_ID];
    this.historyStore=new ManagerScoreHistoryStore(pool);
    this.cursors=new KeysetCursorCodec({activeKeyId:config.QUERY_CURSOR_ACTIVE_KEY_ID,keys:querySigningKeys(config),
      ttlSeconds:config.QUERY_CURSOR_TTL_SECONDS});
  }
  private ref(g:Gate,label:string,value:unknown):string{
    // Opaque scoped correlation, not a SHA oracle for hidden source keys/input
    // bytes and never an authority token. Key rotation invalidates old pins.
    const context={key:this.config.QUERY_CURSOR_ACTIVE_KEY_ID,scope:g.scope.fingerprint,
      target:{surface:g.q.surface,id:g.q.id??null},workspace:g.document.workspace_id,environment:g.document.environment,
      profile:g.document.profile_id,revision:g.document.revision,stages:[...g.q.stage_filter].sort(),partition:g.q.economic_partition};
    // Preserve all default/explicit SCORE references exactly; only this new
    // financial family receives a separate public correlation domain.
    if(g.q.metric_family==="COMPOSITION"||g.q.metric_family==="REGIME")Object.assign(context,{metric_family:g.q.metric_family});
    return "sha256:"+createHmac("sha256",this.referenceKey).update("portal-manager-score-revision-v1\0"+label+"\0"+
      accessDigest({context,value})).digest("hex");
  }
  private async gate(principal:ReadScopePrincipal,q:Query):Promise<Gate>{
    if(q.workspace_id&&q.workspace_id!==principal.workspaceId)notFound();
    const profile=q.environment==="paper"?this.config.EXECUTION_EDGE_PAPER_PROFILE_ID:
      q.environment==="sandbox"?this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID:this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    if(!profile)throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
    const head=q.source_selector==="CURRENT_HEAD"?await this.repository.head(principal.workspaceId,q.environment,profile):null;
    const revision=q.source_selector==="CURRENT_HEAD"?head?.revision:q.source_revision;
    if(!revision)notFound();
    // Bounded exact private lookup supplies the binding metadata, not permission.
    // No filtering/selection/count/serialization happens before exact authority.
    let document:ManagerModelDocument|null;
    try{document=await this.repository.document(principal.workspaceId,q.environment,profile,revision!);}
    catch(error){
      // Invalid private bytes must not reveal existence of a reference before
      // the current named-resource authorization. Operational DB/capacity
      // failures remain finite 503, not a fallback publication.
      if(error instanceof ZodError||error instanceof Error&&["MANAGER_PROJECTION_LIMIT","MANAGER_PROJECTION_DIGEST_MISMATCH"].includes(error.message))notFound();
      throw error;
    }
    if(!document)notFound();
    const action:ReadScopeRequirement["action"]=q.surface==="FUND"?"business.read_all":q.surface==="PORTFOLIO"?"portfolio.read":
      q.surface==="ACCOUNT"?"account.read":"alpha.read";
    const resource=q.surface==="FUND"||q.surface==="DEPLOYMENT"?undefined:
      {kind:q.surface==="PORTFOLIO"?"PORTFOLIO" as const:q.surface==="ACCOUNT"?"ACCOUNT" as const:"ALPHA" as const,id:q.id!};
    const requirement:ReadScopeRequirement={action,resource,requireWholePopulation:q.surface==="FUND",
      dataset:{dataset_id:document!.family_id,source_revision:document!.revision,projection_generation:document!.projection_generation,
        catalogue_revision:document!.catalogue_digest,window:null}};
    let scope:AuthorizedExecutionReadScope;
    try{scope=await this.scopes.authorize(principal,{environment:q.environment,profileId:profile},requirement);}
    catch(error){
      if(q.surface!=="PORTFOLIO"||!(error instanceof ExecutionReadScopeError)||error.code!=="EXECUTION_READ_NOT_AVAILABLE")throw error;
      scope=await this.scopes.authorize(principal,{environment:q.environment,profileId:profile},{...requirement,action:"portfolio.read_restricted"});
    }
    if(scope.mode!=="SCOPED_V2")notFound();
    // A Regime history read is not a financial Score/allocation grant. Check
    // its own public fields and exact correlated population, never inherit the
    // capital/account ceiling merely because the ordinary route is shared.
    const fields=q.metric_family==="REGIME"?["regime","binding_id","provenance_ref","revision","source_as_of","as_of","stage","profile_id",
      "alpha_id","alpha_version_id",...(q.surface==="DEPLOYMENT"?["deployment_id"]:[])]:
      ["score","provenance_ref","revision","source_as_of","as_of","stage","profile_id","currency",
      "alpha_id","alpha_version_id","portfolio_id","deployment_id","account_id"];
    for(const field of fields)if(!scopeAllowsField(scope,field))notFound();
    if(q.metric_family==="COMPOSITION")for(const field of ["allocation","balance_total"])
      if(!scopeAllowsField(scope,field))notFound();
    if((q.surface==="FUND"||q.surface==="PORTFOLIO")&&
      !scopeAllowsFullAccountingPopulation(scope,q.surface==="PORTFOLIO"?q.id:undefined))notFound();
    if(q.surface==="DEPLOYMENT"&&!scopeReadPopulation(scope).allowedTuples.some(t=>t.deployment_id===q.id))notFound();
    if(document!.qualification!=="SOURCE_VERIFIED")throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
    if(document!.workspace_id!==principal.workspaceId||document!.environment!==q.environment||document!.profile_id!==profile)notFound();
    if(head&&(head.revision!==document!.revision||head.payload_digest!==accessDigest(document)))changed();
    return {q,scope,document:document!,head,digest:accessDigest(document)};
  }
  private async unchanged(g:Gate):Promise<void>{
    if(g.head){
      const head=await this.repository.head(g.document.workspace_id,g.document.environment,g.document.profile_id);
      if(head?.revision!==g.head.revision||head.payload_digest!==g.head.payload_digest)changed();
    }else{
      // Retained exact source does not have to equal today's head.
      const row=(await this.pool.query<{payload_digest:string}>("SELECT payload_digest FROM execution_manager_model_revisions "+
        "WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3 AND revision=$4",
      [g.document.workspace_id,g.document.environment,g.document.profile_id,g.document.revision])).rows[0];
      if(!row||row.payload_digest!==g.digest)changed();
    }
  }
  private members(g:Gate):ManagerMember[]{
    return g.document.members.filter(m=>m.valid_from_ms<=g.document.as_of_ms&&(m.valid_to_ms===null||m.valid_to_ms>g.document.as_of_ms)&&
      memberTarget(m,g.q)&&(!g.q.stage_filter.length||g.q.stage_filter.includes(m.stage))&&projectionRowVisible(g.scope,m.tuple));
  }
  private matching(g:Gate,members:readonly ManagerMember[],b:ManagerScorePublication["provenance"]["binding"]):boolean{
    const s=subject(g.q),stages=(g.q.stage_filter.length?[...g.q.stage_filter]:[...new Set(members.map(m=>m.stage))]).sort();
    return members.length>0&&b.subject_type===s.type&&b.subject_id===(s.id??g.document.workspace_id)&&
      b.tuple_population_digest===managerScorePopulationDigest(members)&&b.partition_digest===accessDigest(g.q.economic_partition)&&
      accessDigest([...b.stage_filter].sort())===accessDigest(stages)&&b.window_start_ms<b.window_end_ms&&b.window_end_ms<=g.document.as_of_ms;
  }
  private original(g:Gate,members:readonly ManagerMember[]):Entry[]{
    const d=g.document;
    return (d.precomputed_scores??[]).filter(p=>{
      const x=p.provenance;
      return this.matching(g,members,x.binding)&&x.source_revision===d.revision&&x.source_set_digest===d.source_set_digest&&
        x.source_as_of_ms===d.as_of_ms&&x.source_qualification==="SOURCE_VERIFIED"&&x.scope.workspace_id===d.workspace_id&&
        x.scope.environment===d.environment&&x.scope.profile_id===d.profile_id&&x.scope.catalogue_digest===d.catalogue_digest&&
        p.quality.comparable_basis_id===x.binding.comparable_basis_id&&p.quality.individual_evidence_binding_id===x.binding.individual_evidence_binding_id;
    }).map(p=>({slot:p.slot,binding:p.provenance.binding,original_input_ref:this.ref(g,"input",p.provenance.input_digest),derived_input_ref:null,
      feed_freshness:{availability:"NOT_PUBLISHED" as const,reason_code:"ORIGINAL_FEED_FRESHNESS_NOT_RECORDED" as const},
      availability:p.quality.value===null?"NOT_PUBLISHED":"AVAILABLE",reason_codes:p.quality.reason_codes,score:plainScore(p,(label,value)=>this.ref(g,label,value))}));
  }
  /** A verified empty dataset is different from a researcher's empty visible
   * slice. Preserve SCORE's nonempty guard; only full-accounting named targets
   * may use this independent current publication/resource census proof. */
  private compositionEmptyTarget(g:Gate):boolean{
    if(g.q.metric_family!=="COMPOSITION"||g.q.surface!=="FUND"&&g.q.surface!=="PORTFOLIO"||
      !scopeAllowsFullAccountingPopulation(g.scope,g.q.surface==="PORTFOLIO"?g.q.id:undefined))return false;
    const target=(tuple:{portfolio_id:string})=>g.q.surface==="FUND"||tuple.portfolio_id===g.q.id;
    const population=scopeReadPopulation(g.scope),resources=scopeResources(g.scope);
    if(population.populationTuples.some(target)||population.allowedTuples.some(target)||this.members(g).length)return false;
    return g.q.surface==="FUND"?g.scope.wholePopulation&&resources.some(r=>r.kind==="ROOT"):
      resources.some(r=>r.kind==="PORTFOLIO"&&r.id===g.q.id);
  }
  private compositionMatches(g:Gate,members:readonly ManagerMember[],binding:ManagerCompositionBinding):boolean{
    if(members.length)return this.matching(g,members,binding);
    if(!this.compositionEmptyTarget(g))return false;
    const selectedStages=g.q.stage_filter.length?g.q.stage_filter:binding.stage_filter;
    const expected=subject(g.q);
    return binding.subject_type===expected.type&&binding.subject_id===(expected.id??g.document.workspace_id)&&
      binding.tuple_population_digest===managerScorePopulationDigest([])&&
      binding.partition_digest===accessDigest(g.q.economic_partition)&&
      accessDigest([...binding.stage_filter].sort())===accessDigest([...selectedStages].sort())&&
      binding.stage_filter.every(s=>(g.q.environment==="paper"?["PAPER"]:g.q.environment==="sandbox"?["SANDBOX"]:["CANARY","LIVE"]).includes(s))&&
      binding.window_start_ms<binding.window_end_ms&&binding.window_end_ms<=g.document.as_of_ms;
  }
  private originalComposition(g:Gate,members:readonly ManagerMember[]):Composition|null{
    const d=g.document,selected=(d.precomputed_compositions??[]).filter(p=>{
      const x=p.provenance;
      return this.compositionMatches(g,members,x.binding)&&x.source_revision===d.revision&&
        x.source_set_digest===d.source_set_digest&&x.source_as_of_ms===d.as_of_ms&&x.source_qualification==="SOURCE_VERIFIED"&&
        x.scope.workspace_id===d.workspace_id&&x.scope.environment===d.environment&&x.scope.profile_id===d.profile_id&&
        x.scope.catalogue_digest===d.catalogue_digest;
    });
    if(selected.length>1)notFound();if(!selected.length)return null;
    const p=selected[0],readAtMs=Date.now(),used=new Map(p.provenance.raw_score_refs.map(r=>[r.subject_id,r.publication_digest]));
    // The original immutable publication is historical evidence, not a grant
    // to disclose a contribution outside this currently authorized census.
    // Zero allocation may omit members; it may never add a foreign subject.
    const alphaMembers=new Map<string,ManagerMember[]>();
    for(const member of members){const rows=alphaMembers.get(member.tuple.alpha_id)??[];
      rows.push(member);alphaMembers.set(member.tuple.alpha_id,rows);}
    if(p.provenance.computed_at_ms>readAtMs||
      p.result.contributions.some(row=>!alphaMembers.has(row.subject_id)))notFound();
    const eligibleRaw=(raw:ManagerScorePublication,subjectId:string):boolean=>{
      const x=raw.provenance,b=x.binding,pb=p.provenance.binding,q=raw.quality;
      const population=alphaMembers.get(subjectId);
      return population!==undefined&&raw.slot==="RAW"&&b.subject_type==="alpha"&&b.subject_id===subjectId&&
        b.tuple_population_digest===managerScorePopulationDigest(population)&&
        b.partition_digest===pb.partition_digest&&b.window_start_ms===pb.window_start_ms&&b.window_end_ms===pb.window_end_ms&&
        b.comparable_basis_id===pb.comparable_basis_id&&
        accessDigest([...b.stage_filter].sort())===accessDigest([...pb.stage_filter].sort())&&
        x.source_revision===d.revision&&x.source_set_digest===d.source_set_digest&&x.source_as_of_ms===d.as_of_ms&&
        x.source_qualification==="SOURCE_VERIFIED"&&x.scope.workspace_id===d.workspace_id&&
        x.scope.environment===d.environment&&x.scope.profile_id===d.profile_id&&x.scope.catalogue_digest===d.catalogue_digest&&
        q.qualification==="RUNTIME_APPROVED"&&(q.status==="available"||q.status==="provisional")&&q.value!==null&&
        q.comparable_basis_id===b.comparable_basis_id&&q.individual_evidence_binding_id===b.individual_evidence_binding_id&&
        x.computed_at_ms>=x.source_as_of_ms&&x.computed_at_ms<=p.provenance.computed_at_ms;
    };
    return {availability:p.result.value===null?"PARTIAL":"AVAILABLE",reason_codes:p.result.reason_codes,
      binding:p.provenance.binding,result:{...structuredClone(p.result),
        allocation_snapshot_id:this.ref(g,"allocation-snapshot",p.result.allocation_snapshot_id)},
      allocation_ref:this.ref(g,"allocation",p.provenance.allocation_artifact_sha256),
      allocation_effective_at_ms:p.provenance.allocation_effective_at_ms,
      original_publication_ref:this.ref(g,"composition-original-publication",accessDigest(p)),
      computed_at_ms:p.provenance.computed_at_ms,calculation_revision:p.provenance.calculation_revision,
      raw_dependencies:p.result.contributions.map(row=>{
        // Missing and misbound references have the same public absence. A
        // digest resolving somewhere in this private source is not authority.
        const raw=(d.precomputed_scores??[]).find(score=>accessDigest(score)===used.get(row.subject_id)&&
          eligibleRaw(score,row.subject_id));
        return {subject_id:row.subject_id,availability:raw?"AVAILABLE":"NOT_PUBLISHED",
          reason_codes:raw?[]:["ORIGINAL_ROW_REASON_NOT_RECORDED"],
          original_input_ref:raw?this.ref(g,"input",raw.provenance.input_digest):null,derived_input_ref:null};
      })};
  }
  private restatedComposition(g:Gate,members:readonly ManagerMember[],view:ManagerScoreRestatementSnapshot):Composition|null{
    if(view.schema_version!=="portal.execution.manager-score-restatement.v2")return null;
    const selected=view.composition_entries.filter(entry=>this.compositionMatches(g,members,entry.binding));
    if(selected.length>1)notFound();if(!selected.length)return null;
    const h=selected[0].historical,raw=new Map(view.entries.map(entry=>[accessDigest(entry),entry]));
    return {availability:h.result.value===null?"PARTIAL":"AVAILABLE",reason_codes:h.result.reason_codes,
      binding:h.binding,result:{...structuredClone(h.result),
        allocation_snapshot_id:this.ref(g,"allocation-snapshot",h.result.allocation_snapshot_id)},
      allocation_ref:this.ref(g,"allocation",h.allocation_artifact_sha256),
      allocation_effective_at_ms:h.allocation_effective_at_ms,
      original_publication_ref:this.ref(g,"composition-original-publication",h.original_publication_digest),
      computed_at_ms:h.computed_at_ms,calculation_revision:h.calculation_revision,
      raw_dependencies:h.raw_inputs.map(input=>{
        const entry=input.entry_digest===null?undefined:raw.get(input.entry_digest);
        return {subject_id:input.subject_id,availability:input.disposition==="USED"?"AVAILABLE":
          entry?.historical?"PARTIAL":"NOT_PUBLISHED",reason_codes:input.reason_code?[input.reason_code]:[],
          original_input_ref:input.original_input_digest===null?null:this.ref(g,"input",input.original_input_digest),
          derived_input_ref:entry?.historical?this.ref(g,"input",entry.historical.derived_input_digest):null};
      })};
  }
  private projectCompositionHistory(g:Gate,snapshot:ManagerScoreHistorySnapshot,members:readonly ManagerMember[]):Projected[]{
    const original=this.originalComposition(g,members);
    if(g.q.revision_mode==="ORIGINAL_AS_PUBLISHED")return original?[this.project(g,[],null,original)]:[];
    const map=new Map(snapshot.restatements.map(view=>[view.calculation_key,view]));
    const ordered:ManagerScoreRestatementSnapshot[]=[],seen=new Set<string>();let key=snapshot.restated_head_key;
    while(key!==null){const view=map.get(key);if(!view||seen.has(key))throw new Error("HISTORY_LINEAGE_INVALID");
      seen.add(key);ordered.push(view);key=view.supersedes_calculation_key;}
    const projected=ordered.reverse().flatMap(view=>{
      const composition=this.restatedComposition(g,members,view);
      return composition?[this.project(g,[],view,composition)]:[];
    });
    const originalGate={...g,q:{...g.q,revision_mode:"ORIGINAL_AS_PUBLISHED" as const}};
    let predecessor=original?this.project(originalGate,[],null,original).view.revision_ref:null;
    for(const item of projected){
      item.view.supersedes_revision_ref=predecessor;
      item.view.supersedes_reason=predecessor===null?"NO_AUTHORIZED_PREDECESSOR":"AUTHORIZED_PREDECESSOR";
      predecessor=item.view.revision_ref;
    }
    return projected.reverse();
  }
  private restated(g:Gate,members:readonly ManagerMember[],view:ManagerScoreRestatementSnapshot):Entry[]{
    return view.entries.filter(e=>this.matching(g,members,e.binding)).map(e=>{
      const h=e.historical;
      const p=h?managerScorePublication.parse({slot:e.slot,quality:(({preview:_private,...quality})=>quality)(h.result.quality),
        raw_metrics:h.result.raw_metrics,provenance:h.result.provenance}):null;
      return {slot:e.slot,binding:e.binding,original_input_ref:this.ref(g,"input",e.original_input_digest),
        derived_input_ref:h?this.ref(g,"input",h.derived_input_digest):null,
        feed_freshness:h?{availability:"AVAILABLE" as const,checked_at_ms:h.checked_at_ms,...h.feed_freshness}:
          {availability:"NOT_PUBLISHED" as const,reason_code:"HISTORICAL_CALCULATION_NOT_PUBLISHED" as const},
        availability:e.availability,reason_codes:e.reason_codes,score:p?plainScore(p,(label,value)=>this.ref(g,label,value)):null};
    });
  }
  private project(g:Gate,entries:Entry[],retained:ManagerScoreRestatementSnapshot|null,composition?:Composition,
    regime?:Regime,regimeRetained?:ManagerRegimeRestatementSnapshot|null):Projected {
    const q=g.q,d=g.document,original=q.revision_mode==="ORIGINAL_AS_PUBLISHED";
    if(new Set(entries.map(e=>e.slot)).size!==entries.length)notFound();
    const K=regimeRetained?.knowledge_cutoff_ms??retained?.knowledge_cutoff_ms??null,
      computed=regimeRetained?.computed_at_ms??retained?.computed_at_ms??null;
    const target={surface:q.surface,id:q.id??null};
    const sourceRef=this.ref(g,"source",{target,workspace:d.workspace_id,environment:d.environment,profile:d.profile_id,
      revision:d.revision,stages:[...q.stage_filter].sort(),partition:q.economic_partition});
    const selectedComposition=composition!==undefined&&composition.availability!=="NOT_PUBLISHED";
    const revisionRef=this.ref(g,"revision",{sourceRef,mode:q.revision_mode,K,computed,entries,
      ...(q.metric_family==="COMPOSITION"?{composition:composition??null}:{}),
      ...(q.metric_family==="REGIME"?{regime:regime??null}:{})});
    const available=entries.filter(e=>e.availability==="AVAILABLE").length;
    const availability=regime!==undefined?regime.availability:selectedComposition?composition.availability:entries.length>0&&available===entries.length?"AVAILABLE":
      entries.some(e=>e.availability!=="NOT_PUBLISHED")?"PARTIAL":"NOT_PUBLISHED";
    const view=managerScoreRevisionView.parse({schema_version:"portal.execution.manager-score-revision.v1",target,
      workspace_id:d.workspace_id,environment:d.environment,revision_mode:q.revision_mode,purpose:"HISTORICAL_ANALYSIS_ONLY",
      operational_current:false,revision_ref:revisionRef,supersedes_revision_ref:null,
      supersedes_reason:original?"ORIGINAL_HAS_NO_PREDECESSOR":"NO_AUTHORIZED_PREDECESSOR",
      source:{authorized_source_ref:sourceRef,source_revision:d.revision,source_as_of_ms:d.as_of_ms,
        recorded_through_ms:d.recorded_through_ms,facts_through_ms:d.facts_through_ms},
      knowledge_cutoff_ms:K,knowledge_cutoff_reason:original?"ORIGINAL_KNOWLEDGE_CUTOFF_NOT_RECORDED":K===null?"RESTATEMENT_NOT_PUBLISHED":null,
      computed_at_ms:computed,computed_at_reason:original?"ORIGINAL_COMPUTE_TIMES_ARE_PER_ENTRY":computed===null?"RESTATEMENT_NOT_PUBLISHED":null,
      eligibility:{policy_current:false,policy_state:"UNKNOWN",reason_code:"POLICY_STATE_NOT_CLASSIFIED",
        economic_source:q.source_selector==="CURRENT_HEAD"?"CURRENT_HEAD":"RETAINED_EXACT_REVISION",usable_as_current_operational_score:false},
      availability,reason_codes:q.metric_family==="REGIME"&&regime?regime.availability==="NOT_PUBLISHED"?[regime.reason_code]:[...regime.reason_codes]:selectedComposition||entries.length?[]:[q.metric_family==="COMPOSITION"?
        "SELECTED_COMPOSITION_REVISION_NOT_PUBLISHED":original?"SELECTED_SCORE_REVISION_NOT_PUBLISHED":"RESTATEMENT_NOT_PUBLISHED"],
      score_details:entries,composition:composition??{availability:"NOT_PUBLISHED",reason_code:q.metric_family==="COMPOSITION"?
        "SELECTED_COMPOSITION_REVISION_NOT_PUBLISHED":original?"COMPOSITION_REVISION_NOT_SELECTED":"DEPENDENT_RESTATEMENT_NOT_MATERIALIZED"},
      regime:regime??{availability:"NOT_PUBLISHED",reason_code:"INDEPENDENT_REGIME_REVISION_NOT_SELECTED"}});
    return {view,retained,...(q.metric_family==="REGIME"?{regimeRetained:regimeRetained??null}:{})};
  }
  /** Independent alpha/deployment Regime family. A materialization is selected
   * only after its COMPLETE retained corpus is currently authorized. Private
   * third-head keys never enter refs, cursors, counts or predecessor labels. */
  private projectRegimeHistory(g:Gate,snapshot:ManagerScoreHistorySnapshot):Projected[]{
    const q=g.q;
    if((q.surface!=="ALPHA"&&q.surface!=="DEPLOYMENT")||q.id===undefined)notFound();
    const originalRow=snapshot.original===null?null:{calculation_key:snapshot.original.calculation_key,
      payload_digest:accessDigest(snapshot.original),payload:snapshot.original};
    const detail=(gate:Gate,retained:ManagerRegimeRestatementSnapshot|null):Regime=>projectManagerHistoricalRegime({
      document:g.document,originalRow,restated:retained?.entries.map(e=>e.historical)??null,scope:g.scope,
      query:{surface:q.surface as "ALPHA"|"DEPLOYMENT",id:q.id!,stage_filter:q.stage_filter,
        economic_partition:q.economic_partition,revision_mode:gate.q.revision_mode},
      read_at_ms:Date.now(),maximum_output_bytes:1_048_576,ref:(kind,value)=>this.ref(g,kind,value)});
    const absence=(value:Regime):Projected=>{
      const projected=this.project(g,[],null,undefined,value);
      return {...projected,unpublished:true,...(value.availability==="NOT_PUBLISHED"&&
        value.reason_code==="REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED"?{historyUnavailable:value.reason_code}:{})};
    };
    const originalGate={...g,q:{...q,revision_mode:"ORIGINAL_AS_PUBLISHED" as const}},original=detail(originalGate,null);
    if(q.revision_mode==="ORIGINAL_AS_PUBLISHED")return original.availability==="NOT_PUBLISHED"?[absence(original)]:
      [this.project(g,[],null,undefined,original)];
    const map=new Map(snapshot.regime_restatements.map(v=>[v.calculation_key,v]));
    const ordered:ManagerRegimeRestatementSnapshot[]=[],seen=new Set<string>();let key=snapshot.regime_restated_head_key;
    while(key!==null){const value=map.get(key);if(!value||seen.has(key))throw new Error("HISTORY_LINEAGE_INVALID");
      seen.add(key);ordered.push(value);key=value.supersedes_calculation_key;}
    const visible=new Set<string>(),projected:Projected[]=[];
    for(const value of ordered.reverse()){
      const regime=detail(g,value);if(regime.availability==="NOT_PUBLISHED")continue;
      const item=this.project(g,[],null,undefined,regime,value);
      if(visible.has(item.view.revision_ref))continue;visible.add(item.view.revision_ref);projected.push(item);
    }
    let predecessor=original.availability==="NOT_PUBLISHED"?null:this.project(originalGate,[],null,undefined,original).view.revision_ref;
    for(const item of projected){item.view.supersedes_revision_ref=predecessor;
      item.view.supersedes_reason=predecessor===null?"NO_AUTHORIZED_PREDECESSOR":"AUTHORIZED_PREDECESSOR";
      predecessor=item.view.revision_ref;}
    // Missing legacy corpus stays honest null-count absence. A verified empty
    // independent chain has zero materializations, not one manufactured row.
    return projected.length?projected.reverse():[absence(detail(g,null))];
  }
  private projectHistory(g:Gate,snapshot:ManagerScoreHistorySnapshot):Projected[]{
    const members=this.members(g);if(!members.length&&!this.compositionEmptyTarget(g))notFound();
    if(g.q.metric_family==="REGIME")return this.projectRegimeHistory(g,snapshot);
    if(g.q.metric_family==="COMPOSITION")return this.projectCompositionHistory(g,snapshot,members);
    const originals=this.original(g,members);
    if(g.q.revision_mode==="ORIGINAL_AS_PUBLISHED")return originals.length?[this.project(g,originals,null)]:[];
    // Pointer order is causal, even for equal wall clocks. Hidden-only nodes
    // neither count nor appear as predecessor IDs, cursor offsets or reasons.
    const map=new Map(snapshot.restatements.map(v=>[v.calculation_key,v]));
    const ordered:ManagerScoreRestatementSnapshot[]=[];let key=snapshot.restated_head_key;
    const seen=new Set<string>();
    while(key!==null){const v=map.get(key);if(!v||seen.has(key))throw new Error("HISTORY_LINEAGE_INVALID");
      seen.add(key);ordered.push(v);key=v.supersedes_calculation_key;}
    const visible=new Set<string>();
    const projected=ordered.reverse().map(v=>({v,entries:this.restated(g,members,v)})).filter(p=>p.entries.length)
      .map(p=>this.project(g,p.entries,p.v)).filter(p=>{
        // A v1→combined-v2 append can have the same millisecond and exact RAW
        // projection. It is not a second visible Score fact or private-node ID.
        if(visible.has(p.view.revision_ref))return false;visible.add(p.view.revision_ref);return true;
      });
    // Cross-mode origin is scoped with the ORIGINAL query, not re-labelled as
    // a RESTATED calculation. It is a public predecessor only, not a list item.
    const originalGate={...g,q:{...g.q,revision_mode:"ORIGINAL_AS_PUBLISHED" as const}};
    let predecessor=originals.length?this.project(originalGate,originals,null).view.revision_ref:null;
    for(const p of projected){
      p.view.supersedes_revision_ref=predecessor;
      p.view.supersedes_reason=predecessor===null?"NO_AUTHORIZED_PREDECESSOR":"AUTHORIZED_PREDECESSOR";
      predecessor=p.view.revision_ref;
    }
    return projected.reverse();
  }
  private signature(items:readonly Projected[]):string{return accessDigest(items.map(p=>p.view.revision_ref));}
  private async retained(g:Gate):Promise<Projected[]>{
    // Current named resource/fields/population have already been authorized.
    // No remote authority await is held inside the short READ ONLY snapshot.
    if(!this.members(g).length&&!this.compositionEmptyTarget(g))notFound();
    let snapshot=await this.historyStore.scan(g.document,5000),items=this.projectHistory(g,snapshot);
    if(!await this.historyStore.unchanged(g.document,snapshot,5000)){
      const first=this.signature(items);snapshot=await this.historyStore.scan(g.document,5000);
      items=this.projectHistory(g,snapshot);
      // The re-scan itself is a new coherent READ ONLY snapshot. Comparing its
      // authorized projection is the final history fence; do not turn another
      // hidden-only append into a public409 or chase global metadata forever.
      // A later visible append invalidates the cursor on the next request.
      if(this.signature(items)!==first)changed();
    }
    await this.unchanged(g);return items;
  }
  private classify(g:Gate,item:Projected):ManagerScoreRevisionView {
    const v=item.retained;
    const scope={workspace_id:g.document.workspace_id,environment:g.document.environment,profile_id:g.document.profile_id},rg=item.regimeRetained;
    const state=g.q.metric_family==="REGIME"?(rg?this.runtime?.regimeRestatementFor(scope)?.classifyPolicy(rg)??
      (Date.now()>=rg.policy.approval_pin.valid_until_ms?"NOT_CURRENT":"UNKNOWN"):"UNKNOWN"):
      v?this.runtime?.restatementFor(scope)?.classifyPolicy(v)??
      (Date.now()>=v.policy.valid_until_ms?"NOT_CURRENT":"UNKNOWN"):"UNKNOWN";
    item.view.eligibility.policy_current=state==="CURRENT";item.view.eligibility.policy_state=state;
    item.view.eligibility.reason_code=state==="CURRENT"?null:state==="NOT_CURRENT"?
      "CURRENT_POLICY_NOT_CONFIRMED":"POLICY_STATE_NOT_CLASSIFIED";
    return managerScoreRevisionView.parse(item.view);
  }
  private failure(error:unknown):never{
    if(error instanceof ExecutionReadScopeError)throw error;
    if(error instanceof ManagerRegimePublicProjectionError&&error.code==="REGIME_PUBLIC_BOUND")
      throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
    if(error instanceof ManagerScoreHistoryStoreError){
      if(error.code==="HISTORY_SOURCE_CHANGED")changed();
      if(error.code==="HISTORY_CAPACITY")throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
    }
    if(error instanceof QueryContractError)throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
    throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
  }
  async read(principal:ReadScopePrincipal,raw:unknown):Promise<ManagerScoreRevisionView>{
    const parsed=managerScoreRevisionQuery.safeParse(raw);
    if(!parsed.success)throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",400);
    try{
      const g=await this.gate(principal,parsed.data);
      const item=await this.scopes.deliver(g.scope,async()=>{
        const items=await this.retained(g),selected=parsed.data.revision_ref===undefined?items[0]:
          items.find(p=>p.view.revision_ref===parsed.data.revision_ref);
        if((!selected||selected.unpublished)&&parsed.data.revision_ref!==undefined)notFound();
        const result=selected??this.project(g,[],null);
        if(Buffer.byteLength(JSON.stringify(result.view))>1_048_576)throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
        return result;
      });
      // Last synchronous classification follows final current scope I/O. Policy
      // expiry/replacement labels immutable history; it never deletes the fact.
      const response=this.classify(g,item);
      if(Buffer.byteLength(JSON.stringify(response))>1_048_576)throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
      return response;
    }catch(error){return this.failure(error);}
  }
  async history(principal:ReadScopePrincipal,raw:unknown){
    const parsed=managerScoreRevisionHistoryQuery.safeParse(raw);
    if(!parsed.success)throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",400);
    try{
      const q=parsed.data,g=await this.gate(principal,q);
      const page=await this.scopes.deliver(g.scope,async()=>{
        const retained=await this.retained(g),unavailable=retained.find(p=>p.historyUnavailable)?.historyUnavailable;
        if(unavailable){
          if(q.before||q.after)changed();
          return {response:managerScoreRevisionHistory.parse({schema_version:"portal.execution.manager-score-history.v1",
            target:{surface:q.surface,id:q.id??null},workspace_id:principal.workspaceId,environment:q.environment,revision_mode:q.revision_mode,
            purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,availability:"NOT_PUBLISHED",reason_code:unavailable,
            page:{limit:q.limit,returned_count:null,authorized_total_count:null,next_cursor:null,previous_cursor:null},items:[]}),chosen:[] as Projected[]};
        }
        const all=retained.filter(p=>!p.unpublished),direction=q.before?"before":"after";
        const fingerprint=accessDigest({scope:g.scope.fingerprint,viewer:principal.viewerWorkspaceId??principal.workspaceId,
          target:{surface:q.surface,id:q.id??null},workspace:g.document.workspace_id,environment:q.environment,
          profile:g.document.profile_id,revision:g.document.revision,generation:g.document.projection_generation,
          catalogue:g.document.catalogue_digest,mode:q.revision_mode,stages:[...q.stage_filter].sort(),partition:q.economic_partition,
          limit:q.limit,key:this.config.QUERY_CURSOR_ACTIVE_KEY_ID,authorized:this.signature(all),
          ...(q.metric_family==="COMPOSITION"||q.metric_family==="REGIME"?{metric_family:q.metric_family}:{})});
        const context={resourceId:"execution-manager-score-history-v1",workspaceId:principal.workspaceId,
          direction,queryFingerprint:fingerprint,boundarySize:1} as const;
        const token=q.before??q.after;
        let start=0,end=all.length;
        if(token){const [boundary]=this.cursors.decode(token,context),index=all.findIndex(p=>p.view.revision_ref===boundary);
          if(index<0)changed();if(direction==="before")end=index;else start=index+1;}
        if(direction==="before")start=Math.max(0,end-q.limit);else end=Math.min(end,start+q.limit);
        let chosen=all.slice(start,end);const initialCount=chosen.length;
        // Reserve room for bounded two cursors/envelope, then enforce exact
        // aggregate response bytes below. Do not silently truncate history.
        while(chosen.length&&Buffer.byteLength(JSON.stringify(chosen.map(p=>p.view)))>1_032_192){
          if(direction==="before"){chosen.shift();start++;}else{chosen.pop();end--;}}
        if(!chosen.length&&initialCount>0)throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
        if(!chosen.length&&all.length&&((q.after&&start<all.length)||(q.before&&end>0)))
          throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
        const encode=(dir:"after"|"before",ref:string)=>this.cursors.encode({resource_id:context.resourceId,
          workspace_id:context.workspaceId,direction:dir,query_fingerprint:fingerprint,boundary:[ref]});
        const response=managerScoreRevisionHistory.parse({schema_version:"portal.execution.manager-score-history.v1",
          target:{surface:q.surface,id:q.id??null},workspace_id:principal.workspaceId,environment:q.environment,revision_mode:q.revision_mode,
          purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,availability:"AVAILABLE",reason_code:null,
          page:{limit:q.limit,returned_count:chosen.length,authorized_total_count:all.length,
            next_cursor:chosen.length&&end<all.length?encode("after",chosen[chosen.length-1].view.revision_ref):null,
            previous_cursor:chosen.length&&start>0?encode("before",chosen[0].view.revision_ref):null},items:chosen.map(p=>p.view)});
        if(Buffer.byteLength(JSON.stringify(response))>1_048_576)throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
        return {response,chosen};
      });
      page.response.items=page.chosen.map(p=>this.classify(g,p));
      if(Buffer.byteLength(JSON.stringify(page.response))>1_048_576)throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
      return managerScoreRevisionHistory.parse(page.response);
    }catch(error){return this.failure(error);}
  }
}
