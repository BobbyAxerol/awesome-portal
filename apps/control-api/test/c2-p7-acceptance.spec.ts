import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

const held = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock("../src/execution-v2/current-human-snapshot", () => ({ lockCurrentHumanSnapshot: held.snapshot }));
import { C2P7RecordCandidate, inspectC2P7Prerequisites } from "../src/execution-v2/c2-p7-acceptance";

const proposal = () => ({ schema:"ts.c2.pm-current-access-publication-input.v1",expected_version:0,
  head:{db_login:"ts_pm_operator",db_role:"pm_scoped_writer",environment:"paper",
    user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",version:1},
  acceptance:{document:{field_revision:"pma-field-policy-20261016-r1",fields:["business_report"],
    membership_policy_revision:1,operations:["HISTORY","READ"],physical_refs:[],
    scopes:[{environment:"paper",portfolio_id:"root"},{environment:"paper",portfolio_id:"portfolio"}],visibility:"BUSINESS"},revoked:false},
  portal_fills:["head.acceptance_id","head.workspace_id","head.workload_ref","acceptance.effective_from",
    "acceptance.expires_at","document.human_authority_revision","document.application_revision","document.acceptance_ref","document.delegation_ref"],
  rules:{canonical:"json.dumps(sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)",
    copy_verbatim:["expected_version","head.user_id","head.environment","head.db_login","head.db_role","head.version",
      "acceptance.revoked","acceptance.document.membership_policy_revision","acceptance.document.field_revision",
      "acceptance.document.visibility","acceptance.document.fields","acceptance.document.operations",
      "acceptance.document.physical_refs","acceptance.document.scopes"],
    effective_from:"signing time, UTC Z, whole seconds",window_max_days:90}});
const bytes = () => Buffer.from(JSON.stringify(proposal()));
const hash = (b:Buffer) => createHash("sha256").update(b).digest("hex");
const actor = {user_id:"owner",session_id:"session",session_generation:1};
const db = {} as Parameters<typeof inspectC2P7Prerequisites>[0];
const snapshot = () => ({anchor:"owner",policy:{protected_owner_user_id:"owner",revision:"rev-1"},authority_fingerprint:"fp"});

describe("P7 source-only diagnostic, not acceptance", () => {
  it("binds a held owner snapshot to pinned B1 but never issues authorization", async () => {
    held.snapshot.mockResolvedValueOnce(snapshot()); const b = bytes();
    const result = await inspectC2P7Prerequisites(db,actor,"workspace",b,hash(b));
    expect(held.snapshot).toHaveBeenLastCalledWith(db,actor,"workspace");
    expect(result).toMatchObject({state:"NOT_AUTHORIZED",scope_count:2,operations:["HISTORY","READ"],policy_revision:"rev-1"});
    expect(result.missing).toContain("HISTORY_ACTION_MAPPING_NOT_QUALIFIED");
    expect(result.missing).toContain("OWNER_APPROVED_IMMUTABLE_ACCEPTANCE_RECORD_REQUIRED");
    expect(result.missing).toContain("EXACT_WORKLOAD_DELEGATION_AND_PORTAL_SCOPE_PROOF_REQUIRED");
    expect(Object.isFrozen(result)).toBe(true);
  });
  it("rejects a non-owner, missing policy and a mismatched owner policy", async () => {
    const b = bytes();
    for (const changed of [{...snapshot(),anchor:"other"},{...snapshot(),policy:null},
      {...snapshot(),policy:{protected_owner_user_id:"other",revision:"rev-1"}}]) {
      held.snapshot.mockResolvedValueOnce(changed);
      await expect(inspectC2P7Prerequisites(db,actor,"workspace",b,hash(b))).rejects.toMatchObject({code:"ACCESS_DENIED"});
    }
  });
  it("propagates session/revoke/fence failures and rejects tampered input before DB access", async () => {
    const b = bytes(); held.snapshot.mockRejectedValueOnce(new Error("CURRENT_ACTOR_AUTHORITY_REQUIRED"));
    await expect(inspectC2P7Prerequisites(db,actor,"workspace",b,hash(b))).rejects.toThrow("CURRENT_ACTOR_AUTHORITY_REQUIRED");
    const count = held.snapshot.mock.calls.length;
    await expect(inspectC2P7Prerequisites(db,actor,"workspace",b,"a".repeat(64))).rejects.toThrow("C2_B1_INVALID");
    expect(held.snapshot.mock.calls.length).toBe(count);
  });
  it("captures the authenticated actor before awaiting the held snapshot", async () => {
    const mutableActor = {...actor}; const b = bytes();
    held.snapshot.mockImplementationOnce(async () => { mutableActor.user_id = "other"; return snapshot(); });
    const result = await inspectC2P7Prerequisites(db,mutableActor,"workspace",b,hash(b));
    expect(result.state).toBe("NOT_AUTHORIZED");
    expect(held.snapshot.mock.lastCall?.[1]).toMatchObject({user_id:"owner"});
  });
});

describe("P7 record candidate refuses without explicit trusted source", () => {
  const connect=vi.fn();
  const pool={options:{connectionTimeoutMillis:1000,query_timeout:1000},connect} as unknown as ConstructorParameters<typeof C2P7RecordCandidate>[0];
  const scopedBytes=() => {const p=proposal();p.acceptance.document.scopes[0]!.portfolio_id="paper-portfolio-g1";
    p.acceptance.document.scopes[1]!.portfolio_id="paper-root-g1";return Buffer.from(JSON.stringify(p));};
  it("rejects before connecting when source verifier is missing",async () => {
    const b=scopedBytes();connect.mockClear();
    await expect(new C2P7RecordCandidate(pool).record(actor,"workspace","a".repeat(64),b,hash(b),Buffer.from("proof")))
      .rejects.toThrow("C2_P7_SOURCE_VERIFIER_NOT_INSTALLED");
    expect(connect).not.toHaveBeenCalled();
  });
  it("refuses a verifier with no registered locked source",async()=>{
    const b=scopedBytes();connect.mockClear();
    await expect(new C2P7RecordCandidate(pool,{verify:()=>({})}).record(actor,"workspace","a".repeat(64),b,hash(b),Buffer.from("proof")))
      .rejects.toThrow("C2_P7_REGISTRATION_NOT_INSTALLED");
    expect(connect).not.toHaveBeenCalled();
  });
  it("pins the original pool, verifier and private write path against property replacement",async()=>{
    const b=scopedBytes(),originalVerify=vi.fn(()=>({})),replacement=vi.fn(()=>({}));
    const source={verify:originalVerify},otherPool={options:pool.options,connect:vi.fn()};
    const record=new C2P7RecordCandidate(pool,source,"TEST_ONLY-registry");
    expect(record.matchesComposition(pool,source,"TEST_ONLY-registry")).toBe(true);
    Reflect.set(record,"pool",otherPool);Reflect.set(record,"source",{verify:replacement});
    Reflect.set(record,"registrationKey","other");Reflect.set(record,"registration",{revalidate:replacement});
    Reflect.set(record,"write",replacement);
    expect(record.matchesComposition(pool,source,"TEST_ONLY-registry")).toBe(true);
    expect(record.matchesComposition(otherPool as unknown as typeof pool,source,"TEST_ONLY-registry")).toBe(false);
    await expect(record.record(actor,"workspace","a".repeat(64),b,hash(b),Buffer.from("proof")))
      .rejects.toThrow("C2_P7_SOURCE_PROOF_INVALID");
    expect(originalVerify).toHaveBeenCalledOnce();expect(replacement).not.toHaveBeenCalled();
    source.verify=replacement;
    expect(record.matchesComposition(pool,source,"TEST_ONLY-registry")).toBe(false);
    await expect(record.record(actor,"workspace","a".repeat(64),b,hash(b),Buffer.from("proof")))
      .rejects.toThrow("C2_P7_SOURCE_VERIFIER_NOT_INSTALLED");
    expect(replacement).not.toHaveBeenCalled();
    expect(otherPool.connect).not.toHaveBeenCalled();
  });
  it("rejects missing or asynchronous verifier proof, and refuses scope widening before touching DB",async () => {
    const b=scopedBytes();connect.mockClear();
    for (const verify of [()=>({}),()=>Promise.resolve({})])
      await expect(new C2P7RecordCandidate(pool,{verify},"TEST_ONLY-registry").record(actor,"workspace","a".repeat(64),b,hash(b),Buffer.from("proof")))
        .rejects.toThrow("C2_P7_SOURCE_PROOF_INVALID");
    const widened=proposal();widened.acceptance.document.operations.push("STREAM");const input=Buffer.from(JSON.stringify(widened));
    await expect(new C2P7RecordCandidate(pool,{verify:()=>({})},"TEST_ONLY-registry").record(actor,"workspace","a".repeat(64),input,hash(input),Buffer.from("proof")))
      .rejects.toThrow("C2_P7_SCOPE_NOT_APPROVED");
    expect(connect).not.toHaveBeenCalled();
  });
  it("zeroes its private proof copy when verification rejects or throws without changing the caller's bytes",async()=>{
    const b=scopedBytes();
    for(const shouldThrow of [false,true]) {
      const original=Buffer.from("TEST_ONLY-proof");let seen:Uint8Array|undefined;
      const verifier={verify:(proof:Uint8Array)=>{seen=proof;if(shouldThrow)throw new Error("TEST_ONLY verifier failure");return {};}};
      await expect(new C2P7RecordCandidate(pool,verifier,"TEST_ONLY-registry").record(actor,"workspace","a".repeat(64),b,hash(b),original)).rejects.toThrow();
      expect(seen).toBeDefined();expect(Buffer.from(seen!).every(byte=>byte===0)).toBe(true);
      expect(original.toString()).toBe("TEST_ONLY-proof");
    }
  });
  it("rejects unbounded database pools",() => {
    expect(()=>new C2P7RecordCandidate({options:{}} as unknown as typeof pool)).toThrow("C2_P7_POOL_TIMEOUTS_REQUIRED");
  });
  it("refuses a source subject that is not the authenticated Portal owner",async()=>{
    const b=scopedBytes(),proof=Buffer.from("proof");connect.mockClear();
    const verify=()=>({b1_sha256:hash(b),workspace_id:"workspace",owner_user_id:"owner",issuer:"issuer",subject:"other",
      current_workload_ref:"workload",source_workload_id:"source",ts_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",
      environment:"paper",visibility:"BUSINESS",fields:["business_report"],operations:["HISTORY","READ"],
      scopes:[{environment:"paper",portfolio_id:"paper-portfolio-g1"},{environment:"paper",portfolio_id:"paper-root-g1"}],
      application_revision:"app",authority_revision:1,mapping_sha256:"a".repeat(64),source_evidence_sha256:hash(proof),
      signer_kid:"kid",effective_from_ms:1,expires_at_ms:2});
    await expect(new C2P7RecordCandidate(pool,{verify},"TEST_ONLY-registry").record(actor,"workspace","a".repeat(64),b,hash(b),proof))
      .rejects.toThrow("C2_P7_SOURCE_BINDING_MISMATCH");
    expect(connect).not.toHaveBeenCalled();
  });
});
