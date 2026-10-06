import { describe,expect,it,vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ResearchFixedReplayCompanionRepository } from "../src/research/fixed-replay-companion.repository";
import { FixedReplayCompanionQuerySchema } from "../src/research/fixed-replay-companion.contract";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { VN_OBSERVED_FIXED_PROFILE_ID, VN_OBSERVED_FIXED_PROFILE_DIGEST } from "../src/research/vn-observed-fixed.profile";
import { executionRecipes } from "../src/research/execution-recipes";
import { replayBatch,replayBinding,replayParts,replayRow,replayScope,replaySeal } from "./research-fixed-replay-companion.fixture";
const result=(rows:any[])=>({rows,rowCount:rows.length});
function privateHarness(rows=Array.from({length:201},(_,i)=>replayRow(i)),absent=false) {
  const seal=replaySeal(rows,absent);
  const state={binding:replayBinding(seal.manifest),parts:replayParts(seal),batches:[] as any[],rows:[] as any[],
    sealed:null as string|null,live:true,member:true};
  const query=vi.fn(async(sql:string,args:any[]=[])=>{
    if(sql.includes("FROM workspace_members")) return result(state.member ? [{}] : []);
    if(sql.includes("FOR UPDATE OF producer, job, worker")) return result(state.live ? [{snapshot_content_hash:"a".repeat(64)}] : []);
    if(sql.includes("preflight.requested_spec")) return result([state.binding]);
    if(sql.includes("FROM research.artifact_parts")) return result(state.parts);
    if(sql.includes("SELECT companion_digest FROM research.fixed_replay_companion_seals")) return result(state.sealed ? [{companion_digest:state.sealed}] : []);
    if(sql.includes("SELECT companion_digest,batch_digest,row_count")) return result(state.batches.filter(b=>b.batch_ordinal===args[3]));
    if(sql.includes("SELECT companion_digest FROM research.fixed_replay_companion_batches")) return result(state.batches.slice(0,1));
    if(sql.includes("SELECT companion_digest,batch_ordinal,batch_digest,row_count,manifest")) return result(state.batches);
    if(sql.includes("SELECT payload FROM research.fixed_replay_companion_rows")) return result(state.rows.map(payload=>({payload})));
    if(sql.includes("INSERT INTO research.fixed_replay_companion_batches")) {
      state.batches.push({companion_digest:args[4],batch_ordinal:args[5],batch_digest:args[6],row_count:args[7],manifest:JSON.parse(args[8])});
    }
    if(sql.includes("INSERT INTO research.fixed_replay_companion_rows")) state.rows.push(...JSON.parse(args[5]));
    if(sql.includes("INSERT INTO research.fixed_replay_companion_seals")) state.sealed=args[4];
    return result([]);
  });
  const client={query,release:vi.fn()},pool={connect:vi.fn().mockResolvedValue(client)};
  return {repository:new ResearchFixedReplayCompanionRepository(pool as never),client,state,seal,rows};
}
function publicHarness(rows=Array.from({length:201},(_,i)=>replayRow(i))) {
  const seal=replaySeal(rows),state={rows,manifest:seal.manifest as any,revision:seal.companion_digest,
    artifacts:[{artifact_id:seal.artifact_id,artifact_revision:1,manifest_digest:seal.manifest_digest}],
    profile:{execution_profile_id:seal.manifest.execution_profile_id,execution_profile_digest:seal.manifest.execution_profile_digest},
    member:true,run:true,total:rows.length};
  const query=vi.fn(async(sql:string,args:any[]=[])=>{
    if(sql.includes("FROM workspace_members")) return result(state.member ? [{}] : []);
    if(sql.includes("FROM research.runs run")) return result(state.run ? [state.profile] : []);
    if(sql.startsWith("SELECT artifact_id,artifact_revision,manifest_digest")) return result(state.artifacts);
    if(sql.includes("SELECT seal.companion_digest")) return result([{...seal.manifest,...state.profile,manifest:state.manifest,companion_digest:state.manifest ? state.revision : null,pending:state.manifest===null}]);
    if(sql.includes("SELECT count(*) AS total")) return result([{total:state.total,matching_filter:args[3]===null ? state.total : state.rows.filter(r=>r.source_ordinal===args[3]).length}]);
    if(sql.includes("SELECT payload FROM research.fixed_replay_companion_rows"))
      return result(state.rows.filter(r=>(args[3]===null || r.source_ordinal===args[3]) && (args[4]===null || r.source_ordinal>args[4])).slice(0,args[5]).map(payload=>({payload})));
    return result([]);
  });
  const client={query,release:vi.fn()},pool={connect:vi.fn().mockResolvedValue(client)};
  return {repository:new ResearchFixedReplayCompanionRepository(pool as never),client,state,seal};
}
describe("transactional P05-bound fixed replay custody",()=>{
  it("admits each exact native route/edition and refuses wrong route, clock, edition or digest without weakening legacy custody",async()=>{
    const native=executionRecipes.filter(row=>row.descriptor.schema_version==='research.native-route-profile.v1');
    // All three append-only editions remain readable by their exact binding;
    // only the last edition is intake-qualified by the separate policy gate.
    expect(native).toHaveLength(9);
    for(const profile of native)for(const mutation of ['none','route','timeframe','edition','digest']){
      const h=privateHarness([],true),hash=(s:string)=>createHash('sha256').update(s).digest('hex');
      const receipt={...JSON.parse(h.seal.run_receipt_json),execution_profile_id:profile.profile_id,
        execution_profile_digest:profile.profile_digest};
      const run_receipt_json=JSON.stringify(receipt),artifact=JSON.parse(h.seal.artifact_manifest_json);
      Object.assign(artifact.documents[0],{sha256:hash(run_receipt_json),bytes:Buffer.byteLength(run_receipt_json)});
      const artifact_manifest_json=JSON.stringify(artifact),manifest_digest=hash(artifact_manifest_json);
      const manifest={...h.seal.manifest,manifest_digest,execution_profile_id:profile.profile_id,
        execution_profile_digest:profile.profile_digest};
      const seal={...h.seal,manifest_digest,manifest,companion_digest:sha256ResearchJson(manifest),artifact_manifest_json,run_receipt_json};
      h.state.binding={...manifest,requested_spec:{protocol:'three_window_decay',execution_route:profile.descriptor.execution_route,
        data:{dataset_id:'crypto-binance-1m',symbol:manifest.market_symbol,timeframe:'1h'},
        alpha_binding:{alpha_version_id:profile.descriptor.alpha_binding_requirements.alpha_version_id},
        windows:{oos:{start:new Date(manifest.source.oos_start_utc_ms).toISOString(),
          end_exclusive:new Date(manifest.source.oos_end_exclusive_utc_ms).toISOString()}}}} as any;
      if(mutation==='route')h.state.binding.requested_spec.execution_route='signal_notional';
      if(mutation==='timeframe')h.state.binding.requested_spec.data.timeframe='4h';
      if(mutation==='edition')h.state.binding.requested_spec.alpha_binding.alpha_version_id='av_delta_rsi_polynomial_alpha_1_0_1';
      if(mutation==='digest')h.state.binding.execution_profile_digest='0'.repeat(64);
      if(mutation==='none')expect(await h.repository.seal(replayScope,seal)).toEqual({replayed:false});
      else await expect(h.repository.seal(replayScope,seal)).rejects.toMatchObject({status:409});
    }
  });
  it("binds source-local VN OOS naive/+07/UTC instants without changing legacy UTC parsing",async()=>{
    for(const [start,end,accepted] of [
      ["2025-04-01","2025-07-01",true],
      ["2025-04-01T00:00:00+07:00","2025-07-01T00:00:00+07:00",true],
      ["2025-03-31T17:00:00Z","2025-06-30T17:00:00Z",true],
      ["2025-04-01T00:00:00Z","2025-07-01T00:00:00Z",false],
    ] as const) {
      const h=privateHarness([],true),hash=(s:string)=>createHash("sha256").update(s).digest("hex");
      const source={...h.seal.manifest.source,oos_start_utc_ms:Date.parse("2025-03-31T17:00:00Z"),oos_end_exclusive_utc_ms:Date.parse("2025-06-30T17:00:00Z")};
      const receipt={...JSON.parse(h.seal.run_receipt_json),fixed_replay_source:source,
        execution_profile_id:VN_OBSERVED_FIXED_PROFILE_ID,execution_profile_digest:VN_OBSERVED_FIXED_PROFILE_DIGEST};
      const run_receipt_json=JSON.stringify(receipt),artifact=JSON.parse(h.seal.artifact_manifest_json);
      Object.assign(artifact.documents[0],{sha256:hash(run_receipt_json),bytes:Buffer.byteLength(run_receipt_json)});
      const artifact_manifest_json=JSON.stringify(artifact),manifest_digest=hash(artifact_manifest_json);
      const manifest={...h.seal.manifest,manifest_digest,source,market_symbol:"FPT",
        execution_profile_id:VN_OBSERVED_FIXED_PROFILE_ID,execution_profile_digest:VN_OBSERVED_FIXED_PROFILE_DIGEST};
      const seal={...h.seal,manifest_digest,manifest,companion_digest:sha256ResearchJson(manifest),artifact_manifest_json,run_receipt_json};
      h.state.binding={...manifest,requested_spec:{protocol:"three_window_decay",execution_route:"signal_notional",
        data:{dataset_id:"vn-stock-daily",symbol:"FPT",timeframe:"1d"},windows:{oos:{start,end_exclusive:end}}}} as any;
      if(accepted) expect(await h.repository.seal(replayScope,seal)).toEqual({replayed:false});
      else await expect(h.repository.seal(replayScope,seal)).rejects.toMatchObject({status:409});
    }
  });
  it("appends idempotently, independently validates full hash/count/chronology and finalizes idempotently",async()=>{
    const h=privateHarness();
    expect(await h.repository.append(replayScope,replayBatch(h.rows))).toEqual({replayed:false});
    expect(await h.repository.append(replayScope,replayBatch(h.rows))).toEqual({replayed:true});
    expect(await h.repository.append(replayScope,replayBatch(h.rows,1))).toEqual({replayed:false});
    expect(await h.repository.seal(replayScope,h.seal)).toEqual({replayed:false});
    expect(await h.repository.seal(replayScope,h.seal)).toEqual({replayed:true});
    expect(h.state.rows).toHaveLength(201);expect(h.state.sealed).toBe(h.seal.companion_digest);
    const sql=h.client.query.mock.calls.map(([s])=>s).join("\n");
    expect(sql).toContain("SET LOCAL ROLE portal_research_runtime");expect(sql).toContain("FOR UPDATE OF producer, job, worker");
    expect(sql).toContain("FOR SHARE OF artifact");expect(sql).toContain("producer.worker_attempt_id=artifact.worker_attempt_id");
    expect(sql).toContain("preflight.effective_spec_digest=producer.effective_spec_digest");
    expect(sql).toContain("preflight.dataset_binding_digest=producer.dataset_binding_digest");
    expect(sql).toContain("artifact.state='SEALED'");expect(sql).toContain("ORDER BY source_ordinal LIMIT 20001");
    expect(h.client.release).toHaveBeenCalledTimes(5);
  });
  it("seals fresh source absence without batches, preserving exact metadata and actual DEFAULT position keys",async()=>{
    const absent=privateHarness([],true);expect(await absent.repository.seal(replayScope,absent.seal)).toEqual({replayed:false});
    expect(absent.client.query.mock.calls.some(([sql])=>sql.includes("INSERT INTO research.fixed_replay_companion_rows"))).toBe(false);
    const rows=[{...replayRow(0),positions:{DEFAULT:"0.25"}}],actual=privateHarness(rows);
    await actual.repository.append(replayScope,replayBatch(rows));await actual.repository.seal(replayScope,actual.seal);
    expect(actual.state.rows[0].positions).toEqual({DEFAULT:"0.25"});
  });
  it("rechecks current live fence, exact profile/request/OOS/P05 parts transactionally, then rolls back without writes",async()=>{
    const mutations=[(h:ReturnType<typeof privateHarness>)=>{h.state.live=false;},
      (h:ReturnType<typeof privateHarness>)=>{h.state.binding.requested_spec_digest="0".repeat(64);},
      (h:ReturnType<typeof privateHarness>)=>{h.state.binding.execution_profile_digest="0".repeat(64);},
      (h:ReturnType<typeof privateHarness>)=>{h.state.binding.requested_spec.data.symbol="ETHUSDT";},
      (h:ReturnType<typeof privateHarness>)=>{h.state.binding.requested_spec.windows.oos.start="1999-01-01T00:00:00Z";},
      (h:ReturnType<typeof privateHarness>)=>{h.state.parts[0].part_digest="f".repeat(64);},
      (h:ReturnType<typeof privateHarness>)=>{h.state.parts=[];}];
    for(const mutate of mutations) {
      const h=privateHarness([replayRow(0)]);mutate(h);
      await expect(h.repository.append(replayScope,replayBatch(h.rows))).rejects.toMatchObject({status:409});
      expect(h.client.query.mock.calls.some(([sql])=>sql.startsWith("INSERT"))).toBe(false);
      expect(h.client.query).toHaveBeenCalledWith("ROLLBACK");expect(h.client.release).toHaveBeenCalledOnce();
    }
  });
  it("rejects incomplete, hash-mismatched or chronologically broken finalization rather than exposing partial rows",async()=>{
    for(const breakRows of [(h:ReturnType<typeof privateHarness>)=>h.state.rows.pop(),
      (h:ReturnType<typeof privateHarness>)=>{h.state.rows[1].at_utc_ms=h.state.rows[0].at_utc_ms;},
      (h:ReturnType<typeof privateHarness>)=>{h.state.rows[1].equity="999";},
      (h:ReturnType<typeof privateHarness>)=>{h.state.batches[0].batch_digest="0".repeat(64);}]) {
      const h=privateHarness([replayRow(0),replayRow(1)]);await h.repository.append(replayScope,replayBatch(h.rows));breakRows(h);
      await expect(h.repository.seal(replayScope,h.seal)).rejects.toMatchObject({status:409});expect(h.state.sealed).toBeNull();
    }
    const missing=privateHarness([replayRow(0)]);await expect(missing.repository.seal(replayScope,missing.seal)).rejects.toMatchObject({status:409});
  });
});
describe("bounded fixed replay repository reads",()=>{
  it("reads a tenant-scoped repeatable snapshot with latest artifact chosen before exact producer join, limit+1 and exact ordinal",async()=>{
    const h=publicHarness(),query=FixedReplayCompanionQuerySchema.parse({limit:200});
    const page=await h.repository.page(replayScope,"fixed-replay-run",query,revision=>{expect(revision).toBe(h.seal.companion_digest);return undefined;});
    expect(page.rows).toHaveLength(200);expect(page.hasMore).toBe(true);expect(page.matchingFilter).toBe(201);
    const exact=await h.repository.page(replayScope,"fixed-replay-run",FixedReplayCompanionQuerySchema.parse({source_ordinal:12}),()=>undefined);
    expect(exact.rows).toEqual([replayRow(12)]);
    const calls=h.client.query.mock.calls,sql=calls.map(([s])=>s).join("\n");
    expect(sql).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(sql).toContain("ORDER BY artifact_revision DESC LIMIT 2");
    const binding=calls.find(([s])=>s.includes("SELECT seal.companion_digest"))!;
    expect(binding[0]).not.toContain("LIMIT 1");expect(binding[1]).toEqual([replayScope.workspaceId,"fixed-replay-run",h.seal.artifact_id,1,h.seal.manifest_digest]);
    expect(calls.find(([s])=>s.includes("SELECT payload FROM research.fixed_replay_companion_rows"))![1]?.at(-1)).toBe(201);
  });
  it("refuses ambiguity, tenant absence, count/ordinal holes, OOS escapes and moved immutable binding",async()=>{
    const mutations=[(h:ReturnType<typeof publicHarness>)=>{h.state.artifacts.push({...h.state.artifacts[0],artifact_id:"ambiguous"});},
      (h:ReturnType<typeof publicHarness>)=>{h.state.total=200;},
      (h:ReturnType<typeof publicHarness>)=>{h.state.rows=h.state.rows.filter(r=>r.source_ordinal!==1);},
      (h:ReturnType<typeof publicHarness>)=>{h.state.rows[1].at_utc_ms=h.seal.manifest.source.oos_end_exclusive_utc_ms;},
      (h:ReturnType<typeof publicHarness>)=>{h.state.manifest={...h.state.manifest,manifest_digest:"0".repeat(64)};}];
    for(const mutate of mutations) {
      const h=publicHarness();mutate(h);await expect(h.repository.page(replayScope,"fixed-replay-run",FixedReplayCompanionQuerySchema.parse({}),()=>undefined)).rejects.toMatchObject({status:503});
      expect(h.client.query).toHaveBeenCalledWith("ROLLBACK");
    }
    for(const key of ["member","run"] as const) {
      const h=publicHarness();h.state[key]=false;await expect(h.repository.page(replayScope,"fixed-replay-run",FixedReplayCompanionQuerySchema.parse({}),()=>undefined)).rejects.toMatchObject({status:404});
    }
  });
  it("does not turn known WFO execution into fixed observations and validates cursors even without a companion",async()=>{
    const h=publicHarness();h.state.profile={execution_profile_id:"p17.delta-signal-notional-wfo.v1",execution_profile_digest:"a".repeat(64)};
    const after=vi.fn().mockReturnValue(undefined),value=await h.repository.page(replayScope,"fixed-replay-run",FixedReplayCompanionQuerySchema.parse({}),after);
    expect(value).toMatchObject({manifest:null,rows:[],executionProfile:{id:"p17.delta-signal-notional-wfo.v1"}});expect(after).toHaveBeenCalledWith(null);
    expect(h.client.query.mock.calls.some(([sql])=>sql.includes("FROM research.artifacts"))).toBe(false);
    const noCustody=publicHarness();noCustody.state.manifest=null;
    await expect(noCustody.repository.page(replayScope,"fixed-replay-run",FixedReplayCompanionQuerySchema.parse({}),()=>{throw new Error("stale cursor");})).rejects.toMatchObject({status:503});
  });
  it("migration keeps append-only RLS custody and serializes append/finalization independently of repository",()=>{
    const sql=readFileSync(new URL("../migrations/1723680000088_research-fixed-replay-companion.sql",import.meta.url),"utf8");
    for(const marker of ["FORCE ROW LEVEL SECURITY","portal_research_runtime","GRANT SELECT,INSERT","BEFORE UPDATE OR DELETE",
      "prevent_immutable_log_mutation","prevent_fixed_replay_append_after_seal","validate_fixed_replay_finalization",
      "pg_advisory_xact_lock","FOREIGN KEY(workspace_id,artifact_id)","lag(at_utc_ms)","state='SEALED'"])
      expect(sql).toContain(marker);
    expect(sql).not.toContain("GRANT UPDATE");expect(sql).not.toContain("GRANT DELETE");
  });
});
