import { describe,expect,it,vi } from "vitest";
import { ResearchFixedReplayCompanionService } from "../src/research/fixed-replay-companion.service";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { replayConfig,replayScope,replayRow,replaySeal } from "./research-fixed-replay-companion.fixture";
function paged(rows=Array.from({length:201},(_,i)=>replayRow(i))) {
  const seal=replaySeal(rows),state={manifest:seal.manifest,revision:seal.companion_digest};
  const page=vi.fn(async(_scope:any,_runId:any,query:any,after:(r:string|null)=>number|undefined)=>{
    const boundary=after(state.revision),values=query.source_ordinal===undefined
      ? rows.filter(r=>boundary===undefined || r.source_ordinal>boundary) : rows.filter(r=>r.source_ordinal===query.source_ordinal);
    return {...state,rows:values.slice(0,query.limit),hasMore:values.length>query.limit,
      matchingFilter:query.source_ordinal===undefined ? rows.length : values.length,pending:false};
  });
  return {service:new ResearchFixedReplayCompanionService({page} as never,replayConfig as never),page,state,rows};
}
describe("fixed OOS observation page",()=>{
  it("pages all fresh rows exactly with opaque cursor and exact playhead ordinal without fake folds/orders",async()=>{
    const {service,rows}=paged();
    const first=await service.observations(replayScope,"fixed-replay-run",{limit:200});
    expect(first.rows).toEqual(rows.slice(0,200));expect(first.counts).toEqual({full_source_retained:201,matching_filter:201,returned:200});
    expect(first.custody).toBe("FRESH_FIXED_OOS_RETAINED");expect(first.next_cursor).toBeTruthy();
    const last=await service.observations(replayScope,"fixed-replay-run",{limit:200,cursor:first.next_cursor});
    expect(last.rows).toEqual(rows.slice(200));expect(last.next_cursor).toBeNull();
    const exact=await service.observations(replayScope,"fixed-replay-run",{source_ordinal:17});
    expect(exact.rows).toEqual([rows[17]]);expect(exact.counts.matching_filter).toBe(1);
    for(const privateKey of ["worker_attempt_id","lease_epoch","artifact_manifest_json","run_receipt_json","relative_path","orders","fills","holdout"])
      expect(JSON.stringify(first)).not.toContain(`"${privateKey}"`);
  });
  it("binds cursor to workspace, actor, run, exact revision and limit, not to mutable metadata",async()=>{
    const {service,state}=paged();const first=await service.observations(replayScope,"fixed-replay-run",{limit:1});
    for(const [scope,run,limit] of [[{...replayScope,workspaceId:"foreign"},"fixed-replay-run",1],
      [{...replayScope,actorUserId:"other"},"fixed-replay-run",1],[replayScope,"other-run",1],[replayScope,"fixed-replay-run",2]] as const)
      await expect(service.observations(scope,run,{limit,cursor:first.next_cursor})).rejects.toMatchObject({code:"RESEARCH_REPLAY_CURSOR_INVALID",status:400});
    state.manifest={...state.manifest,manifest_digest:"0".repeat(64)};state.revision=sha256ResearchJson(state.manifest);
    await expect(service.observations(replayScope,"fixed-replay-run",{limit:1,cursor:first.next_cursor})).rejects.toMatchObject({code:"RESEARCH_REPLAY_CURSOR_INVALID"});
  });
  it("distinguishes unrecorded custody, incomplete retention and fresh manifest-bound source omission",async()=>{
    const repository={page:vi.fn().mockResolvedValue({manifest:null,revision:null,rows:[],hasMore:false,matchingFilter:null,pending:false})};
    const service=new ResearchFixedReplayCompanionService(repository as never,replayConfig as never);
    const legacy=await service.observations(replayScope,"fixed-replay-run",{});
    expect(legacy).toMatchObject({custody:"NOT_RECORDED",availability:{state:"NOT_PUBLISHED",reason_code:"FIXED_OOS_CUSTODY_NOT_RECORDED"},rows:[],counts:{full_source_retained:null}});
    repository.page.mockResolvedValue({manifest:null,revision:null,rows:[],hasMore:false,matchingFilter:null,pending:true});
    expect(await service.observations(replayScope,"fixed-replay-run",{})).toMatchObject({custody:"NOT_FINALIZED",availability:{reason_code:"FIXED_OOS_RETENTION_NOT_FINALIZED"}});
    const absent=replaySeal([],true);
    repository.page.mockResolvedValue({manifest:absent.manifest,revision:absent.companion_digest,rows:[],hasMore:false,matchingFilter:null,pending:false});
    expect(await service.observations(replayScope,"fixed-replay-run",{})).toMatchObject({custody:"FRESH_SOURCE_NOT_PUBLISHED",availability:{reason_code:"FIXED_REPLAY_SOURCE_UNAVAILABLE"},manifest:absent.manifest});
  });
  it("rejects dark lane/invalid selectors/foreign workspace before reading and rejects broken pages",async()=>{
    const {service,page}=paged();
    for(const query of [{limit:201},{source_ordinal:1,cursor:"x"},{workspace_id:"foreign"},{table:"orders"}])
      await expect(service.observations(replayScope,"fixed-replay-run",query)).rejects.toMatchObject({status:400});
    expect(page).not.toHaveBeenCalled();
    await expect(new ResearchFixedReplayCompanionService({page} as never,{...replayConfig,FEATURE_RESEARCH_REPLAY:"false"} as never)
      .observations(replayScope,"fixed-replay-run",{})).rejects.toMatchObject({status:503});
  });
  it("returns explicit non-fixed profile applicability, never legacy fixed custody or invented WFO observations",async()=>{
    const repository={page:vi.fn().mockResolvedValue({manifest:null,revision:null,rows:[],hasMore:false,matchingFilter:null,pending:false,
      executionProfile:{id:"p17.delta-signal-notional-wfo.v1",digest:"a".repeat(64)}})};
    const service=new ResearchFixedReplayCompanionService(repository as never,replayConfig as never);
    expect(await service.observations(replayScope,"fixed-replay-run",{})).toMatchObject({custody:"NOT_APPLICABLE",rows:[],manifest:null,
      execution_profile:{id:"p17.delta-signal-notional-wfo.v1",digest:"a".repeat(64)},availability:{state:"NOT_APPLICABLE",reason_code:"EXECUTION_PROFILE_NOT_FIXED"}});
  });
});
