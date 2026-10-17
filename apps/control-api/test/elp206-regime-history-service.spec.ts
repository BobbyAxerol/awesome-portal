/** Actual BFF/current scope/HMAC/cursors with genuine original and worker
 * codecs. ONLY store delivery is a synthetic post-decoder seam, not PG/HTTP,
 * TS source, current-provider or commissioning proof. Actual PG is tested in
 * elp206-regime-restatement and elp210-commissioning suites. */
import "reflect-metadata";
import type {Pool} from "pg";
import {describe,expect,it,vi} from "vitest";
import {accessDigest} from "../src/execution-v2/access-policy";
import {ManagerScoreRevisionService} from "../src/execution-v2/manager-score-revision.service";
import {managerScoreRevisionView,managerScoreRevisionHistory} from "../src/execution-v2/manager-score-revision.contract";
import {type ManagerScoreHistoryStore,type ManagerScoreHistorySnapshot} from "../src/execution-v2/manager-score-history.store";
import {decodeRetainedManagerRegimeRestatementBundle,type ManagerRegimeRestatementSnapshot,
  MANAGER_REGIME_RESTATEMENT_VERSION,MANAGER_REGIME_RESTATEMENT_HEAD} from "../src/execution-v2/manager-regime-restatement";
import {MANAGER_REGIME_HISTORICAL_WORKER_VERSION} from "../src/execution-v2/manager-regime-restatement-worker";
import {FIELDS,prepared,historicalRevision,K,C} from "./helpers/manager-regime-history";
import {OWN,PEER} from "./elp2-product-read.fixture";

async function fixture(omitted?:string){
  const f=await prepared({fields:[...FIELDS,"profile_id"].filter(x=>x!==omitted)}),d=f.document,p=f.product;
  let sourceChanged=false;
  const pool={query:vi.fn(async(sql:string)=>{
    if(sql.includes("execution_manager_model_heads"))return {rows:[{revision:d.revision,payload_digest:
      sourceChanged?accessDigest("TEST_ONLY:changed-source"):accessDigest(d)}]};
    if(sql.includes("execution_manager_model_revisions"))return {rows:[{payload:structuredClone(d),payload_digest:accessDigest(d)}]};
    throw Error("TEST_ONLY_UNEXPECTED_HISTORY_SQL");
  })};
  const service=new ManagerScoreRevisionService(pool as unknown as Pool,p.scopes,p.config),
    store=Reflect.get(service,"historyStore") as ManagerScoreHistoryStore;
  const scan=vi.spyOn(store,"scan"),unchanged=vi.spyOn(store,"unchanged").mockResolvedValue(true);
  let revisions:ManagerRegimeRestatementSnapshot[]=[],original:ManagerScoreHistorySnapshot["original"]=f.row.payload;
  const snapshot=():ManagerScoreHistorySnapshot=>({document:d,original,
    original_head_key:original?.calculation_key??null,restatements:[],restated_head_key:null,
    regime_restatements:revisions,regime_restated_head_key:revisions.at(-1)?.calculation_key??null,
    snapshot_digest:accessDigest({original,revisions})});
  scan.mockImplementation(async()=>snapshot());
  const actual=await historicalRevision(f);
  async function revision(index:number,previous:string|null=null){
    const calculation_revision="TEST_ONLY:bff-regime-"+index;
    const result=await actual.worker.calculateHistoricalRegime({original:actual.original,
      original_custody_key:f.row.calculation_key,original_inputs_digest:f.row.payload.inputs_digest,
      policy:f.calculated.policy,knowledge_cutoff_ms:K,computed_at_ms:C,calculation_revision});
    if(result.status!=="READY")throw Error(JSON.stringify(result));
    const h=result.publication,policy=h.policy,o=f.row.payload;
    const calculation_key=accessDigest({domain:MANAGER_REGIME_RESTATEMENT_VERSION,head_kind:MANAGER_REGIME_RESTATEMENT_HEAD,
      worker_schema_version:MANAGER_REGIME_HISTORICAL_WORKER_VERSION,source:o.source,original_custody_key:o.calculation_key,
      original_inputs_digest:o.inputs_digest,original_regime_custody_digests:o.retained_regimes.map(x=>x.custody_digest),
      policy_identity_digest:accessDigest(policy),calculation_revision});
    const payload:ManagerRegimeRestatementSnapshot={schema_version:MANAGER_REGIME_RESTATEMENT_VERSION,
      revision_mode:"RESTATED_CURRENT_POLICY",purpose:"HISTORICAL_ANALYSIS_ONLY",operational_current:false,
      source:o.source,original_custody_key:o.calculation_key,original_inputs_digest:o.inputs_digest,
      worker_schema_version:MANAGER_REGIME_HISTORICAL_WORKER_VERSION,policy,policy_identity_digest:accessDigest(policy),
      calculation_revision,knowledge_cutoff_ms:K,computed_at_ms:C,calculation_key,supersedes_calculation_key:previous,
      entries:[{binding:h.binding,regime_custody_digest:f.custodies[0].custody_digest,historical:h}]};
    return decodeRetainedManagerRegimeRestatementBundle({calculation_key,payload,payload_digest:accessDigest(payload)},
      o,d,1_048_576,Date.now());
  }
  const q={environment:"paper",surface:"ALPHA",id:OWN.alpha_id,metric_family:"REGIME",stage_filter:["PAPER"],
    economic_partition:f.f.evidence.partition,source_selector:"CURRENT_HEAD",revision_mode:"RESTATED_CURRENT_POLICY"};
  const set=(items:ManagerRegimeRestatementSnapshot[])=>{revisions=items;};
  async function chain(){const a=await revision(1),b=await revision(2,a.calculation_key),c=await revision(3,b.calculation_key);
    set([a,b,c]);return {a,b,c};}
  return {...f,...p,pool,service,store,scan,unchanged,q,set,chain,revision,actual,
    missing:()=>{original=null;},changeSource:()=>{sourceChanged=true;}};
}
type F=Awaited<ReturnType<typeof fixture>>;
const page=(f:F,extra:Record<string,unknown>={})=>f.service.history(f.principal,{...f.q,limit:1,...extra});

describe("independent historical Regime BFF — real components / synthetic post-decoder store",()=>{
  it("serves original Regime using no financial Score grant, calculator or current operational claim",async()=>{
    const f=await fixture(),compute=vi.spyOn(f.actual.worker,"calculateHistoricalRegime");
    const result=await f.service.read(f.principal,{...f.q,revision_mode:"ORIGINAL_AS_PUBLISHED"});
    expect(managerScoreRevisionView.parse(result)).toEqual(result);
    expect(result).toMatchObject({availability:"AVAILABLE",score_details:[],operational_current:false,
      regime:{availability:"AVAILABLE",entries:[{binding:{subject_id:OWN.alpha_id}}]}});
    expect(compute).not.toHaveBeenCalled();
  });
  it("round-trips independent causal HMAC pages and an older exact ref after append, with expired historical policy",async()=>{
    const f=await fixture();const {a,b,c}=await f.chain(),first=await page(f),second=await page(f,{after:first.page.next_cursor}),
      third=await page(f,{after:second.page.next_cursor}),back=await page(f,{before:third.page.previous_cursor});
    expect(first.page.authorized_total_count).toBe(3);expect(third.page.next_cursor).toBeNull();
    expect(back.items[0].revision_ref).toBe(second.items[0].revision_ref);
    expect(new Set([first,second,third].map(p=>p.items[0].revision_ref)).size).toBe(3);
    expect(first.items[0].supersedes_revision_ref).toBe(second.items[0].revision_ref);
    expect(second.items[0].supersedes_revision_ref).toBe(third.items[0].revision_ref);
    expect(first.items[0].eligibility).toMatchObject({policy_current:false,policy_state:"NOT_CURRENT"});
    const pinned=await f.service.read(f.principal,{...f.q,revision_ref:third.items[0].revision_ref});
    expect(pinned.revision_ref).toBe(third.items[0].revision_ref);expect(pinned.regime).toEqual(third.items[0].regime);
    for(const privateKey of [a.calculation_key,b.calculation_key,c.calculation_key,f.row.calculation_key,f.row.payload.inputs_digest])
      expect(JSON.stringify([first,second,third,pinned])).not.toContain(privateKey);
    expect(managerScoreRevisionHistory.safeParse(first).success).toBe(true);
  });
  it("keeps missing independent chain zero, but missing original corpus null-count and guessed absence ref404",async()=>{
    const f=await fixture(),empty=await page(f);expect(empty.page.authorized_total_count).toBe(0);
    const absence=await f.service.read(f.principal,f.q);expect(absence.regime).toEqual({availability:"NOT_PUBLISHED",
      reason_code:"INDEPENDENT_REGIME_RESTATEMENT_NOT_PUBLISHED"});
    await expect(f.service.read(f.principal,{...f.q,revision_ref:absence.revision_ref})).rejects.toMatchObject({status:404});
    f.missing();const missing=await page(f);
    expect(missing).toMatchObject({availability:"NOT_PUBLISHED",reason_code:"REGIME_ORIGINAL_CORPUS_AUTHORITY_NOT_RETAINED",
      page:{returned_count:null,authorized_total_count:null,next_cursor:null,previous_cursor:null},items:[]});
  });
  it.each(["regime","profile_id","binding_id"])("denies missing current %s authority before history scan",async omitted=>{
    const f=await fixture(omitted);await expect(page(f)).rejects.toMatchObject({status:404});expect(f.scan).not.toHaveBeenCalled();
  });
  it("denies hidden/unknown target and wrong workspace before private history selection",async()=>{
    const f=await fixture();for(const extra of [{id:PEER.alpha_id},{id:"TEST_ONLY:unknown"},{workspace_id:"TEST_ONLY:wrong"}])
      await expect(page(f,extra)).rejects.toMatchObject({code:"EXECUTION_READ_NOT_AVAILABLE",status:404});
    expect(f.scan).not.toHaveBeenCalled();
  });
  it.each(["limit","family","workspace","partition"])("refuses replayed cursor with changed %s",async axis=>{
    const f=await fixture();await f.chain();const first=await page(f),extra=axis==="limit"?{limit:2}:
      axis==="family"?{metric_family:"SCORE"}:axis==="workspace"?{workspace_id:"TEST_ONLY:foreign"}:
      {economic_partition:{...f.q.economic_partition,basis:"TEST_ONLY:other"}};
    await expect(page(f,{after:first.page.next_cursor,...extra})).rejects.toMatchObject({status:axis==="family"||axis==="workspace"?404:409});
  });
  it("invalidates old history cursor only after a visible append",async()=>{
    const f=await fixture(),a=await f.revision(1),b=await f.revision(2,a.calculation_key);f.set([a,b]);
    const first=await page(f),c=await f.revision(3,b.calculation_key);f.set([a,b,c]);
    await expect(page(f,{after:first.page.next_cursor})).rejects.toMatchObject({status:409});
  });
  it("source change before final delivery never releases historical data",async()=>{
    const f=await fixture();await f.chain();f.unchanged.mockImplementation(async()=>{f.changeSource();return true;});
    await expect(page(f)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
  });
  it("rechecks actual current grant at the final awaited source publication boundary",async()=>{
    const f=await fixture();await f.chain();const authority=f.access.readPublication.getMockImplementation()!;
    let finishing=false,revoked=false;f.unchanged.mockImplementation(async()=>{finishing=true;return true;});
    f.access.readPublication.mockImplementation(async request=>{const result=await authority(request);
      if(finishing&&!revoked){revoked=true;f.context.grants=f.context.grants.filter(g=>g.action!=="alpha.read");}return result;});
    await expect(page(f)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});expect(revoked).toBe(true);
  });
});
