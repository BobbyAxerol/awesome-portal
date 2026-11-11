import { createHash, createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { nativeRootDecode } from "./native-root-codec";

/** Offline public-key integrity checks only. The pins must come from an
 * independently authenticated selection; this does not prove key ownership,
 * signer custody, owner approval, A2 acceptance, or permission to sign B2. */
const digest=z.string().regex(/^[0-9a-f]{64}$(?![\s\S])/);
const kid=z.string().min(1).max(128).refine(v=>v.trim()===v && !/[\u0000-\u001f\u007f]/u.test(v));
const jwk=z.object({kty:z.literal("OKP"),crv:z.literal("Ed25519"),
  x:z.string().regex(/^[A-Za-z0-9_-]{43}$(?![\s\S])/),kid,alg:z.literal("EdDSA"),use:z.literal("sig")}).strict();
const pins=z.object({jwk_sha256:digest,signer_spki_sha256:digest,signer_kid:kid,
  issuer_spki_sha256:digest,issuer_kid:kid,source_spki_sha256:digest}).strict();
export type C2P8PublicPins=z.infer<typeof pins>;
const sha=(value:Uint8Array)=>createHash("sha256").update(value).digest("hex");
const fail=():never=>{throw new Error("C2_P8_PUBLIC_KEY_INVALID");};

function inspect(bytes:Uint8Array,unknownPins:C2P8PublicPins) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength<1 || bytes.byteLength>8192) return fail();
    const copy=Buffer.from(bytes),p=pins.parse(unknownPins);
    if(sha(copy)!==p.jwk_sha256)return fail();
    const key=jwk.parse(nativeRootDecode(copy));
    const raw=Buffer.from(key.x,"base64url");
    if(raw.length!==32||raw.toString("base64url")!==key.x||key.kid!==p.signer_kid
      ||key.kid===p.issuer_kid)return fail();
    const publicKey=createPublicKey({key,format:"jwk"});
    const spki=sha(publicKey.export({type:"spki",format:"der"}));
    if(publicKey.asymmetricKeyType!=="ed25519"||spki!==p.signer_spki_sha256
      ||spki===p.issuer_spki_sha256||spki===p.source_spki_sha256)return fail();
    return {publicKey, result:Object.freeze({state:"PUBLIC_KEY_CHECKED_NOT_AUTHORIZED" as const,
      jwk_sha256:p.jwk_sha256,signer_spki_sha256:spki,signer_kid:key.kid})};
  } catch {return fail();}
}
export function inspectC2P8PublicKey(bytes:Uint8Array,pins:C2P8PublicPins) {
  return inspect(bytes,pins).result;
}

/** Cryptographic comparison only: a valid signature does not prove an
 * original source receipt, custody, publication authority or release. */
export function verifyC2P8Signature(bytes:Uint8Array,pins:C2P8PublicPins,
  payload:Uint8Array,signature:Uint8Array) {
  const selected=inspect(bytes,pins);
  if(!(payload instanceof Uint8Array)||payload.byteLength<1||payload.byteLength>131072||
    !(signature instanceof Uint8Array)||signature.byteLength!==64)return fail();
  const message=Buffer.from(payload),sig=Buffer.from(signature);
  if(!verify(null,message,selected.publicKey,sig))return fail();
  return Object.freeze({...selected.result,signature_state:"VALID_NOT_AUTHORIZED" as const,
    payload_sha256:sha(message),signature_sha256:sha(sig)});
}
