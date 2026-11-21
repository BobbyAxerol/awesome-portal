import {createHash,randomBytes,randomUUID} from "node:crypto";
import {describe,expect,it} from "vitest";
import {C2SourceProofVault,type SourceProofBinding} from "../src/execution-v2/restore-c2-source-proof-vault";

describe("C2 source proof vault (unmounted candidate)",()=>{
  const proof="test-only.source-signed.proof";
  const binding=():SourceProofBinding=>({custody_id:randomUUID(),operation_id:randomUUID(),generation:"1",
    kind:"SIGNED_SOURCE_TERMINAL",lease_id:randomUUID(),proof_hash:createHash("sha256").update(proof).digest("hex")});
  it("retains encrypted exact source bytes with distinct nonces and a copied key",()=>{
    const key=randomBytes(32),vault=new C2SourceProofVault(key,"test-key"),b=binding();key.fill(0);
    const first=vault.seal(b,proof),second=vault.seal(b,proof);
    expect(first.nonce).not.toBe(second.nonce);
    expect(JSON.stringify(first)).not.toContain(proof);
    const actual=vault.open(b,first);expect(actual.toString()).toBe(proof);actual.fill(0);
  });
  it("rejects a different original, key, tag, ciphertext or extra field",()=>{
    const vault=new C2SourceProofVault(randomBytes(32),"test-key"),b=binding(),sealed=vault.seal(b,proof);
    expect(()=>vault.open({...b,lease_id:randomUUID()},sealed)).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
    expect(()=>vault.open({...b,generation:"2"},sealed)).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
    expect(()=>vault.open(b,{...sealed,tag:Buffer.alloc(16).toString("base64url")})).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
    expect(()=>vault.open(b,{...sealed,ciphertext:Buffer.alloc(4).toString("base64url")})).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
    expect(()=>vault.open(b,{...sealed,extra:true})).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
    expect(()=>new C2SourceProofVault(randomBytes(32),"test-key").open(b,sealed)).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
  });
  it("never accepts human bearer events, nonmatching hashes or invalid keys",()=>{
    const vault=new C2SourceProofVault(randomBytes(32),"test-key"),b=binding();
    expect(()=>vault.seal({...b,kind:"ISSUED_HUMAN_ASSERTION" as never},proof)).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
    expect(()=>vault.seal({...b,proof_hash:"0".repeat(64)},proof)).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
    expect(()=>new C2SourceProofVault(Buffer.alloc(32),"test-key")).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
    expect(()=>new C2SourceProofVault(Buffer.alloc(31),"test-key")).toThrow("C2_SOURCE_PROOF_VAULT_INVALID");
  });
});
