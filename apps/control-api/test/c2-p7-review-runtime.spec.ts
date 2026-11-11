import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {chmodSync,mkdtempSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {Pool} from "pg";
import {afterEach,describe,expect,it} from "vitest";
import {assertC2P7ReviewSchemaCommissioned,c2P7ReviewRuntimeReference,prepareC2P7ReviewRuntime} from "../src/execution-v2/c2-p7-review-runtime";

const dirs:string[]=[];
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});
const hash=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
const target={database_name:"test_database",database_system_identifier:"123456",role_name:"test_role",
  protected_owner_user_id:"test_owner",workspace_id:"test_workspace",
  principal_workspace_pins:[{user_id:"test_owner",workspace_id:"test_workspace"}]};
const scopes=[{environment:"paper",portfolio_id:"paper-portfolio-g1"},{environment:"paper",portfolio_id:"paper-root-g1"}];
const sample=()=>({schema:"ts.c2.pm-current-access-publication-input.v1",expected_version:0,
  head:{db_login:"ts_pm_operator",db_role:"pm_scoped_writer",environment:"paper",user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",version:1},
  acceptance:{document:{field_revision:"pma-field-policy-20261016-r1",fields:["business_report"],membership_policy_revision:1,
    operations:["HISTORY","READ"],physical_refs:[],scopes,visibility:"BUSINESS"},revoked:false},
  portal_fills:["head.acceptance_id","head.workspace_id","head.workload_ref","acceptance.effective_from","acceptance.expires_at",
    "document.human_authority_revision","document.application_revision","document.acceptance_ref","document.delegation_ref"],
  rules:{canonical:"json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)",
    copy_verbatim:["expected_version","head.user_id","head.environment","head.db_login","head.db_role","head.version",
      "acceptance.revoked","acceptance.document.membership_policy_revision","acceptance.document.field_revision",
      "acceptance.document.visibility","acceptance.document.fields","acceptance.document.operations",
      "acceptance.document.physical_refs","acceptance.document.scopes"],
    effective_from:"signing time, UTC Z, whole seconds",window_max_days:90}});
function fixture(edit:Record<string,unknown>={}) {
  const dir=mkdtempSync(join(tmpdir(),"c2-review-runtime-"));dirs.push(dir);
  const write=(name:string,data:Buffer)=>{const path=join(dir,name);writeFileSync(path,data,{mode:0o600});chmodSync(path,0o600);return {path,sha256:hash(data)};};
  const b1_ref=write("b1",Buffer.from(JSON.stringify(sample()))),keys=generateKeyPairSync("ed25519"),now=Date.now();
  const registration={b1_sha256:b1_ref.sha256,a1_sha256:"2".repeat(64),jwks_sha256:"3".repeat(64),p8_spki_sha256:"4".repeat(64),
    workspace_id:target.workspace_id,owner_user_id:target.protected_owner_user_id,issuer:"test_issuer",subject:target.protected_owner_user_id,
    current_workload_ref:"test_workload",source_workload_id:"test_source",ts_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",
    environment:"paper",visibility:"BUSINESS",fields:["business_report"],operations:["HISTORY","READ"],scopes,
    application_revision:"test_revision",authority_revision:7,mapping_sha256:"5".repeat(64),signer_kid:"test_signer",
    effective_from_ms:now-1000,expires_at_ms:now+60000,...edit};
  const payload=Buffer.from(JSON.stringify(registration));
  const proof=Buffer.from(JSON.stringify({payload:payload.toString("base64url"),signature:sign(null,payload,keys.privateKey).toString("base64url")}));
  const manifest={schema_version:"portal.c2-p7-review-runtime.v1",target:"RESEARCH_PAPER_PREPARATION_ONLY",schema_target:target,
    cycle_sha256:"a".repeat(64),registration_key:"test_key",b1_ref,
    registration_ref:write("registration",payload),source_proof_ref:write("proof",proof),
    attestor_public_key_ref:write("public.pem",Buffer.from(keys.publicKey.export({type:"spki",format:"pem"}))),
    attestor_spki_sha256:hash(keys.publicKey.export({type:"spki",format:"der"}))};
  return {write,manifest,reference:write("manifest",Buffer.from(JSON.stringify(manifest)))};
}
const pool={options:{connectionTimeoutMillis:2000,query_timeout:6000}} as unknown as Pool;

describe("private C2 Research review bootstrap",()=>{
  it("keeps standalone startup closed until P7 schema and ACL are independently qualified",()=>{
    expect(()=>assertC2P7ReviewSchemaCommissioned()).toThrow("C2_P7_REVIEW_SCHEMA_NOT_COMMISSIONED");
  });
  it("is absent by default and rejects partial or malformed references",()=>{
    expect(c2P7ReviewRuntimeReference({})).toBeUndefined();
    expect(()=>c2P7ReviewRuntimeReference({CONTROL_API_C2_P7_REVIEW_CONFIG_FILE:"/tmp/test"})).toThrow();
    expect(()=>c2P7ReviewRuntimeReference({CONTROL_API_C2_P7_REVIEW_CONFIG_FILE:"relative",CONTROL_API_C2_P7_REVIEW_CONFIG_SHA256:"a".repeat(64)})).toThrow();
  });
  it("builds one exact-owner Research preparation graph, never issuer authority",async()=>{
    const f=fixture(),runtime=await prepareC2P7ReviewRuntime(f.reference);
    runtime.schemaTarget.principal_workspace_pins[0]!.workspace_id="changed-public-copy";
    const graph=runtime.build(pool,target);
    expect(graph.c2P7ReviewCandidate.usesInstallation(pool,target.workspace_id)).toBe(true);
    expect(graph.c2P7EmergencyCandidate.usesInstallation(pool,target.workspace_id)).toBe(true);
    expect(graph).not.toHaveProperty("issuer");
    expect(()=>runtime.build(pool,target)).toThrow("C2_P7_REVIEW_RUNTIME_INVALID");
    runtime.dispose();
  });
  it("refuses another target, source owner, expired source and tampered private bytes",async()=>{
    const f=fixture(),runtime=await prepareC2P7ReviewRuntime(f.reference);
    expect(()=>runtime.build(pool,{...target,workspace_id:"other"})).toThrow();runtime.dispose();
    for(const change of [{owner_user_id:"other",subject:"other"},{expires_at_ms:1,effective_from_ms:0},
      {operations:["READ","STREAM"]}]) await expect(prepareC2P7ReviewRuntime(fixture(change).reference)).rejects.toThrow("C2_P7_REVIEW_RUNTIME_INVALID");
    writeFileSync(f.manifest.source_proof_ref.path,"tampered",{mode:0o600});
    await expect(prepareC2P7ReviewRuntime(f.reference)).rejects.toThrow("C2_P7_REVIEW_RUNTIME_INVALID");
  });
});
