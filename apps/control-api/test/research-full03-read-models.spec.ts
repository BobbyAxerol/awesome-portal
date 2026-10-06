/** Contract/semantic units only. These do not qualify an HMD product recipe. */
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe,expect,it} from "vitest";
import {executionRecipes} from "../src/research/execution-recipes";
import {currentSourceExecutionPair,currentSourceRetainedMethod,currentSourceRetainedIntervalMs,isCurrentSourceRetainedPair} from "../src/research/current-source-profile";
import {DEFAULT_PARAMETER_BINDING_REGISTRY} from "../src/research/parameter-binding.registry";
import {selectedTrialPresentation} from "../src/research/selected-trial-presentation";
import {ResearchProgressService} from "../src/research/progress.service";
import {ResearchProgressSnapshotSchema,toPublicResearchProgressSnapshot} from "../src/research/progress.contract";
import {isCurrentSourceLanePair} from "../src/research/current-source.repository";

const recipes=executionRecipes.filter(row=>row.descriptor.schema_version==="research.full03-delta-profile.v1");
const fixture=JSON.parse(readFileSync(join(__dirname,"research-progress-w2.fixture.json"),"utf8"));
describe("FULL-03 exact current-source contracts",()=>{
  it("installs all named new intervals without inheriting historical pairs",()=>{
    expect(recipes).toHaveLength(28);
    const pairs=recipes.map(row=>currentSourceExecutionPair(row.profile_id,row.profile_digest)!);
    expect(new Set(pairs.map(pair=>JSON.stringify(pair))).size).toBe(28);
    for(const [index,row] of recipes.entries()) {
      const pair=pairs[index]!;
      expect(isCurrentSourceLanePair(pair.source_adapter_id,pair.profile_id)).toBe(true);
      expect(currentSourceExecutionPair(row.profile_id,"0".repeat(64))).toBeNull();
      expect(isCurrentSourceRetainedPair(pair.source_adapter_id,pairs[(index+1)%pairs.length]!.profile_id)).toBe(false);
      expect(currentSourceRetainedIntervalMs(pair.profile_id,pair.source_adapter_id)).toBe(row.descriptor.source_clock.bar_interval_ms);
      const binding=DEFAULT_PARAMETER_BINDING_REGISTRY.byRetainedLaneProfile(pair.profile_id)!;
      expect(binding.profileDigest).toBe(row.profile_digest);
      expect(binding.adapterContractDigest).toBe(row.descriptor.adapter_contract_digest);
      const method=currentSourceRetainedMethod(pair.profile_id,pair.source_adapter_id);
      const local=method==="CAUSAL_INNER" || method==="PER_FOLD_DECAY";
      const selected=selectedTrialPresentation(local?"study_1.trial_2":"2",pair.profile_id,
        local?{trial_id:"study_1.trial_2",source_trial_id:"2",study_id:"1"}:undefined);
      expect(selected).toMatchObject({selected_trial_ordinal:3,selected_trial_ordinal_scope:local?"STUDY_LOCAL":"RUN_GLOBAL"});
    }
  });
  it.each(recipes.map(row=>[row.profile_id,row.profile_digest] as const))("keeps source and cumulative progress ordinals distinct for %s",(id,digest)=>{
    const source=ResearchProgressSnapshotSchema.parse(structuredClone(fixture.snapshot));
    const pair=currentSourceExecutionPair(id,digest)!;
    const method=currentSourceRetainedMethod(pair.profile_id,pair.source_adapter_id);
    const local=method==="CAUSAL_INNER" || method==="PER_FOLD_DECAY";
    const cursor=source.claim.handoff_cursor!;
    const selected=source.folds.find(fold=>fold.fold===cursor.fold)!;
    cursor.trial=6;
    selected.selection={...selected.selection,scope:local?"PER_FOLD_STUDY":"GLOBAL_STUDY",trial:6,
      ...(local?{source_trial_id:"2",study_id:"1"}:{})};
    const original=structuredClone(source);
    const projected=toPublicResearchProgressSnapshot(source,id);
    expect(projected.claim.handoff_cursor).toMatchObject({trial:local?3:6,
      trial_scope:local?"STUDY_LOCAL":"RUN_GLOBAL",source_trial_id:local?"2":"5",progress_trial_ordinal:6});
    expect(source).toEqual(original);
  });
  it("rejects missing/tampered new producer digest and caps CPU before persistence, even under long-preview flags",()=>{
    const row=recipes[0]!;
    const service=new ResearchProgressService({} as never,{} as never,{} as never,{} as never,
      {} as never,{} as never,{} as never,{FEATURE_RESEARCH_PREVIEW_LONG_WFO:"true"} as never) as unknown as {
        assertProfileBoundIngress:(scope:Record<string,unknown>,input:unknown)=>void;
      };
    const input={event:{payload:{usage:{cpu_seconds:row.budgets.cpu_seconds}}}};
    const scope={executionProfileId:row.profile_id,executionProfileDigest:row.profile_digest};
    expect(()=>service.assertProfileBoundIngress(scope,input)).not.toThrow();
    for(const digest of [undefined,"0".repeat(64)])
      expect(()=>service.assertProfileBoundIngress({...scope,executionProfileDigest:digest},input)).toThrow();
    expect(()=>service.assertProfileBoundIngress(scope,{event:{payload:{usage:{cpu_seconds:row.budgets.cpu_seconds+1}}}})).toThrow();
    expect(()=>service.assertProfileBoundIngress(scope,{...input,evidence:{}})).toThrow();
  });
});
