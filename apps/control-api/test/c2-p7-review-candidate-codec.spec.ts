import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {readFileSync} from "node:fs";
import {describe,expect,it,vi} from "vitest";
import type {Pool} from "pg";
import {createC2P7RegisteredSourceCandidate} from "../src/execution-v2/c2-p7-registered-source-candidate";
import {C2P7ReviewCandidateService} from "../src/execution-v2/c2-p7-review-candidate.service";
/** Real B1 public bytes + real strict codec + ephemeral synthetic signing key.
 * Owner/session snapshot is mocked; this is not P7 acceptance or runtime. */
vi.mock("../src/execution-v2/current-human-snapshot",()=>({lockCurrentHumanSnapshot:vi.fn(async()=>({anchor:"TEST_ONLY-owner",
  policy:{protected_owner_user_id:"TEST_ONLY-owner",revision:"TEST_ONLY"},authority_fingerprint:"TEST_ONLY"}))}));
const file=process.env.C2_B1_PREFLIGHT_TEST_FILE,pin=process.env.C2_B1_PREFLIGHT_TEST_SHA256;
const enabled=!!file&&!!pin;
describe.skipIf(!enabled)("P7 review with real public B1/strict Ed25519 codec",()=>{
  const actor={user_id:"TEST_ONLY-owner",session_id:"TEST_ONLY-session",session_generation:1};
  function setup(override:{tampered?:boolean;wrongPin?:boolean}={}) {
    const b1=readFileSync(file!),now=Date.now();
    const registration={b1_sha256:pin!,a1_sha256:"2".repeat(64),jwks_sha256:"3".repeat(64),p8_spki_sha256:"4".repeat(64),
      workspace_id:"TEST_ONLY-workspace",owner_user_id:actor.user_id,issuer:"TEST_ONLY-issuer",subject:actor.user_id,
      current_workload_ref:"TEST_ONLY-workload",source_workload_id:"TEST_ONLY-source",ts_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",
      environment:"paper",visibility:"BUSINESS",fields:["business_report"],operations:["HISTORY","READ"],scopes:[
        {environment:"paper",portfolio_id:"paper-portfolio-g1"},{environment:"paper",portfolio_id:"paper-root-g1"}],
      application_revision:"TEST_ONLY-app",authority_revision:7,mapping_sha256:"a".repeat(64),signer_kid:"TEST_ONLY-kid",
      effective_from_ms:now-1000,expires_at_ms:now+3600000};
    const keys=generateKeyPairSync("ed25519"),other=generateKeyPairSync("ed25519"),payload=Buffer.from(JSON.stringify(registration));
    const signed=Buffer.from(JSON.stringify({payload:payload.toString("base64url"),
      signature:sign(null,payload,override.tampered?other.privateKey:keys.privateKey).toString("base64url")}));
    const pub=keys.publicKey.export({type:"spki",format:"pem"}).toString();
    const keyPin=createHash("sha256").update(keys.publicKey.export({type:"spki",format:"der"})).digest("hex");
    const source=createC2P7RegisteredSourceCandidate(registration,pub,keyPin);
    const db={query:vi.fn().mockResolvedValue({rows:[],rowCount:0}),release:vi.fn()};
    const pool={options:{connectionTimeoutMillis:1000,query_timeout:1000},connect:vi.fn().mockResolvedValue(db)} as unknown as Pool;
    return new C2P7ReviewCandidateService(pool,source,{} as never,{} as never,{} as never,{enabled:true,environment:"RESEARCH",
      workspace_id:"TEST_ONLY-workspace",cycle_sha256:"5".repeat(64),b1_sha256:override.wrongPin?"0".repeat(64):pin!,b1_bytes:b1,source_proof:signed});
  }
  it("accepts only the real pinned B1 and authenticates all public attested pins",async()=>{
    const result=await setup().preview(actor);
    expect(result).toMatchObject({state:"REVIEW_ONLY_NOT_AUTHORIZED",b1_sha256:pin,a1_sha256:"2".repeat(64),
      jwks_sha256:"3".repeat(64),p8_spki_sha256:"4".repeat(64),issuer:"TEST_ONLY-issuer",subject:"TEST_ONLY-owner",
      current_workload_ref:"TEST_ONLY-workload",ts_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",operations:["HISTORY","READ"]});
  });
  it("fails on a signature made with a different key",async()=>{
    await expect(setup({tampered:true}).preview(actor)).rejects.toThrow();
  });
  it("fails on an altered B1 pin before preview",()=>{expect(()=>setup({wrongPin:true})).toThrow();});
});
