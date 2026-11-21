/** SYNTHETIC pure integrity fixture only; actual execution recorded in the phase packet.
 * Real loaders/worker/first capture/parent prepare/decoder, no PG or source grant. */
import { describe,expect,it } from "vitest";
import { accessDigest } from "../src/execution-v2/access-policy";
import { ManagerScoreOriginalCustody,decodeRetainedManagerScoreOriginal }
  from "../src/execution-v2/manager-score-original-custody";
import { managerRegimeCapturedOriginal,managerRegimeRetainedInputs,restoreManagerRegimeOriginal,
  revokeApprovedManagerRegimePolicy,revokeVerifiedManagerRegimeEvidence,
  type ManagerRegimeOriginalCustody } from "../src/execution-v2/manager-regime-runtime";
import { clone } from "./helpers/manager-regime";
import { regimeOriginalFixture,regimeOriginalLimits,regimeV4ExpectedRow }
  from "./helpers/manager-regime-original";

type Row=ReturnType<typeof regimeV4ExpectedRow>;
const decode=(f:Awaited<ReturnType<typeof regimeOriginalFixture>>,row:Row)=>
  decodeRetainedManagerScoreOriginal(f.document,row,regimeOriginalLimits.maximum_bundle_bytes);
function rehash(row:Row):Row {
  const b=row.payload;b.inputs_digest=accessDigest({retained_tasks:b.retained_tasks,
    retained_compositions:b.retained_compositions,retained_regimes:b.retained_regimes});
  b.calculation_key=accessDigest({mode:"ORIGINAL_INPUTS",source:b.source,inputs_digest:b.inputs_digest});
  row.calculation_key=b.calculation_key;row.payload_digest=accessDigest(b);return row;
}

describe("ELP2-06 original Regime parent v4 — SYNTHETIC pure integrity boundaries",()=>{
  it("prepares and decodes genuine Regime-only v4 without any current Score policy",async()=>{
    const f=await regimeOriginalFixture(),before=JSON.stringify(f.document),parent=new ManagerScoreOriginalCustody(regimeOriginalLimits),
      row=regimeV4ExpectedRow(f.document,f.custodies),prepared=parent.prepare(f.document,[],undefined,f.custodies);
    expect(prepared).toEqual({calculation_key:row.calculation_key,payload_digest:row.payload_digest});
    const restored=decode(f,row);expect(restored).toEqual(row.payload);
    expect(restored.retained_tasks).toEqual([]);expect(restored.retained_compositions).toEqual([]);
    expect(restored.schema_version).toBe("portal.execution.manager-score-original-inputs.v4");
    expect(restored.source.payload_digest).toBe(accessDigest(f.document));
    expect(JSON.stringify(f.document)).toBe(before);expect(Object.isFrozen(prepared)).toBe(true);
    expect(decode(f,row)).not.toBe(restored);
  });
  it("normalizes only genuine child-array order, preserving exact child bytes and full135 source pin",async()=>{
    const f=await regimeOriginalFixture(2),parent=new ManagerScoreOriginalCustody(regimeOriginalLimits),
      row=regimeV4ExpectedRow(f.document,f.custodies),before=f.custodies.map(x=>JSON.stringify(x));
    expect(parent.prepare(f.document,[],[],f.custodies)).toEqual(parent.prepare(f.document,[],[],[...f.custodies].reverse()));
    expect(parent.prepare(f.document,[],[],f.custodies)).toEqual({calculation_key:row.calculation_key,payload_digest:row.payload_digest});
    expect(decode(f,row)).toEqual(row.payload);expect(f.custodies.map(x=>JSON.stringify(x))).toEqual(before);
  });
  it("historical decode survives original handle expiry/revoke, but restored/JSON identities cannot prepare a new original",async()=>{
    const f=await regimeOriginalFixture(),h=f.items[0],parent=new ManagerScoreOriginalCustody(regimeOriginalLimits),
      row=regimeV4ExpectedRow(f.document,f.custodies),child=f.custodies[0];
    revokeApprovedManagerRegimePolicy(h.policy);revokeVerifiedManagerRegimeEvidence(h.evidence);
    expect(decode(f,row)).toEqual(row.payload);
    const historical=restoreManagerRegimeOriginal({custody:child,expected_custody_digest:child.custody_digest,
      document:f.document,maximum_bytes:regimeOriginalLimits.maximum_bundle_bytes},()=>20_000);
    if(historical.status!=="READY")throw new Error(JSON.stringify(historical));
    expect(managerRegimeRetainedInputs(historical.handle)!.policy_approval.valid_until_ms).toBe(10_000);
    for(const fake of [clone(child),JSON.parse(JSON.stringify(child)),historical.handle,{},new Proxy(child,{})]){
      expect(managerRegimeCapturedOriginal(fake)).toBeNull();
      expect(()=>parent.prepare(f.document,[],[],[fake as ManagerRegimeOriginalCustody]))
        .toThrow("MANAGER_ORIGINAL_REGIME_CAPTURE_REQUIRED");
    }
  });
  it("requires the complete Regime census and rejects duplicate source and retained bindings",async()=>{
    const f=await regimeOriginalFixture(2),parent=new ManagerScoreOriginalCustody(regimeOriginalLimits);
    expect(()=>parent.prepare(f.document,[],[],f.custodies.slice(0,1))).toThrow("MANAGER_ORIGINAL_INCOMPLETE_REGIME_SET");
    expect(()=>parent.prepare(f.document,[],[],[f.custodies[0],f.custodies[0],f.custodies[1]]))
      .toThrow("MANAGER_ORIGINAL_DUPLICATE_REGIME");
    const duplicated=clone(f.document);duplicated.precomputed_regimes!.push(clone(duplicated.precomputed_regimes![0]));
    expect(()=>parent.prepare(duplicated,[],[],f.custodies)).toThrow("MANAGER_ORIGINAL_DUPLICATE_REGIME");
    const row=regimeV4ExpectedRow(f.document,f.custodies);row.payload.retained_regimes.pop();
    expect(()=>decode(f,rehash(row))).toThrow("MANAGER_ORIGINAL_INCOMPLETE_REGIME_SET");
  });
  it("cannot orphan genuine children by replacing source metadata/publications and echoing a new child or parent hash",async()=>{
    const f=await regimeOriginalFixture(),parent=new ManagerScoreOriginalCustody(regimeOriginalLimits);
    for(const axis of ["revision","projection_generation","source_set_digest","source_sequence"] as const){
      const changed=clone(f.document);changed[axis]=axis==="source_set_digest"?accessDigest("TEST_ONLY:changed"):
        axis==="source_sequence"?"2":"TEST_ONLY:changed";
      expect(()=>parent.prepare(changed,[],[],f.custodies)).toThrow("MANAGER_ORIGINAL_REGIME_CUSTODY_MISMATCH");
      const row=regimeV4ExpectedRow(f.document,f.custodies);
      expect(()=>decodeRetainedManagerScoreOriginal(changed,row,regimeOriginalLimits.maximum_bundle_bytes))
        .toThrow("MANAGER_ORIGINAL_DIGEST_MISMATCH");
    }
    const absent=clone(f.document);absent.precomputed_regimes=[];
    expect(()=>parent.prepare(absent,[],[],f.custodies)).toThrow("MANAGER_ORIGINAL_REGIME_CUSTODY_MISMATCH");
  });
  it("the immutable expected parent digest catches child rewrites before new self-consistent echoes",async()=>{
    const f=await regimeOriginalFixture(),old=regimeV4ExpectedRow(f.document,f.custodies),wrong=clone(old);
    wrong.payload.retained_regimes[0].custody.policy_approval.approval_ref="TEST_ONLY:retrofit";
    const child=wrong.payload.retained_regimes[0].custody,{custody_digest:_old,...base}=child;child.custody_digest=accessDigest(base);
    // Retain the OLD expected row digest first: caller cannot replace its pin.
    expect(()=>decode(f,wrong)).toThrow("MANAGER_ORIGINAL_DIGEST_MISMATCH");
    // A changed echoed parent hash still has the independently retained OLD
    // child pin, so it cannot silently accept this changed archived child.
    expect(()=>decode(f,rehash(wrong))).toThrow("MANAGER_ORIGINAL_REGIME_CUSTODY_MISMATCH");
    expect(decode(f,old)).toEqual(old.payload);
  });
  it("closed v4 refuses unknown outer/child fields, unrecognized versions and changed row keys",async()=>{
    const f=await regimeOriginalFixture(),row=regimeV4ExpectedRow(f.document,f.custodies);
    const outer=clone(row);Object.assign(outer.payload,{unexpected:true});
    outer.payload_digest=accessDigest(outer.payload);expect(()=>decode(f,outer)).toThrow("MANAGER_ORIGINAL_DIGEST_MISMATCH");
    const child=clone(row);Object.assign(child.payload.retained_regimes[0],{unexpected:true});
    expect(()=>decode(f,rehash(child))).toThrow("MANAGER_ORIGINAL_REGIME_CUSTODY_MISMATCH");
    const unknown=clone(row);Reflect.set(unknown.payload,"schema_version","portal.execution.manager-score-original-inputs.v5");
    unknown.payload_digest=accessDigest(unknown.payload);expect(()=>decode(f,unknown)).toThrow("MANAGER_ORIGINAL_DIGEST_MISMATCH");
    expect(()=>decode(f,{...row,calculation_key:accessDigest("TEST_ONLY:wrong-key")})).toThrow("MANAGER_ORIGINAL_DIGEST_MISMATCH");
  });
  it("new child-array boundaries reject getter/Proxy/symbol/sparse shapes without evaluating payloads",async()=>{
    const f=await regimeOriginalFixture(),parent=new ManagerScoreOriginalCustody(regimeOriginalLimits);let traps=0;
    const getter:ManagerRegimeOriginalCustody[]=[];Object.defineProperty(getter,"0",{enumerable:true,get(){traps++;throw new Error("PRIVATE");}});
    const proxy=new Proxy(f.custodies,{get(){traps++;throw new Error("PRIVATE");},ownKeys(){traps++;throw new Error("PRIVATE");}}),
      sparse=[...f.custodies];delete sparse[0];const symbol=Object.assign([...f.custodies],{[Symbol("TEST_ONLY")]:true});
    for(const value of [getter,proxy,sparse,symbol])expect(()=>parent.prepare(f.document,[],[],value)).toThrow("MANAGER_ORIGINAL_INPUT_INVALID");
    expect(traps).toBe(0);
    expect(()=>parent.prepare(f.document,[],[],Array.from({length:129},()=>f.custodies[0]))).toThrow("MANAGER_ORIGINAL_INPUT_BOUND");
    expect(()=>parent.prepare(f.document,[],[],[new Proxy(f.custodies[0],{get(){traps++;throw new Error("PRIVATE");}})]))
      .toThrow("MANAGER_ORIGINAL_REGIME_CAPTURE_REQUIRED");expect(traps).toBe(0);
  });
  it("bounds cumulative genuine children before duplicate restoration, not128 individually fitting clones",async()=>{
    const f=await regimeOriginalFixture(),c=f.custodies[0],entry={custody_digest:c.custody_digest,custody:c},
      one=Buffer.byteLength(JSON.stringify(entry)),wrapper=Buffer.byteLength('{"retained_compositions":[],"retained_regimes":[]}'),
      maximum_bundle_bytes=wrapper+one+8,parent=new ManagerScoreOriginalCustody({...regimeOriginalLimits,maximum_bundle_bytes});
    expect(Buffer.byteLength(JSON.stringify(c))).toBeLessThan(maximum_bundle_bytes);
    expect(wrapper+2*one+1).toBeGreaterThan(maximum_bundle_bytes);
    expect(()=>parent.prepare(f.document,[],[],[c,c])).toThrow("MANAGER_ORIGINAL_INPUT_BOUND");
  });
  it("bounds full parent overhead after child admission and rejects over-cap retained reads",async()=>{
    const f=await regimeOriginalFixture(),row=regimeV4ExpectedRow(f.document,f.custodies),c=f.custodies[0],
      entry=Buffer.byteLength(JSON.stringify({custody_digest:c.custody_digest,custody:c})),
      wrapper=Buffer.byteLength('{"retained_compositions":[],"retained_regimes":[]}'),
      maximum_bundle_bytes=Buffer.byteLength(JSON.stringify(row.payload))-1;
    expect(wrapper+entry).toBeLessThan(maximum_bundle_bytes);
    expect(Buffer.byteLength(JSON.stringify(f.document))).toBeLessThan(maximum_bundle_bytes);
    expect(()=>new ManagerScoreOriginalCustody({...regimeOriginalLimits,maximum_bundle_bytes})
      .prepare(f.document,[],[],f.custodies)).toThrow("MANAGER_ORIGINAL_INPUT_BOUND");
    expect(()=>decodeRetainedManagerScoreOriginal(f.document,row,maximum_bundle_bytes)).toThrow("MANAGER_ORIGINAL_INPUT_BOUND");
  });
  it("empty/absent Regime input does not silently opt a zero-Score source into a new custody version",async()=>{
    const f=await regimeOriginalFixture(),parent=new ManagerScoreOriginalCustody(regimeOriginalLimits);
    expect(()=>parent.prepare(f.document,[])).toThrow("MANAGER_ORIGINAL_INPUT_BOUND");
    expect(()=>parent.prepare(f.document,[],undefined,[])).toThrow("MANAGER_ORIGINAL_INPUT_BOUND");
  });
});
