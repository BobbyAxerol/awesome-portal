import { describe,expect,it } from "vitest";
import { createHash } from "node:crypto";
import { FixedReplayCompanionRowSchema,FixedReplayCompanionBatchIngressSchema,FixedReplayCompanionSealIngressSchema,
  FixedReplayCompanionQuerySchema,FixedReplayCompanionManifestSchema,fixedReplayCustodyProof,isFixedReplayProfile } from "../src/research/fixed-replay-companion.contract";
import { IMPORTED_ALPHA_PROFILE_ID,IMPORTED_ALPHA_PROFILE_DIGEST } from "../src/research/imported-alpha.profile";
import {executionRecipes} from '../src/research/execution-recipes';
import { sha256ResearchJson } from "../src/research/preflight.service";
import { replayRow,replayBatch,replaySeal } from "./research-fixed-replay-companion.fixture";
describe("bounded fixed OOS custody contract",()=>{
  it("keeps exact per-bar UTC and decimal strings separate from execution ledgers",()=>{
    const row=replayRow(0);expect(FixedReplayCompanionRowSchema.parse(row)).toEqual(row);
    for(const bad of [{...row,volume:null},{...row,open:100},{...row,fill_id:"fake"},{...row,positions:{}},
      {...row,drawdown_fraction:"0.1"},{...row,equity:"0"},{...row,high:"100"},{...row,low:"101.00000000000000000001"},
      {...row,positions:Object.fromEntries(Array.from({length:17},(_,i)=>[`S${i}`,"1"]))}])
      expect(FixedReplayCompanionRowSchema.safeParse(bad).success).toBe(false);
  });
  it("accepts dense 200-row batches and verifies every ordinal, digest, chronology, bound and wire cap",()=>{
    const all=Array.from({length:201},(_,i)=>replayRow(i));
    expect(FixedReplayCompanionBatchIngressSchema.parse(replayBatch(all)).rows).toHaveLength(200);
    expect(FixedReplayCompanionBatchIngressSchema.parse(replayBatch(all,1)).rows).toHaveLength(1);
    const batch=replayBatch(all);
    for(const bad of [{...batch,batch_ordinal:100},{...batch,rows:batch.rows.slice(1)},{...batch,batch_digest:"0".repeat(64)},
      {...batch,companion_digest:"0".repeat(64)},{...batch,artifact_revision:2},{...batch,artifact_manifest_json:"x".repeat(196609)}])
      expect(FixedReplayCompanionBatchIngressSchema.safeParse(bad).success).toBe(false);
    const reversed={...batch,rows:[...batch.rows].reverse()};reversed.batch_digest=sha256ResearchJson(reversed.rows);
    expect(FixedReplayCompanionBatchIngressSchema.safeParse(reversed).success).toBe(false);
  });
  it("pins exact fixed-null/imported-digest admission and typed fresh absence without invented rows",()=>{
    expect(isFixedReplayProfile("p04.fixed-qualification.v1",null)).toBe(true);
    expect(isFixedReplayProfile("p04.fixed-qualification.v1","a".repeat(64))).toBe(false);
    expect(isFixedReplayProfile(IMPORTED_ALPHA_PROFILE_ID,IMPORTED_ALPHA_PROFILE_DIGEST)).toBe(true);
    expect(isFixedReplayProfile("p17.delta-signal-notional-wfo.v1",null)).toBe(false);
    for(const row of executionRecipes.filter(r=>r.descriptor.schema_version==='research.native-route-profile.v1')){
      expect(isFixedReplayProfile(row.profile_id,row.profile_digest)).toBe(true);
      expect(isFixedReplayProfile(row.profile_id,null)).toBe(false);
      expect(isFixedReplayProfile(row.profile_id,'a'.repeat(64))).toBe(false);
    }
    const absent=replaySeal([],true);expect(FixedReplayCompanionSealIngressSchema.parse(absent)).toEqual(absent);
    expect(FixedReplayCompanionManifestSchema.safeParse({...absent.manifest,source:{...absent.manifest.source,row_count:0}}).success).toBe(false);
  });
  it("proves exact P05 bytes and receipt linkage without conflating original/rewritten Parquet SHA",()=>{
    const seal=replaySeal([replayRow(0)]),proof=fixedReplayCustodyProof(seal);
    expect(proof.table.parts[0].sha256).not.toBe((seal.manifest.source as any).file_sha256);
    for(const bad of [{...seal,artifact_manifest_json:seal.artifact_manifest_json+" "},{...seal,run_receipt_json:seal.run_receipt_json+" "},
      {...seal,manifest:{...seal.manifest,requested_spec_digest:"0".repeat(64)}},{...seal,worker_attempt_id:"other"}])
      expect(()=>fixedReplayCustodyProof(bad)).toThrow();
    expect(fixedReplayCustodyProof(replaySeal([],true)).table).toBeNull();
  });
  it("rejects a semantically wrong receipt even when every receipt/manifest byte digest was rehashed",()=>{
    const hash=(s:string)=>createHash("sha256").update(s).digest("hex");
    for(const [field,value] of [["run_id","foreign-run"],["requested_spec_digest","0".repeat(64)],
      ["effective_spec_digest","0".repeat(64)],["dataset_binding_digest","0".repeat(64)],
      ["input_scope","IS_OOS_HOLDOUT"],["holdout_rows_exposed_to_child",1]] as const) {
      const original=replaySeal([replayRow(0)]),receipt={...JSON.parse(original.run_receipt_json),[field]:value};
      const run_receipt_json=JSON.stringify(receipt),artifact=JSON.parse(original.artifact_manifest_json);
      artifact.documents[0].sha256=hash(run_receipt_json);artifact.documents[0].bytes=Buffer.byteLength(run_receipt_json);
      const artifact_manifest_json=JSON.stringify(artifact),manifest_digest=hash(artifact_manifest_json);
      const manifest={...original.manifest,manifest_digest};
      const changed={...original,run_receipt_json,artifact_manifest_json,manifest_digest,manifest,companion_digest:sha256ResearchJson(manifest)};
      expect(FixedReplayCompanionSealIngressSchema.safeParse(changed).success).toBe(true);
      expect(()=>fixedReplayCustodyProof(changed)).toThrow();
    }
  });
  it("allows only finite selectors, no data locator and no exact ordinal combined with a cursor",()=>{
    expect(FixedReplayCompanionQuerySchema.parse({source_ordinal:"0",limit:"200"})).toEqual({source_ordinal:0,limit:200});
    for(const query of [{source_ordinal:-1},{limit:201},{cursor:"x",source_ordinal:1},{path:"/tmp/raw"},{fold_id:"fake"}])
      expect(FixedReplayCompanionQuerySchema.safeParse(query).success).toBe(false);
  });
});
