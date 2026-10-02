/** One named fresh-fixed read contract; no edits to historical replay schemas. */
import { createHash } from "node:crypto";
import { readFileSync,writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root=new URL("../",import.meta.url);
const object=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const ref=name=>({$ref:`#/components/schemas/${name}`});
const nullable=value=>({anyOf:[value,{type:"null"}]});
const count=(maximum,minimum=0)=>({type:"integer",minimum,maximum});
const id={type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$"};
const digest={type:"string",pattern:"^[a-f0-9]{64}$"};
const utc=count(8_640_000_000_000_000);
const decimal={type:"string",pattern:"^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$",maxLength:96};
const scope="FIXED_OOS_RETAINED_MARKET_AND_ACCOUNT_NOT_EXECUTION_LEDGER";
const absence=["FIXED_REPLAY_ROW_LIMIT_EXCEEDED","FIXED_REPLAY_FILE_LIMIT_EXCEEDED","FIXED_REPLAY_MARKET_FIELDS_UNAVAILABLE","FIXED_REPLAY_SOURCE_UNAVAILABLE"];
export function buildFixedReplayCompanionOpenApi() {
  const row=object({source_ordinal:count(19_999),at_utc_ms:utc,open:decimal,high:decimal,low:decimal,close:decimal,volume:decimal,
    equity:decimal,return_fraction:decimal,drawdown_fraction:decimal,positions:{type:"object",minProperties:1,maxProperties:16,
      propertyNames:{pattern:"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$"},additionalProperties:decimal}});
  row.description="Actual retained per-bar OOS candle/account observation. Exact decimal strings; OHLC coherence, positive equity and negative drawdown are source/runtime validated. Actual engine position labels (including DEFAULT) are preserved, not relabeled to requested market symbol. Never an order/fill/trade ledger.";
  const bounds={oos_start_utc_ms:utc,oos_end_exclusive_utc_ms:utc};
  const available=object({schema_version:{const:"research.fixed-replay-source.v1"},state:{const:"AVAILABLE"},reason_code:{type:"null"},
    file_name:{const:"fixed-replay.parquet"},file_sha256:digest,byte_count:count(2_097_152,1),normalized_rows_sha256:digest,row_count:count(20_000,1),
    ...bounds,first_observed_utc_ms:utc,last_observed_utc_ms:utc});
  available.description="file_sha256 binds original confined-child Parquet bytes. P05 rewrites retained parts, so their byte SHA may differ; normalized_rows_sha256 binds exact canonical row semantics. Bounds are half-open admitted OOS UTC bounds, never inferred from nominal intervals.";
  const absent=object({schema_version:{const:"research.fixed-replay-source.v1"},state:{const:"NOT_PUBLISHED"},reason_code:{enum:absence},...bounds});
  const manifest=object({schema_version:{const:"research.fixed-replay-companion-manifest.v1"},workspace_id:id,run_id:id,artifact_id:id,
    artifact_revision:count(2_147_483_647,1),manifest_digest:digest,requested_spec_digest:digest,effective_spec_digest:digest,dataset_binding_digest:digest,
    execution_profile_id:id,execution_profile_digest:nullable(digest),market_symbol:{type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$",
      description:"Exact immutable preflight requested market symbol, distinct from ENGINE_NATIVE_SYMBOL position labels such as DEFAULT."},source:ref("FixedReplaySource"),scope:{const:scope}});
  manifest.description="Immutable companion manifest bound to exact SEALED P05 artifact/revision/manifest, original admitted requested/effective/dataset digests and exact fixed/imported execution profile. Existing p04.fixed-qualification.v1 intentionally has a null profile digest. Private custody proofs and attempt/lease IDs are never public.";
  manifest.allOf=[{anyOf:[{properties:{execution_profile_id:{const:"p04.fixed-qualification.v1"},execution_profile_digest:{type:"null"}}},
    {properties:{execution_profile_id:{const:"p17.imported-signal-notional.v1"},execution_profile_digest:{const:"f1ed5dbccdd90ca7dd35be2755f3b3b5f7e9a29b1641beb08bd0136783c0f298"}}},
    {properties:{execution_profile_id:{const:"p10.vn-stock-daily-observed-fixed.v1"},execution_profile_digest:{const:"acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e"}}}]}];
  const page=object({schema_version:{const:"research.fixed-replay-companion-page.v1"},run_id:id,
    availability:object({state:{enum:["AVAILABLE","NOT_PUBLISHED","NOT_APPLICABLE"]},reason_code:nullable({enum:[...absence,
      "FIXED_OOS_CUSTODY_NOT_RECORDED","FIXED_OOS_RETENTION_NOT_FINALIZED","EXECUTION_PROFILE_NOT_FIXED"]})}),
    custody:{enum:["FRESH_FIXED_OOS_RETAINED","FRESH_SOURCE_NOT_PUBLISHED","NOT_RECORDED","NOT_FINALIZED","NOT_APPLICABLE"]},
    execution_profile:object({id:nullable(id),digest:nullable(digest)}),scope:{const:scope},revision:nullable(digest),manifest:nullable(ref("FixedReplayManifest")),
    counts:object({full_source_retained:nullable(count(20_000,1)),matching_filter:nullable(count(20_000)),returned:count(200)}),
    rows:{type:"array",items:ref("FixedReplayObservation"),maxItems:200},next_cursor:nullable({type:"string",maxLength:4096})});
  page.description="Complete source population is at most 20,000 retained rows; each response is at most 200 rows/1 MiB. Opaque renewable cursor binds workspace, actor, run, immutable revision and limit. Exact source_ordinal playhead is mutually exclusive with cursor. No rows or fake folds/orders/fills/trades/holdout are synthesized. NOT_RECORDED conservatively covers old or fresh unrecorded custody; it does not infer a historical run from absent parts.";
  page.allOf=[{if:{properties:{availability:{properties:{state:{const:"AVAILABLE"}}}}},then:{properties:{custody:{const:"FRESH_FIXED_OOS_RETAINED"},
    availability:{properties:{reason_code:{type:"null"}}},manifest:{allOf:[ref("FixedReplayManifest"),{properties:{source:ref("FixedReplayAvailableSource")}}]},revision:digest,
    counts:{properties:{full_source_retained:count(20_000,1),matching_filter:count(20_000)}}}},else:{properties:{rows:{maxItems:0},next_cursor:{type:"null"},
    counts:{properties:{full_source_retained:{type:"null"},matching_filter:{type:"null"},returned:{const:0}}}}}},
    {if:{properties:{custody:{const:"FRESH_SOURCE_NOT_PUBLISHED"}}},then:{properties:{availability:{properties:{state:{const:"NOT_PUBLISHED"},reason_code:{enum:absence}}},
      manifest:{allOf:[ref("FixedReplayManifest"),{properties:{source:ref("FixedReplayAbsentSource")}}]},revision:digest}}},
    ...[["NOT_RECORDED","FIXED_OOS_CUSTODY_NOT_RECORDED","NOT_PUBLISHED"],["NOT_FINALIZED","FIXED_OOS_RETENTION_NOT_FINALIZED","NOT_PUBLISHED"],
      ["NOT_APPLICABLE","EXECUTION_PROFILE_NOT_FIXED","NOT_APPLICABLE"]].map(([custody,reason,state])=>({if:{properties:{custody:{const:custody}}},then:{properties:{manifest:{type:"null"},revision:{type:"null"},
        availability:{properties:{state:{const:state},reason_code:{const:reason}}}}}}))];
  const parameters=[{name:"runId",in:"path",required:true,schema:{type:"string",pattern:"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$"}},
    {name:"workspace_id",in:"query",schema:id},{name:"source_ordinal",in:"query",schema:count(19_999),description:"Exact immutable source ordinal; cannot combine with cursor."},
    {name:"limit",in:"query",schema:{...count(200,1),default:100}},{name:"cursor",in:"query",schema:{type:"string",minLength:1,maxLength:4096}}];
  return {openapi:"3.1.0",info:{title:"Portal Fresh Fixed OOS Observations API",version:"1.0.0",description:page.description},servers:[{url:"/"}],security:[{portalSession:[]}],
    paths:{"/api/v1/quantbt/runs/{runId}/replay/observations":{get:{operationId:"researchFixedReplayObservationsGetV1",summary:"Read one bounded immutable fresh-fixed OOS observation page",parameters,
      responses:{"200":{description:"Bounded source observations or explicit custody/source/profile absence. Cache-Control private, no-store.",content:{"application/json":{schema:ref("FixedReplayPage")}}},
        ...Object.fromEntries([400,401,403,404,409,503].map(code=>[String(code),{$ref:"#/components/responses/Problem"}]))}}}},
    components:{securitySchemes:{portalSession:{type:"apiKey",in:"cookie",name:"portal_session"}},responses:{Problem:{description:"Typed refusal; no private source locators.",content:{"application/problem+json":{schema:ref("Problem")}}}},
      schemas:{FixedReplayObservation:row,FixedReplayAvailableSource:available,FixedReplayAbsentSource:absent,FixedReplaySource:{anyOf:[ref("FixedReplayAvailableSource"),ref("FixedReplayAbsentSource")]},
        FixedReplayManifest:manifest,FixedReplayPage:page,Problem:{type:"object",required:["type","title","status"],properties:{type:{type:"string"},title:{type:"string"},status:count(599,400)},additionalProperties:true}}}};
}
function canonical(value) {
  const normalize=v=>Array.isArray(v) ? v.map(normalize) : v && typeof v==="object"
    ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])) : v;
  return JSON.stringify(normalize(value));
}
export function fixedReplayCompanionFixtures() {
  const hash=v=>createHash("sha256").update(canonical(v),"utf8").digest("hex");
  const rows=[0,1].map(i=>({source_ordinal:i,at_utc_ms:1_700_000_000_000+i*60_000,open:"100",high:"102",low:"99",close:"101",volume:"2",equity:"1000",return_fraction:"0",drawdown_fraction:"0",positions:{DEFAULT:"0.25"}}));
  const source={schema_version:"research.fixed-replay-source.v1",state:"AVAILABLE",reason_code:null,file_name:"fixed-replay.parquet",file_sha256:"f".repeat(64),byte_count:256,
    normalized_rows_sha256:hash(rows),row_count:2,oos_start_utc_ms:rows[0].at_utc_ms,oos_end_exclusive_utc_ms:rows[1].at_utc_ms+60_000,
    first_observed_utc_ms:rows[0].at_utc_ms,last_observed_utc_ms:rows[1].at_utc_ms};
  const manifest={schema_version:"research.fixed-replay-companion-manifest.v1",workspace_id:"fixed-replay-fixture-workspace",run_id:"fixed-replay-fixture-run",artifact_id:"fixed-replay-fixture-artifact",
    artifact_revision:1,manifest_digest:"a".repeat(64),requested_spec_digest:"c".repeat(64),effective_spec_digest:"d".repeat(64),dataset_binding_digest:"e".repeat(64),
    execution_profile_id:"p04.fixed-qualification.v1",execution_profile_digest:null,market_symbol:"BTCUSDT",source,scope};
  const base={schema_version:"research.fixed-replay-companion-page.v1",run_id:manifest.run_id,scope,execution_profile:{id:manifest.execution_profile_id,digest:null},next_cursor:null};
  const absentManifest={...manifest,source:{schema_version:"research.fixed-replay-source.v1",state:"NOT_PUBLISHED",reason_code:"FIXED_REPLAY_ROW_LIMIT_EXCEEDED",
    oos_start_utc_ms:source.oos_start_utc_ms,oos_end_exclusive_utc_ms:source.oos_end_exclusive_utc_ms}};
  return {
    "research-fixed-replay-companion.available.valid.json":{...base,availability:{state:"AVAILABLE",reason_code:null},custody:"FRESH_FIXED_OOS_RETAINED",revision:hash(manifest),manifest,counts:{full_source_retained:2,matching_filter:2,returned:2},rows},
    "research-fixed-replay-companion.fresh-absent.valid.json":{...base,availability:{state:"NOT_PUBLISHED",reason_code:absentManifest.source.reason_code},custody:"FRESH_SOURCE_NOT_PUBLISHED",revision:hash(absentManifest),manifest:absentManifest,counts:{full_source_retained:null,matching_filter:null,returned:0},rows:[]},
    "research-fixed-replay-companion.not-recorded.valid.json":{...base,availability:{state:"NOT_PUBLISHED",reason_code:"FIXED_OOS_CUSTODY_NOT_RECORDED"},custody:"NOT_RECORDED",revision:null,manifest:null,counts:{full_source_retained:null,matching_filter:null,returned:0},rows:[]},
    "research-fixed-replay-companion.not-applicable.valid.json":{...base,execution_profile:{id:"p17.delta-signal-notional-wfo.v1",digest:"b".repeat(64)},availability:{state:"NOT_APPLICABLE",reason_code:"EXECUTION_PROFILE_NOT_FIXED"},custody:"NOT_APPLICABLE",revision:null,manifest:null,counts:{full_source_retained:null,matching_filter:null,returned:0},rows:[]},
  };
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const documents={"openapi/research-fixed-replay-companion.openapi.json":buildFixedReplayCompanionOpenApi(),
    ...Object.fromEntries(Object.entries(fixedReplayCompanionFixtures()).map(([name,value])=>[`fixtures/${name}`,value]))};
  for(const [name,value] of Object.entries(documents)) {
    const url=new URL(name,root),encoded=JSON.stringify(value,null,2)+"\n";
    if(process.argv.includes("--check")) {if(readFileSync(url,"utf8")!==encoded) throw new Error(`Generated fixed replay contract drift: ${name}`);}
    else writeFileSync(url,encoded);
  }
}
