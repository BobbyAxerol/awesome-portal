/** Synthetic Portal workflow facts; not TS command eligibility or runtime proof. */
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { PortalUser } from "../src/domain";
import { ExecutionReadScopes, type ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { IncidentController } from "../src/operations/incident.controller";
import { projectIncidentEligibility, incidentEligibilityQuery, type IncidentEligibilityFacts } from "../src/operations/incident-eligibility";
import { IncidentRepository } from "../src/operations/incident.repository";
import { IncidentService } from "../src/operations/incident.service";

const WS="TEST_ONLY:workspace", ID="TEST_ONLY:incident", NOW=1_800_000_000_000;
const admin={userId:"TEST_ONLY:admin",role:"ADMIN"} as PortalUser;
const principal={user:admin,workspaceId:WS,session:{}} as ReadScopePrincipal;
const fact=(overrides:Partial<IncidentEligibilityFacts>={}):IncidentEligibilityFacts=>({
  incident_id:ID,environment:"PAPER",workflow_state:"OPEN",workflow_version:1,
  acknowledged_at:null,assigned_to_user_id:null,has_mitigation_attestation:false,has_clean_dry_run:false,...overrides});
const ready={acknowledged_at:new Date(NOW),assigned_to_user_id:"TEST_ONLY:assignee",has_mitigation_attestation:true};

describe("incident advisory workflow projection",()=>{
  const vectors:{name:string;changes:Partial<IncidentEligibilityFacts>;eligible:boolean[];mitigation?:string[];resolution?:string[]}[]=[
    {name:"initial OPEN",changes:{},eligible:[true,false,false],
      mitigation:["INCIDENT_ACKNOWLEDGEMENT_REQUIRED","INCIDENT_ASSIGNEE_REQUIRED","MITIGATION_EVIDENCE_REQUIRED"],
      resolution:["INCIDENT_NOT_MITIGATED","CLEAN_DRY_RUN_EVIDENCE_REQUIRED"]},
    {name:"OPEN acknowledged",changes:{acknowledged_at:new Date(NOW)},eligible:[false,false,false],
      mitigation:["INCIDENT_ASSIGNEE_REQUIRED","MITIGATION_EVIDENCE_REQUIRED"]},
    {name:"OPEN missing acknowledgement only",changes:{...ready,acknowledged_at:null},eligible:[true,false,false],
      mitigation:["INCIDENT_ACKNOWLEDGEMENT_REQUIRED"]},
    {name:"OPEN missing assignee only",changes:{...ready,assigned_to_user_id:null},eligible:[false,false,false],
      mitigation:["INCIDENT_ASSIGNEE_REQUIRED"]},
    {name:"OPEN missing mitigation evidence only",changes:{...ready,has_mitigation_attestation:false},eligible:[false,false,false],
      mitigation:["MITIGATION_EVIDENCE_REQUIRED"]},
    {name:"OPEN ready to mitigate",changes:ready,eligible:[false,true,false],mitigation:[]},
    {name:"OPEN clean dry run cannot bypass mitigation",changes:{...ready,has_clean_dry_run:true},eligible:[false,true,false],
      resolution:["INCIDENT_NOT_MITIGATED"]},
    {name:"MITIGATED missing clean dry run",changes:{...ready,workflow_state:"MITIGATED"},eligible:[false,false,false],
      mitigation:["INCIDENT_NOT_MITIGATABLE"],resolution:["CLEAN_DRY_RUN_EVIDENCE_REQUIRED"]},
    // The existing ACK writer permits MITIGATED when not already acknowledged;
    // the resolve writer needs MITIGATED+clean evidence, not an invented gate.
    {name:"MITIGATED unacknowledged can acknowledge and resolve",changes:{workflow_state:"MITIGATED",has_clean_dry_run:true},
      eligible:[true,false,true],resolution:[]},
    {name:"MITIGATED ready to resolve",changes:{...ready,workflow_state:"MITIGATED",has_clean_dry_run:true},
      eligible:[false,false,true],resolution:[]},
    {name:"RESOLVED terminal regardless of evidence",changes:{...ready,workflow_state:"RESOLVED",has_clean_dry_run:true},
      eligible:[false,false,false],mitigation:["INCIDENT_ALREADY_RESOLVED"],resolution:["INCIDENT_ALREADY_RESOLVED"]},
  ];
  it.each(vectors)("$name",({changes,eligible,mitigation,resolution})=>{
    const input=fact(changes),before=structuredClone(input),result=projectIncidentEligibility(input,WS,NOW);
    expect(result.actions.map(row=>row.action)).toEqual(["incident.acknowledge","incident.mitigate","incident.resolve"]);
    expect(result.actions.map(row=>row.eligible)).toEqual(eligible);
    if(mitigation)expect(result.actions[1].blocker_codes).toEqual(mitigation);
    if(resolution)expect(result.actions[2].blocker_codes).toEqual(resolution);
    expect(result.actions.every(row=>row.eligible===(row.blocker_codes.length===0))).toBe(true);
    expect(result.actions.map(row=>row.required_inputs)).toEqual([[],["mitigation_evidence_hash"],["clean_dry_run_evidence_hash","reason"]]);
    expect(result).toMatchObject({workspace_id:WS,incident_id:ID,workflow_version:1,observed_at_ms:NOW,
      current_only:true,advisory_only:true,authority_basis:"EXISTING_PORTAL_ADMIN_INCIDENT_WORKFLOW",
      family_check:"PORTAL_INCIDENT_WORKFLOW_RECHECK_REQUIRED",source_side_effect_requested:false,deployment_resume_requested:false});
    expect(input).toEqual(before);
  });
});

function serviceFixture(modes:("LEGACY_COMPATIBILITY"|"SCOPED_V2")[]=["LEGACY_COMPATIBILITY","LEGACY_COMPATIBILITY"]){
  const eligibility=vi.fn(async()=>fact());
  const coreSelectionMode=vi.fn(async()=>modes.shift()??"SCOPED_V2");
  const service=new IncidentService({eligibility} as unknown as IncidentRepository,
    {coreSelectionMode} as unknown as ExecutionReadScopes);
  return {service,eligibility,coreSelectionMode};
}

describe("incident eligibility service authorization and mode fences",()=>{
  it("refuses USER before reading mode or incident",async()=>{
    const f=serviceFixture();
    await expect(f.service.eligibility({...admin,role:"USER"},WS,ID,principal))
      .rejects.toMatchObject({code:"ADMIN_ROLE_REQUIRED",status:403});
    expect(f.eligibility).not.toHaveBeenCalled();expect(f.coreSelectionMode).not.toHaveBeenCalled();
  });
  it("refuses missing/mismatched current principal before incident lookup",async()=>{
    const f=serviceFixture();
    for(const actor of [undefined,{...principal,user:{...admin,userId:"TEST_ONLY:other"}},{...principal,workspaceId:"TEST_ONLY:other"}])
      await expect(f.service.eligibility(admin,WS,ID,actor)).rejects.toMatchObject({code:"EXECUTION_READ_SCOPE_REQUIRED",status:403});
    expect(f.eligibility).not.toHaveBeenCalled();expect(f.coreSelectionMode).not.toHaveBeenCalled();
  });
  it("refuses SCOPED_V2 before incident lookup; ADMIN is not a scoped publication",async()=>{
    const f=serviceFixture(["SCOPED_V2"]);
    await expect(f.service.eligibility(admin,WS,ID,principal))
      .rejects.toMatchObject({code:"INCIDENT_SCOPED_PARENT_NOT_COMMISSIONED",status:503});
    expect(f.eligibility).not.toHaveBeenCalled();
  });
  it("refuses an access-mode change after lookup instead of returning captured facts",async()=>{
    const f=serviceFixture(["LEGACY_COMPATIBILITY","SCOPED_V2"]);
    await expect(f.service.eligibility(admin,WS,ID,principal)).rejects.toMatchObject({code:"EXECUTION_READ_ACCESS_CHANGED",status:409});
    expect(f.eligibility).toHaveBeenCalledExactlyOnceWith(WS,ID);expect(f.coreSelectionMode).toHaveBeenCalledTimes(2);
  });
  it("fences the successful advisory response on both sides of the single lookup",async()=>{
    const f=serviceFixture(),clock=vi.spyOn(Date,"now").mockReturnValue(NOW);
    try{
      expect(await f.service.eligibility(admin,WS,ID,principal)).toEqual(projectIncidentEligibility(fact(),WS,NOW));
      expect(f.coreSelectionMode.mock.invocationCallOrder[0]).toBeLessThan(f.eligibility.mock.invocationCallOrder[0]);
      expect(f.eligibility.mock.invocationCallOrder[0]).toBeLessThan(f.coreSelectionMode.mock.invocationCallOrder[1]);
    }finally{clock.mockRestore();}
  });
});

describe("incident eligibility repository and controller boundaries",()=>{
  it("uses one scoped statement with correlated EXISTS, never the bounded detail evidence page",async()=>{
    const query=vi.fn(async()=>({rows:[fact()],rowCount:1}));
    const repo=new IncidentRepository({query} as unknown as Pool);
    expect(await repo.eligibility(WS,ID)).toEqual(fact());
    expect(query).toHaveBeenCalledTimes(1);
    const [sql,params]=query.mock.calls[0] as unknown as [string,unknown[]];
    expect(params).toEqual([WS,ID]);expect(sql).not.toContain(WS);expect(sql).not.toContain(ID);
    expect(sql.match(/EXISTS\(SELECT 1 FROM execution_incident_evidence/g)).toHaveLength(2);
    expect(sql.match(/e\.workspace_id=i\.workspace_id/g)).toHaveLength(2);
    expect(sql.match(/e\.incident_id=i\.incident_id/g)).toHaveLength(2);
    expect(sql).toContain("i.workspace_id=$1 AND i.incident_id=$2");
    expect(sql).toContain("e.evidence_kind='MITIGATION_ATTESTATION'");expect(sql).toContain("e.evidence_kind='CLEAN_DRY_RUN'");
    expect(sql).not.toMatch(/\bLIMIT\b/i);
  });
  it("returns the same not-found error for an absent or out-of-workspace incident",async()=>{
    const query=vi.fn(async()=>({rows:[],rowCount:0}));
    const repo=new IncidentRepository({query} as unknown as Pool);
    await expect(repo.eligibility(WS,ID)).rejects.toMatchObject({code:"INCIDENT_NOT_FOUND",status:404});
  });
  it("rejects unknown query keys and malformed IDs before workspace/service lookup",async()=>{
    const eligibility=vi.fn(),isMember=vi.fn(async()=>true);
    const controller=new IncidentController({eligibility} as never,{isMember} as never,{} as never);
    const request={portalUser:admin,portalWorkspaceId:WS,portalSession:{}} as Parameters<IncidentController["eligibility"]>[0];
    for(const query of [{workspace_id:WS,action:"incident.resolve"},{workspace_id:WS,role:"ADMIN"},
      {workspace_id:[WS]},{workspace_id:"x".repeat(97)},{workspace_id:WS,include:"evidence"}])
      await expect(controller.eligibility(request,ID,query)).rejects.toMatchObject({code:"INVALID_INCIDENT_ELIGIBILITY",status:400});
    await expect(controller.eligibility(request,"../other",{})).rejects.toMatchObject({code:"INVALID_INCIDENT_ELIGIBILITY",status:400});
    expect(isMember).not.toHaveBeenCalled();expect(eligibility).not.toHaveBeenCalled();
    expect(incidentEligibilityQuery.parse({})).toEqual({});
  });
  it("checks workspace membership and passes only the authenticated principal",async()=>{
    const eligibility=vi.fn(async()=>({advisory_only:true})),isMember=vi.fn(async()=>false);
    const controller=new IncidentController({eligibility} as never,{isMember} as never,{} as never);
    const request={portalUser:admin,portalWorkspaceId:WS,portalSession:{}} as Parameters<IncidentController["eligibility"]>[0];
    await expect(controller.eligibility(request,ID,{})).rejects.toMatchObject({code:"WORKSPACE_NOT_FOUND",status:404});
    expect(eligibility).not.toHaveBeenCalled();
    isMember.mockResolvedValue(true);await controller.eligibility(request,ID,{});
    expect(eligibility).toHaveBeenCalledExactlyOnceWith(admin,WS,ID,{user:admin,session:request.portalSession,workspaceId:WS,viewerWorkspaceId:WS});
  });
});
