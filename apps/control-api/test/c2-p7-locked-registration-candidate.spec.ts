import {createHash} from "node:crypto";
import {describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({snapshot:vi.fn(),step:vi.fn()}));
vi.mock("../src/execution-v2/current-human-snapshot",()=>({lockCurrentHumanSnapshot:mocks.snapshot}));
vi.mock("../src/repos/account-lifecycle",()=>({ACCESS_STEP_UP_PROOFS:["ACCESS_ADMIN"],
  AccountLifecycleRepository:class {lockActiveStepUpExpiry=mocks.step;}}));
import {createC2P7LockedRegistrationCandidate} from "../src/execution-v2/c2-p7-locked-registration-candidate";
import type {PoolClient} from "pg";
const person={user_id:"owner",session_id:"session",session_generation:1};
const payload=Buffer.from('{"candidate":"registry"}');
const proof=Buffer.from(JSON.stringify({payload:payload.toString("base64url"),signature:"ignored-by-fake"}));
const digest=(b:Buffer)=>createHash("sha256").update(b).digest("hex");
const verified=()=>({workspace_id:"workspace",owner_user_id:"owner",subject:"owner",application_revision:"app",
  authority_revision:7,effective_from_ms:1000,expires_at_ms:3000,source_evidence_sha256:digest(proof)});
const registry=()=>({registration_sha256:digest(payload),workspace_id:"workspace",owner_user_id:"owner",
  application_revision:"app",authority_revision:"7",state:"ACTIVE",expires_at_ms:"3000"});
const snapshot=()=>({anchor:"owner",lease_until_ms:4000,policy:{state:"REVIEWED",qualification:"OWNER_VERIFIED",
  protected_owner_user_id:"owner"}});
function db(row:unknown=registry(),revision="7",now=2000) {
  return {query:vi.fn(async (sql:string)=>sql.includes("elp210_candidate.authority")?
    {rowCount:1,rows:[{revision,drain_id:null}]}:sql.includes("candidate.lock_registration_for_read")?
      {rowCount:row?1:0,rows:row?[row]:[]}:{rowCount:1,rows:[{ms:now}]})} as unknown as PoolClient;
}
function setup() {mocks.snapshot.mockReset().mockResolvedValue(snapshot());mocks.step.mockReset().mockResolvedValue(new Date(4000));}

describe("P7 locked registration candidate, unmounted",()=>{
  it("retains the configured verifier if the source object is later changed",async()=>{
    setup();const original=vi.fn(()=>({...verified(),subject:"other"})),replacement=vi.fn(()=>verified());
    const source={verify:original},candidate=createC2P7LockedRegistrationCandidate(source,"trusted-key");
    source.verify=replacement;
    await expect(candidate.revalidate(db(),person,"workspace",proof)).rejects.toThrow("C2_P7_REGISTRATION_NOT_CURRENT");
    expect(original).toHaveBeenCalledOnce();expect(replacement).not.toHaveBeenCalled();
  });
  it("locks current actor then holds the exact registry row before returning non-authorization",async()=>{
    setup();const client=db(),source={verify:()=>verified()};
    const result=await createC2P7LockedRegistrationCandidate(source,"trusted-key").revalidate(client,person,"workspace",proof);
    expect(result).toMatchObject({state:"CHECKED_NOT_AUTHORIZED",registration_sha256:digest(payload),authority_revision:7});
    expect(result.valid_until_ms).toBe(3000);
    expect(mocks.snapshot).toHaveBeenCalledWith(client,person,"workspace");
    expect(vi.mocked(client.query).mock.calls.some(call=>String(call[0]).includes("lock_registration_for_read"))).toBe(true);
  });
  it("refuses revoked, missing, replaced and stale registrations or mismatched authority",async()=>{
    const source={verify:()=>verified()};
    for(const row of [null,{...registry(),state:"REVOKED"},{...registry(),registration_sha256:"a".repeat(64)},
      {...registry(),workspace_id:"other"},{...registry(),application_revision:"old"},{...registry(),authority_revision:"6"},
      {...registry(),expires_at_ms:"3001"}]) {
      setup();await expect(createC2P7LockedRegistrationCandidate(source,"trusted-key").revalidate(db(row),person,"workspace",proof)).rejects.toThrow();
    }
    setup();await expect(createC2P7LockedRegistrationCandidate(source,"trusted-key").revalidate(db(registry(),"8"),person,"workspace",proof)).rejects.toThrow();
  });
  it("caps the held preparation to the earliest session or step-up expiry",async()=>{
    setup();mocks.step.mockResolvedValue(new Date(2500));
    const result=await createC2P7LockedRegistrationCandidate({verify:()=>verified()},"trusted-key")
      .revalidate(db(),person,"workspace",proof);
    expect(result.valid_until_ms).toBe(2500);
  });
  it("refuses missing step-up, owner mismatch, expiration and source mismatch",async()=>{
    const source={verify:()=>verified()};
    setup();mocks.step.mockResolvedValue(null);
    await expect(createC2P7LockedRegistrationCandidate(source,"k").revalidate(db(),person,"workspace",proof)).rejects.toThrow();
    setup();mocks.snapshot.mockResolvedValue({...snapshot(),anchor:"other"});
    await expect(createC2P7LockedRegistrationCandidate(source,"k").revalidate(db(),person,"workspace",proof)).rejects.toThrow();
    setup();await expect(createC2P7LockedRegistrationCandidate(source,"k").revalidate(db(registry(),"7",3000),person,"workspace",proof)).rejects.toThrow();
    setup();await expect(createC2P7LockedRegistrationCandidate({verify:()=>({...verified(),subject:"other"})},"k")
      .revalidate(db(),person,"workspace",proof)).rejects.toThrow();
  });
});
