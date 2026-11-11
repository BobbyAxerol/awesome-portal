import { createHash, createPublicKey } from "node:crypto";
import { z } from "zod";
import { nativeRootDecode } from "./native-root-codec";

/** Offline integrity only. This does not register a workload, verify a CSR
 * signature, bind a Portal owner, approve delegation, or authorize P7/B2.
 * The manifest pin MUST be independently selected by the operator; a hash
 * supplied alongside untrusted bytes does not establish their provenance. */
const hex=z.string().regex(/^[a-f0-9]{64}$/), id=z.string().min(1).max(128)
  .refine(v=>v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v));
const names=["identifiers.json","ts-mtls-client.csr.pem","ts-source-proof-ed25519.jwk.json","ts-source-proof-ed25519.pub.pem"] as const;
type Name=typeof names[number];
const manifest=z.object({schema:z.literal("ts-portal.pm-authority-exchange.v1"),direction:z.literal("ts-to-portal"),
  step:z.literal("a1"),revision:z.literal(1),produced_by:z.string().min(1).max(128),produced_utc:z.string().min(1).max(64),
  files:z.array(z.object({path:z.enum(names),bytes:z.number().int().min(1).max(65536),sha256:hex}).strict()).length(4)}).strict();
const identifiers=z.object({schema:z.literal("ts-portal.pm-authority-a1.v1"),source_issuer:id,source_key_id:id,
  source_public_key_spki_sha256:hex,principal_user_id:z.string().uuid(),environment:z.literal("paper"),
  mtls_client_csr_subject:z.string().min(1).max(512),requested_client_cert_validity_days_min:z.number().int().min(120).max(3650),
  portal_to_fill:z.array(id).min(1).max(32),handoff:z.string().min(1).max(512)}).strict();
const jwk=z.object({kty:z.literal("OKP"),crv:z.literal("Ed25519"),x:z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  kid:id,alg:z.literal("EdDSA"),use:z.literal("sig")}).strict();
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const fail=():never=>{throw new Error("C2_A1_INTAKE_INVALID")};
export function inspectPinnedC2A1SourceIntake(input:{manifest:Uint8Array;files:Record<Name,Uint8Array>;manifest_sha256:string}) {
  try {
    if(!hex.safeParse(input.manifest_sha256).success || !(input.manifest instanceof Uint8Array)
      || input.manifest.byteLength<1 || input.manifest.byteLength>65536
      || !input.files || Object.keys(input.files).sort().join("\0")!==[...names].sort().join("\0")
      || names.some(n=>!(input.files[n] instanceof Uint8Array) || input.files[n].byteLength<1 || input.files[n].byteLength>65536)) return fail();
    const snapshot=Buffer.from(input.manifest), data=Object.fromEntries(names.map(n=>[n,Buffer.from(input.files[n])])) as Record<Name,Buffer>;
    if(sha(snapshot)!==input.manifest_sha256)return fail();
    const m=manifest.parse(nativeRootDecode(snapshot));
    if(new Set(m.files.map(f=>f.path)).size!==names.length)return fail();
    for(const f of m.files) if(data[f.path].byteLength!==f.bytes||sha(data[f.path])!==f.sha256)return fail();
    const ids=identifiers.parse(nativeRootDecode(data["identifiers.json"]));
    const pub=jwk.parse(nativeRootDecode(data["ts-source-proof-ed25519.jwk.json"]));
    if(pub.kid!==ids.source_key_id || new Set(ids.portal_to_fill).size!==ids.portal_to_fill.length)return fail();
    const pem=createPublicKey(data["ts-source-proof-ed25519.pub.pem"]);
    const fromJwk=createPublicKey({key:pub,format:"jwk"});
    if(pem.asymmetricKeyType!=="ed25519"||!pem.equals(fromJwk))return fail();
    const spki=sha(pem.export({type:"spki",format:"der"}));
    if(spki!==ids.source_public_key_spki_sha256)return fail();
    const csr=data["ts-mtls-client.csr.pem"];
    if(!csr.toString("ascii").startsWith("-----BEGIN CERTIFICATE REQUEST-----\n") ||
      !csr.toString("ascii").trimEnd().endsWith("-----END CERTIFICATE REQUEST-----"))return fail();
    return Object.freeze({state:"INTEGRITY_ONLY_NOT_AUTHORIZED" as const,manifest_sha256:input.manifest_sha256,
      source_issuer:ids.source_issuer,source_key_id:ids.source_key_id,source_spki_sha256:spki,
      ts_principal_user_id:ids.principal_user_id,environment:ids.environment,client_csr_sha256:sha(csr),
      client_csr_signature:"NOT_VERIFIED" as const});
  } catch {return fail();}
}
