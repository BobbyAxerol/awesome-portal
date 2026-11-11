import {createHash} from "node:crypto";
import {beforeEach,describe,expect,it,vi} from "vitest";
import type {Pool,PoolClient} from "pg";
const mocks=vi.hoisted(()=>({snapshot:vi.fn(),step:vi.fn(),inspect:vi.fn()}));
vi.mock("../src/execution-v2/current-human-snapshot",()=>({lockCurrentHumanSnapshot:mocks.snapshot}));
vi.mock("../src/repos/account-lifecycle",()=>({ACCESS_STEP_UP_PROOFS:["ACCESS_ADMIN"],
  AccountLifecycleRepository:class {lockActiveStepUpExpiry=mocks.step;}}));
vi.mock("../src/execution-v2/c2-b1-preflight",()=>({inspectPinnedC2B1NotAuthorized:mocks.inspect}));
import {C2P7OwnerIntentCandidate} from "../src/execution-v2/c2-p7-owner-intent-candidate";
const sha=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
const actor={user_id:"owner",session_id:"session",session_generation:1};
const pin="a".repeat(64),payload=Buffer.from("synthetic-signed-payload"),sourceProof=Buffer.from(JSON.stringify({payload:payload.toString("base64url")}));
const scope=[{environment:"paper",portfolio_id:"paper-portfolio-g1"},{environment:"paper",portfolio_id:"paper-root-g1"}];
const doc={operations:["HISTORY","READ"],fields:["business_report"],scopes:scope,visibility:"BUSINESS"};
const source=()=>({b1_sha256:pin,workspace_id:"w",owner_user_id:"owner",issuer:"issuer",subject:"owner",
  current_workload_ref:"workload",source_workload_id:"workload",ts_user_id:"source-user",environment:"paper",
  ...doc,application_revision:"app",authority_revision:7,mapping_sha256:"b".repeat(64),source_evidence_sha256:sha(sourceProof),
  signer_kid:"kid",effective_from_ms:1000,expires_at_ms:5000});
function dbFixture() {
  let row:Record<string,unknown>|undefined;let revoked=false;
  const query=vi.fn(async(sql:string,params?:unknown[])=>{
    if(sql==="SHOW transaction_isolation")return {rowCount:1,rows:[{transaction_isolation:"read committed"}]};
    if(sql==="SHOW transaction_read_only")return {rowCount:1,rows:[{transaction_read_only:"off"}]};
    if(sql.includes("SELECT revision::text"))return {rowCount:1,rows:[{revision:"7",drain_id:null}]};
    if(sql.includes("INSERT INTO elp210_c2_p7_candidate.owner_intents")){
      if(row)return {rowCount:0,rows:[]};
      const p=params!;row={intent_id:p[0],proof_sha256:p[1],action:p[3],workspace_id:p[4],owner_user_id:p[5],session_id:p[6],
        registration_key:p[8],registration_sha256:p[9],source_evidence_sha256:p[10],authority_revision:p[13],expires_at_ms:p[14]};
      return {rowCount:1,rows:[]};
    }
    if(sql.includes("lock_owner_intent_by_proof"))return row&&params?.[0]===row.proof_sha256?{rowCount:1,rows:[row]}:{rowCount:0,rows:[]};
    if(sql.includes("SELECT owner_user_id,workspace_id"))return row&&params?.[0]===row.intent_id?{rowCount:1,rows:[row]}:{rowCount:0,rows:[]};
    if(sql.includes("INSERT INTO elp210_c2_p7_candidate.owner_intent_revocations")){revoked=true;return {rowCount:1,rows:[]};}
    if(sql.includes("SELECT 1 FROM elp210_c2_p7_candidate.owner_intent_revocations"))return {rowCount:revoked?1:0,rows:revoked?[{}]:[]};
    if(sql.includes("txid_current()")&&sql.includes("clock_timestamp"))return {rowCount:1,rows:[{xid:"5",ms:2000}]};
    if(sql.includes("txid_current()"))return {rowCount:1,rows:[{xid:"5"}]};
    if(sql.includes("clock_timestamp"))return {rowCount:1,rows:[{ms:2000}]};
    return {rowCount:0,rows:[]};
  });
  const client={query,release:vi.fn()},pool={options:{connectionTimeoutMillis:1000,query_timeout:1000},connect:async()=>client} as unknown as Pool;
  return {pool,client,query};
}
beforeEach(()=>{
  mocks.snapshot.mockResolvedValue({anchor:"owner",lease_until_ms:4000,policy:{state:"REVIEWED",qualification:"OWNER_VERIFIED",protected_owner_user_id:"owner"}});
  mocks.step.mockResolvedValue(new Date(3500));mocks.inspect.mockReturnValue({head:{user_id:"source-user"},acceptance:{document:doc}});
});
describe("P7 owner intent candidate (synthetic only)",()=>{
  it("binds an exact approved decision and refuses replay and use after revocation",async()=>{
    const d=dbFixture(),candidate=new C2P7OwnerIntentCandidate(d.pool,{verify:source},"key");
    const created=await candidate.approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"once");
    expect(created.state).toBe("RECORDED_NOT_AUTHORIZED");expect(created.expires_at_ms).toBe(3500);
    expect(await candidate.verifyLocked(d.client as unknown as PoolClient,created.proof)).toMatchObject({action:"REGISTER",owner_user_id:"owner",
      session_id:"session",registration_sha256:sha(payload),source_evidence_sha256:sha(sourceProof),intent_evidence_sha256:sha(created.proof)});
    await expect(candidate.approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"once")).rejects.toThrow("REPLAY_NO_SECRET");
    await candidate.revoke(actor,"w",created.intent_id);
    await expect(candidate.verifyLocked(d.client as unknown as PoolClient,created.proof)).rejects.toThrow("DENIED");
    const lockIndex=d.query.mock.calls.findIndex(c=>c[0].includes("WHERE proof_sha256=$1 FOR UPDATE"));
    const revokeRead=d.query.mock.calls.findIndex(c=>c[0].includes("SELECT 1 FROM elp210_c2_p7_candidate.owner_intent_revocations"));
    expect(revokeRead).toBeGreaterThan(lockIndex);
  });
  it("fails closed for missing authority, wrong owner, altered scope and missing step-up",async()=>{
    const d=dbFixture();
    await expect(new C2P7OwnerIntentCandidate(d.pool,undefined,"key").approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"one")).rejects.toThrow();
    for(const change of [{owner_user_id:"other"},{subject:"other"},{operations:["READ","READ"]},{b1_sha256:"f".repeat(64)}]){
      const candidate=new C2P7OwnerIntentCandidate(d.pool,{verify:()=>({...source(),...change})},"key");
      await expect(candidate.approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"one")).rejects.toThrow();
    }
    mocks.step.mockResolvedValueOnce(null);
    await expect(new C2P7OwnerIntentCandidate(d.pool,{verify:source},"key").approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"one")).rejects.toThrow();
    expect(d.query.mock.calls.some(c=>c[0].includes("INSERT INTO elp210_c2_p7_candidate.owner_intents"))).toBe(false);
  });
  it("rejects invalid proof and detects a lost transaction before releasing verification",async()=>{
    const d=dbFixture(),candidate=new C2P7OwnerIntentCandidate(d.pool,{verify:source},"key");
    await expect(candidate.verifyLocked(d.client as unknown as PoolClient,Buffer.alloc(31))).rejects.toThrow();
    const created=await candidate.approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"one");
    const query=vi.fn(async(sql:string,params?:unknown[])=>sql.includes("txid_current()")&&sql.includes("clock_timestamp")?
      {rowCount:1,rows:[{xid:"6",ms:2000}]}:d.query(sql,params));
    await expect(candidate.verifyLocked({query} as unknown as PoolClient,created.proof)).rejects.toThrow();
  });
  it("copies the opaque proof before the first await",async()=>{
    const d=dbFixture(),candidate=new C2P7OwnerIntentCandidate(d.pool,{verify:source},"key");
    const created=await candidate.approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"one");
    const expected=sha(created.proof);let changed=false;
    const query=vi.fn(async(sql:string,params?:unknown[])=>{
      if(!changed){created.proof.fill(0);changed=true;}
      return d.query(sql,params);
    });
    const verified=await candidate.verifyLocked({query} as unknown as PoolClient,created.proof);
    expect(verified).toMatchObject({intent_evidence_sha256:expected});
  });
  it("pins its pool, registration and verifier against runtime property replacement",async()=>{
    const d=dbFixture(),original={verify:source},candidate=new C2P7OwnerIntentCandidate(d.pool,original,"key");
    const impostor=dbFixture();
    Object.assign(candidate,{pool:impostor.pool,source:{verify:()=>({...source(),owner_user_id:"other"})},registrationKey:"other",
      approveInternal:()=>{throw new Error("shadow method called");},transaction:()=>{throw new Error("shadow transaction called");}});
    expect(candidate.matchesComposition(d.pool,original,"key")).toBe(true);
    expect(candidate.matchesComposition(impostor.pool,original,"key")).toBe(false);
    const made=await candidate.approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"shadow");
    expect(made.state).toBe("RECORDED_NOT_AUTHORIZED");
    expect(impostor.query).not.toHaveBeenCalled();
    original.verify=()=>({...source(),owner_user_id:"other"});
    expect(candidate.matchesComposition(d.pool,original,"key")).toBe(false);
    await expect(candidate.approve(actor,"w","REGISTER",Buffer.from("b1"),pin,sourceProof,"changed-verifier"))
      .rejects.toThrow("C2_P7_OWNER_INTENT_DENIED");
  });
});
