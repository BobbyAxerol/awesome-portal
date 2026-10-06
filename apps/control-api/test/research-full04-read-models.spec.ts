/** Synthetic contract/regression units only. Native HMD product runs qualify recipes separately. */
import {readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";
import {gunzipSync} from "node:zlib";
import {describe,expect,it} from "vitest";
import {executionRecipes} from "../src/research/execution-recipes";
import {currentSourceExecutionPair,currentSourceRetainedMethod} from "../src/research/current-source-profile";
import {CurrentSourceOptimizerDisclosureSchema,CurrentSourceMode4SelectionSchema,CurrentSourceFoldPayloadSchema,CurrentSourceSummarySchema} from "../src/research/current-source.payload";
import {selectionRoles} from "../src/research/current-source-facts";
import {candidateDrawdown,searchPool} from "../src/research/current-source-pool";
import {selectedTrialPresentation} from "../src/research/selected-trial-presentation";
import {foldOrdering} from "../src/research/fold-ordering";
import {retainedFinalAudit} from "../src/research/report-core-v2";
import {finalAuditTargetApplicable} from "../src/research/final-audit.contract";
import {assertFull04SealConsistency} from "../src/research/full04-seal-consistency";
import {sha256ResearchJson} from "../src/research/preflight.service";
import {ResearchProgressSnapshotSchema,ResearchProgressEventSchema,toPublicResearchProgressEvent,toPublicResearchProgressSnapshot} from "../src/research/progress.contract";
import {openApiValidator} from "./research-rf05-openapi";
import {resolveSealedPerformanceMetric} from "../src/research/source-aware-metric-resolver";
import {ResearchRunLibraryService} from "../src/research/run-library.service";
import {testConfig} from "./harness";

const recipes=executionRecipes.filter(row=>row.descriptor.schema_version==="research.full04-delta-profile.v1");
const fixture=JSON.parse(gunzipSync(readFileSync(join(__dirname,"research-w5b-real-replay.fixture.json.gz"))).toString());
const params={window:"34",rsi_lower:"40",rsi_upper:"60"};
const dispersion={selector:"is_only_robust",is_subperiods:2,temporal_score:"0.5",temporal_q25:"0.4",temporal_mad:"0.1",temporal_count:2,is_only_robust_score:"0.45"};
const location={source_locator:"wfo.mode_evidence.v1:best_trial.selection_metadata",reason_code:null};
function disclosure(mode:"mode_3_flat_minima"|"mode_4_is_only_robust"|"mode_5_full_robust",synthetic=false){
  return CurrentSourceOptimizerDisclosureSchema.parse({schema_version:"research.current-source-optimizer-disclosure.v1",
    optimization_mode:mode,optimization_schedule:"global",calibration_sample:mode==="mode_5_full_robust"?"FULL_SAMPLE":mode==="mode_4_is_only_robust"?"IS_ONLY":"IS_OOS",
    oos_used_for_selection:mode==="mode_3_flat_minima",full_sample_used_for_selection:mode==="mode_5_full_robust",
    selection_target:{kind:synthetic?"SYNTHETIC_CENTROID":"TRIAL",trial_id:synthetic?null:"0",objective_kind:mode==="mode_5_full_robust"?"FULL_SAMPLE_MEAN_SHARPE":"IS_MEAN_SHARPE",
      selection_score:"0.45",selection_score_kind:"IS_ONLY_ROBUST_J"},
    ...(synthetic?{centroid:{state:"AVAILABLE",parameters:params,medoid_trial_id:"1",cluster_size:2,cluster_method:"kmeans",requires_evaluation:true}}:{}),
    mode_evidence:mode==="mode_3_flat_minima"?{kind:"PLATEAU",...location,selector:"centroid",cluster_method:"kmeans",cluster_size:2,top_trials:3,
      medoid_trial_id:"1",cluster_mean_objective:"0.5",cluster_best_objective:"0.6"}
      :mode==="mode_5_full_robust"?{kind:"FULL_SAMPLE_ROBUST",...location,...dispersion,selection_sample_bars:32}
      :{kind:"IS_ONLY_DISPERSION",...location,...dispersion}});
}
describe("FULL-04 exact source read semantics",()=>{
  it.skipIf(!process.env.FULL04_NATIVE_RETENTION_ROOT)("validates actual pinned-wheel retained summaries when a native lane is provided",()=>{
    const root=process.env.FULL04_NATIVE_RETENTION_ROOT!;
    const paths=readdirSync(root).filter(name=>/^full04-retention-(?:mode[2345]-global|mode4-causal)0$/.test(name));
    expect(paths).toHaveLength(5);
    for(const path of paths){
      const summary=JSON.parse(readFileSync(join(root,path,"retained/artifacts/rs02-current-source-artifact/documents/current_source_summary.json"),"utf8"));
      // Parse actual retained native output without manufacturing any product
      // values or rewriting the immutable source identity.
      const parsed=CurrentSourceSummarySchema.safeParse(summary);
      expect(parsed.success?null:parsed.error.issues,`${path} strict retained summary`).toBeNull();
      if(path.includes("mode5-global")){
        const scalar=resolveSealedPerformanceMetric("sharpe",{enriched:parsed.data!.enriched_analysis,analyticsV2:parsed.data!.summary_analytics_v2});
        expect(scalar).toMatchObject({scope:"FULL_SAMPLE"});
        expect(scalar!.definition_id).toContain("sealed-full-sample-");
        const service=new ResearchRunLibraryService({} as never,{...testConfig(),FEATURE_RESEARCH_EVIDENCE:"true"} as never);
        const stats=(service as unknown as {stats(row:unknown,progress:null,source:unknown,retained:unknown,sealed:unknown):unknown[]}).stats(
          {effective_status:"COMPLETED",source_kind:"RESEARCH_DURABLE"},null,{state:"AVAILABLE",reason_code:null},
          {oosTrades:2,oosTradesReason:null},{enriched:parsed.data!.enriched_analysis,analyticsV2:parsed.data!.summary_analytics_v2});
        expect(stats[0]).toMatchObject({label:"Full-sample Sharpe",scope:"FULL_SAMPLE"});
        for(const stat of stats)openApiValidator("research-run-library.openapi.json","MetricCell").assert(stat);
      }
    }
  });
  it("never coerces a non-Mode1 generic Progress objective to Mode1",()=>{
    const journal=ResearchProgressSnapshotSchema.parse(JSON.parse(readFileSync(join(__dirname,"research-progress-w2.fixture.json"),"utf8")).snapshot);
    const original=structuredClone(journal);
    for(const row of recipes.filter(recipe=>recipe.public_profile.optimization_schedule==="global")){
      const progress=toPublicResearchProgressSnapshot(journal,row.profile_id);
      expect(progress.folds[0]!.selection.objective_kind).toBe("NOT_PUBLISHED");
      expect(progress.overall.tqdm_line).toContain("best objective");
      expect(progress.claim.handoff_cursor?.trial_scope).toBe("RUN_GLOBAL");
      openApiValidator("research-progress.openapi.json","ProgressSnapshot").assert(progress);
    }
    expect(journal).toEqual(original);
    const event=ResearchProgressEventSchema.parse(JSON.parse(readFileSync(join(__dirname,"research-progress-w2.fixture.json"),"utf8")).events.find((entry:any)=>entry.event_type==="trial_completed"));
    const originalEvent=structuredClone(event),mode2=recipes.find(row=>row.public_profile.optimization_mode==="mode_2_sbb")!;
    const projected=toPublicResearchProgressEvent(event,mode2.profile_id);
    expect(projected.payload.tqdm_line).toContain("best objective");
    expect(projected.payload.console?.text).toContain("objective=");
    expect(event).toEqual(originalEvent);
  });
  it("maps exactly35method×interval pairs without assuming Mode1 causal",()=>{
    expect(recipes).toHaveLength(35);
    for(const row of recipes){
      const pair=currentSourceExecutionPair(row.profile_id,row.profile_digest)!;
      const mode=row.public_profile.optimization_mode,schedule=row.public_profile.optimization_schedule;
      expect(currentSourceRetainedMethod(pair.profile_id,pair.source_adapter_id)).toBe(mode==="mode_5_full_robust"?"FULL_SAMPLE":schedule==="per_fold_causal"?"CAUSAL_IS_ONLY":"GLOBAL_WFO");
      expect(currentSourceExecutionPair(row.profile_id,"0".repeat(64))).toBeNull();
      const local=schedule==="per_fold_causal";
      expect(selectedTrialPresentation(local?"study_1.trial_2":"2",pair.profile_id,
        local?{trial_id:"study_1.trial_2",source_trial_id:"2",study_id:"1"}:undefined)).toMatchObject({selected_trial_ordinal:3,selected_trial_ordinal_scope:local?"STUDY_LOCAL":"RUN_GLOBAL"});
    }
  });
  it("retains centroid parameters without inventing trialidentity or losing a selection",()=>{
    const d=disclosure("mode_3_flat_minima",true),facts=structuredClone(fixture.summary.source_facts);
    facts.search.optimization_mode="mode_3_flat_minima";
    const roles=selectionRoles(facts,{trial_id:null,objective:"0.5"},d);
    expect(roles.centroid).toMatchObject({state:"AVAILABLE",trial_id:null});
    const profile=recipes.find(row=>row.public_profile.optimization_mode==="mode_3_flat_minima")!.descriptor.current_source;
    expect(selectedTrialPresentation(null,profile.profile_id)).toMatchObject({selected_trial_ordinal:null,selected_trial_ordinal_scope:null,selected_trial_ordinal_reason_code:"SELECTION_HAS_NO_TRIAL"});
    expect(searchPool({facts,trials:[],candidates:[],folds:[],selectedTrialId:null,optimizerDisclosure:d}).selected).toMatchObject({state:"AVAILABLE",value:1});
    expect(CurrentSourceOptimizerDisclosureSchema.safeParse({...d,selection_target:{...d.selection_target,trial_id:"-1"}}).success).toBe(false);
  });
  it("counts the actual SBB search trials without calling a proxy mean realizedOOS",()=>{
    const facts=structuredClone(fixture.summary.source_facts);facts.search.optimization_mode="mode_2_sbb";
    const trialFacts={...fixture.rows.TRIAL[0].payload.trial_facts,stage:"sbb_search",objective_kind:"SBB_BOOTSTRAP_ROBUST_J"};
    const pool=searchPool({facts,trials:[{trialId:"0",state:"COMPLETE",objective:"0.1",facts:trialFacts}],candidates:[],folds:[],selectedTrialId:"0"});
    expect(pool.trials_evaluated.value).toBe(1);expect(pool.scored_unpruned.value).toBe(1);expect(pool.top_is_k.state).toBe("NOT_PUBLISHED");
  });
  it("Mode4 causal preserves local selection and nativeobjective without fabricated innerfolds",()=>{
    const selected=CurrentSourceMode4SelectionSchema.parse({schema_version:"research.current-source-mode4-selection.v1",scope:"OUTER_FOLD_SELECTION",study_id:"1",fold_seed:43,
      source_trial_id:"0",selected_trial_id:"study_1.trial_0",parameters:params,params_digest:sha256ResearchJson(params),objective:"0.8",objective_kind:"IS_MEAN_SHARPE",
      candidate_is_metric:"0.8",candidate_count:1,study_trial_rows:3,outer_oos_used_for_selection:false,causality_claim:"strict_fold_local_retraining",selection_sequence:0,params_frozen_at_utc_ms:null});
    const facts=structuredClone(fixture.summary.source_facts);facts.search.optimization_mode="mode_4_is_only_robust";facts.search.optimization_schedule="per_fold_causal";
    facts.claims.oos_used_for_selection=false;facts.claims.causality_claim="strict_fold_local_retraining";
    const profile=recipes.find(row=>row.public_profile.optimization_schedule==="per_fold_causal")!.descriptor.current_source;
    const ordering=foldOrdering([{foldId:"0",sourceOrdinal:0,trainStartUtcMs:0,trainEndUtcMs:10,testStartUtcMs:20,testEndUtcMs:30,childAudit:[],mode4Selection:selected}],facts,params,
      {window:"int",rsi_lower:"float",rsi_upper:"float"},undefined,profile.profile_id);
    expect(ordering.folds[0]).toMatchObject({verdict:"CAUSAL_DATA_TIME_SELECTION",selected_candidate:{study_id:"1",selected_trial_id:"study_1.trial_0"}});
    expect(ordering.folds[0]!.selected_candidate).not.toHaveProperty("inner_fold_count");
    expect(CurrentSourceMode4SelectionSchema.safeParse({...selected,inner_fold_count:2}).success).toBe(false);
    expect(CurrentSourceFoldPayloadSchema.safeParse({...fixture.rows.FOLD[0].payload,mode4_selection:selected,fold_selection:selected}).success).toBe(false);
  });
  it("Mode5 cannot receive an untouchedOOS finalaudit",()=>{
    const d=disclosure("mode_5_full_robust"),profile=recipes.find(row=>row.public_profile.optimization_mode==="mode_5_full_robust")!.descriptor.current_source;
    expect(CurrentSourceOptimizerDisclosureSchema.safeParse({...d,full_sample_used_for_selection:false}).success).toBe(false);
    const audit=retainedFinalAudit("rrun_full04_unit",null,{provenance:profile} as never,{} as never,{} as never);
    expect(audit).toMatchObject({kind:"NOT_APPLICABLE",reason_code:"FULL_SAMPLE_CALIBRATION_HAS_NO_UNTOUCHED_FINAL_AUDIT",audit_target_kind:null});
    expect(finalAuditTargetApplicable(audit)).toBe(false);
  });
  it("labels selected Mode5 drawdown as retained full-sample calibration without changing its value",()=>{
    const candidate=fixture.rows.CANDIDATE[0].payload;
    const input={candidate:{candidateId:candidate.candidate_id,objective:candidate.objective,facts:candidate.trial_facts},
      selection:fixture.summary.selection,schedule:"global",passportMaxDrawdown:"0.12345"};
    const old=candidateDrawdown(input),fullSample=candidateDrawdown({...input,fullSampleCalibration:true});
    expect(old).toEqual({state:"AVAILABLE",value:"0.12345",reason_code:null,source:"RETAINED_STITCHED_OOS_PATH"});
    expect(fullSample).toEqual({...old,source:"RETAINED_FULL_SAMPLE_CALIBRATION_PATH"});
    openApiValidator("research-current-source.openapi.json","CandidateDrawdown").assert(fullSample);
    expect(candidateDrawdown({...input,fullSampleCalibration:true,selection:{trial_id:"999",objective:null}})).toMatchObject({state:"NOT_PUBLISHED",value:null,source:null});
  });
  it("checks a global source selection and denies mismatchedmode or syntheticidentity",()=>{
    const f=structuredClone(fixture),d=disclosure("mode_4_is_only_robust"),row=recipes.find(row=>row.public_profile.optimization_mode==="mode_4_is_only_robust"&&row.public_profile.optimization_schedule==="global")!;
    d.selection_target.trial_id=f.summary.selection.trial_id;f.summary.optimizer_disclosure=d;
    Object.assign(f.summary.source_facts.search,{optimization_mode:d.optimization_mode,optimization_schedule:d.optimization_schedule});
    Object.assign(f.summary.source_facts.claims,{oos_used_for_selection:false,full_sample_used_for_selection:false});
    const input={profileId:row.descriptor.current_source.profile_id,sourceAdapterId:row.descriptor.current_source.source_adapter_id,tableRows:f.table_rows,summary:f.summary};
    const rows=["FOLD","TRIAL","CANDIDATE","SELECTION"].flatMap(tableKind=>f.rows[tableKind].map((member:any)=>({...member,tableKind})));
    expect(()=>assertFull04SealConsistency(input,rows)).not.toThrow();
    d.optimization_mode="mode_5_full_robust";expect(()=>assertFull04SealConsistency(input,rows)).toThrow();
  });
  it("joins Mode4 causal candidate evaluations by explicit local trial identity, never evaluation ID",()=>{
    // Synthetic regression for the native evaluation-suffixed candidate IDs
    // observed in failed product run rrun_fb0a77763ef9169b131cf9a13ff8bea4.
    const f=structuredClone(fixture),row=recipes.find(recipe=>recipe.public_profile.optimization_schedule==="per_fold_causal")!;
    const d=disclosure("mode_4_is_only_robust");d.optimization_schedule="per_fold_causal";
    d.selection_target.kind="STUDY_LOCAL_TRIAL";d.selection_target.trial_id="study_1.trial_0";
    f.summary.optimizer_disclosure=d;
    Object.assign(f.summary.source_facts.search,{optimization_mode:d.optimization_mode,optimization_schedule:d.optimization_schedule,n_studies:2});
    Object.assign(f.summary.source_facts.claims,{oos_used_for_selection:false,full_sample_used_for_selection:false,causality_claim:"strict_fold_local_retraining"});
    const selection={trial_id:"study_1.trial_0",objective:"0.8",parameters:params,scope:"LAST_FOLD_DEPLOYMENT",fold_id:"1"};
    f.summary.selection=selection;
    const rows:Array<{tableKind:string;sourceId:string;sourceOrdinal:number;payload:any}>=[];
    for(let fold=0;fold<2;fold++){
      const study=String(fold),nativeTrial=`study_${study}.trial_0`;
      const block={schema_version:"research.current-source-mode4-selection.v1",scope:"OUTER_FOLD_SELECTION",study_id:study,fold_seed:42+fold,
        source_trial_id:"0",selected_trial_id:nativeTrial,parameters:params,params_digest:sha256ResearchJson(params),objective:"0.8",objective_kind:"IS_MEAN_SHARPE",
        candidate_is_metric:"0.8",candidate_count:2,study_trial_rows:3,outer_oos_used_for_selection:false,causality_claim:"strict_fold_local_retraining",selection_sequence:fold,params_frozen_at_utc_ms:null};
      rows.push({tableKind:"FOLD",sourceId:study,sourceOrdinal:fold,payload:{...f.rows.FOLD[fold].payload,fold_id:study,mode4_selection:block}});
      for(let trial=0;trial<3;trial++)rows.push({tableKind:"TRIAL",sourceId:`study_${study}.trial_${trial}`,sourceOrdinal:fold*3+trial,
        payload:{state:"COMPLETE",objective:"0.8",parameters:params,trial_facts:{study_id:study,source_trial_id:String(trial),objective_kind:"IS_MEAN_SHARPE",fold_scope:{kind:"FOLD",fold_id:study}}}});
      for(let evaluation=0;evaluation<2;evaluation++)rows.push({tableKind:"CANDIDATE",sourceId:`${nativeTrial}.evaluation_${fold*2+evaluation}`,sourceOrdinal:fold*2+evaluation,
        payload:{objective:"0.8",parameters:params,trial_facts:{study_id:study,source_trial_id:"0",objective_kind:"IS_MEAN_SHARPE",fold_scope:{kind:"FOLD",fold_id:study}}}});
    }
    rows.push({tableKind:"SELECTION",sourceId:"SELECTED",sourceOrdinal:0,payload:selection});
    const input={profileId:row.descriptor.current_source.profile_id,sourceAdapterId:row.descriptor.current_source.source_adapter_id,tableRows:{FOLD:2,TRIAL:6,CANDIDATE:4,SELECTION:1},summary:f.summary};
    expect(()=>assertFull04SealConsistency(input,rows)).not.toThrow();
    const wrong=structuredClone(rows);for(const candidate of wrong.filter(member=>member.tableKind==="CANDIDATE"))candidate.payload.trial_facts.source_trial_id="2";
    expect(()=>assertFull04SealConsistency(input,wrong)).toThrow();
  });
});
