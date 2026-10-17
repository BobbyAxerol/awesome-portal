/** Actual named service / KeysetCursorCodec / current scoped authority components.
 * History snapshots below are SYNTHETIC TEST_ONLY post-decoder outputs supplied
 * through a spy. NOT PG, HTTP, immutable-custody or source qualification proof.
 * Actual PG snapshot/decoder/fault evidence belongs to score-history-store.spec.
 */
import "reflect-metadata";
import type {Pool} from "pg";
import {describe,expect,it,vi} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import {BUSINESS_READ_FIELDS} from "../src/execution-v2/read-fields";
import {managerModelDocument,type ManagerModelDocument,type ManagerMember} from "../src/execution-v2/manager-model.contract";
import {managerScorePopulationDigest} from "../src/execution-v2/manager-score-publication";
import {managerScorePublication} from "../src/execution-v2/manager-score-publication.contract";
import {ManagerScoreRuntime,type ManagerScoreRuntimeTask} from "../src/execution-v2/manager-score-runtime";
import type {ManagerScoreRestatementSnapshot} from "../src/execution-v2/manager-score-restatement";
import type {ManagerScoreHistorySnapshot,ManagerScoreHistoryStore} from "../src/execution-v2/manager-score-history.store";
import {ManagerScoreRevisionService} from "../src/execution-v2/manager-score-revision.service";
import {managerScoreRevisionHistory,managerScoreRevisionHistoryQuery} from "../src/execution-v2/manager-score-revision.contract";
import {productReadFixture,OWN,PEER,PRIVATE} from "./elp2-product-read.fixture";

const partition={economic_domain:"PAPER" as const,currency:"USDT",basis:"SYNTHETIC:basis",
  native_profile_ref:"SYNTHETIC:native",domain_proof_ref:"SYNTHETIC:domain"};
async function fixture(fields:string[]=[...BUSINESS_READ_FIELDS]){
  const f=productReadFixture({fields}),asOf=Date.now()-60_000;
  const member=(tuple:typeof OWN):ManagerMember=>({tuple,stage:"PAPER",name:tuple.alpha_id,
    owner_user_id:null,lifecycle:null,venue:null,health:null,source_state:null,binding_ref:null,
    assignment_revision:"SYNTHETIC:assignment",owner_revision:"SYNTHETIC:owner",binding_revision:"SYNTHETIC:binding",
    valid_from_ms:asOf-1000,valid_to_ms:null});
  const d:ManagerModelDocument={schema_version:"portal.execution.manager-model-input.v1",workspace_id:f.principal.workspaceId,
    environment:"paper",profile_id:f.config.EXECUTION_EDGE_PAPER_PROFILE_ID,qualification:"SOURCE_VERIFIED",
    family_id:"alpha_fleet_overview",revision:"SYNTHETIC:history-source",supersedes_revision:null,source_epoch:"SYNTHETIC:epoch",
    source_sequence:"1",projection_generation:"SYNTHETIC:history-generation",catalogue_digest:accessDigest("SYNTHETIC:catalogue"),
    source_set_digest:accessDigest([OWN,PEER,PRIVATE]),as_of_ms:asOf,recorded_through_ms:asOf,facts_through_ms:asOf,
    observed_at_ms:asOf,source_quality:{completeness:"COMPLETE",freshness:"STALE",reasons:[]},
    members:[member(OWN),member(PEER),member(PRIVATE)],facts:[]};
  const worker=new ManagerScoreRuntime({maximum_observations:100,maximum_blocks:10,maximum_stress_subperiods:100,
    maximum_input_bytes:65536,maximum_in_flight:1});
  const originalTasks:ManagerScoreRuntimeTask[]=[];
  const score=async(id:string)=>{
    const binding={subject_type:"alpha" as const,subject_id:id,
      tuple_population_digest:managerScorePopulationDigest(d.members.filter(m=>m.tuple.alpha_id===id)),
      partition_digest:accessDigest(partition),stage_filter:["PAPER" as const],window_start_ms:asOf-1000,
      window_end_ms:asOf,comparable_basis_id:"SYNTHETIC:basis",individual_evidence_binding_id:"SYNTHETIC:ledger:"+id};
    const task:ManagerScoreRuntimeTask={scope:{workspace_id:d.workspace_id,environment:d.environment,profile_id:d.profile_id,
      catalogue_digest:d.catalogue_digest},binding,source_revision:d.revision,source_set_digest:d.source_set_digest,
      source_qualification:"SOURCE_VERIFIED",calculation_revision:"SYNTHETIC:calc",computed_at_ms:asOf+1,
      expected_policy_revision:null,policy:null,input:{kind:"METRICS",quality:{comparable_basis_id:binding.comparable_basis_id,
        individual_evidence_binding_id:binding.individual_evidence_binding_id,window_start_ms:asOf-1000,window_end_ms:asOf,
        as_of_ms:asOf,observed_duration_ms:1000,currency:"USDT",required_costs_complete:true,stale:false,data_valid:true,
        sample_count:10,complete_block_count:2,metrics:{net_excess_twr:"0.06",sharpe_period:"0.12",
          mdd:"0.04",add:"0.01",positive_block_ratio:"0.75",stress_excess_twr:"0.045"}}}};
    originalTasks.push(task);
    const result=await worker.calculate(task),{preview:_preview,...quality}=result.quality;
    return managerScorePublication.parse({slot:"RAW",quality,raw_metrics:result.raw_metrics,provenance:result.provenance});
  };
  d.precomputed_scores=[await score(OWN.alpha_id),await score(PEER.alpha_id)];
  const document=managerModelDocument.parse(d);
  const pool={query:vi.fn(async(sql:string,parameters?:unknown[])=>{
    if(sql.includes("execution_manager_model_heads"))return {rows:[{revision:document.revision,source_epoch:document.source_epoch,
      source_sequence:document.source_sequence,projection_generation:document.projection_generation,
      payload_digest:accessDigest(document),catalogue_digest:document.catalogue_digest}]};
    if(sql.includes("execution_manager_model_revisions"))return {rows:String(parameters?.[3])===document.revision?
      [{payload:structuredClone(document),payload_digest:accessDigest(document)}]:[]};
    throw new Error("SYNTHETIC_UNEXPECTED_SQL");
  })};
  // Deliberately NO runtime/coordinator: archived rows must remain readable.
  const service=new ManagerScoreRevisionService(pool as unknown as Pool,f.scopes,f.config);
  const store=Reflect.get(service,"historyStore") as ManagerScoreHistoryStore;
  const scan=vi.spyOn(store,"scan"),unchanged=vi.spyOn(store,"unchanged").mockResolvedValue(true);
  const source={workspace_id:document.workspace_id,environment:document.environment,profile_id:document.profile_id,
    revision:document.revision,payload_digest:accessDigest(document),qualification:document.qualification,
    source_epoch:document.source_epoch,source_sequence:document.source_sequence,projection_generation:document.projection_generation,
    catalogue_digest:document.catalogue_digest,source_set_digest:document.source_set_digest,as_of_ms:document.as_of_ms};
  const originalKey=accessDigest("SYNTHETIC:original"),originalInputs=accessDigest("SYNTHETIC:original-inputs");
  function revision(index:number,ids:string[]=[OWN.alpha_id],prior:string|null=null):ManagerScoreRestatementSnapshot{
    return {schema_version:"portal.execution.manager-score-restatement.v1",revision_mode:"RESTATED_CURRENT_POLICY",
      purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,source,original_custody_key:originalKey,
      original_inputs_digest:originalInputs,policy:{identity_digest:accessDigest("SYNTHETIC:policy:"+index),
        method_digest:accessDigest("SYNTHETIC:method"),policy_revision:"SYNTHETIC:policy:"+index,stress_delta_bps:"5",
        approved_at_ms:asOf+100,valid_until_ms:Date.now()+300_000},calculation_revision:"SYNTHETIC:calc:"+index,
      input_method_revision:"SYNTHETIC:retained-method",knowledge_cutoff_ms:asOf+index*1000,computed_at_ms:asOf+index*1000+1,
      entries:ids.map(id=>({slot:"RAW",binding:originalTasks.find(t=>t.binding.subject_id===id)!.binding,
        original_input_digest:accessDigest("SYNTHETIC:input:"+id),availability:"NOT_PUBLISHED",
        reason_codes:["METRIC_DEPENDENCIES_NOT_RETAINED"],historical:null})),
      calculation_key:accessDigest("SYNTHETIC:private-calculation:"+index),supersedes_calculation_key:prior};
  }
  function snapshot(revisions:ManagerScoreRestatementSnapshot[]):ManagerScoreHistorySnapshot{
    // This is a post-decoder service boundary stub, not a custody-valid bundle.
    // original is intentionally unused by this target projection; real decode
    // / lineage / source hash coupling is separately tested on actual PG.
    return {document,original:null,restatements:structuredClone(revisions),original_head_key:null,
      restated_head_key:revisions.at(-1)?.calculation_key??null,snapshot_digest:accessDigest(revisions)};
  }
  let revisions:ManagerScoreRestatementSnapshot[]=[];
  scan.mockImplementation(async()=>snapshot(revisions));
  const q={environment:"paper",surface:"ALPHA",id:OWN.alpha_id,economic_partition:partition,stage_filter:["PAPER"],
    source_selector:"CURRENT_HEAD",revision_mode:"RESTATED_CURRENT_POLICY"};
  const set=(items:ManagerScoreRestatementSnapshot[])=>{revisions=structuredClone(items);};
  const chain=()=>{const a=revision(1),hidden=revision(2,[PEER.alpha_id],a.calculation_key),
    b=revision(3,[OWN.alpha_id],hidden.calculation_key),c=revision(4,[OWN.alpha_id],b.calculation_key);
    set([a,hidden,b,c]);return {a,hidden,b,c};};
  return {...f,document,pool,service,worker,q,store,scan,unchanged,revision,snapshot,set,chain};
}
type Fixture=Awaited<ReturnType<typeof fixture>>;
const page=(f:Fixture,extra:Record<string,unknown>={})=>f.service.history(f.principal,{...f.q,limit:1,...extra});

describe("R06 scoped Score history service — synthetic post-decoder components only",()=>{
  it("returns an ORIGINAL item despite pending/null score, without optional custody/runtime",async()=>{
    const f=await fixture(),result=await page(f,{revision_mode:"ORIGINAL_AS_PUBLISHED"});
    expect(managerScoreRevisionHistory.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({availability:"AVAILABLE",reason_code:null,page:{returned_count:1,authorized_total_count:1}});
    expect(result.items[0]).toMatchObject({revision_mode:"ORIGINAL_AS_PUBLISHED",availability:"NOT_PUBLISHED",
      supersedes_revision_ref:null,supersedes_reason:"ORIGINAL_HAS_NO_PREDECESSOR",
      score_details:[{binding:{subject_id:OWN.alpha_id},score:{quality:{status:"policy_pending",value:null}}}]});
    expect(f.scan).toHaveBeenCalledTimes(1);
  });
  it("filters target before count and lineage, preserving own method absence without peer materializations",async()=>{
    const f=await fixture(),r=f.chain(),result=await page(f,{limit:50});
    expect(result.page).toMatchObject({returned_count:3,authorized_total_count:3,next_cursor:null,previous_cursor:null});
    expect(result.items.every(v=>v.availability==="NOT_PUBLISHED"&&v.score_details.length===1&&
      v.score_details[0].binding.subject_id===OWN.alpha_id&&v.score_details[0].reason_codes.includes("METRIC_DEPENDENCIES_NOT_RETAINED"))).toBe(true);
    expect(result.items.map(v=>v.computed_at_ms)).toEqual([r.c.computed_at_ms,r.b.computed_at_ms,r.a.computed_at_ms]);
    for(const privateValue of [r.hidden.calculation_key,r.a.calculation_key,r.b.calculation_key,r.c.calculation_key,
      r.hidden.original_inputs_digest,"SYNTHETIC:input:"+PEER.alpha_id,"SYNTHETIC:policy:2"])
      expect(JSON.stringify(result)).not.toContain(privateValue);
    expect(result.items[0]).toMatchObject({supersedes_revision_ref:result.items[1].revision_ref,supersedes_reason:"AUTHORIZED_PREDECESSOR"});
    expect(result.items[1].supersedes_revision_ref).toBe(result.items[2].revision_ref);
    const original=await f.service.read(f.principal,{...f.q,revision_mode:"ORIGINAL_AS_PUBLISHED"});
    expect(result.items[2].supersedes_revision_ref).toBe(original.revision_ref);
  });
  it("round-trips opaque forward/back boundaries in newest-first causal order",async()=>{
    const f=await fixture();f.chain();
    const first=await page(f),second=await page(f,{after:first.page.next_cursor}),
      third=await page(f,{after:second.page.next_cursor}),back=await page(f,{before:third.page.previous_cursor}),
      backFirst=await page(f,{before:back.page.previous_cursor});
    expect(first.page.previous_cursor).toBeNull();expect(third.page.next_cursor).toBeNull();
    expect(new Set([first,second,third].map(p=>p.items[0].revision_ref)).size).toBe(3);
    expect(back.items[0].revision_ref).toBe(second.items[0].revision_ref);
    expect(backFirst.items[0].revision_ref).toBe(first.items[0].revision_ref);
    expect([first,second,third,back].every(p=>p.page.authorized_total_count===3)).toBe(true);
  });
  it("rejects simultaneous before/after and out-of-contract limits before scan",async()=>{
    const f=await fixture();
    for(const bad of [{before:"x",after:"y"},{limit:0},{limit:51}]){
      expect(managerScoreRevisionHistoryQuery.safeParse({...f.q,...bad}).success).toBe(false);
      await expect(page(f,bad)).rejects.toMatchObject({status:400});
    }
    expect(f.scan).not.toHaveBeenCalled();
  });
  it("rejects cursor tampering and limit/mode context changes, rather than applying an offset",async()=>{
    const f=await fixture();f.chain();const first=await page(f),token=first.page.next_cursor!;
    const firstChar=token[0]==="A"?"B":"A";
    await expect(page(f,{after:firstChar+token.slice(1)})).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    await expect(page(f,{after:token,limit:2})).rejects.toMatchObject({status:409});
    await expect(page(f,{after:token,revision_mode:"ORIGINAL_AS_PUBLISHED"})).rejects.toMatchObject({status:409});
  });
  it("resolves an older public ref after a newer materialization, independently of coordinator installation",async()=>{
    const f=await fixture(),a=f.revision(1),b=f.revision(2,[OWN.alpha_id],a.calculation_key);
    f.set([a]);const old=await f.service.read(f.principal,f.q);
    f.set([a,b]);const selected=await f.service.read(f.principal,{...f.q,revision_ref:old.revision_ref});
    expect(selected.revision_ref).toBe(old.revision_ref);expect(selected.computed_at_ms).toBe(a.computed_at_ms);
    expect((await f.service.read(f.principal,f.q)).computed_at_ms).toBe(b.computed_at_ms);
  });
  it("returns the same finite404 for unknown public ref and a private calculation-key guess",async()=>{
    const f=await fixture(),a=f.revision(1);f.set([a]);
    for(const revision_ref of [accessDigest("SYNTHETIC:unknown-public-ref"),a.calculation_key])
      await expect(f.service.read(f.principal,{...f.q,revision_ref}))
        .rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
  });
  it("denies absent approved score/provenance fields before inventory scan",async()=>{
    for(const field of ["score","provenance_ref"]){
      const f=await fixture(BUSINESS_READ_FIELDS.filter(value=>value!==field));
      await expect(page(f)).rejects.toMatchObject({status:404});expect(f.scan).not.toHaveBeenCalled();
    }
  });
  it("denies hidden target, wrong workspace and whole-accounting escalation before scan",async()=>{
    const f=await fixture();
    for(const invalid of [{id:PEER.alpha_id},{workspace_id:"SYNTHETIC:other-workspace"},
      {surface:"FUND",id:undefined},{surface:"PORTFOLIO",id:OWN.portfolio_id}])
      await expect(page(f,invalid)).rejects.toMatchObject({status:404});
    expect(f.scan).not.toHaveBeenCalled();
  });
  it("preserves expired historical materialization and its cursor while classifying NOT_CURRENT",async()=>{
    const f=await fixture(),a=f.revision(1),b=f.revision(2,[OWN.alpha_id],a.calculation_key);
    // Both historical calculations completed before this already-past expiry.
    // No global clock seam, wall-clock sleep or immutable policy mutation.
    a.policy.valid_until_ms=f.document.as_of_ms+30_000;b.policy.valid_until_ms=f.document.as_of_ms+30_000;
    f.set([a,b]);const first=await page(f);
    expect(first.items[0].eligibility.policy_state).toBe("NOT_CURRENT");
    const second=await page(f,{after:first.page.next_cursor});
    expect(second.items[0]).toMatchObject({computed_at_ms:a.computed_at_ms,
      eligibility:{policy_current:false,policy_state:"NOT_CURRENT",reason_code:"CURRENT_POLICY_NOT_CONFIRMED"}});
    expect(second.page.authorized_total_count).toBe(2);
    const again=await f.service.read(f.principal,{...f.q,revision_ref:second.items[0].revision_ref});
    expect(again.eligibility.policy_state).toBe("NOT_CURRENT");
  });
  it("does not bind pagination to mutable current-policy classification",async()=>{
    const f=await fixture();f.chain();let state:"CURRENT"|"NOT_CURRENT"="CURRENT";
    // Explicit component seam only: no current-policy approval is asserted.
    Reflect.set(f.service,"runtime",{restatementFor:()=>({classifyPolicy:()=>state})});
    const first=await page(f);expect(first.items[0].eligibility.policy_state).toBe("CURRENT");
    state="NOT_CURRENT";
    const next=await page(f,{after:first.page.next_cursor});
    expect(next.page.authorized_total_count).toBe(3);
    expect(next.items[0].eligibility.policy_state).toBe("NOT_CURRENT");
  });
  it("rechecks actual grant during final provider await and never releases a revoked history",async()=>{
    const f=await fixture(),a=f.revision(1);f.set([a]);
    const authority=f.access.readPublication.getMockImplementation()!;let finishing=false,revoked=false;
    f.unchanged.mockImplementation(async()=>{finishing=true;return true;});
    f.access.readPublication.mockImplementation(async request=>{
      const result=await authority(request);
      if(finishing&&!revoked){revoked=true;f.context.grants=f.context.grants.filter(g=>g.action!=="alpha.read");}
      return result;
    });
    await expect(page(f)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(revoked).toBe(true);
  });
  it("rescans once and accepts hidden-only append without changing existing public cursor",async()=>{
    const f=await fixture(),a=f.revision(1),b=f.revision(2,[OWN.alpha_id],a.calculation_key);f.set([a,b]);
    const first=await page(f),hidden=f.revision(3,[PEER.alpha_id],b.calculation_key);
    f.scan.mockReset().mockResolvedValueOnce(f.snapshot([a,b])).mockResolvedValue(f.snapshot([a,b,hidden]));
    f.unchanged.mockReset().mockResolvedValueOnce(false).mockResolvedValue(true);
    const second=await page(f,{after:first.page.next_cursor});
    expect(f.scan).toHaveBeenCalledTimes(2);
    expect(second.items[0].computed_at_ms).toBe(a.computed_at_ms);
    expect(second.page.authorized_total_count).toBe(2);
  });
  it("refuses visible projected change during inventory verification",async()=>{
    const f=await fixture(),a=f.revision(1),b=f.revision(2,[OWN.alpha_id],a.calculation_key);
    f.scan.mockReset().mockResolvedValueOnce(f.snapshot([a])).mockResolvedValue(f.snapshot([a,b]));
    f.unchanged.mockReset().mockResolvedValueOnce(false).mockResolvedValue(true);
    await expect(page(f)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(f.scan).toHaveBeenCalledTimes(2);
  });
  it("bounded re-scan accepts stable authorized projection despite repeated metadata instability",async()=>{
    const f=await fixture(),a=f.revision(1),firstHidden=f.revision(2,[PEER.alpha_id],a.calculation_key),
      nextHidden=f.revision(3,[PEER.alpha_id],firstHidden.calculation_key);
    f.scan.mockReset().mockResolvedValueOnce(f.snapshot([a,firstHidden]))
      .mockResolvedValue(f.snapshot([a,firstHidden,nextHidden]));
    // Every metadata check would report further global instability. The second
    // coherent READ ONLY snapshot has the same authorized projection and is
    // sufficient; never chase another hidden append or publish its existence.
    f.unchanged.mockReset().mockResolvedValue(false);
    const result=await page(f);
    expect(result).toMatchObject({availability:"AVAILABLE",page:{returned_count:1,authorized_total_count:1}});
    expect(result.items[0].computed_at_ms).toBe(a.computed_at_ms);
    expect(f.scan).toHaveBeenCalledTimes(2);expect(f.unchanged).toHaveBeenCalledTimes(1);
  });
});
