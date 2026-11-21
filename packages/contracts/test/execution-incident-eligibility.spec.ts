/** Canonical synthetic advisory contract, never command or runtime authority. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { INCIDENT_ELIGIBILITY_ACTIONS, projectIncidentEligibility, type IncidentEligibilityFacts }
  from "../../../apps/control-api/src/operations/incident-eligibility";

const root=resolve(__dirname,"..");
const load=(path:string)=>JSON.parse(readFileSync(resolve(root,path),"utf8"));
const schema=load("schemas/execution-incident-eligibility.v1.schema.json");
const spec=load("openapi/execution-incident-eligibility.openapi.json");
const fixture=load("fixtures/execution-incident-eligibility.synthetic.valid.json");
const servedSchema=spec.components.schemas.IncidentActionEligibility;
const standalone=new Ajv2020({strict:false,allErrors:true}).compile(schema);
const served=new Ajv2020({strict:false,allErrors:true}).compile(servedSchema);
const values=fixture.cases as Record<string,ReturnType<typeof projectIncidentEligibility>>;
const fixtureFacts:Record<string,Partial<IncidentEligibilityFacts>>={
  open:{},
  mitigation_ready:{acknowledged_at:new Date(1),assigned_to_user_id:"usr_TEST_ONLY",has_mitigation_attestation:true},
  resolution_ready:{workflow_state:"MITIGATED",acknowledged_at:new Date(1),assigned_to_user_id:"usr_TEST_ONLY",
    has_mitigation_attestation:true,has_clean_dry_run:true},
  resolved:{workflow_state:"RESOLVED",acknowledged_at:new Date(1),assigned_to_user_id:"usr_TEST_ONLY",
    has_mitigation_attestation:true,has_clean_dry_run:true},
};

function valid(value:unknown):boolean{
  const a=Boolean(standalone(value)),b=Boolean(served(value));
  expect(a,"standalone/OpenAPI schema drift").toBe(b);
  return a;
}

describe("incident action eligibility publication",()=>{
  it("publishes one read-only, strict-query, session-bound sibling operation and explicit failure statuses",()=>{
    const operation=spec.paths["/api/v1/execution/operations/incidents/{incident_id}/eligibility"].get;
    expect(operation.operationId).toBe("executionIncidentActionEligibilityGetV1");
    expect(operation.security).toEqual([{portalSession:[]}]);
    expect(operation["x-strict-query-keys"]).toEqual(["workspace_id"]);
    expect(operation.parameters.map((parameter:{name:string;in:string})=>[parameter.name,parameter.in]))
      .toEqual([["incident_id","path"],["workspace_id","query"]]);
    expect(operation.parameters[1].required).toBe(false);
    expect(Object.keys(operation.responses).sort()).toEqual(["200","400","401","403","404","409","503"]);
    expect(operation.responses["200"].headers["Cache-Control"].schema.const).toBe("private, no-store");
    expect(operation.responses["200"].content["application/json"].schema.$ref)
      .toBe("#/components/schemas/IncidentActionEligibility");
    expect(operation.description).toContain("not a scoped grant, command permit");
    expect(operation.description).toContain("POST checks exact evidence hash");
    expect(spec.paths["/api/v1/execution/operations/incidents/{incident_id}/eligibility"].post).toBeUndefined();
  });

  it.each(Object.keys(values))("canonical %s case equals the real pure projection",name=>{
    const sample=values[name];
    expect(fixture.lane).toBe("TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT");expect(fixture.runtime_qualified).toBe(false);
    expect(Object.hasOwn(fixtureFacts,name)).toBe(true);
    const fact:IncidentEligibilityFacts={incident_id:sample.incident_id,environment:sample.environment,
      workflow_state:"OPEN",workflow_version:sample.workflow_version,acknowledged_at:null,assigned_to_user_id:null,
      has_mitigation_attestation:false,has_clean_dry_run:false,...fixtureFacts[name]};
    expect(projectIncidentEligibility(fact,sample.workspace_id,sample.observed_at_ms)).toEqual(sample);
    expect(valid(sample),JSON.stringify(standalone.errors)).toBe(true);
  });

  it("never accepts command authority, resume intent or unknown permission-like fields",()=>{
    for(const [field,value] of Object.entries({current_only:false,advisory_only:false,source_side_effect_requested:true,
      deployment_resume_requested:true,authority_basis:"TS_AUTHORITY",family_check:"QUALIFIED_COMMAND_PERMIT",
      granted:true,authorized:true,role:"ADMIN",step_up_required:false,source_command:"resume",can_apply:true}))
      expect(valid({...values.open,[field]:value}),field).toBe(false);
    for(const field of ["grant_id","permission","source_command","eligible_until_ms"]){
      const value=structuredClone(values.open);
      Object.assign(value.actions[0],{[field]:"TEST_ONLY"});
      expect(valid(value),field).toBe(false);
    }
  });

  it("refuses contradictory eligible/blocker facts, foreign action blockers and invented required inputs",()=>{
    for(let index=0;index<3;index++){
      const denied=structuredClone(values.resolved);denied.actions[index].eligible=true;
      expect(valid(denied)).toBe(false);
      const empty=structuredClone(values.resolved);empty.actions[index].blocker_codes=[];
      expect(valid(empty)).toBe(false);
      const foreign=structuredClone(values.resolved);
      foreign.actions[index].blocker_codes=[index===0?"INCIDENT_ASSIGNEE_REQUIRED":"INCIDENT_NOT_ACKNOWLEDGEABLE"];
      expect(valid(foreign)).toBe(false);
      const inputs=structuredClone(values.open);inputs.actions[index].required_inputs=["password"];
      expect(valid(inputs)).toBe(false);
    }
  });

  it("closes the three-action vocabulary, order, cardinality and required fields",()=>{
    expect(values.open.actions.map(row=>row.action)).toEqual([...INCIDENT_ELIGIBILITY_ACTIONS]);
    expect(valid({...values.open,actions:values.open.actions.slice(0,2)})).toBe(false);
    expect(valid({...values.open,actions:[...values.open.actions,values.open.actions[0]]})).toBe(false);
    expect(valid({...values.open,actions:[values.open.actions[1],values.open.actions[0],values.open.actions[2]]})).toBe(false);
    for(const field of Object.keys(values.open)){
      const value=Object.fromEntries(Object.entries(values.open).filter(([key])=>key!==field));
      expect(valid(value),field).toBe(false);
    }
    for(const override of [{workflow_version:0},{workflow_version:1.5},{workflow_version:Number.MAX_SAFE_INTEGER+1},
      {observed_at_ms:-1},{observed_at_ms:"1792627200000"},{workspace_id:"x".repeat(97)},
      {environment:"ALL"},{incident_id:"../other"}])expect(valid({...values.open,...override})).toBe(false);
  });
});
