import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {describe,expect,it} from "vitest";
import {C2P7OwnerAuthAttestationCandidate,type C2P7OwnerAuthClaims} from "../src/execution-v2/c2-p7-owner-auth-attestation-candidate";

describe("P7 independent owner-auth attestation candidate",()=>{
  const keys=generateKeyPairSync("ed25519"),other=generateKeyPairSync("ed25519");
  const pem=keys.publicKey.export({type:"spki",format:"pem"}).toString();
  const pin=createHash("sha256").update(keys.publicKey.export({type:"spki",format:"der"})).digest("hex");
  const verifier=new C2P7OwnerAuthAttestationCandidate(pem,pin,"test-issuer","test-audience");
  const value:C2P7OwnerAuthClaims={schema:"portal.c2-p7.owner-auth-attestation.candidate.v1",issuer:"test-issuer",
    audience:"test-audience",workspace_id:"workspace",owner_user_id:"owner",session_id:"session",session_generation:1,
    cycle_sha256:"1".repeat(64),b1_sha256:"2".repeat(64),confirmation_sha256:"3".repeat(64),
    idempotency_sha256:"4".repeat(64),issued_at_ms:1000,expires_at_ms:61000};
  const {schema:_,issuer:__,audience:___,issued_at_ms:____,expires_at_ms:_____,...expected}=value;
  const proof=(v:unknown,key=keys.privateKey)=>{const payload=Buffer.from(JSON.stringify(v));return Buffer.from(JSON.stringify({
    payload:payload.toString("base64url"),signature:sign(null,payload,key).toString("base64url")}));};
  it("accepts only a current attestation for the exact owner, session, request and cycle",()=>{
    expect(()=>verifier.verify(proof(value),expected,1000)).not.toThrow();
    for(const change of [{owner_user_id:"other"},{workspace_id:"other"},{session_id:"other"},{session_generation:2},
      {cycle_sha256:"5".repeat(64)},{b1_sha256:"5".repeat(64)},{confirmation_sha256:"5".repeat(64)},
      {idempotency_sha256:"5".repeat(64)}])expect(()=>verifier.verify(proof(value),{...expected,...change},2000)).toThrow();
  });
  it("rejects forged keys, issuer/audience changes, malformed and expired proofs",()=>{
    expect(()=>new C2P7OwnerAuthAttestationCandidate(pem,"0".repeat(64),"test-issuer","test-audience")).toThrow();
    expect(()=>new C2P7OwnerAuthAttestationCandidate(keys.privateKey.export({type:"pkcs8",format:"pem"}).toString(),pin,"test-issuer","test-audience")).toThrow();
    expect(()=>verifier.verify(proof(value,other.privateKey),expected,2000)).toThrow();
    for(const change of [{issuer:"other"},{audience:"other"},{expires_at_ms:121001},{extra:true}])
      expect(()=>verifier.verify(proof({...value,...change}),expected,2000)).toThrow();
    for(const now of [999,61000,-1,NaN])expect(()=>verifier.verify(proof(value),expected,now)).toThrow();
    expect(()=>verifier.verify(proof(value),{} as typeof expected,2000)).toThrow();
    expect(()=>verifier.verify(Buffer.from(` ${proof(value).toString()}`),expected,2000)).toThrow();
  });
});
