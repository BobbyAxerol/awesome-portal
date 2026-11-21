/** PRIVATE / NOT_APPLIED / NOT_RUN.
 * SYNTHETIC pins/calibration/source only; actual genuine original loader,
 * numerical worker, first capture, parent prepare and historical restore.
 * No DB/source provider/coordinator/HTTP/public authority/ACK claim. */
import { describe,expect,it,vi } from "vitest";
import * as calculator from "../src/execution-v2/manager-regime";
import { accessDigest } from "../src/execution-v2/access-policy";
import { ManagerScoreOriginalCustody } from "../src/execution-v2/manager-score-original-custody";
import { loadApprovedManagerRegimePolicy,managerRegimeRetainedInputs,restoreManagerRegimeOriginal,
  revokeApprovedManagerRegimePolicy,revokeVerifiedManagerRegimeEvidence,
  managerRegimeHistoricalPolicySnapshot,managerRegimeHistoricalPolicySnapshotCurrent,
  restoreManagerRegimeHistoricalPolicySnapshot,type ManagerRegimePolicyArtifact,
  type ManagerRegimeHistoricalPolicyArchive,
  type RetainedManagerRegimeInputs } from "../src/execution-v2/manager-regime-runtime";
import { ManagerRegimeHistoricalRuntime,decodeRetainedManagerRegimeRestatement,
  type ManagerHistoricalRegimeTask,type ManagerHistoricalRegimeContext,
  type ManagerHistoricalRegimeResult,type ManagerRegimeHistoricalRestatement }
  from "../src/execution-v2/manager-regime-restatement-worker";
import { fixture,calculate,clone,digest,policyInput,limits } from "./helpers/manager-regime";
import { regimeOriginalDocument,captureRegimeOriginals,regimeOriginalLimits,regimeV4ExpectedRow }
  from "./helpers/manager-regime-original";

type Alter=(p:ManagerRegimePolicyArtifact)=>void;
async function original(f=fixture(),alterPin?:Parameters<typeof calculate>[1],at=2001){
  const h=await calculate(f,alterPin),document=regimeOriginalDocument([h]),
    [custody]=captureRegimeOriginals([h],document),row=regimeV4ExpectedRow(document,[custody]),
    prepared=new ManagerScoreOriginalCustody(regimeOriginalLimits).prepare(document,[],[],[custody]);
  expect(prepared).toEqual({calculation_key:row.calculation_key,payload_digest:row.payload_digest});
  const restored=restoreManagerRegimeOriginal({custody,expected_custody_digest:row.payload.retained_regimes[0].custody_digest,
    document,maximum_bytes:limits.maximum_input_bytes},()=>at);
  if(restored.status!=="READY")throw new Error(JSON.stringify(restored));
  const view=managerRegimeRetainedInputs(restored.handle);if(!view)throw new Error("TEST_ONLY_GENUINE_ORIGINAL_REQUIRED");
  return {h,document,custody,row,prepared,handle:restored.handle,view};
}
type Original=Awaited<ReturnType<typeof original>>;
function selected(o:Original,alter:Alter=()=>{},options:{approved?:number;available?:number;until?:number;at?:number}={}){
  const f=fixture();f.policy=clone(o.view.policy_artifact);
  Object.assign(f.policy.policy,{policy_version:"TEST_ONLY:selected-policy-v2",approved_policy_id:"TEST_ONLY:selected-approval",
    source_locator:"TEST_ONLY:selected-policy"});alter(f.policy);
  const input=policyInput(f),approved=options.approved??1500,available=options.available??approved,at=options.at??2001;
  Object.assign(input.approval_pin,{approval_ref:"TEST_ONLY:independent-selected-approval",policy_revision:"TEST_ONLY:selected-revision",
    approved_at_ms:approved,available_at_ms:available,valid_until_ms:options.until??30_000});input.as_of_ms=at;
  const loaded=loadApprovedManagerRegimePolicy(input);if(loaded.status!=="READY")throw new Error(JSON.stringify(loaded));
  return {handle:loaded.handle,artifact:f.policy,archive:{artifact_utf8:input.artifact_bytes,approval_pin:clone(input.approval_pin)} satisfies ManagerRegimeHistoricalPolicyArchive};
}
function task(o:Original,p:ReturnType<typeof selected>,k=2000,c=2001):ManagerHistoricalRegimeTask{
  return {original:o.handle,original_custody_key:o.prepared.calculation_key,original_inputs_digest:o.row.payload.inputs_digest,
    policy:p.handle,knowledge_cutoff_ms:k,computed_at_ms:c,calculation_revision:"TEST_ONLY:historical-regime-worker1"};
}
function context(t:ManagerHistoricalRegimeTask,p:ReturnType<typeof selected>):ManagerHistoricalRegimeContext{
  return {...t,policy:clone(p.archive)};
}
function ready(result:ManagerHistoricalRegimeResult):ManagerRegimeHistoricalRestatement{
  if(result.status!=="READY")throw new Error(JSON.stringify(result));return result.publication;
}
function absent(result:ManagerHistoricalRegimeResult,code:string){expect(result).toEqual({status:"NOT_PUBLISHED",reason_codes:[code]});}
const runtime=(at=2001)=>new ManagerRegimeHistoricalRuntime(limits,()=>at);

describe("ELP2-06 independent historical Regime worker — SYNTHETIC private proof only",()=>{
  it("RGR01(a) uses a genuinely independently approved policy available exactly E and preserves original A/E/F/corpus",async()=>{
    const o=await original(),p=selected(o,a=>{a.policy.kernel_bandwidth="0.75";},{approved:900,available:1000}),t=task(o,p),
      v=ready(await runtime().calculateHistoricalRegime(t));
    expect(v.freeze_witness).toBe("SELECTED_APPROVAL_BEFORE_EVALUATION");
    expect(v).toMatchObject({schema_version:"portal.execution.manager-regime-restatement-worker.v1",
      purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,economic_as_of_ms:1000,evaluation_at_ms:1000,
      feature_cutoff_ms:1000,original_computed_at_ms:1001,captured_at_ms:1002,knowledge_cutoff_ms:2000,computed_at_ms:2001});
    expect(v.result.as_of_ms).toBe(1000);expect(v.reference_census_digest).toBe(o.custody.reference_census_digest);
    expect(v.policy.artifact_utf8).toBe(p.archive.artifact_utf8);expect(v.source.payload_digest).toBe(accessDigest(o.document));
    expect(v.original_custody_key).toBe(o.prepared.calculation_key);expect(v.original_inputs_digest).toBe(o.row.payload.inputs_digest);
    expect(v.feed_freshness).toMatchObject({status:"HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS",source_age_ms:1001,feature_age_ms:1001});
    expect(v.result.status).not.toBe("stale");expect(decodeRetainedManagerRegimeRestatement(v,context(t,p),limits.maximum_output_bytes,40_000)).toEqual(v);
  });
  it("RGR01(b) permits only administrative later-policy changes and archived original expiry/revoke, not a current original grant",async()=>{
    const o=await original(fixture(),undefined,20_001),p=selected(o,()=>{},{at:20_001}),t=task(o,p,20_000,20_001);
    revokeApprovedManagerRegimePolicy(o.h.policy);revokeVerifiedManagerRegimeEvidence(o.h.evidence);
    const v=ready(await runtime(20_001).calculateHistoricalRegime(t));
    expect(v.freeze_witness).toBe("ORIGINAL_APPROVED_SEMANTIC_CORE");expect(v.policy.approval_pin.approved_at_ms).toBe(1500);
    expect(v.original_policy_artifact_sha256).toBe(o.custody.policy_artifact_sha256);
    expect(v.result.neighbor_count).toBe(o.h.publication.result.neighbor_count);
    expect(v.result.stage_breakdown[0].matched_outcome_summary).toEqual(o.h.publication.result.stage_breakdown[0].matched_outcome_summary);
    expect(v.policy.approval_pin.artifact_sha256).not.toBe(o.custody.policy_artifact_sha256);
    expect(v.feed_freshness.status).toBe("HISTORICAL_OUTSIDE_CURRENT_FEED_FRESHNESS");
    const before=JSON.stringify(v);revokeApprovedManagerRegimePolicy(p.handle);
    expect(decodeRetainedManagerRegimeRestatement(v,context(t,p),limits.maximum_output_bytes,40_000)).toEqual(v);
    expect(JSON.stringify(v)).toBe(before);absent(await runtime(20_001).calculateHistoricalRegime(t),"REGIME_HISTORICAL_POLICY_NOT_CURRENT");
  });
  const coreChanges:[string,Alter][]=[
    ["scaler median",p=>{p.policy.scaler[0].median="1";}],["scaler MAD",p=>{p.policy.scaler[0].mad="2";}],
    ["scaler locator",p=>{p.policy.scaler[0].source_locator="TEST_ONLY:other-scaler";}],
    ["calibration hash",p=>{p.policy.calibration_hash=digest("new-calibration");}],
    ["calibration snapshot",p=>{p.policy.calibration_snapshot_id="TEST_ONLY:new-calibration";}],
    ["calibration cutoff",p=>{p.policy.calibration_cutoff_ms=11;}],["freeze",p=>{p.policy.frozen_at_ms=21;}],
    ["bandwidth",p=>{p.policy.kernel_bandwidth="0.75";}],["neighbors",p=>{p.policy.min_neighbors=2;}],
    ["ESS",p=>{p.policy.min_effective_sample_size="1";}],["episodes",p=>{p.policy.min_distinct_episodes=2;}],
    ["distance",p=>{p.policy.max_distance="4";}],["feature age",p=>{p.policy.max_feature_age_ms=200;}],
    ["feature coverage",p=>{p.policy.min_current_feature_coverage="0.5";}],
    ["quantiles",p=>{p.policy.empirical_quantiles=["0.2","0.8"];}],
    ["maximum corpus",p=>{p.policy.max_reference_windows=127;}],
    ["rounding",p=>{p.policy.canonical_decimal_places=11;}],
    ["artifact calculator revision",p=>{p.calculation_revision="TEST_ONLY:changed-calculator";}],
  ];
  it.each(coreChanges)("later approval cannot retrofit changed %s into an alleged pre-E semantic core",async(_name,alter)=>{
    const o=await original(),p=selected(o,alter);
    absent(await runtime().calculateHistoricalRegime(task(o,p)),"REGIME_HISTORICAL_FREEZE_WITNESS_NOT_RETAINED");
  });
  it.each(["feature method","economic basis","formula","horizon"] as const)("pre-E approval still refuses incompatible %s",async axis=>{
    const o=await original(),p=selected(o,a=>{
      if(axis==="feature method")a.feature_definition.features[0].method_ref="TEST_ONLY:different-method";
      if(axis==="economic basis")a.economic_basis.account_mode="TEST_ONLY:different-account-mode";
      if(axis==="formula")a.formula_hash=digest("different-formula");
      if(axis==="horizon")a.policy.horizon_ms=101;
    },{approved:900,available:1000});
    absent(await runtime().calculateHistoricalRegime(task(o,p)),"REGIME_HISTORICAL_METHOD_INCOMPATIBLE");
  });
  it.each([1000,1001])("calibration freeze %s at/after E is not admitted despite a genuine later approval",async frozen=>{
    const o=await original(),p=selected(o,a=>{a.policy.frozen_at_ms=frozen;});
    absent(await runtime().calculateHistoricalRegime(task(o,p)),"REGIME_HISTORICAL_CALIBRATION_AFTER_EVALUATION");
  });
  it.each(["deployment","research"] as const)("%s references unknown at original A remain excluded even though proof is known at K",async kind=>{
    const f=fixture();if(kind==="research")Object.assign(f.evidence.references[0],{
      source_kind:"research",stage:"ResearchOOS",evidence_kind:"research_simulated",deployment:null});
    const o=await original(f,pin=>{pin.references[0].reconciliation!.available_at_ms=1002;}),p=selected(o),t=task(o,p),
      before=JSON.stringify(o.view),v=ready(await runtime().calculateHistoricalRegime(t));
    expect(o.view.input.references[0].source_proof_available_at_ms).toBe(1002);expect(v.knowledge_cutoff_ms).toBe(2000);
    expect(v.result.neighbor_count).toBe(2);expect(v.result.reference_window_ids).not.toContain(o.view.input.references[0].reference_window_id);
    expect(v.result.reason_codes).toContain("REFERENCE_PROOF_NOT_AVAILABLE_AS_OF");expect(JSON.stringify(o.view)).toBe(before);
    expect(decodeRetainedManagerRegimeRestatement(v,context(t,p),limits.maximum_output_bytes,40_000)).toEqual(v);
    const forged=clone(v),group=forged.result.stage_breakdown[0],ref=o.view.input.references[0],
      previous=group.reference_window_ids[0];group.reference_window_ids[0]=ref.reference_window_id;
    Object.assign(group.neighbors[0],{reference_window_id:ref.reference_window_id,manifest_hash:ref.manifest_hash,source_locator:ref.source_locator});
    forged.result.reference_window_ids=forged.result.reference_window_ids.map(id=>id===previous?ref.reference_window_id:id);
    expect(()=>decodeRetainedManagerRegimeRestatement(forged,context(t,p),limits.maximum_output_bytes,40_000))
      .toThrow("REGIME_HISTORICAL_RESULT_MISMATCH");
  });
  it.each(["empty","stale","out-of-support","unbound","weak"] as const)("retains genuine %s descriptive/null result, not an invented prediction or zero",async kind=>{
    const f=fixture(kind==="weak"?"paper":"live");if(kind==="empty")f.evidence.references=[];
    if(kind==="stale")Object.assign(f.evidence.current,{feature_cutoff_ms:800,closed_through_ms:800,available_at_ms:800});
    if(kind==="out-of-support")f.evidence.current.values[0].value="1000";
    if(kind==="unbound")f.evidence.references[0].deployment!.effective_from_ms=50;
    const o=await original(f),p=selected(o),t=task(o,p),v=ready(await runtime().calculateHistoricalRegime(t));
    expect(v.result.status).toBe(kind==="empty"?"insufficient_data":kind==="out-of-support"?"out_of_support":kind==="weak"?"weak_support":kind);
    expect(v.result.as_of_ms).toBe(1000);expect(v.operational_current).toBe(false);
    expect(decodeRetainedManagerRegimeRestatement(v,context(t,p),limits.maximum_output_bytes,40_000)).toEqual(v);
  });
  it("rechecks genuine selected policy after yield and at final publication, releasing capacity after all failures",async()=>{
    const o=await original(),p=selected(o),t=task(o,p),r=runtime(),pending=r.calculateHistoricalRegime(t);
    revokeApprovedManagerRegimePolicy(p.handle);absent(await pending,"REGIME_HISTORICAL_POLICY_NOT_CURRENT");
    const replacement=selected(o);expect((await r.calculateHistoricalRegime(task(o,replacement))).status).toBe("READY");
    let calls=0;const expired=selected(o,()=>{},{until:2002}),clock=()=>++calls===1?2001:2002;
    absent(await new ManagerRegimeHistoricalRuntime(limits,clock).calculateHistoricalRegime(task(o,expired)),"REGIME_HISTORICAL_POLICY_NOT_CURRENT");
    const final=selected(o,()=>{},{until:2002});let finalCalls=0;
    absent(await new ManagerRegimeHistoricalRuntime(limits,()=>++finalCalls<3?2001:2002)
      .calculateHistoricalRegime(task(o,final)),"REGIME_HISTORICAL_POLICY_NOT_CURRENT");
    expect((await r.calculateHistoricalRegime(task(o,replacement))).status).toBe("READY");
  });
  it("bounded single-flight/cancellation has no queue and releases slots deterministically without sleeps",async()=>{
    const o=await original(),p=selected(o),t=task(o,p),r=runtime(),first=r.calculateHistoricalRegime(t);
    absent(await r.calculateHistoricalRegime(t),"REGIME_HISTORICAL_CAPACITY");expect((await first).status).toBe("READY");
    const aborted=new AbortController();aborted.abort();absent(await r.calculateHistoricalRegime(t,aborted.signal),"REGIME_HISTORICAL_CANCELLED");
    const during=new AbortController(),pending=r.calculateHistoricalRegime(t,during.signal);during.abort();
    absent(await pending,"REGIME_HISTORICAL_CANCELLED");expect((await r.calculateHistoricalRegime(t)).status).toBe("READY");
  });
  it("selected archive decodes after today's revoke/expiry, never invokes calculator or mints a current snapshot witness",async()=>{
    const o=await original(),p=selected(o),t=task(o,p),spy=vi.spyOn(calculator,"calculateManagerRegimeFit");
    try{const v=ready(await runtime().calculateHistoricalRegime(t));expect(spy).toHaveBeenCalledOnce();
      const snapshot=managerRegimeHistoricalPolicySnapshot(p.handle,o.view.evidence_artifact.scope,2000,2001)!;
      expect(managerRegimeHistoricalPolicySnapshotCurrent(p.handle,snapshot,2001)).toBe(true);
      revokeApprovedManagerRegimePolicy(p.handle);
      const saved=JSON.stringify(v);expect(decodeRetainedManagerRegimeRestatement(clone(v),context(t,p),limits.maximum_output_bytes,40_000)).toEqual(v);
      expect(spy).toHaveBeenCalledOnce();expect(JSON.stringify(v)).toBe(saved);
      const historical=restoreManagerRegimeHistoricalPolicySnapshot({archive:p.archive,scope:o.view.evidence_artifact.scope,
        knowledge_cutoff_ms:2000,computed_at_ms:2001},40_000)!;
      expect(historical).not.toBeNull();expect(managerRegimeHistoricalPolicySnapshotCurrent(p.handle,historical,2001)).toBe(false);
      expect(managerRegimeHistoricalPolicySnapshotCurrent(p.handle,clone(snapshot),2001)).toBe(false);
    }finally{spy.mockRestore();}
  });
  it("strict decoder binds independent parent/source/child/input/corpus/clocks and does not accept wrapper-selected echoes",async()=>{
    const o=await original(),p=selected(o),t=task(o,p),c=context(t,p),v=ready(await runtime().calculateHistoricalRegime(t));
    const changes:((w:ManagerRegimeHistoricalRestatement)=>void)[]=[w=>{w.original_custody_key=digest("changed-parent");},
      w=>{w.original_inputs_digest=digest("changed-parent-input");},w=>{w.regime_custody_digest=digest("changed-child");},
      w=>{w.original_publication_digest=digest("changed-original-publication");},w=>{w.original_input_digest=digest("changed-original-input");},
      w=>{w.evidence_artifact_sha256=digest("changed-evidence");},w=>{w.population_census_digest=digest("changed-population");},
      w=>{w.reference_census_digest=digest("changed-corpus");},w=>{w.source.payload_digest=digest("changed-source");},
      w=>{w.original_computed_at_ms=1002;},w=>{w.captured_at_ms=1003;},w=>{w.knowledge_cutoff_ms=1999;},
      w=>{w.computed_at_ms=2000;},w=>{w.policy_semantic_core_digest=digest("changed-core");},
      w=>{w.freeze_witness="SELECTED_APPROVAL_BEFORE_EVALUATION";},
      w=>{w.derived_input_digest=digest("changed-derived");},w=>{w.derivation_context_digest=digest("changed-context");},
      w=>{w.economic_as_of_ms=1001;},w=>{w.evaluation_at_ms=999;},w=>{w.feature_cutoff_ms=999;},
      w=>{w.checked_at_ms=40_001;},w=>{w.feed_freshness.source_age_ms=0;}];
    for(const change of changes){const wrong=clone(v);change(wrong);
      expect(()=>decodeRetainedManagerRegimeRestatement(wrong,c,limits.maximum_output_bytes,40_000)).toThrow("REGIME_HISTORICAL_CONTEXT_MISMATCH");}
    expect(()=>decodeRetainedManagerRegimeRestatement(v,{...c,original_custody_key:digest("wrong-independent-pin")},limits.maximum_output_bytes,40_000))
      .toThrow("REGIME_HISTORICAL_CONTEXT_MISMATCH");
    const archive=context(t,p);archive.policy.artifact_utf8+=" ";
    expect(()=>decodeRetainedManagerRegimeRestatement(v,archive,limits.maximum_output_bytes,40_000)).toThrow("REGIME_HISTORICAL_POLICY_ARCHIVE_INVALID");
    const extra=clone(v);Object.assign(extra,{authority:true});expect(()=>decodeRetainedManagerRegimeRestatement(extra,c,limits.maximum_output_bytes,40_000))
      .toThrow("REGIME_HISTORICAL_INPUT_INVALID");
  });
  it("unknown source reference and changed known-at/stage corpus cannot be introduced through a stored result",async()=>{
    const o=await original(),p=selected(o),t=task(o,p),v=ready(await runtime().calculateHistoricalRegime(t)),wrong=clone(v);
    wrong.result.stage_breakdown[0].neighbors[0].manifest_hash=digest("wrong-manifest");
    expect(()=>decodeRetainedManagerRegimeRestatement(wrong,context(t,p),limits.maximum_output_bytes,40_000)).toThrow("REGIME_HISTORICAL_RESULT_MISMATCH");
    const unknown=clone(v);unknown.result.reason_codes.push("REFERENCE_PROOF_NOT_AVAILABLE_AS_OF");
    unknown.result.reasons.push({code:"REFERENCE_PROOF_NOT_AVAILABLE_AS_OF",reference_window_id:"TEST_ONLY:unknown-reference",source_locator:"TEST_ONLY:unknown"});
    expect(()=>decodeRetainedManagerRegimeRestatement(unknown,context(t,p),limits.maximum_output_bytes,40_000)).toThrow("REGIME_HISTORICAL_RESULT_MISMATCH");
  });
  it("genuine original identity and own-data metadata refuse forged/JSON handles, getters and Proxy with zero traps",async()=>{
    const o=await original(),p=selected(o),t=task(o,p);let traps=0;
    const hostile=<T extends object>(x:T)=>new Proxy(x,{get(){traps++;throw new Error("PRIVATE");},ownKeys(){traps++;throw new Error("PRIVATE");},
      getPrototypeOf(){traps++;throw new Error("PRIVATE");}}),getter={...t};Object.defineProperty(getter,"computed_at_ms",{enumerable:true,get(){traps++;throw new Error("PRIVATE");}});
    const invalid=[hostile(t),getter,Object.assign({...t},{[Symbol("TEST_ONLY")]:true}),Object.assign(Object.create({extra:true}),t),
      {...t,original_custody_key:hostile({}) as unknown as string}];
    for(const value of invalid)absent(await runtime().calculateHistoricalRegime(value),"REGIME_HISTORICAL_INPUT_INVALID");
    for(const original of [{},clone(o.view),hostile(o.handle)])absent(await runtime().calculateHistoricalRegime({...t,original:original as RetainedManagerRegimeInputs}),
      "REGIME_HISTORICAL_ORIGINAL_NOT_RETAINED");
    absent(await runtime().calculateHistoricalRegime({...t,policy:hostile(p.handle)}),"REGIME_HISTORICAL_POLICY_NOT_CURRENT");
    expect(traps).toBe(0);
    const v=ready(await runtime().calculateHistoricalRegime(t)),c=context(t,p),archive=context(t,p);
    Object.defineProperty(archive.policy.approval_pin,"approval_ref",{enumerable:true,get(){traps++;throw new Error("PRIVATE");}});
    for(const value of [hostile(v),{...v,policy:hostile(v.policy)}])expect(()=>decodeRetainedManagerRegimeRestatement(value,c,limits.maximum_output_bytes,40_000))
      .toThrow("REGIME_HISTORICAL_INPUT_INVALID");
    expect(()=>decodeRetainedManagerRegimeRestatement(v,archive,limits.maximum_output_bytes,40_000)).toThrow("REGIME_HISTORICAL_INPUT_INVALID");expect(traps).toBe(0);
  });
  it("enforces explicit reference/input/output limits and trusted chronology with typed failure and no stranded slot",async()=>{
    const o=await original(),p=selected(o),t=task(o,p);
    absent(await new ManagerRegimeHistoricalRuntime({...limits,maximum_references:2},()=>2001).calculateHistoricalRegime(t),"REGIME_HISTORICAL_INPUT_BOUND");
    absent(await new ManagerRegimeHistoricalRuntime({...limits,maximum_input_bytes:1},()=>2001).calculateHistoricalRegime(t),"REGIME_HISTORICAL_INPUT_BOUND");
    absent(await new ManagerRegimeHistoricalRuntime({...limits,maximum_output_bytes:1},()=>2001).calculateHistoricalRegime(t),"REGIME_HISTORICAL_OUTPUT_BOUND");
    const early=selected(o,()=>{},{approved:900,available:1000});
    absent(await runtime().calculateHistoricalRegime({...task(o,early),knowledge_cutoff_ms:1001}),"REGIME_HISTORICAL_TIME_INVALID");
    // K after the trusted clock fails at snapshot intake, before context time.
    absent(await runtime().calculateHistoricalRegime({...t,knowledge_cutoff_ms:2002}),"REGIME_HISTORICAL_POLICY_NOT_CURRENT");
    absent(await runtime().calculateHistoricalRegime({...t,computed_at_ms:2002}),"REGIME_HISTORICAL_TIME_INVALID");
    for(const now of [NaN,Infinity,-1,1.5])absent(await new ManagerRegimeHistoricalRuntime(limits,()=>now).calculateHistoricalRegime(t),"REGIME_HISTORICAL_TIME_INVALID");
    let calls=0;absent(await new ManagerRegimeHistoricalRuntime(limits,()=>++calls===1?2001:2000).calculateHistoricalRegime(t),"REGIME_HISTORICAL_POLICY_NOT_CURRENT");
    for(const maximum_references of [0,NaN,Infinity,1.5,4097])expect(()=>new ManagerRegimeHistoricalRuntime({...limits,maximum_references},()=>2001))
      .toThrow("REGIME_HISTORICAL_LIMIT_INVALID");
    let traps=0;const invalid={...limits};Object.defineProperty(invalid,"maximum_input_bytes",{enumerable:true,get(){traps++;throw new Error("PRIVATE");}});
    expect(()=>new ManagerRegimeHistoricalRuntime(invalid,()=>2001)).toThrow("REGIME_HISTORICAL_LIMIT_INVALID");
    expect(()=>new ManagerRegimeHistoricalRuntime(limits,new Proxy(()=>2001,{apply(){traps++;throw new Error("PRIVATE");}})))
      .toThrow("REGIME_HISTORICAL_LIMIT_INVALID");expect(traps).toBe(0);
  });
});
