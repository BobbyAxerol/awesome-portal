import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,expect,it} from "vitest";
import type {components} from "../generated/research-run-setup";
const read=(path:string)=>JSON.parse(readFileSync(resolve(__dirname,"..",path),"utf8"));
const doc=read("openapi/research-run-setup.openapi.json");
const schema=(name:string)=>new Ajv2020({strict:false}).compile(JSON.parse(JSON.stringify({
  ...doc.components.schemas[name],$defs:doc.components.schemas}).replaceAll("#/components/schemas/","#/$defs/")));
describe("S02 named setup contract and safe canonical examples",()=>{
  it.each(["three-window","advanced","unavailable"])("validates typed %s without authorization or raw source",name=>{
    const fixture:components["schemas"]["WindowSuggestion"]=read(`fixtures/research-window-suggestion.${name}.valid.json`);
    const validate=schema("WindowSuggestion");expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
    expect(validate({...fixture,may_create_run:true})).toBe(false);
    expect(validate({...fixture,preflight_token:"pf_fake"})).toBe(false);
    if(name==="unavailable")expect(validate({...fixture,metadata:{...fixture.metadata,state:"AVAILABLE"}})).toBe(false);
  });
  it("publishes a canonical typed setup example, preserving disabled reasons",()=>{
    const fixture:components["schemas"]["SetupOptions"]=read("fixtures/research-run-setup-options.fixed.valid.json");
    const validate=schema("SetupOptions");expect(validate(fixture),JSON.stringify(validate.errors)).toBe(true);
    expect(validate({...fixture,profiles:[{...fixture.profiles[0],state:"DISABLED"}]})).toBe(false);
    expect(validate({...fixture,profiles:[{...fixture.profiles[0],state:"DISABLED",reason_code:"PROFILE_FLAG_OFF",refusals:[{reason_code:"PROFILE_FLAG_OFF",field_path:["profile_id"]}]}]})).toBe(true);
    expect(fixture.engine_options?.optimization_pairs.find(row=>row.optimization_mode==="mode_2_sbb")).toMatchObject({state:"DISABLED",reason_code:"PROFILE_NOT_OPENED",profile_ids:[]});
    expect(fixture.profiles[0].budget).toMatchObject({cpu_seconds:45,wall_seconds:90,qualification:"LEGACY_EXACT_BINDING",preview_override:false});
    expect(fixture.preflight_policy).toMatchObject({maximum_active_unbound_per_actor:8,ttl_seconds:600,expiry_extension:false});
    expect(validate({...fixture,profiles:Array.from({length:257},()=>fixture.profiles[0])})).toBe(false);
    expect(validate({...fixture,profiles:[{...fixture.profiles[0],budget:{...fixture.profiles[0].budget,cpu_seconds:9999}}]})).toBe(false);
    const invalid=structuredClone(fixture);invalid.engine_options!.execution_routes.find(row=>row.value==="portfolio")!.state="ENABLED";
    expect(validate(invalid)).toBe(false);
  });
  it("publishes a separate typed stale revision, not a generic profile conflict",()=>{
    const value:components["schemas"]["Problem"]=read("fixtures/research-run-setup-options.stale.valid.json");
    const validate=schema("Problem");expect(validate(value),JSON.stringify(validate.errors)).toBe(true);
    expect(value.error.code).toBe("RESEARCH_SETUP_OPTIONS_STALE");expect(value.details?.field_path).toEqual(["options_revision"]);
  });
  it("exports exactly two named operations, requires both explicit bounds and a context revision",()=>{
    expect(Object.keys(doc.paths)).toHaveLength(2);
    const generated=readFileSync(resolve(__dirname,"../generated/research-run-setup.d.ts"),"utf8");
    expect(generated).toContain("researchRunSetupOptionsGetV1");expect(generated).toContain("researchRunWindowSuggestionPostV1");
    const validate=schema("SuggestionRequest");
    const request={alpha_id:"alpha",alpha_version_id:"av_alpha_1",dataset_id:"crypto-binance-1m",symbol:"BTCUSDT",timeframe:"1h",profile_id:"p04.fixed-qualification.v1",options_revision:"a".repeat(64)};
    expect(validate(request)).toBe(true);expect(validate({...request,start_utc_ms:1})).toBe(false);
    expect(validate({...request,source_path:"/data/private"})).toBe(false);
  });
});
