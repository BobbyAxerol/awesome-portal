import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inspectC2P8PublicKey, verifyC2P8Signature } from "../src/execution-v2/c2-p8-public-key";

const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
function setup() {
  const key=generateKeyPairSync("ed25519"),issuer=generateKeyPairSync("ed25519"),source=generateKeyPairSync("ed25519");
  const jwk={...key.publicKey.export({format:"jwk"}),kid:"p8-1",alg:"EdDSA",use:"sig"};
  const bytes=Buffer.from(JSON.stringify(jwk));
  const spki=(k:typeof key.publicKey)=>sha(k.export({format:"der",type:"spki"}));
  return {key,jwk,bytes,pins:{jwk_sha256:sha(bytes),signer_spki_sha256:spki(key.publicKey),
    signer_kid:"p8-1",issuer_spki_sha256:spki(issuer.publicKey),issuer_kid:"issuer-1",source_spki_sha256:spki(source.publicKey)}};
}
describe("C2 P8 public-only selection, never release authority",()=>{
  it("checks exact public bytes and a signature without authorizing publication",()=>{
    const s=setup(),payload=Buffer.from('{"exact":"bytes"}'),signature=sign(null,payload,s.key.privateKey);
    expect(inspectC2P8PublicKey(s.bytes,s.pins)).toMatchObject({state:"PUBLIC_KEY_CHECKED_NOT_AUTHORIZED",signer_kid:"p8-1"});
    expect(verifyC2P8Signature(s.bytes,s.pins,payload,signature)).toMatchObject({signature_state:"VALID_NOT_AUTHORIZED",payload_sha256:sha(payload)});
    expect(()=>verifyC2P8Signature(s.bytes,s.pins,Buffer.from("other"),signature)).toThrow("C2_P8_PUBLIC_KEY_INVALID");
    expect(()=>verifyC2P8Signature(s.bytes,s.pins,payload,signature.subarray(1))).toThrow("C2_P8_PUBLIC_KEY_INVALID");
  });
  it("rejects wrong pins and reuse of issuer or source key",()=>{
    const s=setup();
    for(const pins of [{...s.pins,jwk_sha256:"0".repeat(64)},{...s.pins,signer_spki_sha256:"0".repeat(64)},
      {...s.pins,signer_kid:"different"},{...s.pins,issuer_kid:s.pins.signer_kid},
      {...s.pins,issuer_spki_sha256:s.pins.signer_spki_sha256},{...s.pins,source_spki_sha256:s.pins.signer_spki_sha256}])
      expect(()=>inspectC2P8PublicKey(s.bytes,pins)).toThrow("C2_P8_PUBLIC_KEY_INVALID");
  });
  it("rejects private, extra, ambiguous or noncanonical public key material even with matching byte pins",()=>{
    const s=setup();
    const malformed=[Buffer.from(JSON.stringify({...s.jwk,d:"secret"})),Buffer.from(JSON.stringify({...s.jwk,extra:true})),
      Buffer.from(JSON.stringify({...s.jwk,x:s.jwk.x!.slice(0,42)+"B"})),
      Buffer.from(JSON.stringify(s.jwk).replace('"kid":"p8-1"','"kid":"p8-1","\\u006bid":"p8-1"')),
      Buffer.from([0xff])];
    for(const bytes of malformed) expect(()=>inspectC2P8PublicKey(bytes,{...s.pins,jwk_sha256:sha(bytes)})).toThrow("C2_P8_PUBLIC_KEY_INVALID");
  });
  it.skipIf(!process.env.C2_P8_PUBLIC_JWK)("checks the explicitly pinned Research public candidate without signing",()=>{
    const bytes=readFileSync(process.env.C2_P8_PUBLIC_JWK!);
    const result=inspectC2P8PublicKey(bytes,{
      jwk_sha256:"0ad65ab92e0d64a62222b4a0e8980311dd51f0ea7fc7ee08246aebc2032576dc",
      signer_spki_sha256:"8181cfdfc9858f0ea8bc80dff02ac16570299141eac48cf721b379543652235d",
      signer_kid:"p8-research-8181cfdfc9858f0e",
      issuer_spki_sha256:"317597e3473d62ff0249f049bff75217ad069a97f470b9a358ac5a68e4a41558",
      issuer_kid:"research-candidate-064b8dc9-17a8-4305-9b7f-d5c7524245e6",
      source_spki_sha256:"2932eb4603c9d38c4e8c120ad0bf3b714fff4f6fb99f8921fb903f6efb953237"});
    expect(result.state).toBe("PUBLIC_KEY_CHECKED_NOT_AUTHORIZED");
  });
});
