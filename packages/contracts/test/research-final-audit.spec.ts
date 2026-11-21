import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

const doc=JSON.parse(readFileSync(new URL("../openapi/research-final-audit.openapi.json",import.meta.url),"utf8"));
const schemas=JSON.parse(JSON.stringify(doc.components.schemas).replaceAll("#/components/schemas/","#/$defs/"));
const ajv=new Ajv2020({strict:false});
const read=ajv.compile({$defs:schemas,$ref:"#/$defs/Read"});
const create=ajv.compile({$defs:schemas,$ref:"#/$defs/Create"});
const fixture=(state:string)=>JSON.parse(readFileSync(new URL(`../fixtures/research-final-audit.${state}.valid.json`,import.meta.url),"utf8"));

describe("named pinned final-audit canonical contract",()=>{
  it("keeps FULL04 additive report scopes stable through historical audit regeneration",()=>{
    expect(()=>execFileSync(process.execPath,["tooling/generate-research-final-audit.mjs","--check"],{
      cwd:new URL("../",import.meta.url),stdio:"pipe",
    })).not.toThrow();
    const report=JSON.parse(readFileSync(new URL("../openapi/research-report.openapi.json",import.meta.url),"utf8"));
    expect(report.components.schemas.FinalAudit.properties.kind.enum).toContain("NOT_APPLICABLE");
    expect(report.components.schemas.HeadlineV2.properties.scope.enum).toContain("FULL_SAMPLE");
  });
  it("publishes only one named read and one explicit intent, with typed refusals",()=>{
    expect(Object.keys(doc.paths)).toEqual(["/api/v1/quantbt/runs/{run_id}/final-audit"]);
    const path=Object.values(doc.paths)[0] as any;
    expect(path.get.operationId).toBe("researchLinkedFinalAuditGetV1");
    expect(path.post.operationId).toBe("researchLinkedFinalAuditCreateV1");
    for(const operation of [path.get,path.post]) for(const status of [400,401,403,404,409,502,503])
      expect(operation.responses[status].content["application/json"].schema.$ref).toBe("#/components/schemas/Problem");
    expect(path.post.description).toContain("x-portal-csrf");
  });
  it("validates every explicitly synthetic state and does not equate READY with verified bytes",()=>{
    for(const state of ["ready_to_admit","queued","running","awaiting_verification","verified","failed","cancelled"])
      expect(read(fixture(state)),JSON.stringify(read.errors)).toBe(true);
    const verified=fixture("verified");
    for(const bad of [{...verified,verification:null},{...verified,child_run_id:null},
      {...verified,profile_digest:"0".repeat(64)}, {...verified,state:"AWAITING_VERIFICATION"},
      {...verified,verification:{...verified.verification,result:{...verified.verification.result,optimizer_trials:1}}}])
      expect(read(bad),JSON.stringify(bad)).toBe(false);
  });
  it("has no browser authority over parameters, raw source documents, data or transport",()=>{
    const input={client_intent_id:"audit-fixture-intent-0001",target_digest:"a".repeat(64)};
    expect(create(input)).toBe(true);
    for(const key of ["params","source_config_raw","source_selection_raw","url","path","snapshot_id","optimizer_trials"])
      expect(create({...input,[key]:"forbidden"})).toBe(false);
  });
});
