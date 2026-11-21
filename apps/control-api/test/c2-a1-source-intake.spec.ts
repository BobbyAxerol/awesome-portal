import { createHash, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectPinnedC2A1SourceIntake } from "../src/execution-v2/c2-a1-source-intake";

const sha=(v:Uint8Array)=>createHash("sha256").update(v).digest("hex");
const json=(v:unknown)=>Buffer.from(JSON.stringify(v));
function sample() {
  const key=generateKeyPairSync("ed25519"), publicJwk=key.publicKey.export({format:"jwk"});
  const files={"identifiers.json":json({schema:"ts-portal.pm-authority-a1.v1",source_issuer:"TEST_ONLY-source",
    source_key_id:"TEST_ONLY-kid",source_public_key_spki_sha256:sha(key.publicKey.export({format:"der",type:"spki"})),
    principal_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",environment:"paper",mtls_client_csr_subject:"CN=TEST_ONLY",
    requested_client_cert_validity_days_min:120,portal_to_fill:["source_audience"],handoff:"TEST_ONLY"}),
    "ts-mtls-client.csr.pem":Buffer.from("-----BEGIN CERTIFICATE REQUEST-----\nTEST_ONLY\n-----END CERTIFICATE REQUEST-----\n"),
    "ts-source-proof-ed25519.jwk.json":json({...publicJwk,kid:"TEST_ONLY-kid",alg:"EdDSA",use:"sig"}),
    "ts-source-proof-ed25519.pub.pem":Buffer.from(key.publicKey.export({type:"spki",format:"pem"}))};
  const pin=()=>{const manifest=json({schema:"ts-portal.pm-authority-exchange.v1",direction:"ts-to-portal",step:"a1",revision:1,
    produced_by:"TEST_ONLY",produced_utc:"TEST_ONLY",files:Object.entries(files).map(([path,bytes])=>({path,bytes:bytes.length,sha256:sha(bytes)}))});
    return {manifest,files,manifest_sha256:sha(manifest)};};
  return {files,pin};
}
describe("C2 A1 public intake is integrity only",()=>{
  it("binds pinned manifest, source public key, kid and principal without claiming source authority",()=>{
    const s=sample(),r=inspectPinnedC2A1SourceIntake(s.pin());
    expect(r).toMatchObject({state:"INTEGRITY_ONLY_NOT_AUTHORIZED",source_key_id:"TEST_ONLY-kid",environment:"paper",
      ts_principal_user_id:"b2b70006-2373-4f10-b2d4-5e4c32af9204",client_csr_signature:"NOT_VERIFIED"});
    expect(r).not.toHaveProperty("owner_user_id"); expect(r).not.toHaveProperty("delegation");
  });
  it("rejects wrong independent manifest pin, changed bytes, private keys and mismatched public keys",()=>{
    const s=sample(),input=s.pin();
    expect(()=>inspectPinnedC2A1SourceIntake({...input,manifest_sha256:"0".repeat(64)})).toThrow("C2_A1_INTAKE_INVALID");
    const changed={...input.files,"identifiers.json":Buffer.from("{}")};
    expect(()=>inspectPinnedC2A1SourceIntake({...input,files:changed})).toThrow("C2_A1_INTAKE_INVALID");
    const originalPem=s.files["ts-source-proof-ed25519.pub.pem"],alt=generateKeyPairSync("ed25519").publicKey;
    s.files["ts-source-proof-ed25519.pub.pem"]=Buffer.from(alt.export({type:"spki",format:"pem"}));
    expect(()=>inspectPinnedC2A1SourceIntake(s.pin())).toThrow("C2_A1_INTAKE_INVALID");
    s.files["ts-source-proof-ed25519.pub.pem"]=originalPem;
    const j=JSON.parse(s.files["ts-source-proof-ed25519.jwk.json"].toString());
    s.files["ts-source-proof-ed25519.jwk.json"]=json({...j,d:"TEST_ONLY"});
    expect(()=>inspectPinnedC2A1SourceIntake(s.pin())).toThrow("C2_A1_INTAKE_INVALID");
  });
  it("rejects duplicate decoded keys in pinned source JSON",()=>{
    const s=sample(),original=s.files["ts-source-proof-ed25519.jwk.json"].toString();
    s.files["ts-source-proof-ed25519.jwk.json"]=Buffer.from(original.replace('"kid":','"kid":"a","\\u006bid":'));
    expect(()=>inspectPinnedC2A1SourceIntake(s.pin())).toThrow("C2_A1_INTAKE_INVALID");
  });
  it("bounds every input before copying and refuses non-byte input",()=>{
    const input=sample().pin(),tooLarge=Buffer.alloc(65537);
    expect(()=>inspectPinnedC2A1SourceIntake({...input,manifest:tooLarge})).toThrow("C2_A1_INTAKE_INVALID");
    for(const name of Object.keys(input.files) as (keyof typeof input.files)[]) {
      expect(()=>inspectPinnedC2A1SourceIntake({...input,files:{...input.files,[name]:tooLarge}})).toThrow("C2_A1_INTAKE_INVALID");
      expect(()=>inspectPinnedC2A1SourceIntake({...input,files:{...input.files,[name]:"TEST_ONLY"} as unknown as typeof input.files})).toThrow("C2_A1_INTAKE_INVALID");
    }
  });
  it.skipIf(!process.env.C2_A1_PUBLIC_DIR)("checks explicitly selected public A1 bytes against an independent manifest pin",()=>{
    const dir=process.env.C2_A1_PUBLIC_DIR!;
    const files={"identifiers.json":readFileSync(join(dir,"identifiers.json")),
      "ts-mtls-client.csr.pem":readFileSync(join(dir,"ts-mtls-client.csr.pem")),
      "ts-source-proof-ed25519.jwk.json":readFileSync(join(dir,"ts-source-proof-ed25519.jwk.json")),
      "ts-source-proof-ed25519.pub.pem":readFileSync(join(dir,"ts-source-proof-ed25519.pub.pem"))};
    const result=inspectPinnedC2A1SourceIntake({manifest:readFileSync(join(dir,"MANIFEST.json")),files,
      manifest_sha256:"7b063476b5daf2218382b31166f48a73218e09befd7804b0eb018b11fc642ab4"});
    expect(result.source_spki_sha256).toBe("2932eb4603c9d38c4e8c120ad0bf3b714fff4f6fb99f8921fb903f6efb953237");
    expect(result.state).toBe("INTEGRITY_ONLY_NOT_AUTHORIZED");
  });
});
