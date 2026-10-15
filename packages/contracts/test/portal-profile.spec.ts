import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import Ajv2020 from "ajv/dist/2020";
import {describe,it,expect} from "vitest";
const root=resolve(__dirname,"..");
const spec=JSON.parse(readFileSync(resolve(root,"openapi/portal-profile.openapi.json"),"utf8"));
const fixture=JSON.parse(readFileSync(resolve(root,"fixtures/portal-profile.synthetic.valid.json"),"utf8"));
const ajv=new Ajv2020({strict:true});
const schemas=JSON.parse(JSON.stringify(spec.components.schemas).replaceAll("#/components/schemas/","#/$defs/"));
ajv.addSchema({$id:"portal-profile",$defs:schemas});
const validate=(name:string,value:unknown)=>ajv.compile({$ref:`portal-profile#/$defs/${name}`})(value);
describe("ELP2-02 generated profile boundary",()=>{
  it("publishes named read/write operations with cookie, CSRF and CAS/idempotency",()=>{
    const path=spec.paths["/api/auth/profile"];
    expect(path.get.operationId).toBe("portalOwnProfileGetV1");
    expect(path.patch.operationId).toBe("portalOwnProfilePatchV1");
    expect(path.patch.parameters.map((p:any)=>p.name)).toEqual(["x-portal-idempotency-key","x-portal-csrf","Origin"]);
    expect(spec.components.securitySchemes.PortalSession.name).toBe("__Host-portal_session");
  });
  it("synthetic identity preserves absent TS/researcher proof and disabled recovery",()=>{
    expect(validate("OwnProfile",fixture)).toBe(true);
    expect(validate("OwnProfile",{...fixture,ts_identity:{...fixture.ts_identity,state:"VERIFIED"}})).toBe(false);
    expect(validate("OwnProfile",{...fixture,owner_recovery:{enabled:true,reason:"OWNER_RECOVERY_NOT_APPROVED"}})).toBe(false);
    expect(JSON.stringify(fixture)).not.toMatch(/password_hash|csrf_secret|subject|jwt|activation_token/);
  });
  it("allows only self display-name intent, not identity/roles/grants/owner",()=>{
    const body={display_name:"Researcher",expected_revision:1};
    expect(validate("OwnProfilePatch",body)).toBe(true);
    for(const key of ["user_id","role","capabilities","issuer","subject","target_user_id","is_owner","ts_user_id"])
      expect(validate("OwnProfilePatch",{...body,[key]:"spoof"}),key).toBe(false);
    for(const name of ["","   ","\u00a0","Bad\nname","\nBad","Bad\t","Bad\u007fname","x".repeat(121)])
      expect(validate("OwnProfilePatch",{...body,display_name:name})).toBe(false);
    expect(validate("OwnProfilePatch",{...body,display_name:"😀".repeat(120)})).toBe(true);
    expect(validate("OwnProfilePatch",{...body,display_name:"😀".repeat(121)})).toBe(false);
    expect(validate("OwnProfilePatch",{...body,expected_revision:Number.MAX_SAFE_INTEGER+1})).toBe(false);
  });
  it("operation and error fixtures match actual wire envelopes",()=>{
    expect(validate("OwnProfileOperation",{schema_version:"portal.profile-operation.v1",outcome:"REPLAYED",operation_id:"alo_TEST",resulting_revision:1,profile:fixture})).toBe(true);
    expect(validate("ProfileProblem",{error:{code:"SESSION_REQUIRED",message:"Invalid session."},request_id:"test-only"})).toBe(true);
    const types=readFileSync(resolve(root,"generated/portal-profile.d.ts"),"utf8");
    for(const type of ["OwnProfile:","OwnProfilePatch:","OwnProfileOperation:","portalOwnProfileGetV1:","portalOwnProfilePatchV1:"])expect(types).toContain(type);
  });
});
