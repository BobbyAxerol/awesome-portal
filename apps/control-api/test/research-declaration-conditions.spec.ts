import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
import {declarationConditions} from "../src/research/declaration-conditions";
import {DeclarationEstimateSchema} from "../src/research/dataset-index.contract";
import type {ResearchRequestedSpec} from "../src/research/preflight.contract";
const root=resolve(process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname,"../../../packages/contracts"), "fixtures");
const read=(name:string)=>JSON.parse(readFileSync(resolve(root,name),"utf8"));
const example=read("research-declaration-estimate.v1.available.valid.json");
const profiles=read("research-foundation.atlas-current.valid.json").portal_admission.profiles;
const spec={schema_version:"research.requested-spec.v1",protocol:"advanced",execution_route:"signal_notional",
 data:{timeframe:"1h"},client:{engine_release_id:"er_quantbt_111"},optuna_trials:3,random_seed:42,
 optimization_mode:"mode_1_decay",optimization_schedule:"global",early_stopping:null,
 walk_forward:{frequency:"weekly",window_mode:"expanding"},route_params:{},optimization_config:{},parameter_space_overrides:[]} as ResearchRequestedSpec;
describe("DR-09 source-bound advisory conditions",()=>{
 it("publishes executable-profile estimates, not a token or may_create_run grant",()=>{
   const r=declarationConditions(spec,example.metadata,profiles,["1h"]);
   expect(r.ready_for_preflight).toBe(true); expect(DeclarationEstimateSchema.safeParse(r).success).toBe(true);
   expect(r).not.toHaveProperty("may_create_run");
 });
 it.each(["seed","trial","timeframe","v2","frequency","range","folds","disabled","unknown","warmup"])("does not bless refused %s", which=>{
   const s=structuredClone(spec),m=structuredClone(example.metadata),p=structuredClone(profiles);
   if(which==="seed") s.random_seed=null;
   if(which==="trial") s.optuna_trials=401;
   if(which==="timeframe") s.data.timeframe="15m";
   if(which==="v2") s.schema_version="research.requested-spec.v2";
   if(which==="frequency") s.walk_forward!.frequency="monthly";
   if(which==="range") m.windows[0].end_exclusive_utc_ms=m.windows[0].start_utc_ms+93*86400000;
   if(which==="folds") m.planned_folds.count=17;
   if(which==="disabled") p[1].state="DISABLED";
   if(which==="unknown") Object.assign(m.planned_folds,{availability:"NOT_PUBLISHED",reason_code:"HMD_SYMBOL_INTERVAL_NOT_INDEXED",count:null,min_train_bars:null,min_oos_bars:null});
   if(which==="warmup") Object.assign(m.windows[0],{warmup_bars_required:300,warmup_bars_available_before_start:299});
   const r=declarationConditions(s,m,p,["1h"]);
   expect(r.ready_for_preflight).toBe(false);
   expect(DeclarationEstimateSchema.safeParse(r).success).toBe(true);
 });
 it.each(["available","partial"])("matches generated %s fixture",name=>{
   expect(DeclarationEstimateSchema.safeParse(read(`research-declaration-estimate.v1.${name}.valid.json`)).success).toBe(true);
 });
});
