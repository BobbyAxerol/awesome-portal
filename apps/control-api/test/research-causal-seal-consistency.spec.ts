/** Synthetic custody graph negatives, not an engine receipt. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { assertCausalSealConsistency } from "../src/research/causal-seal-consistency";
import { CurrentSourceFoldPayloadSchema } from "../src/research/current-source.payload";

const historical = JSON.parse(gunzipSync(readFileSync(join(__dirname,"research-w5b-real-replay.fixture.json.gz"))).toString("utf8"));
function graph(candidateCount=1) {
  const summary = structuredClone(historical.summary);
  const folds = historical.rows.FOLD.map((row: any,index: number) => {
    const payload = structuredClone(row.payload), start = payload.train_start_utc_ms;
    payload.fold_facts.oos_score=null; // Native causal capture never publishes a global/inner best-trial score here.
    payload.causal_selection = { schema_version:"research.current-source-causal-selection.v1",scope:"OUTER_FOLD_SELECTION",
      study_id:String(index),fold_seed:42+index,selected_trial_id:`${index}.trial_0`,parameters:{...summary.selection.parameters,window:String(34+index)},
      objective:"0.5",objective_kind:"INNER_VALIDATION_DECAY_J",candidate_is_metric:"0.8",candidate_oos_metric:"0.6",candidate_decay:"0.2",
      candidate_metrics_scope:"OUTER_FOLD_POST_SELECTION",candidate_count:candidateCount,study_trial_rows:3,outer_oos_used_for_selection:false,
      candidate_is_scope:"INNER_VALIDATION_IS_MEAN",candidate_oos_scope:"OUTER_FOLD_OOS",candidate_decay_scope:"INNER_IS_MEAN_MINUS_OUTER_OOS",
      causality_claim:"strict_nested_fold_local_retraining",inner_fold_count:2,
      inner_validation:{inner_split_frequency:"weekly",inner_window_mode:"expanding",inner_train_window:"7D",inner_min_folds:2},
      inner_folds:[0,1].map(inner => ({inner_fold_id:String(inner),train_start_utc_ms:start,
        train_end_utc_ms:start+1000*(inner+1),test_start_utc_ms:start+1000*(inner+1)+1,
        test_end_utc_ms:start+1000*(inner+1)+999,outer_oos_used_for_selection:false})) };
    CurrentSourceFoldPayloadSchema.parse(payload);
    return { tableKind:"FOLD",sourceOrdinal:index,sourceId:payload.fold_id,payload };
  });
  const trials=folds.flatMap((fold: any,index: number) => [0,1,2].map(local=>({tableKind:"TRIAL",sourceOrdinal:index*3+local,
    sourceId:`${index}.trial_${local}`,payload:{state:"COMPLETE",parameters:fold.payload.causal_selection.parameters,objective:"0.9",
      trial_facts:{stage:"is_search",objective_kind:"IS_MEAN_SHARPE",pruned:false,study_id:String(index),source_trial_id:String(local),fold_scope:{kind:"FOLD",fold_id:fold.sourceId,reason_code:null}}}})));
  const candidates=trials.filter((row: any)=>Number(row.payload.trial_facts.source_trial_id)<candidateCount).map((row: any,index: number)=>({...row,tableKind:"CANDIDATE",sourceOrdinal:index,
    payload:{...structuredClone(row.payload),objective:"0.5",trial_facts:{...structuredClone(row.payload.trial_facts),stage:"oos_candidate_selection",objective_kind:"MODE_1_DECAY_J"}}}));
  const last=folds.at(-1)!;
  const selection={scope:"LAST_FOLD_DEPLOYMENT",fold_id:last.sourceId,trial_id:last.payload.causal_selection.selected_trial_id,
    objective:"0.5",parameters:last.payload.causal_selection.parameters};
  summary.selection=selection;
  Object.assign(summary.source_facts.search,{n_studies:folds.length,optimization_schedule:"per_fold_causal"});
  Object.assign(summary.source_facts.claims,{oos_used_for_selection:false,causality_claim:"strict_nested_fold_local_retraining"});
  summary.source_facts.temporal_guards.observed_inner_fold_count=folds.length*2;
  summary.counts={folds:folds.length,trials:trials.length,candidates:candidates.length};
  return { input:{tableRows:{FOLD:folds.length,TRIAL:trials.length,CANDIDATE:candidates.length,SELECTION:1},summary},
    authority:{requestedSpec:{schema_version:"research.requested-spec.v2",optimization_schedule:"per_fold_causal",data:{timeframe:"1h"},
      walk_forward:{inner:{split_frequency:"weekly",window_mode:"expanding",train_window:"7D",min_folds:2}}},
      topology:{plan_source:"quantbt.walkforward.WalkForwardEngine.build_folds",folds:folds.map(fold=>({inner_fold_count:2,
        train:{start_utc_ms:fold.payload.train_start_utc_ms,end_exclusive_utc_ms:fold.payload.train_end_utc_ms+3_600_000},
        outer_oos:{start_utc_ms:fold.payload.test_start_utc_ms,end_exclusive_utc_ms:fold.payload.test_end_utc_ms+3_600_000}}))}},
    rows:[...folds,...trials,...candidates,{tableKind:"SELECTION",sourceOrdinal:0,sourceId:"selected",payload:selection}] };
}
describe("causal seal relation binding",()=>{
  it("accepts exactly bounded own-study sources and final-fold deployment",()=>{
    const g=graph();expect(()=>assertCausalSealConsistency(g.input,g.rows,g.authority)).not.toThrow();
  });
  it("accepts correctly scoped nonselected candidates and legitimately pruned nonselected Stage-A trials",()=>{
    const multiple=graph(2);expect(()=>assertCausalSealConsistency(multiple.input,multiple.rows,multiple.authority)).not.toThrow();
    const g=graph(),pruned=g.rows.find(row=>row.tableKind==="TRIAL" && (row.payload as any).trial_facts.source_trial_id==="1")!;
    Object.assign(pruned.payload,{state:"PRUNED",objective:null});
    (pruned.payload as any).trial_facts.pruned=true;
    expect(()=>assertCausalSealConsistency(g.input,g.rows,g.authority)).not.toThrow();
  });
  it.each([
    ["TRIAL","stage","oos_candidate_selection"],
    ["TRIAL","objective_kind","MODE_1_DECAY_J"],
    ["CANDIDATE","stage","is_search"],
    ["CANDIDATE","objective_kind","IS_MEAN_SHARPE"],
  ])("refuses wrong %s %s on every selected and nonselected row",(tableKind,key,value)=>{
    const members=graph(2).rows.filter(row=>row.tableKind===tableKind);
    for(const member of members) {
      const g=graph(2),row=g.rows.find(candidate=>candidate.tableKind===tableKind && candidate.sourceOrdinal===member.sourceOrdinal)!;
      (row.payload as any).trial_facts[key]=value;
      expect(()=>assertCausalSealConsistency(g.input,g.rows,g.authority)).toThrow("Causal selections do not match");
    }
  });
  it.each(["wrong params","wrong objective","wrong fold","extra study","inner count","global fallback","summary mismatch","last fold mismatch","candidate study","candidate scope","pruned selected","immutable inner pin","shifted outer window","contradictory fold claim","wrong bar interval","sparse fold ordinal","mixed legacy inner score"])("refuses %s atomically",name=>{
    const g=graph(),fold=g.rows.find(row=>row.tableKind==="FOLD")!,trial=g.rows.find(row=>row.tableKind==="TRIAL")!;
    if(name==="wrong params")trial.payload=structuredClone(trial.payload), (trial.payload as any).parameters.window="999";
    if(name==="wrong objective")(g.rows.find(row=>row.tableKind==="CANDIDATE")!.payload as any).objective="999";
    if(name==="wrong fold")(trial.payload as any).trial_facts.fold_scope.fold_id="other";
    if(name==="extra study")(trial.payload as any).trial_facts.study_id="other";
    if(name==="inner count")g.input.summary.source_facts.temporal_guards.observed_inner_fold_count=2;
    if(name==="global fallback")g.input.summary.source_facts.search.optimization_schedule="global";
    if(name==="summary mismatch")g.input.summary.selection={...g.input.summary.selection,objective:"999"};
    if(name==="last fold mismatch")g.input.summary.selection={...g.input.summary.selection,fold_id:fold.sourceId};
    if(name==="candidate study")(g.rows.find(row=>row.tableKind==="CANDIDATE")!.payload as any).trial_facts.study_id="1";
    if(name==="candidate scope")(g.rows.find(row=>row.tableKind==="CANDIDATE")!.payload as any).trial_facts.fold_scope.fold_id="other";
    if(name==="pruned selected")(trial.payload as any).trial_facts.pruned=true;
    if(name==="immutable inner pin")g.authority.requestedSpec.walk_forward.inner.train_window="14D";
    if(name==="shifted outer window") {
      for(const key of ["train_start_utc_ms","train_end_utc_ms","test_start_utc_ms","test_end_utc_ms"])(fold.payload as any)[key]+=3_600_000;
      for(const inner of (fold.payload as any).causal_selection.inner_folds)for(const key of ["train_start_utc_ms","train_end_utc_ms","test_start_utc_ms","test_end_utc_ms"])inner[key]+=3_600_000;
    }
    if(name==="contradictory fold claim")(fold.payload as any).causal_selection.causality_claim="global_selection_evaluates_outer_oos";
    if(name==="wrong bar interval")g.authority.requestedSpec.data.timeframe="1d";
    if(name==="sparse fold ordinal")fold.sourceOrdinal=99;
    if(name==="mixed legacy inner score")(fold.payload as any).fold_facts.oos_score=structuredClone(historical.rows.FOLD[0].payload.fold_facts.oos_score);
    expect(()=>assertCausalSealConsistency(g.input,g.rows,g.authority)).toThrow("Causal selections do not match");
  });
});
