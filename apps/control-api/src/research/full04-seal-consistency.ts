/** FULL-04 mode facts are checked against exact retained selection/populations.
 * IS-only study selection is not Mode 1 inner validation; centroid is not a trial. */
import {CurrentSourceFoldPayloadSchema,CurrentSourceSummarySchema} from "./current-source.payload";
import {ResearchCurrentSourceError} from "./current-source.error";
import {sha256ResearchJson} from "./preflight.service";
import {currentSourceRetainedMethod,currentSourceRetainedRecipe,currentSourceStudyTrialCount} from "./current-source-profile";
import {retainedStudyTrialCountAdmitted} from "./early-stopping";

type Row={tableKind:string;sourceOrdinal:number;sourceId:string;payload:Record<string,unknown>};
export function assertFull04SealConsistency(input:{profileId:string;sourceAdapterId:string;tableRows:Record<string,number>;summary:Record<string,unknown>},rows:Row[],requestedSpec?:Readonly<Record<string,unknown>>):void {
  const fail=():never=>{throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_CONFLICT","Optimizer source facts do not match the admitted mode, selection or population.",409);};
  const parsed=CurrentSourceSummarySchema.safeParse(input.summary);
  const recipe=currentSourceRetainedRecipe(input.profileId,input.sourceAdapterId);
  if(!parsed.success || !recipe || recipe.public_profile.optimization_mode==="mode_1_decay")return fail();
  const summary=parsed.data,disclosure=summary.optimizer_disclosure,facts=summary.source_facts;
  const configuredTrials=currentSourceStudyTrialCount(recipe,facts?.search.optuna_trials_per_study);
  if(configuredTrials===null)return fail();
  if(!disclosure || !facts || disclosure.optimization_mode!==recipe.public_profile.optimization_mode
    || disclosure.optimization_schedule!==recipe.public_profile.optimization_schedule
    || facts.search.optimization_mode!==disclosure.optimization_mode || facts.search.optimization_schedule!==disclosure.optimization_schedule
    || facts.claims.oos_used_for_selection!==disclosure.oos_used_for_selection
    || facts.claims.full_sample_used_for_selection!==disclosure.full_sample_used_for_selection
    || summary.selection.trial_id!==disclosure.selection_target.trial_id)return fail();
  const folds=rows.filter(row=>row.tableKind==="FOLD").sort((a,b)=>a.sourceOrdinal-b.sourceOrdinal);
  const trials=rows.filter(row=>row.tableKind==="TRIAL"),candidates=rows.filter(row=>row.tableKind==="CANDIDATE");
  const selected=rows.filter(row=>row.tableKind==="SELECTION");
  const singleton=selected[0]?.payload;
  if(folds.length!==input.tableRows.FOLD || trials.length!==input.tableRows.TRIAL
    || candidates.length!==input.tableRows.CANDIDATE || selected.length!==1
    || singleton?.trial_id!==summary.selection.trial_id || singleton?.objective!==summary.selection.objective
    || singleton?.scope!==summary.selection.scope || singleton?.fold_id!==summary.selection.fold_id
    || sha256ResearchJson(singleton?.parameters)!==sha256ResearchJson(summary.selection.parameters))return fail();
  if(disclosure.selection_target.kind==="SYNTHETIC_CENTROID") {
    if(!disclosure.centroid || sha256ResearchJson(disclosure.centroid.parameters)!==sha256ResearchJson(summary.selection.parameters)
      || summary.selection.trial_id!==null)return fail();
  }else{
    const trial=trials.find(row=>row.sourceId===summary.selection.trial_id);
    if(!trial || trial.payload.state!=="COMPLETE" || sha256ResearchJson(trial.payload.parameters)!==sha256ResearchJson(summary.selection.parameters))return fail();
  }
  const method=currentSourceRetainedMethod(input.profileId,input.sourceAdapterId);
  if(method==="FULL_SAMPLE") {
    if(folds.length!==1 || disclosure.calibration_sample!=="FULL_SAMPLE" || !disclosure.full_sample_used_for_selection
      || disclosure.oos_used_for_selection || facts.claims.validation_claim!=="none_full_sample_calibration")return fail();
    const fold=CurrentSourceFoldPayloadSchema.safeParse(folds[0]!.payload);
    if(!fold.success || fold.data.train_start_utc_ms!==fold.data.test_start_utc_ms || fold.data.train_end_utc_ms!==fold.data.test_end_utc_ms
      || fold.data.causal_selection || fold.data.fold_selection || fold.data.mode4_selection)return fail();
  }
  if(method!=="CAUSAL_IS_ONLY")return;
  if(folds.length<2 || folds.length>16 || !retainedStudyTrialCountAdmitted(trials.length,configuredTrials,requestedSpec,folds.length) || disclosure.selection_target.kind!=="STUDY_LOCAL_TRIAL"
    || summary.selection.scope!=="LAST_FOLD_DEPLOYMENT" || facts.search.n_studies!==folds.length)return fail();
  const studies=new Set<string>();
  for(const [ordinal,row] of folds.entries()){
    const parsedFold=CurrentSourceFoldPayloadSchema.safeParse(row.payload);
    if(!parsedFold.success || parsedFold.data.fold_id!==row.sourceId || row.sourceOrdinal!==ordinal)return fail();
    const fold=parsedFold.data,selection=fold.mode4_selection;
    if(!selection || fold.causal_selection || fold.fold_selection || studies.has(selection.study_id)
      || selection.selection_sequence!==ordinal || selection.params_digest!==sha256ResearchJson(selection.parameters)
      || fold.train_end_utc_ms===null || fold.test_start_utc_ms===null || fold.train_end_utc_ms>=fold.test_start_utc_ms)return fail();
    studies.add(selection.study_id);
    const members=(source:Row[])=>source.filter(member=>(member.payload.trial_facts as {study_id?:string}|undefined)?.study_id===selection.study_id);
    const studyTrials=members(trials),studyCandidates=members(candidates);
    if(!retainedStudyTrialCountAdmitted(studyTrials.length,configuredTrials,requestedSpec) || selection.study_trial_rows!==studyTrials.length
      || studyCandidates.length!==selection.candidate_count || studyCandidates.length>configuredTrials
      || [...studyTrials,...studyCandidates].some(member=>{
        const scope=(member.payload.trial_facts as {fold_scope?:{kind:string;fold_id:string}}|undefined)?.fold_scope;
        return !scope || !["FOLD","PER_FOLD_STUDY"].includes(scope.kind) || scope.fold_id!==row.sourceId;
      }))return fail();
    const trial=studyTrials.find(member=>member.sourceId===selection.selected_trial_id);
    // Candidate IDs identify native evaluations, not trials. The engine can
    // retain multiple evaluation records of one selected native trial.
    // Join only through its explicit study-local source identity and facts.
    const candidate=studyCandidates.find(member=>{
      const facts=member.payload.trial_facts as {source_trial_id?:string;objective_kind?:string}|undefined;
      return facts?.source_trial_id===selection.source_trial_id && facts.objective_kind===selection.objective_kind
        && member.payload.objective===selection.objective
        && sha256ResearchJson(member.payload.parameters)===selection.params_digest;
    });
    if(!trial || !candidate || trial.payload.state!=="COMPLETE" || candidate.payload.objective!==selection.objective
      || sha256ResearchJson(trial.payload.parameters)!==selection.params_digest || sha256ResearchJson(candidate.payload.parameters)!==selection.params_digest)return fail();
  }
  if([...trials,...candidates].some(row=>!studies.has(String((row.payload.trial_facts as {study_id?:string}|undefined)?.study_id))))return fail();
  const last=CurrentSourceFoldPayloadSchema.parse(folds.at(-1)!.payload).mode4_selection!;
  if(summary.selection.fold_id!==folds.at(-1)!.sourceId || summary.selection.trial_id!==last.selected_trial_id
    || summary.selection.objective!==last.objective || sha256ResearchJson(summary.selection.parameters)!==last.params_digest)return fail();
}
