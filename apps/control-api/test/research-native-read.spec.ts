import {describe,it,expect,vi} from "vitest";
import {NativeCustodySchema,NativeSearchSchema,NativeFreezeSchema} from "../src/research/native-read.contract";
import {ResearchNativeReadService} from "../src/research/native-read.service";
import {ResearchNativeReadRepository} from "../src/research/native-read.repository";
import {sha256ResearchJson} from "../src/research/preflight.service";
import {executionRecipe} from "../src/research/execution-recipes";
import {ResearchNativeReportSchema} from "../src/research/native-report.contract";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {openApiValidator} from "./research-rf05-openapi";
import {ResearchFreezeService} from "../src/research/freeze.service";
import {notYet} from "../src/research/artifact-verify.contract";
const scope={workspaceId:"ws_native",actorUserId:"usr_native"},recipe=executionRecipe("p10.delta-event-driven-limit-oco-search-1h.v1");
const config={QUERY_CURSOR_ACTIVE_KEY_ID:"k1",QUERY_CURSOR_KEYS_JSON:JSON.stringify({k1:"native-test-query-key-at-least-32-bytes"}),QUERY_CURSOR_TTL_SECONDS:900};
export function nativeCustody(n=300){
  const parameters={threshold:"42"};
  return NativeCustodySchema.parse({schema_version:"research.native-read-custody.v2",selection_evidence:null,workspace_id:scope.workspaceId,run_id:"rrun_native",artifact_id:"rart_native",artifact_revision:1,
    manifest_digest:"a".repeat(64),requested_spec_digest:"b".repeat(64),effective_spec_digest:"c".repeat(64),dataset_binding_digest:"d".repeat(64),
    execution_profile_id:recipe.profile_id,execution_profile_digest:recipe.profile_digest,engine_version:"1.1.1",
    summary:{schema_version:"research.native-optimization.v1",authority:"PINNED_QUANTBT_NATIVE_IS_SHARPE",scope:"P08_WARMUP_PLUS_IS_ONLY",objective_name:"sharpe",
      selection_method:"QUANTBT_GENERIC_ROBUST_PLATEAU_NOT_SCALAR_WFO_V1",requested_trials:n,completed_trials:n,retained_trials:n,distinct_parameter_sets:1,
      selected_trial_number:n-1,selected_parameters:parameters,selected_objective:"1.23",train_start_utc_ms:100,train_end_exclusive_utc_ms:200,holdout_used:false,
      table_kind:"native_optimizer_trials",table_schema_version:"research.native-optimizer-trial-table.v1",sha256:"e".repeat(64)},
    source_parts:Array.from({length:Math.ceil(n/128)},(_,i)=>({ordinal:i+1,sha256:"f".repeat(64),rows:Math.min(128,n-i*128),bytes:2048})),
    selected_parameters_digest:sha256ResearchJson(parameters),verification_scope:"P05_MANIFEST_ALL_PARTS_AND_DOCUMENTS_AT_PREPARATION",
    trials:Array.from({length:n},(_,i)=>({source_ordinal:i,trial_number:i,trial_ordinal:i+1,scope:"NATIVE_IS_STUDY",state:"COMPLETE",parameters,
      objective:{value:"1.23",availability:{state:"AVAILABLE",reason_code:null}},metrics:{},selected:i===n-1}))});
}
function subject(n=300){const custody=nativeCustody(n),stored={custody,digest:sha256ResearchJson(custody),checkedAtUtcMs:1790000000000};
  const repo={read:vi.fn().mockResolvedValue(stored),binding:vi.fn(),store:vi.fn()};
  return {stored,repo,service:new ResearchNativeReadService(repo as never,config as never)};}
describe("§55 complete bounded native read custody",()=>{
  it("serves every trial exactly once, including selection beyond first page",()=>{
    const v=subject(400),first=v.service.search(scope,v.stored),second=v.service.search(scope,v.stored,first.ledger.next_cursor!);
    expect(first.ledger.rows).toHaveLength(200);expect(second.ledger.rows).toHaveLength(200);expect(second.ledger.next_cursor).toBeNull();
    expect(new Set([...first.ledger.rows,...second.ledger.rows].map(r=>r.trial_number)).size).toBe(400);
    expect(first.selected_trial_number).toBe(399);expect(first.selected_trial_ordinal).toBe(400);
    expect(second.ledger.rows.at(-1)!.selected).toBe(true);
    expect(NativeSearchSchema.safeParse(first).success).toBe(true);
    openApiValidator("research-search.openapi.json","NativeSearch").assert(first);
    expect(Buffer.byteLength(JSON.stringify(first))).toBeLessThan(1024*1024);
  });
  it("binds cursor to actor/workspace/revision/limit and rejects forged boundaries",()=>{
    const v=subject(),cursor=v.service.search(scope,v.stored).ledger.next_cursor!;
    for(const s of [{...scope,actorUserId:"other"},{...scope,workspaceId:"other"}])expect(()=>v.service.search(s,v.stored,cursor)).toThrow();
    expect(()=>v.service.search(scope,{...v.stored,digest:"9".repeat(64)},cursor)).toThrow();
    expect(()=>v.service.search(scope,v.stored,cursor,100)).toThrow();
    expect(()=>v.service.search(scope,v.stored,"forged")).toThrow();
  });
  it("publishes exact digests and narrowly-scoped integrity, not a scalar certificate",()=>{
    const v=subject(),freeze=v.service.freeze(v.stored);
    expect(freeze.integrity).toMatchObject({state:"MATCH_AT_PREPARATION",current_bytes_rechecked:false});
    expect(freeze.selected_parameters_digest).toBe(sha256ResearchJson(v.stored.custody.summary.selected_parameters));
    expect(freeze.artifact.source_table_digest).not.toBe(freeze.artifact.source_parts[0]!.sha256);
    expect(freeze.scalar_wfo_certificate.state).toBe("NOT_APPLICABLE");
    expect(NativeFreezeSchema.safeParse(freeze).success).toBe(true);
    openApiValidator("research-freeze.openapi.json","NativeFreeze").assert(freeze);
  });
  it("reads never prepare files, enqueue compute or write a sidecar",async()=>{
    const v=subject();await v.service.read(scope,"rrun_native");
    expect(v.repo.read).toHaveBeenCalledOnce();expect(v.repo.binding).not.toHaveBeenCalled();expect(v.repo.store).not.toHaveBeenCalled();
  });
  it("native Freeze ETag uses persisted observations, not the read transaction clock",async()=>{
    const v=subject(3),c=v.stored.custody;
    const row={kind:"DURABLE",runId:c.run_id,executionProfileId:c.execution_profile_id,
      adapterContractDigest:recipe.descriptor.adapter_contract_digest,requestedSpecDigest:c.requested_spec_digest,
      effectiveSpecDigest:c.effective_spec_digest,datasetBindingDigest:c.dataset_binding_digest,
      manifestDigest:c.manifest_digest,projection:null,jobState:"SUCCEEDED",
      sourceAsOfUtcMs:v.stored.checkedAtUtcMs-1000,asOfUtcMs:v.stored.checkedAtUtcMs+1000};
    const repository={hub:vi.fn().mockImplementation(async()=>({...row,asOfUtcMs:row.asOfUtcMs++}))};
    const bytes={latest:vi.fn().mockResolvedValue(notYet("NOT_VERIFIED","P05_BYTES_NOT_VERIFIED"))};
    const service=new ResearchFreezeService(repository as never,{FEATURE_RESEARCH_FREEZE:"true"} as never,
      undefined,bytes as never,v.service);
    const first=await service.detail(scope,c.run_id,{}),second=await service.detail(scope,c.run_id,{});
    expect(first.as_of_utc_ms).toBe(v.stored.checkedAtUtcMs);
    expect(second).toEqual(first);
    bytes.latest.mockResolvedValue({...notYet("NOT_VERIFIED","P05_BYTES_NOT_VERIFIED"),state:"MATCH",
      reason_code:null,receipt_id:`rabv_${"1".repeat(32)}`,verified_at_utc_ms:v.stored.checkedAtUtcMs+5000,
      artifact_revision:1,expected_manifest_digest:c.manifest_digest,observed_manifest_digest:c.manifest_digest,
      parts_checked:1,documents_checked:1});
    const changed=await service.detail(scope,c.run_id,{});
    expect(changed.as_of_utc_ms).toBe(v.stored.checkedAtUtcMs+5000);
    expect(changed.etag).not.toBe(first.etag);
    expect(changed.artifact_bytes.state).toBe("MATCH");
  });
  it("rejects forged identity, partial population and changed parameters",()=>{
    const source=nativeCustody(3);
    for(const change of [(v:any)=>v.trials[0].trial_ordinal=2,(v:any)=>v.trials[2].parameters.threshold="10",
      (v:any)=>v.trials.pop(),(v:any)=>v.summary.distinct_parameter_sets=2,(v:any)=>v.source_parts[0].rows=2]){
      const bad=structuredClone(source);change(bad);expect(NativeCustodySchema.safeParse(bad).success).toBe(false);
    }
  });
  it("pruned objective-derived metrics must be typed null, never special zero",()=>{
    const source=nativeCustody(3);source.trials[0]!.state="PRUNED";source.summary.completed_trials=2;
    expect(NativeCustodySchema.safeParse(source).success).toBe(false);
    source.trials[0]!.objective={value:null,availability:{state:"NOT_PUBLISHED",reason_code:"TRIAL_PRUNED_NO_OBJECTIVE"}};
    expect(NativeCustodySchema.safeParse(source).success).toBe(true);
  });
  it("repository refuses membership before reading or writing projection",async()=>{
    const client={query:vi.fn().mockResolvedValue({rowCount:0,rows:[]}),release:vi.fn()},pool={connect:vi.fn().mockResolvedValue(client)};
    const repo=new ResearchNativeReadRepository(pool as never);
    await expect(repo.read(scope,"rrun_native")).rejects.toMatchObject({status:403});
    expect(client.query.mock.calls.some(c=>String(c[0]).includes("native_read_models"))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });
  it("native Report remains compatible with earlier immutable cores and fixed native has no invented study",()=>{
    const root=process.env.PORTAL_CONTRACTS_DIR??resolve(__dirname,"../../../packages/contracts");
    const value=JSON.parse(readFileSync(resolve(root,"fixtures/research-native-report.valid.json"),"utf8"));
    expect(ResearchNativeReportSchema.safeParse(value).success).toBe(true);
    const earlier=structuredClone(value);delete earlier.kind;delete earlier.execution;delete earlier.freeze.selection_evidence;
    expect(ResearchNativeReportSchema.parse(earlier)).toEqual(earlier);
    const execution=JSON.parse(readFileSync(resolve(root,"fixtures/research-native-route-result.valid.json"),"utf8"));
    const fixed={...value,kind:"NATIVE_FIXED",execution,optimization:null,freeze:null,population:null};
    expect(ResearchNativeReportSchema.safeParse(fixed).success).toBe(true);
    expect(ResearchNativeReportSchema.safeParse({...fixed,population:value.population}).success).toBe(false);
  });
});
