/** Synthetic read-model/contract units only, not FULL-02 qualification evidence. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { CurrentSourceFoldSelectionSchema, CurrentSourceFoldPayloadSchema, CurrentSourceProtocolDisclosureSchema } from "../src/research/current-source.payload";
import { DELTA_PER_FOLD_DECAY_PROFILE, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE,
  DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_PER_FOLD_DECAY_PROFILE_DIGEST,
  DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST } from "../src/research/full02.profiles";
import { currentSourceExecutionPair,isCurrentSourceExecutionProfile } from "../src/research/current-source-profile";
import { DEFAULT_PARAMETER_BINDING_REGISTRY } from "../src/research/parameter-binding.registry";
import { p11StageEvents } from "../src/research/p11-stage-events";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { quantbtCandidateId } from "../src/research/fold-ordering";
import { assertFull02SealConsistency } from "../src/research/full02-seal-consistency";
import { selectedTrialPresentation } from "../src/research/selected-trial-presentation";
import { retainedFinalAudit } from "../src/research/report-core-v2";
import { ResearchCurrentSourceSplitResponseSchema } from "../src/research/current-source.contract";
import { claimStrip,searchContract } from "../src/research/current-source-facts";
import { executionRecipes } from "../src/research/execution-recipes";

const original = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8"));
const scope = { workspaceId: "full02-unit-workspace", actorUserId: "full02-unit-user" };
const config = { FEATURE_RESEARCH_CURRENT_SOURCE: "true", QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}', QUERY_CURSOR_TTL_SECONDS: 900 };

function decaySource() {
  const f = structuredClone(original);
  const kinds = DEFAULT_PARAMETER_BINDING_REGISTRY.byRetainedLaneProfile(DELTA_PER_FOLD_DECAY_PROFILE.current_source.profile_id)!.candidateParameterKinds;
  f.rows.FOLD.forEach((row: any, index: number) => {
    const parameters = { ...f.summary.selection.parameters, window: String(34 + index) };
    row.payload.fold_selection = CurrentSourceFoldSelectionSchema.parse({
      schema_version: "research.current-source-fold-selection.v1", scope: "OUTER_FOLD_SELECTION", study_id: String(index),
      selected_trial_id: `study_${index}.trial_0`, parameters, objective: "0.5", objective_kind: "OUTER_FOLD_DECAY_J",
      candidate_is_metric: "0.8", candidate_oos_metric: "0.6", candidate_decay: "0.2", candidate_count: 1,
      study_trial_rows: 3, outer_oos_used_for_selection: true, params_digest: sha256ResearchJson(parameters),
      selection_sequence: index, params_frozen_at_utc_ms: null,
    });
    row.payload.child_audit.records.forEach((record: any) => { record.candidate_id = quantbtCandidateId(parameters,kinds); });
    CurrentSourceFoldPayloadSchema.parse(row.payload);
  });
  f.rows.TRIAL = f.rows.FOLD.flatMap((fold: any,index: number) => original.rows.TRIAL.map((row: any,local: number) => ({
    ...structuredClone(row), sourceOrdinal: index*3+local, sourceId: `study_${index}.trial_${local}`,
    payload: { ...structuredClone(row.payload), trial_id: `study_${index}.trial_${local}`,
      ...(local === 0 ? { parameters: structuredClone(fold.payload.fold_selection.parameters), state: "COMPLETE" } : {}),
      trial_facts: { ...structuredClone(row.payload.trial_facts), study_id: String(index), source_trial_id: String(local),
        stage: "is_search", objective_kind: "IS_MEAN_SHARPE", fold_scope: { kind: "FOLD", fold_id: fold.payload.fold_id, reason_code: null } } },
  })));
  f.rows.CANDIDATE = f.rows.FOLD.map((fold: any,index: number) => {
    const selected = fold.payload.fold_selection, row = structuredClone(original.rows.CANDIDATE[0]);
    return { ...row, sourceOrdinal: index, sourceId: selected.selected_trial_id,
      payload: { ...row.payload, candidate_id: selected.selected_trial_id, parameters: selected.parameters, objective: selected.objective,
        trial_facts: { ...row.payload.trial_facts, stage: "oos_candidate_selection", objective_kind: "MODE_1_DECAY_J", pruned: false,
          study_id: String(index), source_trial_id: "0", fold_scope: { kind: "FOLD", fold_id: fold.payload.fold_id, reason_code: null } } } };
  });
  const last = f.rows.FOLD.at(-1).payload;
  f.summary.selection = { scope: "LAST_FOLD_DEPLOYMENT", fold_id: last.fold_id,
    trial_id: last.fold_selection.selected_trial_id, objective: last.fold_selection.objective, parameters: last.fold_selection.parameters };
  f.rows.SELECTION[0].payload = { ...f.summary.selection, selection_role: "selected" };
  Object.assign(f.summary.source_facts.claims, { oos_used_for_selection: true });
  Object.assign(f.summary.source_facts.search, { optimization_schedule: "per_fold_decay", n_studies: 2, optuna_trials_scope: "per_fold",
    selected_trial_id: f.summary.selection.trial_id, raw_best_is_trial_id: null, raw_best_is_objective: null });
  f.table_rows.TRIAL = f.rows.TRIAL.length; f.table_rows.CANDIDATE = f.rows.CANDIDATE.length;
  if (f.summary.counts) Object.assign(f.summary.counts, { trials: f.rows.TRIAL.length, candidates: f.rows.CANDIDATE.length });
  return f;
}
function reader(f: any, profile = DELTA_PER_FOLD_DECAY_PROFILE.current_source) {
  const seal = { runId: f.run_id, artifactRevision: 1, sourceAdapterId: profile.source_adapter_id, profileId: profile.profile_id,
    manifestDigest: f.manifest_digest, sourceTransformDigest: f.source_transform_digest, retainedImportDigest: "f".repeat(64),
    requestedSpecDigest: "1".repeat(64), effectiveSpecDigest: "2".repeat(64), datasetBindingDigest: "3".repeat(64),
    tableRows: f.table_rows, totalRows: Object.values(f.table_rows as Record<string,number>).reduce((a,b) => a+b,0),
    summary: f.summary, retainedAtUtcMs: 1_790_269_236_911 };
  const repository = { sealForRead: vi.fn().mockResolvedValue(seal), stageEventClocks: vi.fn().mockResolvedValue(p11StageEvents()),
    admittedRequestedSpec: vi.fn().mockResolvedValue(null), verifyRetainedImport: vi.fn().mockResolvedValue("f".repeat(64)),
    searchForRead: vi.fn().mockResolvedValue({ seal, inputs: { requestedSpec: null, trials: f.rows.TRIAL,
      candidates: f.rows.CANDIDATE, folds: f.rows.FOLD, stageEvents: p11StageEvents() } }),
    rows: vi.fn(async (_scope: unknown,_run: string,_revision: number,kind: string,q: {limit: number}) => ({
      rows: f.rows[kind].slice(0,q.limit), hasMore: f.rows[kind].length > q.limit, hasPrevious: false, totalRows: f.rows[kind].length })) };
  return { seal, service: new ResearchCurrentSourceService(repository as never,config as never) };
}
function rowsForCheck(f: any) {
  return ["FOLD","TRIAL","CANDIDATE","SELECTION"].flatMap(tableKind => f.rows[tableKind].map((row: any) => ({ ...row,tableKind })));
}
function protocol() {
  const window = (start: number) => ({ start_utc_ms: start, end_exclusive_utc_ms: start+3_600_000, bar_count: 1 });
  const point = (start: number) => ({ at_utc_ms: start, equity: "20000", return_fraction: "0", accepted_position: "0", drawdown_fraction: "0", signal_target: null });
  return CurrentSourceProtocolDisclosureSchema.parse({
    schema_version: "research.current-source-protocol-disclosure.v1", protocol: "three_window_decay", engine_operation: "train_test_split",
    calibration_scope: "IS_OOS_ONLY", observation_scope: "OOS_SELECTION_INPUT", windows: { is: window(0),oos: window(3_600_000),holdout: window(7_200_000) },
    independent_holdout: { ...window(7_200_000), state: "AVAILABLE", holdout_used_for_selection: false, selected_params_digest: sha256ResearchJson({ window: "34" }),freeze_before_holdout: true },
    window_series: { is: [point(0)],oos: [point(3_600_000)],holdout: [point(7_200_000)] },
  });
}

describe("FULL-02 exact retained semantics (unit only)", () => {
  it.each(executionRecipes.filter(row=>row.source_requirement==="FULL03_IMMUTABLE_DELTA_BINDING"
    && row.adapter_kind==="DELTA_THREE_WINDOW_OPTIMIZED"))("checks Three calibration endpoints with $profile_id's native interval",row=>{
    const f=structuredClone(original),p=protocol();
    const descriptor=row.descriptor as {source_clock:{bar_interval_ms:number};current_source:{source_adapter_id:string;profile_id:string}};
    const interval=descriptor.source_clock.bar_interval_ms;
    for(const [index,key] of (["is","oos","holdout"] as const).entries()) {
      p.windows[key]={start_utc_ms:index*interval,end_exclusive_utc_ms:(index+1)*interval,bar_count:1};
      p.window_series[key][0]!.at_utc_ms=index*interval;
    }
    p.independent_holdout={...p.independent_holdout,...p.windows.holdout,
      selected_params_digest:sha256ResearchJson(f.summary.selection.parameters)};
    f.rows.FOLD=f.rows.FOLD.slice(0,1);f.table_rows.FOLD=1;
    Object.assign(f.rows.FOLD[0].payload,{train_start_utc_ms:0,train_end_utc_ms:0,
      test_start_utc_ms:interval,test_end_utc_ms:interval});
    f.summary.protocol_disclosure=p;
    f.summary.source_facts.search.optimization_schedule="global";
    f.summary.source_facts.claims.oos_used_for_selection=true;
    if(f.summary.counts) f.summary.counts.folds=1;
    const input={profileId:descriptor.current_source.profile_id,sourceAdapterId:descriptor.current_source.source_adapter_id,
      tableRows:f.table_rows,summary:f.summary};
    expect(()=>assertFull02SealConsistency(input,rowsForCheck(f))).not.toThrow();
    f.rows.FOLD[0].payload.test_end_utc_ms++;
    expect(()=>assertFull02SealConsistency(input,rowsForCheck(f))).toThrow();
  });
  it("serves the one native Three Window calibration fold without widening historical WFO bounds",async()=>{
    const f=structuredClone(original);
    f.rows.FOLD=f.rows.FOLD.slice(0,1);f.table_rows.FOLD=1;
    f.summary.protocol_disclosure=protocol();
    const {service}=reader(f,DELTA_THREE_WINDOW_OPTIMIZED_PROFILE.current_source);
    const split=await service.split(scope,f.run_id) as any;
    expect(split.fold_plan.chronology).toBe("SOURCE_OBSERVED_THREE_WINDOW");
    expect(split.fold_plan.folds).toHaveLength(1);
    expect(ResearchCurrentSourceSplitResponseSchema.safeParse({...split,fold_plan:{...split.fold_plan,
      chronology:"SOURCE_OBSERVED_ADVANCED_WFO"}}).success).toBe(false);
    expect(ResearchCurrentSourceSplitResponseSchema.safeParse({...split,fold_plan:{...split.fold_plan,
      folds:[...split.fold_plan.folds,...split.fold_plan.folds]}}).success).toBe(false);
  });
  it("admits retained custody only for the exact recipe digest, including non-WFO Three Window",()=>{
    for(const [id,digest,pair] of [
      [DELTA_PER_FOLD_DECAY_PROFILE_ID,DELTA_PER_FOLD_DECAY_PROFILE_DIGEST,DELTA_PER_FOLD_DECAY_PROFILE.current_source],
      [DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID,DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_DIGEST,DELTA_THREE_WINDOW_OPTIMIZED_PROFILE.current_source],
    ] as const){
      expect(currentSourceExecutionPair(id,digest)).toEqual(pair);
      expect(isCurrentSourceExecutionProfile(id,digest)).toBe(true);
      expect(currentSourceExecutionPair(id,"0".repeat(64))).toBeNull();
    }
    expect(currentSourceExecutionPair("p04.delta-rsi.v1",DELTA_PER_FOLD_DECAY_PROFILE_DIGEST)).toBeNull();
    expect(currentSourceExecutionPair(undefined,undefined)).toBeNull();
  });
  it("rejects decay masquerading as causal, mixing both selections or using a run-global ordinal", () => {
    const f = decaySource(), selected = f.rows.FOLD[0].payload.fold_selection;
    expect(CurrentSourceFoldSelectionSchema.safeParse({ ...selected,outer_oos_used_for_selection: false }).success).toBe(false);
    expect(CurrentSourceFoldPayloadSchema.safeParse({ ...f.rows.FOLD[0].payload,causal_selection: selected }).success).toBe(false);
    expect(selectedTrialPresentation(selected.selected_trial_id,DELTA_PER_FOLD_DECAY_PROFILE.current_source.profile_id,
      { trial_id: selected.selected_trial_id,source_trial_id: "0",study_id: selected.study_id })).toMatchObject({ selected_trial_ordinal: 1,selected_trial_ordinal_scope: "STUDY_LOCAL" });
    expect(selectedTrialPresentation(selected.selected_trial_id,DELTA_PER_FOLD_DECAY_PROFILE.current_source.profile_id).selected_trial_ordinal).toBeNull();
  });
  it("checks every native study population, params digest and last-fold deployment before sealing", () => {
    const f = decaySource(), input = { profileId: DELTA_PER_FOLD_DECAY_PROFILE.current_source.profile_id,tableRows: f.table_rows,summary: f.summary };
    expect(() => assertFull02SealConsistency(input,rowsForCheck(f))).not.toThrow();
    const altered = structuredClone(f); altered.rows.FOLD[0].payload.fold_selection.params_digest = "a".repeat(64);
    expect(() => assertFull02SealConsistency(input,rowsForCheck(altered))).toThrow();
    altered.rows.FOLD[0].payload.fold_selection.params_digest = f.rows.FOLD[0].payload.fold_selection.params_digest;
    altered.rows.TRIAL[0].payload.trial_facts.study_id = "another-study";
    expect(() => assertFull02SealConsistency(input,rowsForCheck(altered))).toThrow();
  });
  it("serves study-scoped Search, truthful noncausal Freeze and own-fold Replay without inventing theta/K", async () => {
    const f = decaySource(), { service } = reader(f);
    const split = await service.split(scope,f.run_id) as any;
    expect(split.fold_plan.folds.map((fold: any) => fold.fold_selection.selected_trial_ordinal)).toEqual([1,1]);
    const search = await service.search(scope,f.run_id,{ limit: 20 }) as any;
    expect(search.surface.state).toBe("NOT_APPLICABLE");
    expect(search.surfaces_by_study.map((study: any) => study.scope)).toEqual(["OUTER_FOLD_DECAY_STUDY","OUTER_FOLD_DECAY_STUDY"]);
    expect(search.selection.objective_kind).toBe("OUTER_FOLD_DECAY_J");
    expect(search.selection.selected_trial_ordinal_scope).toBe("STUDY_LOCAL");
    expect(search.pool.top_is_k.value).toBeNull();
    const freeze = await service.freeze(scope,f.run_id) as any;
    expect(freeze.fold_ordering.folds.map((row: any) => row.verdict)).toEqual(["NOT_CAUSAL_OUTER_OOS_SELECTION","NOT_CAUSAL_OUTER_OOS_SELECTION"]);
    expect(freeze.fold_ordering.frozen_candidate.candidate_id).toBeNull();
    expect(freeze.stage4_binding.rows[0].source_key).toBe("rs02.fold.fold_selection.parameters");
    const replay = await service.replay(scope,f.run_id,{ limit: 10 }) as any;
    expect(replay.execution.fold_capital.segments.map((segment: any) => segment.params_digest))
      .toEqual(f.rows.FOLD.map((row: any) => row.payload.fold_selection.params_digest));
    const audit = retainedFinalAudit(f.run_id,{ relationship: "PRIMARY" } as never,freeze,search,replay);
    expect(audit.audit_target_kind).toBe("PER_FOLD_PARAMETER_SELECTIONS");
    expect(audit.optimizer_reinvoked).toBe(false);
  });
  it("binds fold-filter cursors to the requested study and refuses absent per-fold selections", async () => {
    const f = decaySource(), { service } = reader(f);
    const first = await service.search(scope,f.run_id,{ limit: 1,fold: "0" }) as any;
    expect(first.ledger.page.next_cursor).toBeTruthy();
    await expect(service.search(scope,f.run_id,{ limit: 1,fold: "1",cursor: first.ledger.page.next_cursor })).rejects.toThrow();
    delete f.rows.FOLD[0].payload.fold_selection;
    await expect(reader(f).service.replay(scope,f.run_id,{ limit: 10 })).rejects.toMatchObject({ status: 503 });
  });
  it("keeps Three Window independent holdout separate and rejects overlap/selection digest drift", () => {
    const p = protocol();
    expect(searchContract(original.summary.source_facts,p)).toMatchObject({validation_claim:"THREE_WINDOW_IS_OOS_CALIBRATION",
      chronological_claim:"NOT_CAUSAL_THREE_WINDOW_CALIBRATION",classification_basis:"PORTAL_FULL02_PROTOCOL_DISCLOSURE_CLASSIFICATION_V1",oos_used_for_selection:true});
    expect(claimStrip(original.summary.source_facts,p).validation_claim).toMatchObject({value:"THREE_WINDOW_IS_OOS_CALIBRATION",
      source_key:"portal.full02_protocol_classification_v1.validation"});
    expect(searchContract(original.summary.source_facts).validation_claim).toBe(original.summary.source_facts.claims.validation_claim);
    expect(p.observation_scope).toBe("OOS_SELECTION_INPUT");
    expect(CurrentSourceProtocolDisclosureSchema.safeParse({ ...p,independent_holdout: { ...p.independent_holdout,holdout_used_for_selection: true } }).success).toBe(false);
    const overlap = structuredClone(p); overlap.windows.holdout.start_utc_ms--;
    expect(CurrentSourceProtocolDisclosureSchema.safeParse(overlap).success).toBe(false);
    const common = { protocol_disclosure: p,provenance: { ...DELTA_THREE_WINDOW_OPTIMIZED_PROFILE.current_source },revision: "unit",
      integrity: { state: "MATCH" },search_contract: { optimization_schedule: "global" },selection: { parameters: { window: "34" } } };
    const audit = retainedFinalAudit("unit-run",{ relationship: "PRIMARY" } as never,common as never,common as never,common as never);
    expect(audit.optimizer_basis).toBe("THREE_WINDOW_HOLDOUT_RAN_FROZEN_CALIBRATION_SELECTION");
    const wrong = { ...common,selection: { parameters: { window: "35" } } };
    expect(retainedFinalAudit("unit-run",{ relationship: "PRIMARY" } as never,common as never,wrong as never,common as never).optimizer_reinvoked).toBeNull();
  });
});
