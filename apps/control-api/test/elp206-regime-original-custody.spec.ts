/** TEST_ONLY regression; actual execution results live in the phase packet.
 * Actual loaders/calculator/custody, SYNTHETIC method/calibration/source pins.
 * No DB, public authority, source commissioning or numerical campaign. */
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import * as calculator from "../src/execution-v2/manager-regime";
import { accessDigest } from "../src/execution-v2/access-policy";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import { captureManagerRegimeOriginal, managerRegimeCapturedOriginal, restoreManagerRegimeOriginal, managerRegimeRetainedInputs,
  loadApprovedManagerRegimePolicy, loadVerifiedManagerRegimeEvidence, ManagerRegimeRuntime, managerRegimePublicationCurrent,
  revokeApprovedManagerRegimePolicy, revokeVerifiedManagerRegimeEvidence,
  type ManagerRegimeOriginalCustody, type RetainedManagerRegimeInputs,
  type ManagerRegimeRuntimeTask } from "../src/execution-v2/manager-regime-runtime";
import { clone, digest, limits, fixture, policyInput, evidenceInput, calculate } from "./helpers/manager-regime";

const maximumBytes=1_048_576,sha=(bytes:string|Uint8Array)=>`sha256:${createHash("sha256").update(bytes).digest("hex")}`;
type Calculated=Awaited<ReturnType<typeof calculate>>;
function documentFor(h:Calculated):ManagerModelDocument{
  const a=h.f.evidence;
  return {schema_version:"portal.execution.manager-model-input.v1",workspace_id:a.scope.workspace_id,environment:a.scope.environment,
    profile_id:a.scope.profile_id,qualification:"SOURCE_VERIFIED",family_id:"alpha_fleet_overview",revision:a.source_revision,
    supersedes_revision:null,source_epoch:"TEST_ONLY:original-epoch",source_sequence:"1",projection_generation:a.projection_generation,
    catalogue_digest:a.scope.catalogue_digest,source_set_digest:a.source_set_digest,as_of_ms:a.source_as_of_ms,
    recorded_through_ms:a.source_as_of_ms,facts_through_ms:a.source_as_of_ms,observed_at_ms:h.task.computed_at_ms,
    source_quality:{completeness:"COMPLETE",freshness:"FRESH",reasons:[]},facts:[],
    members:a.population.map(m=>({...clone(m),name:"TEST_ONLY:Alpha",owner_user_id:"TEST_ONLY:researcher",lifecycle:"ACTIVE",
      venue:null,health:null,source_state:null,binding_ref:null,assignment_revision:"TEST_ONLY:assignment",
      owner_revision:"TEST_ONLY:owner",binding_revision:"TEST_ONLY:binding",valid_from_ms:100,valid_to_ms:null})),
    precomputed_regimes:[clone(h.publication)]};
}
function captureRequest(h:Calculated,document=documentFor(h)){
  return {policy:h.policy,evidence:h.evidence,document,publication:h.publication,maximum_bytes:maximumBytes};
}
function requireCustody(result:ReturnType<typeof captureManagerRegimeOriginal>):ManagerRegimeOriginalCustody{
  if(result.status!=="READY")throw new Error(JSON.stringify(result));return result.custody;
}
function restored(custody:ManagerRegimeOriginalCustody,document:ManagerModelDocument,at=20_000){
  return restoreManagerRegimeOriginal({custody,expected_custody_digest:custody.custody_digest,document,maximum_bytes:maximumBytes},()=>at);
}
function requireRetained(result:ReturnType<typeof restoreManagerRegimeOriginal>):RetainedManagerRegimeInputs{
  if(result.status!=="READY")throw new Error(JSON.stringify(result));return result.handle;
}
function reason(value:{status:string;reason_code?:string},code:string){expect(value).toMatchObject({status:"NOT_PUBLISHED",reason_code:code});}
const rehash=(custody:ManagerRegimeOriginalCustody)=>{const {custody_digest:_ignored,...base}=custody;custody.custody_digest=accessDigest(base);return custody;};

describe("ELP2-06 original Regime private custody (SYNTHETIC, no source/runtime qualification)",()=>{
  it("round-trips exact original policy/evidence UTF8, whitespace and byte hashes without reserialization",async()=>{
    const f=fixture();f.policy.scope.workspace_id="TEST_ONLY:không-gian";f.evidence.scope.workspace_id=f.policy.scope.workspace_id;
    const p=policyInput(f),e=evidenceInput(f),policyBytes=JSON.stringify(JSON.parse(p.artifact_bytes),null,2)+"\n",
      evidenceBytes=" \n"+JSON.stringify(JSON.parse(e.artifact_bytes),null,1)+"\n";
    const mutablePolicy=Buffer.from(policyBytes),mutableEvidence=Buffer.from(evidenceBytes);
    p.approval_pin.artifact_sha256=sha(mutablePolicy);e.source_pin.artifact_sha256=sha(mutableEvidence);
    const ph=loadApprovedManagerRegimePolicy({...p,artifact_bytes:mutablePolicy}),eh=loadVerifiedManagerRegimeEvidence({...e,artifact_bytes:mutableEvidence});
    if(ph.status!=="READY"||eh.status!=="READY")throw new Error(JSON.stringify({ph,eh}));
    // Loaded bytes are detached from the caller's mutable backing arrays.
    mutablePolicy.fill(0);mutableEvidence.fill(0);
    const base=await calculate(f),h={...base,policy:ph.handle,evidence:eh.handle,task:{...base.task,policy:ph.handle,evidence:eh.handle}};
    const output=await new ManagerRegimeRuntime(limits,()=>1001).calculate(h.task);
    if(output.status!=="READY")throw new Error(JSON.stringify(output));h.publication=output.publication;
    const d=documentFor(h),custody=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002)),
      view=managerRegimeRetainedInputs(requireRetained(restored(clone(custody),d)))!;
    expect(custody.policy_artifact_utf8).toBe(policyBytes);expect(custody.evidence_artifact_utf8).toBe(evidenceBytes);
    expect(custody.policy_artifact_sha256).toBe(sha(policyBytes));expect(custody.evidence_artifact_sha256).toBe(sha(evidenceBytes));
    expect(view.policy_artifact).toEqual(f.policy);expect(view.evidence_artifact).toEqual(f.evidence);
    expect(view.custody.source.payload_digest).toBe(accessDigest(d));expect(view.custody.original_publication_digest).toBe(accessDigest(h.publication));
    expect(view.input.as_of_ms).toBe(1000);expect(view.input.evaluation_at_ms).toBe(1000);
  });
  it("only genuine capture identity is eligible for first-write; restored/cloned/JSON/proxy records never mint it",async()=>{
    const h=await calculate(),d=documentFor(h),c=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002));
    expect(managerRegimeCapturedOriginal(c)).toBe(c);
    const historical=requireRetained(restored(c,d));
    for(const counterfeit of [clone(c),JSON.parse(JSON.stringify(c)),historical,{},null,new Proxy(c,{})])
      expect(managerRegimeCapturedOriginal(counterfeit)).toBeNull();
    expect(managerRegimeRetainedInputs({} as RetainedManagerRegimeInputs)).toBeNull();
    expect(managerRegimeRetainedInputs(clone(historical))).toBeNull();
  });
  it("requires actual runtime-returned publication identity and digest, not cloned or self-consistently forged final135 output",async()=>{
    const h=await calculate(),d=documentFor(h),request=captureRequest(h,d);
    reason(captureManagerRegimeOriginal({...request,publication:clone(h.publication)},()=>1002),"REGIME_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
    const fake=clone(h.publication),forged=clone(d);fake.result.stage_breakdown[0].matched_outcome_summary!.mean="0.02";
    forged.precomputed_regimes=[fake];reason(captureManagerRegimeOriginal({...request,publication:fake,document:forged},()=>1002),"REGIME_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
    const actual=h.publication;actual.result.stage_breakdown[0].matched_outcome_summary!.mean="0.02";
    const changed=clone(d);changed.precomputed_regimes=[clone(actual)];
    reason(captureManagerRegimeOriginal({...request,document:changed},()=>1002),"REGIME_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
  });
  it.each(["policy","evidence"] as const)("refuses counterfeit %s handle despite schema-correct publication",async axis=>{
    const h=await calculate(),request=captureRequest(h);
    for(const fake of [{},clone(axis==="policy"?h.policy:h.evidence)])
      reason(captureManagerRegimeOriginal({...request,[axis]:fake} as typeof request,()=>1002),"REGIME_ORIGINAL_CUSTODY_NOT_APPROVED");
  });
  it("retains historical original after approval expiry/revoke without current handle, worker or source replacement",async()=>{
    const h=await calculate(),d=documentFor(h),c=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002));
    revokeApprovedManagerRegimePolicy(h.policy);revokeVerifiedManagerRegimeEvidence(h.evidence);
    const spy=vi.spyOn(calculator,"calculateManagerRegimeFit");
    try{const handle=requireRetained(restored(c,d)),a=managerRegimeRetainedInputs(handle)!,b=managerRegimeRetainedInputs(handle)!;
      expect(a).toEqual(b);expect(a).not.toBe(b);expect(a.custody).not.toBe(b.custody);
      expect(a.policy_approval.valid_until_ms).toBe(10_000);expect(a.source_acceptance.valid_until_ms).toBe(10_000);
      expect(a.input.current).toEqual(h.f.evidence.current);expect(a.input.references).toHaveLength(3);expect(spy).not.toHaveBeenCalled();
      expect(managerRegimePublicationCurrent(h.policy,h.evidence,h.publication,20_000)).toBe(false);
      expect((await new ManagerRegimeRuntime(limits,()=>20_000).calculate({...h.task,policy:handle as unknown as typeof h.policy})).status).toBe("NOT_PUBLISHED");
      expect((await new ManagerRegimeRuntime(limits,()=>20_000).calculate({...h.task,evidence:handle as unknown as typeof h.evidence})).status).toBe("NOT_PUBLISHED");
    }finally{spy.mockRestore();}
  });
  it.each(["policy","evidence"] as const)("refuses revoked %s before capture and in final capture clock fence",async axis=>{
    const h=await calculate(),revoke=()=>axis==="policy"?revokeApprovedManagerRegimePolicy(h.policy):revokeVerifiedManagerRegimeEvidence(h.evidence);
    let calls=0;reason(captureManagerRegimeOriginal(captureRequest(h),()=>{if(++calls===1)revoke();return 1002;}),"REGIME_ORIGINAL_CUSTODY_NOT_CURRENT");
    reason(captureManagerRegimeOriginal(captureRequest(h),()=>1002),"REGIME_ORIGINAL_CUSTODY_NOT_APPROVED");
  });
  it("refuses expired original capture but restores bytes that were genuinely captured before expiry",async()=>{
    const h=await calculate(),d=documentFor(h),request=captureRequest(h,d),c=requireCustody(captureManagerRegimeOriginal(request,()=>1002));
    reason(captureManagerRegimeOriginal(request,()=>10_000),"REGIME_ORIGINAL_CUSTODY_NOT_CURRENT");
    expect(restored(c,d,20_000).status).toBe("READY");
  });
  it("binds final FULL135 source metadata and exact publication, not a summary-only or different revision document",async()=>{
    const h=await calculate(),d=documentFor(h),request=captureRequest(h,d);
    for(const change of [(x:ManagerModelDocument)=>{x.workspace_id="TEST_ONLY:other-workspace";},
      (x:ManagerModelDocument)=>{x.environment="paper";},(x:ManagerModelDocument)=>{x.profile_id="TEST_ONLY:other-profile";},
      (x:ManagerModelDocument)=>{x.catalogue_digest=digest("other-catalogue");},(x:ManagerModelDocument)=>{x.revision="TEST_ONLY:r2";},
      (x:ManagerModelDocument)=>{x.projection_generation="TEST_ONLY:g2";},(x:ManagerModelDocument)=>{x.source_set_digest=digest("other-set");},
      (x:ManagerModelDocument)=>{x.as_of_ms=999;x.facts_through_ms=999;}]){
      const wrong=clone(d);change(wrong);reason(captureManagerRegimeOriginal({...request,document:wrong},()=>1002),"REGIME_ORIGINAL_CUSTODY_SOURCE_MISMATCH");}
    for(const publications of [[],[clone(h.publication),clone(h.publication)]]){
      const wrong=clone(d);wrong.precomputed_regimes=publications;
      reason(captureManagerRegimeOriginal({...request,document:wrong},()=>1002),"REGIME_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");}
    const wrong=clone(h.publication);wrong.provenance.calculation_revision="TEST_ONLY:other-worker";
    reason(captureManagerRegimeOriginal({...request,publication:wrong},()=>1002),"REGIME_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
  });
  it("requires each exact accepted tuple/stage once; unrelated final-document slots remain digest-bound",async()=>{
    const h=await calculate(),d=documentFor(h),request=captureRequest(h,d);
    for(const change of [(x:ManagerModelDocument)=>{x.members=[];},(x:ManagerModelDocument)=>{x.members.push(clone(x.members[0]));},
      (x:ManagerModelDocument)=>{x.members[0].stage="CANARY";},(x:ManagerModelDocument)=>{x.members[0].tuple.account_id="TEST_ONLY:other-account";}]){
      const wrong=clone(d);change(wrong);reason(captureManagerRegimeOriginal({...request,document:wrong},()=>1002),"REGIME_ORIGINAL_CUSTODY_POPULATION_MISMATCH");}
    const c=requireCustody(captureManagerRegimeOriginal(request,()=>1002)),changed=clone(d);changed.source_sequence="2";
    reason(restored(c,changed),"REGIME_ORIGINAL_CUSTODY_SOURCE_MISMATCH");
  });
  it("independent parent digest prevents retrofit even if a changed child recomputes its own hash",async()=>{
    const h=await calculate(),d=documentFor(h),c=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002));
    const changed=clone(c);changed.policy_approval.approval_ref="TEST_ONLY:retrofit";rehash(changed);
    reason(restoreManagerRegimeOriginal({custody:changed,expected_custody_digest:c.custody_digest,document:d,maximum_bytes:maximumBytes},()=>20_000),
      "REGIME_ORIGINAL_CUSTODY_DIGEST_MISMATCH");
    const edits:((x:ManagerRegimeOriginalCustody)=>void)[]=[x=>{x.original_publication_digest=digest("wrong-publication");},
      x=>{x.original_input_digest=digest("wrong-input");},x=>{x.policy_artifact_sha256=digest("wrong-policy-bytes");},
      x=>{x.evidence_artifact_sha256=digest("wrong-evidence-bytes");},x=>{x.population_census_digest=digest("wrong-population");},
      x=>{x.reference_census_digest=digest("wrong-references");},x=>{x.policy_artifact_utf8+=" ";},x=>{x.evidence_artifact_utf8+=" ";}];
    for(const edit of edits){const wrong=clone(c);edit(wrong);reason(restored(wrong,d),"REGIME_ORIGINAL_CUSTODY_DIGEST_MISMATCH");}
  });
  it("rehashing a caller-controlled child does not bypass archived pin/source/publication/input checks",async()=>{
    const h=await calculate(),d=documentFor(h),c=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002));
    for(const [edit,code]of [
      [(x:ManagerRegimeOriginalCustody)=>{x.policy_artifact_utf8+=" ";},"REGIME_ORIGINAL_CUSTODY_ARTIFACT_INVALID"],
      [(x:ManagerRegimeOriginalCustody)=>{x.evidence_artifact_utf8+=" ";},"REGIME_ORIGINAL_CUSTODY_ARTIFACT_INVALID"],
      [(x:ManagerRegimeOriginalCustody)=>{x.source_acceptance.reference_census_digest=digest("wrong-corpus");},"REGIME_ORIGINAL_CUSTODY_ARTIFACT_INVALID"],
      [(x:ManagerRegimeOriginalCustody)=>{x.policy_approval.calibration_hash=digest("wrong-calibration");},"REGIME_ORIGINAL_CUSTODY_ARTIFACT_INVALID"],
      [(x:ManagerRegimeOriginalCustody)=>{x.original_publication_digest=digest("wrong-publication");},"REGIME_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH"],
      [(x:ManagerRegimeOriginalCustody)=>{x.original_input_digest=digest("wrong-input");},"REGIME_ORIGINAL_CUSTODY_DIGEST_MISMATCH"],
    ] as const){const wrong=clone(c);edit(wrong);reason(restored(rehash(wrong),d),code);}
  });
  it("preserves individually future reference proof at original A and genuine abstention states, never advancing cutoff to restore time",async()=>{
    const h=await calculate(fixture(),pin=>{pin.references[0].reconciliation!.available_at_ms=1002;}),d=documentFor(h),
      c=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002)),view=managerRegimeRetainedInputs(requireRetained(restored(c,d)))!;
    expect(h.publication.result.neighbor_count).toBe(2);expect(h.publication.result.reason_codes).toContain("REFERENCE_PROOF_NOT_AVAILABLE_AS_OF");
    expect(view.input.as_of_ms).toBe(1000);expect(view.input.references[0].source_proof_available_at_ms).toBe(1002);
    expect(view.evidence_artifact.references).toHaveLength(3);expect(view.source_acceptance.references[0].reconciliation!.available_at_ms).toBe(1002);
  });
  it.each(["empty","stale","out-of-support","unbound"] as const)("keeps original calculator %s fact as historical custody without inventing support",async scenario=>{
    const f=fixture();if(scenario==="empty")f.evidence.references=[];
    if(scenario==="stale")Object.assign(f.evidence.current,{feature_cutoff_ms:800,closed_through_ms:800,available_at_ms:800});
    if(scenario==="out-of-support")f.evidence.current.values[0].value="1000";
    if(scenario==="unbound")f.evidence.references[0].deployment!.effective_from_ms=50;
    const h=await calculate(f),d=documentFor(h),c=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002)),v=managerRegimeRetainedInputs(requireRetained(restored(c,d)))!;
    expect(h.publication.result.status).toBe(scenario==="empty"?"insufficient_data":scenario==="out-of-support"?"out_of_support":scenario);
    expect(v.custody.original_publication_digest).toBe(accessDigest(h.publication));expect(v.input.as_of_ms).toBe(1000);
  });
  it("rejects future captured/computed/source observation and backward/invalid trusted clocks",async()=>{
    const h=await calculate(),d=documentFor(h),request=captureRequest(h,d),c=requireCustody(captureManagerRegimeOriginal(request,()=>1002));
    reason(captureManagerRegimeOriginal(request,()=>1000),"REGIME_ORIGINAL_CUSTODY_ORIGINAL_TIME_INVALID");
    const future=clone(d);future.observed_at_ms=1003;reason(captureManagerRegimeOriginal({...request,document:future},()=>1002),"REGIME_ORIGINAL_CUSTODY_ORIGINAL_TIME_INVALID");
    reason(restored(c,d,1001),"REGIME_ORIGINAL_CUSTODY_ORIGINAL_TIME_INVALID");
    for(const invalid of [NaN,Infinity,-1,1.5])reason(captureManagerRegimeOriginal(request,()=>invalid),"REGIME_ORIGINAL_CUSTODY_ORIGINAL_TIME_INVALID");
    let calls=0;reason(captureManagerRegimeOriginal(request,()=>++calls===1?1002:1001),"REGIME_ORIGINAL_CUSTODY_ORIGINAL_TIME_INVALID");
    const wrong=clone(c);wrong.captured_at_ms=1000;reason(restored(rehash(wrong),d),"REGIME_ORIGINAL_CUSTODY_ORIGINAL_TIME_INVALID");
  });
  it("bounds the cumulative serialized custody, not each artifact separately, and rejects malformed caps",async()=>{
    const h=await calculate(),d=documentFor(h),request=captureRequest(h,d),c=requireCustody(captureManagerRegimeOriginal(request,()=>1002)),
      exact=Buffer.byteLength(JSON.stringify(c),"utf8");
    expect(Buffer.byteLength(c.policy_artifact_utf8)+Buffer.byteLength(c.evidence_artifact_utf8)).toBeLessThan(exact-1);
    expect(captureManagerRegimeOriginal({...request,maximum_bytes:exact},()=>1002).status).toBe("READY");
    reason(captureManagerRegimeOriginal({...request,maximum_bytes:exact-1},()=>1002),"REGIME_ORIGINAL_CUSTODY_BOUND");
    reason(restoreManagerRegimeOriginal({custody:c,expected_custody_digest:c.custody_digest,document:d,maximum_bytes:exact-1},()=>20_000),"REGIME_ORIGINAL_CUSTODY_BOUND");
    for(const maximum_bytes of [0,NaN,Infinity,1.5,8*1024*1024+1])reason(captureManagerRegimeOriginal({...request,maximum_bytes},()=>1002),"REGIME_ORIGINAL_CUSTODY_BOUND");
  });
  it("strict UTF8 bytes and exact hashes stay loader requirements before original custody exists",()=>{
    const f=fixture(),p=policyInput(f),e=evidenceInput(f),invalid=Uint8Array.from([0xc3,0x28]);
    expect(loadApprovedManagerRegimePolicy({...p,artifact_bytes:invalid,approval_pin:{...p.approval_pin,artifact_sha256:sha(invalid)}}))
      .toMatchObject({status:"NOT_PUBLISHED",reason_codes:["REGIME_ARTIFACT_INVALID"]});
    expect(loadVerifiedManagerRegimeEvidence({...e,artifact_bytes:invalid,source_pin:{...e.source_pin,artifact_sha256:sha(invalid)}}))
      .toMatchObject({status:"NOT_PUBLISHED",reason_codes:["REGIME_ARTIFACT_INVALID"]});
    expect(loadApprovedManagerRegimePolicy({...p,artifact_bytes:p.artifact_bytes+"\n"}))
      .toMatchObject({status:"NOT_PUBLISHED",reason_codes:["REGIME_POLICY_ARTIFACT_HASH_MISMATCH"]});
    expect(loadVerifiedManagerRegimeEvidence({...e,artifact_bytes:e.artifact_bytes+"\n"}))
      .toMatchObject({status:"NOT_PUBLISHED",reason_codes:["REGIME_EVIDENCE_ARTIFACT_HASH_MISMATCH"]});
  });
  it("optional own-data boundaries reject getters, Proxy, symbol, prototype, cycle and sparse arrays with zero traps",async()=>{
    const h=await calculate(),d=documentFor(h),request=captureRequest(h,d),c=requireCustody(captureManagerRegimeOriginal(request,()=>1002));let traps=0;
    const proxy=<T extends object>(value:T)=>new Proxy(value,{get(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");},
      ownKeys(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");},getPrototypeOf(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");},
      getOwnPropertyDescriptor(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");}});
    const getter={...request};Object.defineProperty(getter,"document",{enumerable:true,get(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");}});
    const nested=clone(d);Object.defineProperty(nested.members[0],"name",{enumerable:true,get(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");}});
    const sparse=clone(d);delete sparse.members[0];
    const cycle=clone(d);Reflect.set(cycle,"unexpected",cycle);
    for(const invalid of [proxy(request),getter,{...request,document:proxy(d)},{...request,document:nested},
      {...request,document:cycle},Object.assign(Object.create({inherited:true}),request),Object.assign({...request},{[Symbol("unexpected")]:true})])
      reason(captureManagerRegimeOriginal(invalid,()=>1002),"REGIME_ORIGINAL_CUSTODY_INVALID");
    reason(captureManagerRegimeOriginal({...request,document:sparse},()=>1002),"REGIME_ORIGINAL_CUSTODY_BOUND");
    reason(captureManagerRegimeOriginal({...request,publication:proxy(h.publication)},()=>1002),"REGIME_ORIGINAL_CUSTODY_PUBLICATION_MISMATCH");
    const proxyClock=new Proxy(()=>1002,{apply(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");}});
    reason(captureManagerRegimeOriginal(request,proxyClock),"REGIME_ORIGINAL_CUSTODY_INVALID");
    reason(captureManagerRegimeOriginal(request,()=>{throw proxy({});}),"REGIME_ORIGINAL_CUSTODY_INVALID");
    expect(traps).toBe(0);
    const restoredRequest={custody:c,expected_custody_digest:c.custody_digest,document:d,maximum_bytes:maximumBytes};
    const nestedCustody=clone(c);Object.defineProperty(nestedCustody.policy_approval,"approval_ref",{enumerable:true,get(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");}});
    for(const invalid of [proxy(restoredRequest),{...restoredRequest,custody:proxy(c)},{...restoredRequest,custody:nestedCustody},
      {...restoredRequest,document:proxy(d)}])reason(restoreManagerRegimeOriginal(invalid,()=>20_000),"REGIME_ORIGINAL_CUSTODY_INVALID");
    expect(traps).toBe(0);expect(managerRegimeCapturedOriginal(proxy(c))).toBeNull();expect(traps).toBe(0);
    expect(managerRegimeRetainedInputs(proxy({}) as RetainedManagerRegimeInputs)).toBeNull();expect(traps).toBe(0);
  });
  it("expected parent digest rejects accessor objects, live/revoked Proxy and outer getter before schema reflection",async()=>{
    const h=await calculate(),d=documentFor(h),c=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002));let traps=0;
    const base={custody:c,expected_custody_digest:c.custody_digest,document:d,maximum_bytes:maximumBytes},evil={};
    for(const key of ["then","catch","constructor"])Object.defineProperty(evil,key,{get(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");}});
    const proxy=new Proxy(evil,{get(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");},ownKeys(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");}}),
      revoked=Proxy.revocable({},{});revoked.revoke();
    for(const value of [evil,proxy,revoked.proxy])reason(restoreManagerRegimeOriginal({...base,expected_custody_digest:value as unknown as string},()=>20_000),"REGIME_ORIGINAL_CUSTODY_INVALID");
    const outer={...base};Object.defineProperty(outer,"expected_custody_digest",{enumerable:true,get(){traps++;throw new Error("TEST_ONLY_PRIVATE_DIAGNOSTIC");}});
    reason(restoreManagerRegimeOriginal(outer,()=>20_000),"REGIME_ORIGINAL_CUSTODY_INVALID");expect(traps).toBe(0);
  });
  it("RGC01 genuine1600-window artifact survives worker/capture/restore/accessor without a false composite node cap",async()=>{
    const count=1600,A=200_000,C=A+1,T=A+2,ceiling=8*1024*1024,f=fixture(),template=clone(f.evidence.references[0]);
    f.policy.policy.max_reference_windows=count;f.evidence.source_as_of_ms=A;f.evidence.evaluation_at_ms=A;
    f.evidence.evidence_snapshot_available_at_ms=A;
    Object.assign(f.evidence.current,{feature_cutoff_ms:A,closed_through_ms:A,available_at_ms:A});
    f.evidence.references=Array.from({length:count},(_,i)=>{const r=clone(template),start=200+i*100;
      r.reference_window_id=`TEST_ONLY:large-window${i}`;r.individual_evidence_binding_id=`TEST_ONLY:large-binding${i}`;
      r.manifest_hash=digest(`large-window${i}`);r.source_locator=`TEST_ONLY:large-source${i}`;r.episode_id=`TEST_ONLY:large-episode${i}`;
      Object.assign(r.features,{feature_cutoff_ms:start,closed_through_ms:start,available_at_ms:start});
      r.outcome_start_ms=start;r.outcome_end_ms=start+100;r.outcome_available_at_ms=start+100;return r;});
    const pi=policyInput(f),ei=evidenceInput(f);pi.as_of_ms=C;pi.approval_pin.valid_until_ms=A+10_000;
    ei.as_of_ms=C;ei.source_pin.accepted_at_ms=A;ei.source_pin.available_at_ms=A;ei.source_pin.valid_until_ms=A+10_000;
    expect(Buffer.byteLength(pi.artifact_bytes)).toBeLessThanOrEqual(65_536);
    expect(Buffer.byteLength(ei.artifact_bytes)).toBeLessThanOrEqual(ceiling);
    const policy=loadApprovedManagerRegimePolicy(pi),evidence=loadVerifiedManagerRegimeEvidence(ei);
    if(policy.status!=="READY"||evidence.status!=="READY")throw new Error(JSON.stringify({policy,evidence}));
    const a=f.evidence,task:ManagerRegimeRuntimeTask={policy:policy.handle,evidence:evidence.handle,scope:clone(a.scope),binding:clone(a.binding),
      source_revision:a.source_revision,projection_generation:a.projection_generation,source_set_digest:a.source_set_digest,
      source_as_of_ms:A,source_qualification:"SOURCE_VERIFIED",calculation_revision:f.policy.calculation_revision,computed_at_ms:C};
    const computed=await new ManagerRegimeRuntime({...limits,maximum_references:count,maximum_input_bytes:ceiling,maximum_output_bytes:ceiling},()=>C).calculate(task);
    if(computed.status!=="READY")throw new Error(JSON.stringify(computed));
    const h:Calculated={f,policy:policy.handle,evidence:evidence.handle,task,publication:computed.publication},d=documentFor(h),
      custody=requireCustody(captureManagerRegimeOriginal({...captureRequest(h,d),maximum_bytes:ceiling},()=>T));
    const result=restoreManagerRegimeOriginal({custody,expected_custody_digest:custody.custody_digest,document:d,maximum_bytes:ceiling},()=>A+20_000),
      handle=requireRetained(result),view=managerRegimeRetainedInputs(handle);
    expect(view).not.toBeNull();if(!view)throw new Error("TEST_ONLY_EXPECTED_LARGE_ACCESSOR");
    const nodes=(value:unknown):number=>1+(value!==null&&typeof value==="object"?Object.values(value).reduce<number>((n,v)=>n+nodes(v),0):0);
    for(const part of Object.values(view))expect(nodes(part)).toBeLessThanOrEqual(250_000);
    expect(nodes(view)).toBeGreaterThan(250_000); // This was the incorrect shared accessor ceiling.
    expect(Buffer.byteLength(JSON.stringify(view))).toBeLessThanOrEqual(3*ceiling+2*65_536);
    expect(h.publication.result.neighbor_count).toBe(count);expect(view.evidence_artifact.references).toHaveLength(count);
    expect(view.source_acceptance.references).toHaveLength(count);expect(view.input.references).toHaveLength(count);
    expect(view.input.references[1599].source_proof_available_at_ms).toBe(160_200);
    expect(view.input.as_of_ms).toBe(A);expect(Object.isFrozen(view)).toBe(true);expect(Object.isFrozen(view.input.references)).toBe(true);
    const again=managerRegimeRetainedInputs(handle)!;expect(again).not.toBe(view);expect(again.input.references).not.toBe(view.input.references);
    expect(again.custody.evidence_artifact_utf8).toBe(ei.artifact_bytes);
  });
  it("RGC02 source membership uses A-effective half-open intervals, not historical/future duplicates",async()=>{
    const h=await calculate(),A=h.f.evidence.source_as_of_ms,d=documentFor(h),current=d.members[0],old=clone(current);
    old.valid_to_ms=A;old.assignment_revision="TEST_ONLY:old-assignment";current.valid_from_ms=A;d.members=[old,current];
    const c=requireCustody(captureManagerRegimeOriginal(captureRequest(h,d),()=>1002));
    expect(restored(c,d).status).toBe("READY"); // Old ends and new starts exactly at A.
    for(const kind of ["expired-only","future-only","active-duplicate","wrong-stage","wrong-account"] as const){
      const bad=documentFor(h),m=bad.members[0];
      if(kind==="expired-only")m.valid_to_ms=A;
      if(kind==="future-only")m.valid_from_ms=A+1;
      if(kind==="active-duplicate")bad.members.push(clone(m));
      if(kind==="wrong-stage")m.stage="CANARY";
      if(kind==="wrong-account")m.tuple.account_id="TEST_ONLY:other-account";
      reason(captureManagerRegimeOriginal(captureRequest(h,bad),()=>1002),"REGIME_ORIGINAL_CUSTODY_POPULATION_MISMATCH");
      // Negative archived JSON, NOT a genuine first-write capture/parent grant.
      // Pin its exact bad source so restore exercises census rather than the
      // earlier unchanged-source digest guard. No forged READY handle is used.
      const malformed=clone(c);malformed.source.payload_digest=accessDigest(bad);rehash(malformed);
      reason(restored(malformed,bad),"REGIME_ORIGINAL_CUSTODY_POPULATION_MISMATCH");
    }
  });
});
