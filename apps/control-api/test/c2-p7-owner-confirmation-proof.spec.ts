import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {describe,expect,it} from "vitest";
import {C2P7OwnerConfirmationVerifier,type C2P7ConfirmationClaims} from "../src/execution-v2/c2-p7-owner-confirmation-proof";

describe("P7 owner confirmation proof, isolated keys",()=>{
  const key=generateKeyPairSync("ed25519"),other=generateKeyPairSync("ed25519");
  const pem=key.publicKey.export({type:"spki",format:"pem"}).toString();
  const pin=createHash("sha256").update(key.publicKey.export({type:"spki",format:"der"})).digest("hex");
  const value:C2P7ConfirmationClaims={schema:"portal.c2-p7.owner-confirmation.v1",cycle_sha256:"1".repeat(64),
    confirmation_sha256:"2".repeat(64),intent_id:"9a912814-0899-49b9-9887-38b807a14831",
    registration_key:"test-registration",registration_sha256:"3".repeat(64),source_evidence_sha256:"4".repeat(64),
    b1_sha256:"5".repeat(64),workspace_id:"test-workspace",owner_user_id:"test-owner",session_id:"test-session",
    session_generation:2,authority_revision:3,acceptance_sha256:"6".repeat(64),delegation_sha256:"7".repeat(64),
    issued_at_ms:1000,expires_at_ms:2000};
  const proof=(claims:unknown,privateKey=key.privateKey)=>{
    const payload=Buffer.from(JSON.stringify(claims));
    return Buffer.from(JSON.stringify({payload:payload.toString("base64url"),
      signature:sign(null,payload,privateKey).toString("base64url")}));
  };
  const verifier=new C2P7OwnerConfirmationVerifier(pem,pin);
  it("accepts exact current signed claims with an independently pinned key",()=>{
    expect(verifier.keySha256()).toBe(pin);
    expect(verifier.verify(proof(value),value,1000)).toEqual(value);
    expect(Object.isFrozen(verifier.verify(proof(value),value,1999))).toBe(true);
  });
  it("rejects wrong keys, tampering and noncanonical envelopes",()=>{
    expect(()=>new C2P7OwnerConfirmationVerifier(pem,"0".repeat(64))).toThrow();
    expect(()=>new C2P7OwnerConfirmationVerifier(key.privateKey.export({type:"pkcs8",format:"pem"}).toString(),pin)).toThrow();
    expect(()=>verifier.verify(proof(value,other.privateKey),value,1500)).toThrow();
    expect(()=>verifier.verify(Buffer.from(` ${proof(value).toString()}`),value,1500)).toThrow();
    expect(()=>verifier.verify(proof({...value,extra:true}),value,1500)).toThrow();
    expect(()=>verifier.verify(proof(value).subarray(0,20),value,1500)).toThrow();
  });
  it("rejects replay for a different cycle, session, authority or record",()=>{
    for(const changed of [{cycle_sha256:"8".repeat(64)},{confirmation_sha256:"8".repeat(64)},
      {intent_id:"b47699ef-1609-41d2-af8b-84f22f1be710"},{workspace_id:"other"},{owner_user_id:"other"},
      {session_id:"other"},{session_generation:3},{authority_revision:4},{source_evidence_sha256:"8".repeat(64)},
      {registration_sha256:"8".repeat(64)},{acceptance_sha256:"8".repeat(64)},{delegation_sha256:"8".repeat(64)}])
      expect(()=>verifier.verify(proof(value),{...value,...changed},1500)).toThrow();
  });
  it("rejects not-yet-valid, expired, invalid or caller-mutated times",()=>{
    for(const now of [999,2000,-1,Number.NaN])expect(()=>verifier.verify(proof(value),value,now)).toThrow();
    expect(()=>verifier.verify(proof({...value,expires_at_ms:1000}),{...value,expires_at_ms:1000},1000)).toThrow();
    expect(()=>verifier.verify(proof(value),{...value,expires_at_ms:3000},1500)).toThrow();
  });
});
