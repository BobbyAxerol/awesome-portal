/** Operator authoring helper; adds FULL03 candidates, never edits historical rows. */
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
const root=new URL("../../../",import.meta.url);
const read=p=>JSON.parse(readFileSync(new URL(p,root),"utf8"));
const save=(p,v)=>writeFileSync(new URL(p,root),JSON.stringify(v,null,2)+"\n");
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==="object"
  ?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
const path="apps/portal/registry/research-execution-recipes.v1.json", table=read(path);
const old={schema_version:"research.alpha-source.v1",version:"1.0.0",
  entrypoint:"strategy.delta_rsi:generate_signals",required_columns:["open","high","low","close","volume"],
  timeframes:["1h","4h","1d"],warmup_bars:300,determinism:{seed_required:false,external_io:false},
  parameter_space:{window:{minimum:20,maximum:60,step:2},rsi_l:{minimum:12,maximum:30,step:1},
    signalLength:{minimum:3,maximum:20,step:1},len_atr1:{minimum:5,maximum:20,step:1},
    len_atr2:{minimum:25,maximum:60,step:1},rvol:{minimum:1,maximum:2.5,step:0.1},
    len_vol:{minimum:8,maximum:40,step:2},slpercent:{minimum:0.7,maximum:2.5,step:0.1}},
  execution:{adapter_id:"p04.delta-rsi.v1",engine_release_id:"er_quantbt_111",execution_route:"signal_notional",
    protocol:"three_window_decay",parameter_mode:"fixed_qualification_v1"},
  provenance:{protected_kernel_sha256:"34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d",
    specification_sha256:"3a4f7e5beb79eecebda61f46a8501d0128bffa0b29508ee1826835b1eeb59730"}};
const av="av_delta_rsi_polynomial_alpha_1_0_1",adapter="full03.delta-rsi.v1";
const intervals={"1m":60000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"4h":14400000,"1d":86400000};
const declaration={...old,version:"1.0.1",timeframes:Object.keys(intervals),
  execution:{...old.execution,adapter_id:adapter,parameter_mode:"exact_recipe_qualification_v1"}};
const binding={schema_version:"research.full03-delta-binding.v1",alpha_id:"delta-rsi-polynomial-alpha",
  alpha_version_id:av,declared_contract:declaration,fixed_parameters:{window:32,rsi_l:20,signalLength:9,
    len_atr1:10,len_atr2:42,rvol:1.6,len_vol:16,slpercent:1.3}};
const bindingDigest=hash(binding);
save("apps/portal/registry/research-full03-delta-binding.v1.json",{...binding,adapter_contract_digest:bindingDigest});
const templates={"wfo-temporal":"p10.delta-signal-notional-wfo.v2","causal-inner":"p10.delta-signal-notional-causal-inner.v1",
  "per-fold-decay":"p10.delta-signal-notional-per-fold-decay.v1","three-window-optimized":"p10.delta-signal-notional-three-window-optimized.v1"};
for(const [tf,step]of Object.entries(intervals)) for(const[method,template]of Object.entries(templates)){
  const id=`p10.delta-${method}-${tf}.v1`;
  if(table.recipes.some(r=>r.profile_id===id)) continue;
  const row=structuredClone(table.recipes.find(r=>r.profile_id===template));
  // Calendar bound is derived from 96k target bars, then bounded by ten
  // years. Actual index/planner/100k input and child limits still enforce it.
  const maxDays=Math.min(3650,Math.floor(96000*step/86400000));
  row.profile_id=id;row.public_profile={...row.public_profile,profile_id:id,timeframe:tf,max_span_days:maxDays};
  row.descriptor={...row.descriptor,schema_version:"research.full03-delta-profile.v1",profile_id:id,
    adapter_id:adapter,adapter_contract_digest:bindingDigest,timeframe:tf,max_span_days:maxDays,
    alpha_binding_requirements:{alpha_id:binding.alpha_id,alpha_version_id:av,adapter_id:adapter,
      adapter_contract_digest:bindingDigest,warmup_bars:300},
    source_clock:{clock_basis:"FIXED_UTC_INTERVAL_V1",bar_interval_ms:step,source_timezone:"UTC",
      warmup_semantics:"FIXED_INTERVAL_PREDECESSORS_V1"},
    dataset_id:"crypto-binance-1m",
    current_source:{source_adapter_id:`full03.quantbt-signal-notional-${method}-${tf}.v1`,
      profile_id:`full03.delta-signal-notional-${method}-${tf}.v1`}};
  row.public_profile.dataset_id="crypto-binance-1m";
  row.work_schema_version="research.full03-delta-work.v1";
  row.profile_digest=hash(row.descriptor);row.preview_override=null;
  row.feature_flags=["FEATURE_RESEARCH_RUN_PRODUCER","FEATURE_RESEARCH_WFO_PROFILE","FEATURE_RESEARCH_FULL03_PROFILE"];
  row.source_requirement="FULL03_IMMUTABLE_DELTA_BINDING";
  table.recipes.push(row);table.qualification_references.push({profile_id:id,recipe_digest:hash(row),
    kind:"CANDIDATE_NOT_QUALIFIED",receipt_path:null,receipt_sha256:null});
}
save(path,table);
const schemaPath="apps/portal/registry/research-execution-recipes.v1.schema.json", schema=read(schemaPath);
const fields=schema.properties.recipes.items.properties;
for(const[values,value]of[[fields.feature_flags.items.enum,"FEATURE_RESEARCH_FULL03_PROFILE"],
  [fields.source_requirement.enum,"FULL03_IMMUTABLE_DELTA_BINDING"]]) if(!values.includes(value))values.push(value);
fields.public_profile.properties.dataset_id.enum=["vn-stock-daily","crypto-binance-1m"];
save(schemaPath,schema);
console.log(JSON.stringify({recipes:table.recipes.length,binding_digest:bindingDigest}));
