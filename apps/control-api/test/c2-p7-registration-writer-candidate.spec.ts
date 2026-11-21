import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({snapshot:vi.fn(),step:vi.fn()}));
vi.mock("../src/execution-v2/current-human-snapshot",()=>({lockCurrentHumanSnapshot:mocks.snapshot}));
vi.mock("../src/repos/account-lifecycle",()=>({ACCESS_STEP_UP_PROOFS:["ACCESS_ADMIN"],
  AccountLifecycleRepository:class {lockActiveStepUpExpiry=mocks.step;}}));
import {C2P7RegistrationWriterCandidate} from "../src/execution-v2/c2-p7-registration-writer-candidate";
import type {Pool} from "pg";
const actor={user_id:"owner",session_id:"session",session_generation:1};
const payload=Buffer.from("TEST_ONLY"),proof=Buffer.from(JSON.stringify({payload:payload.toString("base64url"),signature:"TEST_ONLY"}));
const intentProof=Buffer.from("TEST_ONLY intent");
const hash=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
const source={verify:()=>({workspace_id:"workspace",owner_user_id:"owner",subject:"owner",application_revision:"app",
  authority_revision:7,effective_from_ms:1,expires_at_ms:3000,source_evidence_sha256:hash(proof)})};
const validIntent=()=>({action:"REGISTER",workspace_id:"workspace",owner_user_id:"owner",session_id:"session",
  registration_key:"key",registration_sha256:hash(payload),source_evidence_sha256:hash(proof),
  authority_revision:7,expires_at_ms:3000,intent_evidence_sha256:hash(intentProof)});
function mockPool() {
  const query=vi.fn(async(sql:string)=>sql.includes("elp210_candidate.authority")?{rowCount:1,rows:[{revision:"7",drain_id:null}]}:
    sql.includes("clock_timestamp")?{rowCount:1,rows:[{ms:2000}]}:{rowCount:0,rows:[]});
  const release=vi.fn(),connect=vi.fn().mockResolvedValue({query,release});
  const pool={options:{connectionTimeoutMillis:1000,query_timeout:1000},connect} as unknown as Pool;
  return {pool,query,release,connect};
}
describe("C2 P7 registration writer source-only",()=>{
  it("fails before DB use when a qualified intent verifier is absent",async()=>{
    const m=mockPool();await expect(new C2P7RegistrationWriterCandidate(m.pool,source,undefined,"key")
      .change("REGISTER",actor,"workspace",proof,intentProof)).rejects.toThrow();
    expect(m.connect).not.toHaveBeenCalled();
  });
  it("rolls back and writes nothing for mismatched owner intent",async()=>{
    mocks.snapshot.mockResolvedValue({anchor:"owner",lease_until_ms:4000,policy:{state:"REVIEWED",
      qualification:"OWNER_VERIFIED",protected_owner_user_id:"owner"}});mocks.step.mockResolvedValue(new Date(4000));
    for(const change of [{owner_user_id:"other"},{session_id:"other"},{action:"REVOKE"},
      {registration_sha256:"a".repeat(64)},{source_evidence_sha256:"a".repeat(64)},
      {intent_evidence_sha256:"a".repeat(64)},{authority_revision:8}]) {
      const m=mockPool(),intent={verifyLocked:async()=>({...validIntent(),...change})};
      await expect(new C2P7RegistrationWriterCandidate(m.pool,source,intent,"key")
        .change("REGISTER",actor,"workspace",proof,intentProof)).rejects.toThrow();
      expect(m.query.mock.calls.some(call=>call[0]==="ROLLBACK")).toBe(true);
      expect(m.query.mock.calls.some(call=>call[0].includes("INSERT INTO"))).toBe(false);
      expect(m.release).toHaveBeenCalled();
    }
  });
  it("refuses the legacy direct-UPDATE shortcut before obtaining a DB connection",async()=>{
    const m=mockPool(),writer=new C2P7RegistrationWriterCandidate(m.pool,source,undefined,"key");
    await expect(writer.emergencyRevoke(actor,"workspace")).rejects.toThrow("C2_P7_USE_EMERGENCY_REDUCTION");
    await expect(writer.change("REVOKE",actor,"workspace",proof,intentProof)).rejects.toThrow("C2_P7_USE_EMERGENCY_REDUCTION");
    await expect(writer.changeInTransaction({query:m.query} as never,"REVOKE",actor,"workspace",proof,intentProof))
      .rejects.toThrow("C2_P7_USE_EMERGENCY_REDUCTION");
    expect(m.connect).not.toHaveBeenCalled();
    expect(m.query).not.toHaveBeenCalled();
  });
  it("pins the pool and the two verifier methods; replacement fails before acquiring a connection",async()=>{
    const m=mockPool(),other=mockPool(),original={verify:source.verify},intent={verifyLocked:async()=>validIntent()};
    const writer=new C2P7RegistrationWriterCandidate(m.pool,original,intent,"key");
    Object.assign(writer,{pool:other.pool,source:{verify:()=>({})},intent:{verifyLocked:async()=>({})},registrationKey:"other"});
    expect(writer.matchesComposition(m.pool,original,intent)).toBe(true);
    expect(writer.matchesComposition(other.pool,original,intent)).toBe(false);
    expect(writer.compositionRegistrationKey()).toBe("key");
    const verifier=original.verify;original.verify=()=>({...verifier(),owner_user_id:"other"});
    expect(writer.matchesComposition(m.pool,original,intent)).toBe(false);
    await expect(writer.change("REGISTER",actor,"workspace",proof,intentProof)).rejects.toThrow("C2_P7_REGISTRY_WRITE_DENIED");
    expect(m.connect).not.toHaveBeenCalled();expect(other.connect).not.toHaveBeenCalled();
    original.verify=verifier;
    intent.verifyLocked=async()=>({...validIntent(),owner_user_id:"other"});
    await expect(writer.change("REGISTER",actor,"workspace",proof,intentProof)).rejects.toThrow("C2_P7_REGISTRY_WRITE_DENIED");
    expect(m.connect).not.toHaveBeenCalled();
  });
});
