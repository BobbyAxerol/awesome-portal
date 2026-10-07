import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,it,expect,vi} from "vitest";
import {WindowExecutionPageSchema,WindowAnalyticsSchema,WindowExecutionSourceSchema,WindowExecutionBatchSchema,
  WindowExecutionSealSchema} from "../src/research/window-execution.contract";
import {ResearchWindowExecutionService} from "../src/research/window-execution.service";
import {sha256ResearchJson} from "../src/research/preflight.service";
import {replayNavigation,replayBoundIdentity} from "../src/research/replay-navigation";
import {ReplayNavigationSchema} from "../src/research/replay-navigation.contract";
import {openApiValidator} from "./research-rf05-openapi";

const scope={workspaceId:"window-workspace",actorUserId:"window-user"},runId="rrun_"+"a".repeat(32);
const config={FEATURE_RESEARCH_REPLAY:"true",FEATURE_RESEARCH_COMPARE:"true",QUERY_CURSOR_ACTIVE_KEY_ID:"k1",
  QUERY_CURSOR_KEYS_JSON:JSON.stringify({k1:"window-query-signing-key-at-least-32-bytes"}),QUERY_CURSOR_TTL_SECONDS:900};
const contractsDir=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,"../../../packages/contracts");
const fixture=JSON.parse(readFileSync(resolve(contractsDir,"fixtures/research-window-execution.holdout.synthetic.valid.json"),"utf8"));
function harness(){
  const observation={kind:"OBSERVATION",window:"HOLDOUT",fold_id:null,at_utc_ms:fixture.descriptor.start_utc_ms,
    payload:{equity:"20000",return_fraction:"0",drawdown_fraction:"0",accepted_position:"0",signal_target:null,candle:null,
      fee:null,funding:null,turnover:null,active_stop:null,active_take_profit:null}};
  const rows=Array.from({length:201},(_,i)=>({...observation,source_ordinal:i,at_utc_ms:observation.at_utc_ms+i*3600000}));
  const state={pending:false,revision:"b".repeat(64),manifest:{source:{protocol:"three_window_decay",windows:[fixture.descriptor]}}};
  const page=vi.fn(async(_s:any,_id:string,q:any,_kind:string,after:(revision:string|null)=>number|undefined)=>{
    const start=after(state.revision),available=rows.filter(r=>start===undefined||r.source_ordinal>start);
    return {...state,rows:available.slice(0,q.limit),matching:201,hasMore:available.length>q.limit};
  });
  return {rows,state,page,service:new ResearchWindowExecutionService({page} as never,config as never)};
}
describe("WEX per-window source contracts and authority",()=>{
  it("publishes canonical full Holdout analytics through generated OpenAPI and Zod",()=>{
    WindowExecutionPageSchema.parse(fixture);
    openApiValidator("research-window-execution.openapi.json","WindowExecutionPage").assert(fixture);
    const a=fixture.rows[0].payload;
    expect(Object.keys(a.metrics)).toHaveLength(25);
    expect(a.monthly_returns.definition_id).toMatch(/^WINDOW_/);
    for(const changed of [{...a,window:"IS"},{...a,input_digest:"c".repeat(64)},
      {...a,observation_count:a.observation_count+1},{...a,end_exclusive_utc_ms:a.last_observed_utc_ms}])
      expect(WindowAnalyticsSchema.safeParse(changed).success).toBe(false);
  });
  it("pages once over exact source ordinals and binds cursor to actor/window/filter/revision",async()=>{
    const h=harness(),first=await h.service.read(scope,runId,{window:"HOLDOUT",limit:200},"OBSERVATION");
    expect(first.rows).toHaveLength(200);expect(first.next_cursor).toBeTruthy();
    const last=await h.service.read(scope,runId,{window:"HOLDOUT",limit:200,cursor:first.next_cursor},"OBSERVATION");
    expect(last.rows).toEqual(h.rows.slice(200));expect(last.next_cursor).toBeNull();
    for(const [s,q]of [[{...scope,actorUserId:"other"},{window:"HOLDOUT",limit:200}],
      [scope,{window:"IS",limit:200}],[scope,{window:"HOLDOUT",limit:1}],
      [scope,{window:"HOLDOUT",limit:200,at_utc_ms:1700000000000}]] as const)
      await expect(h.service.read(s,runId,{...q,cursor:first.next_cursor},"OBSERVATION")).rejects.toMatchObject({status:400});
    h.state.revision="e".repeat(64);
    await expect(h.service.read(scope,runId,{window:"HOLDOUT",limit:200,cursor:first.next_cursor},"OBSERVATION")).rejects.toMatchObject({status:400});
  });
  it("does not publish protected/absent windows as empty AVAILABLE",async()=>{
    const page=vi.fn(async()=>({manifest:null,revision:null,rows:[],matching:null,hasMore:false,pending:true}));
    const service=new ResearchWindowExecutionService({page} as never,config as never);
    expect(await service.read(scope,runId,{window:"HOLDOUT"},"OBSERVATION")).toMatchObject({rows:[],
      availability:{state:"NOT_PUBLISHED",reason_code:"RUN_NOT_COMPLETED_WINDOW_PROTECTED"}});
    expect(await service.navigation(scope,runId)).toBeUndefined();
    for(const q of [{workspace_id:"foreign"},{limit:201},{table:"fills"},{window:"HOLDOUT",record_kind:"ORDER"}])
      await expect(service.read(scope,runId,q,"OBSERVATION")).rejects.toMatchObject({status:400});
    expect(page).toHaveBeenCalledTimes(2);
  });
  it("requires exact ingress identity, byte/digest and contiguous row custody",async()=>{
    const rows=fixture.rows.map((r:any)=>({...r,source_ordinal:0}));
    const source={schema_version:"research.window-execution-source.v1",protocol:"three_window_decay",execution_route:"pct_equity",
      row_count:1,rows_digest:sha256ResearchJson(rows),counts:{ANALYTICS:1,OBSERVATION:0,EXECUTION:0},windows:[fixture.descriptor],
      authority:fixture.authority};
    const manifest={schema_version:"research.window-execution-manifest.v1",workspace_id:scope.workspaceId,run_id:runId,
      artifact_id:"window-artifact",artifact_revision:1,manifest_digest:"a".repeat(64),requested_spec_digest:"b".repeat(64),
      effective_spec_digest:"c".repeat(64),dataset_binding_digest:"d".repeat(64),execution_profile_id:"window-profile",
      execution_profile_digest:null,source};
    const body={schema_version:"research.window-execution-batch.v1",workspace_id:scope.workspaceId,run_id:runId,
      job_id:"window-job",worker_attempt_id:"window-worker",lease_epoch:1,manifest,companion_digest:sha256ResearchJson(manifest),
      artifact_manifest_json:"{}",source_document_json:JSON.stringify(source),batch_ordinal:0,start_ordinal:0,
      batch_digest:sha256ResearchJson(rows),rows};
    expect(WindowExecutionBatchSchema.safeParse(body).success).toBe(true);
    for(const mutation of [{...body,rows:[]},{...body,start_ordinal:1},{...body,batch_digest:"f".repeat(64)},
      {...body,companion_digest:"f".repeat(64)},{...body,workspace_id:"foreign"}])
      expect(WindowExecutionBatchSchema.safeParse(mutation).success).toBe(false);
    const {batch_ordinal,start_ordinal,batch_digest,rows:batchRows,...seal}=body;
    expect(WindowExecutionSealSchema.safeParse({...seal,schema_version:"research.window-execution-seal.v1"}).success).toBe(true);
    const append=vi.fn(),service=new ResearchWindowExecutionService({append} as never,config as never);
    await expect(service.ingest({workspaceId:scope.workspaceId,actorUserId:scope.actorUserId,jobId:"foreign-job",
      workerAttemptId:body.worker_attempt_id,leaseEpoch:1} as never,body)).rejects.toMatchObject({status:409});
    expect(append).not.toHaveBeenCalled();
  });
  it("compares full same-window populations rather than sampled display curves and respects its feature gate",async()=>{
    const correlation=vi.fn(async()=>({matched:48,value:0.9}));
    const page=vi.fn(async()=>({manifest:{source:{windows:[fixture.descriptor]}},revision:fixture.revision,
      pending:false,rows:fixture.rows,matching:1,hasMore:false}));
    const runs=[runId,"rrun_"+"b".repeat(32)] as [string,string];
    const service=new ResearchWindowExecutionService({page,correlation} as never,config as never);
    const response=await service.compare(scope,runs,{window:"HOLDOUT",limit:1});
    expect(response.runs[0]?.analysis).toEqual(fixture.rows[0].payload);
    expect(response.correlation).toMatchObject({state:"AVAILABLE",value:"0.9",matched_observation_count:48});
    openApiValidator("research-window-execution.openapi.json","WindowCompare").assert(response);
    const disabled=new ResearchWindowExecutionService({page,correlation} as never,{...config,FEATURE_RESEARCH_COMPARE:"false"} as never);
    await expect(disabled.compare(scope,runs,{window:"HOLDOUT",limit:1})).rejects.toMatchObject({status:503});
  });
  it("only completed Three Window custody can disclose Holdout; WFO has no independent Holdout",()=>{
    const identity=replayBoundIdentity(undefined);
    const source={protocol:"three_window_decay",windows:[fixture.descriptor]} as any;
    const disclosed=replayNavigation(identity,undefined,undefined,source);
    ReplayNavigationSchema.parse(disclosed);
    expect(disclosed.holdout_window).toMatchObject({bars:48,availability:{state:"AVAILABLE"},access_basis:"COMPLETED_THREE_WINDOW_RETAINED_ACCOUNT"});
    openApiValidator("research-replay.openapi.json","ReplayNavigationWindow").assert(disclosed.holdout_window);
    const wfo=replayNavigation(identity,undefined,[],{protocol:"advanced_walk_forward",windows:[]} as any);
    expect(wfo.holdout_window.availability.state).toBe("NOT_APPLICABLE");
    expect(WindowExecutionSourceSchema.safeParse({...source,schema_version:"research.window-execution-source.v1",execution_route:"pct_equity",row_count:0,
      rows_digest:"a".repeat(64),counts:{OBSERVATION:0,ANALYTICS:0,EXECUTION:0},protocol:"advanced_walk_forward",
      authority:"COMPLETED_RETAINED_ACCOUNT_AND_ENGINE_AUDIT_NOT_BROKER_HISTORY"}).success).toBe(false);
  });
});
