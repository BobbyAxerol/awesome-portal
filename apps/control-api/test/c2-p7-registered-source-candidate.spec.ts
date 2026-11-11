import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {describe,expect,it} from "vitest";
import {c2P7RegisteredSourceKeysAreIndependent,createC2P7RegisteredSourceCandidate} from "../src/execution-v2/c2-p7-registered-source-candidate";

const keys=generateKeyPairSync("ed25519");
const publicPem=keys.publicKey.export({type:"spki",format:"pem"}).toString();
const pin=createHash("sha256").update(keys.publicKey.export({type:"spki",format:"der"})).digest("hex");
const data=()=>({b1_sha256:"1".repeat(64),a1_sha256:"2".repeat(64),jwks_sha256:"3".repeat(64),
  p8_spki_sha256:"4".repeat(64),workspace_id:"workspace",owner_user_id:"owner",issuer:"issuer",subject:"owner",
  current_workload_ref:"workload",source_workload_id:"source",ts_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",
  environment:"paper",visibility:"BUSINESS",fields:["business_report"],operations:["HISTORY","READ"],
  scopes:[{environment:"paper",portfolio_id:"paper-portfolio-g1"},{environment:"paper",portfolio_id:"paper-root-g1"}],
  application_revision:"revision",authority_revision:7,mapping_sha256:"5".repeat(64),signer_kid:"signer",
  effective_from_ms:1000,expires_at_ms:2000});
const wrapBytes=(payload:Buffer,priv=keys.privateKey)=>
  Buffer.from(JSON.stringify({payload:payload.toString("base64url"),signature:sign(null,payload,priv).toString("base64url")}));
const wrap=(document:unknown,priv=keys.privateKey)=>wrapBytes(Buffer.from(JSON.stringify(document)),priv);

describe("C2 P7 registered source candidate (unmounted)",()=>{
  it("binds necessary owner/witness key separation to the exact factory source and P8 pin",()=>{
    const source=createC2P7RegisteredSourceCandidate(data(),publicPem,pin);
    const owner="a".repeat(64),witness="b".repeat(64),p8=data().p8_spki_sha256;
    expect(c2P7RegisteredSourceKeysAreIndependent(source,owner,witness)).toBe(true);
    for(const [a,b] of [[pin,witness],[owner,pin],[p8,witness],[owner,p8],[owner,owner],["bad",witness]])
      expect(c2P7RegisteredSourceKeysAreIndependent(source,a,b)).toBe(false);
    expect(c2P7RegisteredSourceKeysAreIndependent({verify:source.verify},owner,witness)).toBe(false);
    expect(c2P7RegisteredSourceKeysAreIndependent(Object.create(source),owner,witness)).toBe(false);
  });
  it("refuses a registration whose source attestor reuses the P8 publication key",()=>{
    expect(()=>createC2P7RegisteredSourceCandidate({...data(),p8_spki_sha256:pin},publicPem,pin))
      .toThrow("C2_P7_REGISTERED_SOURCE_INVALID");
  });
  it("verifies an independently pinned attestor and exact pre-provisioned binding",()=>{
    const proof=wrap(data()); const source=createC2P7RegisteredSourceCandidate(data(),publicPem,pin);
    expect(source.verify(proof)).toMatchObject({owner_user_id:"owner",authority_revision:7,
      source_evidence_sha256:createHash("sha256").update(proof).digest("hex")});
  });
  it("fails closed on untrusted keys, invalid proof, wrong signature and oversized input",()=>{
    expect(()=>createC2P7RegisteredSourceCandidate(data(),publicPem,"0".repeat(64))).toThrow();
    const source=createC2P7RegisteredSourceCandidate(data(),publicPem,pin);
    const other=generateKeyPairSync("ed25519");
    for (const proof of [Buffer.from("{}"),wrap(data(),other.privateKey),Buffer.alloc(65537),Buffer.from("" )])
      expect(()=>source.verify(proof)).toThrow("C2_P7_REGISTERED_SOURCE_INVALID");
  });
  it("rejects independently signed changes to authority, provenance, workload or scope",()=>{
    const source=createC2P7RegisteredSourceCandidate(data(),publicPem,pin);
    for (const edit of [{authority_revision:8},{a1_sha256:"8".repeat(64)},{b1_sha256:"8".repeat(64)},
      {jwks_sha256:"8".repeat(64)},{p8_spki_sha256:"8".repeat(64)},{source_workload_id:"other"},
      {workspace_id:"other"},{issuer:"other"},{subject:"other"},{application_revision:"other"},
      {operations:["READ","STREAM"]},{scopes:[{environment:"paper",portfolio_id:"paper-root-g1"},
        {environment:"paper",portfolio_id:"paper-portfolio-g1"}]}])
      expect(()=>source.verify(wrap({...data(),...edit}))).toThrow("C2_P7_REGISTERED_SOURCE_INVALID");
  });
  it("captures independent registration values rather than a mutable caller object",()=>{
    const registration=data(); const source=createC2P7RegisteredSourceCandidate(registration,publicPem,pin);
    registration.owner_user_id="other";
    expect(()=>source.verify(wrap(data()))).not.toThrow();
    expect(()=>source.verify(wrap(registration))).toThrow();
  });
  it("rejects duplicate keys, alternate encodings and malformed UTF-8 even when signed",()=>{
    const source=createC2P7RegisteredSourceCandidate(data(),publicPem,pin);
    const canonical=JSON.stringify(data());
    const duplicate=canonical.replace('"owner_user_id":"owner"','"owner_user_id":"owner","owner_user_id":"owner"');
    const malformed=Buffer.concat([Buffer.from(canonical.slice(0,-1)),Buffer.from([0xff]),Buffer.from("}")]);
    const escaped=canonical.replace('"owner_user_id":"owner"','"owner_user_id":"\\u006fwner"');
    for (const payload of [Buffer.from(duplicate),malformed,Buffer.from(escaped),Buffer.from(` ${canonical}`)])
      expect(()=>source.verify(wrapBytes(payload))).toThrow("C2_P7_REGISTERED_SOURCE_INVALID");
    const validEnvelope=wrap(data()).toString("utf8");
    const duplicateEnvelope=validEnvelope.replace('"payload":','"payload":"ignored","payload":');
    const badEnvelope=Buffer.concat([Buffer.from(validEnvelope.slice(0,-1)),Buffer.from([0xff]),Buffer.from("}")]);
    for (const input of [Buffer.from(duplicateEnvelope),badEnvelope,Buffer.from(` ${validEnvelope}`)])
      expect(()=>source.verify(input)).toThrow("C2_P7_REGISTERED_SOURCE_INVALID");
    // JSON's UTF-8 decoder would silently replace 0xff with U+FFFD, matching
    // this legitimately registered issuer unless the original bytes are checked.
    const replacement={...data(),issuer:"\ufffd"};
    const replacementSource=createC2P7RegisteredSourceCandidate(replacement,publicPem,pin);
    const utf8=Buffer.from(JSON.stringify(replacement));
    const at=utf8.indexOf(Buffer.from("\ufffd"));
    const invalidIssuer=Buffer.concat([utf8.subarray(0,at),Buffer.from([0xff]),utf8.subarray(at+3)]);
    expect(()=>replacementSource.verify(wrapBytes(invalidIssuer))).toThrow("C2_P7_REGISTERED_SOURCE_INVALID");
  });
});
