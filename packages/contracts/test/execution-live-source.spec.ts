/** TEST_ONLY schema/fixture parity. No source or product authority installed. */
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,expect,it} from "vitest";
import {liveSourceOperationsRead,liveSourceValues} from "../../../apps/control-api/src/live/live-source.contract";
import {liveSourceCurrentSchemas,liveSourceFixture,liveSourceFixtureName,liveSourceReadRoute,
  updateLiveSourcePath} from "../tooling/execution-positive-parent-reader.mjs";
import type {components as LiveTypes,operations as LiveOperations} from "../generated/execution-live-full";
const root=resolve(__dirname,".."),load=(file:string)=>JSON.parse(readFileSync(resolve(root,file),"utf8"));
const fixture=load("fixtures/"+liveSourceFixtureName),definitions=liveSourceCurrentSchemas();
const stored=load("schemas/execution-operations.v1.schema.json"),api=load("openapi/execution-live-full.openapi.json");
const ajv=new Ajv2020({strict:true,allErrors:true});
ajv.addSchema({$id:"TEST_ONLY:live-source",$defs:definitions});
const validate=ajv.compile({$ref:"TEST_ONLY:live-source#/$defs/LiveSourceOperationsReadV2"});
const clone=<T>(value:T):T=>structuredClone(value);
const check=(body:unknown,expected:boolean)=>{
  expect(validate(body),"finite AJV").toBe(expected);
  expect(liveSourceOperationsRead.safeParse(body).success,"canonical Zod").toBe(expected);
};
const mutateValues=(key:string,value:unknown)=>{
  const body=clone(fixture.populated);body.data.orders.records[0].values[key]=value;return body;
};
describe("ELP2-04 finite source-only Live public contract",()=>{
  it("publishes one finite source shape through the SAME stored defs/tooling; fixture is explicitly synthetic",()=>{
    expect(Object.keys(definitions)).toEqual(["LiveSourceOperationsReadV2"]);
    expect(stored.$defs.LiveSourceOperationsReadV2).toEqual(definitions.LiveSourceOperationsReadV2);
    expect(api.components.schemas.LiveSourceOperationsReadV2).toEqual({$ref:
      "../schemas/execution-operations.v1.schema.json#/$defs/LiveSourceOperationsReadV2"});
    expect(fixture).toEqual(liveSourceFixture());
    expect(fixture).toMatchObject({lane:"TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT",runtime_qualified:false,
      production_config:false,authority_installed:false,source_publication_installed:false});
    check(fixture.populated,true);check(fixture.unpublished,true);
    // Both are source-only: parent/root/current TS acceptance are not implied.
    expect(fixture.populated.data.broker_sync).toMatchObject({state:"NOT_PUBLISHED",reason_code:"BROKER_PURPOSE_NOT_COMMISSIONED"});
    expect(fixture.populated.data.account_balances.provenance.purpose).toBe("account.read");
    expect(fixture.populated.data.orders.provenance.purpose).toBe("alpha.read");
    expect(validate(load("fixtures/execution-live-full-operations.unavailable.valid.json"))).toBe(false);
  });
  it("retains legacy success/ref, named GET, other verbs, params, security, defaults and unrelated components",()=>{
    const updated=clone(api);updateLiveSourcePath(updated);expect(updated).toEqual(api);
    expect(Object.keys(updated.paths)).toEqual(Object.keys(api.paths));
    const get=updated.paths[liveSourceReadRoute].get;
    expect(get.operationId).toBe("getLiveFullOperations");
    expect(get.responses[200].content["application/json"].schema).toEqual({oneOf:[
      {$ref:"../schemas/execution-live-full-operations.v1.schema.json#/$defs/LiveFullOperations"},
      {$ref:"../schemas/execution-operations.v1.schema.json#/$defs/LiveSourceOperationsReadV2"}]});
    const probe=clone(api);probe.paths[liveSourceReadRoute].patch={operationId:"TEST_ONLY:untouched-write"};
    probe.paths[liveSourceReadRoute].get.security=[{TEST_ONLY:[]}];
    probe.paths[liveSourceReadRoute].get.responses.default={description:"TEST_ONLY:untouched-default"};
    probe.components.schemas.TEST_ONLY_Unrelated={type:"string"};
    const before=clone(probe);updateLiveSourcePath(probe);
    expect(probe.paths[liveSourceReadRoute].patch).toEqual(before.paths[liveSourceReadRoute].patch);
    expect(probe.paths[liveSourceReadRoute].get.parameters).toEqual(before.paths[liveSourceReadRoute].get.parameters);
    expect(probe.paths[liveSourceReadRoute].get.security).toEqual(before.paths[liveSourceReadRoute].get.security);
    expect(probe.paths[liveSourceReadRoute].get.responses.default).toEqual(before.paths[liveSourceReadRoute].get.responses.default);
    expect(probe.components.schemas.TEST_ONLY_Unrelated).toEqual(before.components.schemas.TEST_ONLY_Unrelated);
    expect(probe.components.responses).toEqual(before.components.responses);
    expect(probe.components.schemas.Problem).toEqual(before.components.schemas.Problem);
    expect(()=>updateLiveSourcePath({paths:{}})).toThrow("Missing existing Live source GET");
  });
  it("known refusals use the actual filter CommandProblem application/json, not stale problem+json",()=>{
    const get=api.paths[liveSourceReadRoute].get;
    for(const status of [400,401,403,404,409,500,503]){
      expect(get.responses[status].$ref).toBeUndefined();
      expect(Object.keys(get.responses[status].content)).toEqual(["application/json"]);
      expect(get.responses[status].content["application/json"].schema).toEqual({$ref:
        "execution-trusted-commands.openapi.json#/components/schemas/CommandProblem"});
    }
    const problem=load("openapi/execution-trusted-commands.openapi.json").components.schemas.CommandProblem;
    const problemValidator=ajv.compile(problem);
    expect(problemValidator({error:{code:"EXECUTION_READ_ACCESS_CHANGED",message:"Read access changed."},request_id:"TEST_ONLY"})).toBe(true);
    expect(problemValidator({type:"about:blank",title:"bad",status:409})).toBe(false);
    expect(problemValidator({error:{code:"TEST_ONLY",message:"safe",sql:"PRIVATE"},request_id:"TEST_ONLY"})).toBe(false);
  });
  it("every object level is finite; private source fields and nested blobs are rejected",()=>{
    const base=fixture.populated;
    for(const patch of [{actor:{user_id:"PRIVATE"}},{source_cursor:"PRIVATE"},{private_raw_snapshot:{}},
      {approval:{status:"APPROVED"}},{canary:{}},{decision_context:{}},{production_command_active:true}])check({...base,...patch},false);
    for(const key of ["actor_user_id","external_account_ref","sql","token","params","raw_payload","stop_price"])
      check(mutateValues(key,"PRIVATE"),false);
    const changed=clone(base);changed.data.orders.records[0].private_lineage={};check(changed,false);
    const panel=clone(base);panel.data.orders.source_rows=[];check(panel,false);
    const provenance=clone(base);provenance.data.orders.provenance.captured_subject_id="PRIVATE";check(provenance,false);
    const extra=clone(base);extra.data.extra_panel={};check(extra,false);
    check(mutateValues("price",{raw:"1"}),false);
  });
  it("keeps omission vs explicit null vs exact0, with precise decimal/count strings and epoch milliseconds",()=>{
    const omitted=clone(fixture.populated);omitted.data.orders.records[0].values={};check(omitted,true);
    for(const value of [null,"0","-0","0.000000000000000001","9007199254740993.123456789123456789"])
      check(mutateValues("price",value),true);
    for(const value of [0,9007199254740992,"", "+1","01","1e-10",".5","1.","NaN","Infinity","1\n","1\r","1\u2028","1\u2029","1".repeat(97)])
      check(mutateValues("price",value),false);
    for(const value of [null,"0","9007199254740993"])
      check(mutateValues("filled_count",value),true);
    for(const value of [0,"-1","1.0","01","1\n","1\r","1".repeat(97)])check(mutateValues("filled_count",value),false);
    for(const value of [null,0,Number.MAX_SAFE_INTEGER])check(mutateValues("trade_time_ms",value),true);
    for(const value of [-1,0.5,Number.MAX_SAFE_INTEGER+1,"2026-10-18T00:00:00Z"])
      check(mutateValues("trade_time_ms",value),false);
    expect(liveSourceValues.parse({price:"0"})).toEqual({price:"0"});
    expect(liveSourceValues.parse({price:null})).toEqual({price:null});
    expect(liveSourceValues.parse({})).toEqual({});
  });
  it("rejects source-clock/census/runtime/stream/command assertions not supplied by THIS reader",()=>{
    const base=fixture.populated;
    for(const patch of [{schema_version:"execution.live-full-operations.v1"},{environment:"paper"},{source_verdict:"ACCEPTED"},
      {coverage:"FULL"},{record_authority:"BROKER"},{visibility:"FULL"},{source_side_effect_requested:true},
      {runtime_activation_requested:true},{runtime:{...base.runtime,state:"RUNNING"}},
      {realtime:{...base.realtime,active:true}},{commands:{...base.commands,enabled:true}},
      {observed_at_ms:-1},{observed_at_ms:Number.MAX_SAFE_INTEGER+1}])check({...base,...patch},false);
    for(const patch of [{source_as_of_ms:0},{source_clock_reason:"KNOWN"},{exact_total:1},{limit:400},
      {provenance:{...base.data.orders.provenance,source_revision:"PRIVATE"}},
      {provenance:{...base.data.orders.provenance,source_cursor:"PRIVATE"}},
      {provenance:{...base.data.orders.provenance,source_completeness:"COMPLETE"}},
      {provenance:{...base.data.orders.provenance,history_semantics:"FULL_HISTORY"}},
      {provenance:{...base.data.orders.provenance,purpose:"audit.read"}}]){
      const changed=clone(base);changed.data.orders={...changed.data.orders,...patch};check(changed,false);
    }
    const missing=clone(base);delete missing.data.broker_sync;check(missing,false);
  });
  it("NOT_PUBLISHED is genuinely empty; PARTIAL empty is not a complete source-zero assertion",()=>{
    const changed=clone(fixture.populated);changed.data.orders={...changed.data.orders,state:"PARTIAL",
      reason_code:"NO_AUTHORIZED_RETAINED_OBSERVATION",records:[],returned_count:0,has_more:false};check(changed,true);
    const unavailable=clone(fixture.unpublished);
    for(const patch of [{records:fixture.populated.data.orders.records,returned_count:1},{has_more:true},{returned_count:1}]){
      const invalid=clone(unavailable);invalid.data.orders={...invalid.data.orders,...patch};check(invalid,false);
    }
  });
  it("accepts at most200 authorized records, with no invented total; malformed observation IDs fail",()=>{
    const body=clone(fixture.populated),record=body.data.orders.records[0];
    body.data.orders.records=Array.from({length:200},(_,index)=>({...record,observation_id:"por1_"+index.toString(16).padStart(64,"0")}));
    body.data.orders.returned_count=200;body.data.orders.has_more=true;
    body.data.orders.next_cursor="lps2.TEST_ONLY.200.1800000000."+"a".repeat(43);check(body,true);
    body.data.orders.records.push(record);check(body,false);
    for(const observation_id of ["por1_"+"a".repeat(63),"por1_"+"A".repeat(64),record.observation_id+"\n"]){
      const invalid=clone(fixture.populated);invalid.data.orders.records[0].observation_id=observation_id;check(invalid,false);
    }
  });
  it("publishes fixed same-route navigation and exact panel grain without a source cursor or new operation",()=>{
    const get=api.paths[liveSourceReadRoute].get,params=get.parameters.filter((p:{in:string})=>p.in==="query");
    expect(params.find((p:{name:string})=>p.name==="panel").schema.enum)
      .toEqual(["deployments","positions","sessions","orders","fills","accounts","account_balances","margin_balances","account_sync","reconciliation"]);
    expect(params.find((p:{name:string})=>p.name==="cursor").schema).toMatchObject({type:"string",maxLength:128});
    expect(get.operationId).toBe("getLiveFullOperations");
    expect(Object.keys(api.paths)).toEqual([liveSourceReadRoute]);
    expect(fixture.populated.data.account_balances.grain).toBe("ACCOUNT");
    expect(fixture.populated.data.orders.grain).toBe("DEPLOYMENT");
    const wrong=clone(fixture.populated);wrong.data.account_balances.grain="DEPLOYMENT";check(wrong,false);
  });
  it("continuation shape never authorizes; has_more requires its same-panel token and absence has no navigation",()=>{
    const body=clone(fixture.populated),token="lps2.TEST_ONLY.200.1800000000."+"a".repeat(43);
    body.data.orders.has_more=true;body.data.orders.next_cursor=token;check(body,true);
    body.data.orders.next_cursor=null;check(body,false);
    body.data.orders.has_more=false;body.data.orders.next_cursor=token;check(body,false);
    for(const cursor of [token+"\n","raw-source-cursor","ur1.TEST_ONLY.200.1800000000."+"a".repeat(43)]){
      body.data.orders.has_more=true;body.data.orders.next_cursor=cursor;check(body,false);
    }
    const unavailable=clone(fixture.unpublished);unavailable.data.orders.previous_cursor=token;check(unavailable,false);
  });
  it("rejects control bytes and BMP overflow without silently requiring denied values",()=>{
    for(const value of ["bad\ntext","bad\u0000text","bad\u007ftext","x".repeat(4097),""])
      check(mutateValues("status",value),false);
    check(mutateValues("status",null),true);check(mutateValues("status","x".repeat(4096)),true);
  });
  it("documents standard JSON Schema cross-field/Unicode limits instead of claiming false parity",()=>{
    const mismatch=clone(fixture.populated);mismatch.data.orders.returned_count=0;
    // Standard JSON Schema has no arbitrary sibling array-length equality.
    expect(validate(mismatch)).toBe(true);
    expect(liveSourceOperationsRead.safeParse(mismatch).success).toBe(false);
    const astral=mutateValues("status","😀".repeat(2049));
    // JSON maxLength counts code points; Zod3 max uses UTF16 code units.
    expect(validate(astral)).toBe(true);
    expect(liveSourceOperationsRead.safeParse(astral).success).toBe(false);
  });
});
// Compile-only generated tripwires: a missing union arm cannot pass via never.
type Assert<T extends true>=T;
type Source=LiveTypes["schemas"]["LiveSourceOperationsReadV2"];
type Wire=LiveOperations["getLiveFullOperations"]["responses"][200]["content"]["application/json"];
type Served=Extract<Wire,{schema_version:"portal.execution.live-source-operations.v2"}>;
type Legacy=Extract<Wire,{schema_version:"execution.live-full-operations.v1"}>;
type _SourcePresent=Assert<[Served] extends [never]?false:true>;
type _LegacyPresent=Assert<[Legacy] extends [never]?false:true>;
type _SourceShape=Assert<Served extends Source?true:false>;
type _SourceReverseShape=Assert<Source extends Served?true:false>;
type _NoCommandAuthority=Assert<Source["commands"]["enabled"] extends false?true:false>;
type _NoRuntimeAuthority=Assert<Source["runtime_activation_requested"] extends false?true:false>;
type _NoCensus=Assert<Source["data"]["orders"]["exact_total"] extends null?true:false>;
type _PanelCursor=Assert<Source["data"]["orders"]["next_cursor"] extends string|null?true:false>;
type _AccountGrain=Assert<Source["data"]["account_balances"]["grain"] extends "ACCOUNT"?true:false>;
type Query=NonNullable<LiveOperations["getLiveFullOperations"]["parameters"]["query"]>;
type _FinitePanel=Assert<Exclude<Query["panel"],undefined> extends
  "deployments"|"positions"|"sessions"|"orders"|"fills"|"accounts"|"account_balances"|"margin_balances"|"account_sync"|"reconciliation"?true:false>;
type Values=Source["data"]["orders"]["records"][number]["values"];
type _ExactPrice=Assert<Values["price"] extends string|null|undefined?true:false>;
type _CountString=Assert<Values["filled_count"] extends string|null|undefined?true:false>;
type _OptionalPrice=Assert<{} extends Pick<Values,"price">?true:false>;
type _NoHiddenKey=Assert<"private_actor_id" extends keyof Values?false:true>;
type ErrorWire=LiveOperations["getLiveFullOperations"]["responses"][409]["content"]["application/json"];
type _TypedError=Assert<ErrorWire extends {error:{code:string;message:string};request_id:string}?true:false>;
