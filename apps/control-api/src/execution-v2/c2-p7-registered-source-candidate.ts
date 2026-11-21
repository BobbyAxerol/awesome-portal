import { createHash, createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import type { C2P7SourceVerifier } from "./c2-p7-acceptance";

/**
 * Unmounted candidate only. The immutable registration and attestation key must
 * come from a separately qualified, operator-controlled installation, NOT the
 * HTTP request or the proof being verified. A signature is not owner acceptance,
 * a session, a step-up, a grant, or an authorization to publish. P7 must still
 * check the real owner, session, step-up and revision under its authority lock.
 * Wire format: compact JSON.stringify UTF-8 with schema key order, including
 * both the outer envelope and the signed payload. No alternative encodings,
 * whitespace, duplicate keys, or malformed UTF-8 are accepted.
 * Revocation/change of this candidate's registration is not fenced with the P7
 * transaction; therefore this implementation MUST NOT be mounted for issuance.
 */
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const id = z.string().min(1).max(128).refine(s => s.trim() === s && !/[\u0000-\u001f\u007f]/u.test(s));
const timestamp = z.number().int().nonnegative().safe();
const scope = z.object({environment:z.literal("paper"), portfolio_id:id}).strict();
const binding = z.object({
  b1_sha256:hex, a1_sha256:hex, jwks_sha256:hex, p8_spki_sha256:hex,
  workspace_id:id, owner_user_id:id, issuer:id, subject:id, current_workload_ref:id,
  source_workload_id:id, ts_user_id:z.literal("b2b70006-2373-4f10-b2d4-5e4c32af9204"),
  environment:z.literal("paper"), visibility:z.literal("BUSINESS"), fields:z.tuple([z.literal("business_report")]),
  operations:z.tuple([z.literal("HISTORY"),z.literal("READ")]),
  scopes:z.tuple([scope,scope]), application_revision:id, authority_revision:timestamp,
  mapping_sha256:hex, signer_kid:id, effective_from_ms:timestamp, expires_at_ms:timestamp,
}).strict().superRefine((v,ctx) => {
  if (v.subject !== v.owner_user_id || v.scopes[0].portfolio_id !== "paper-portfolio-g1" ||
      v.scopes[1].portfolio_id !== "paper-root-g1" || v.expires_at_ms <= v.effective_from_ms ||
      v.expires_at_ms - v.effective_from_ms > 90*86400_000)
    ctx.addIssue({code:z.ZodIssueCode.custom,message:"invalid C2 binding"});
});
const envelope = z.object({payload:z.string().min(1).max(32000), signature:z.string().min(1).max(512)}).strict();
const sha = (bytes:Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const fail = ():never => { throw new Error("C2_P7_REGISTERED_SOURCE_INVALID"); };
// Metadata is attached to the exact verifier returned by the factory, never
// supplied through an interface method that a caller could impersonate.
const registeredPins = new WeakMap<C2P7SourceVerifier, Readonly<{attestor:string;p8:string}>>();

/** Necessary key separation only. Different public keys do not prove separate
 * operators, protected custody, owner authentication, or commissioning. */
export function c2P7RegisteredSourceKeysAreIndependent(source:C2P7SourceVerifier,ownerAuth:string,witness:string):boolean {
  const pins=registeredPins.get(source);
  return !!pins && hex.safeParse(ownerAuth).success && hex.safeParse(witness).success &&
    ownerAuth!==witness && ownerAuth!==pins.attestor && ownerAuth!==pins.p8 &&
    witness!==pins.attestor && witness!==pins.p8;
}
const decode = (s:string):Buffer => {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return fail();
  const b=Buffer.from(s,"base64url");
  if (b.toString("base64url")!==s) return fail();
  return b;
};

/** Captures a separately provisioned registration and public attestor key. */
export function createC2P7RegisteredSourceCandidate(
  registration:unknown, approvalPublicPem:string, independentlyPinnedPublicKeySha256:string,
):C2P7SourceVerifier {
  const parsed=binding.safeParse(registration);
  if (!parsed.success || !hex.safeParse(independentlyPinnedPublicKeySha256).success ||
      // Source attestation and Portal P8 publication are separate trust
      // domains. Enforce the same key separation at this composition boundary
      // even when an upstream caller skipped the independent P8 preflight.
      parsed.data.p8_spki_sha256===independentlyPinnedPublicKeySha256 ||
      typeof approvalPublicPem!=="string" || approvalPublicPem.length>8192) return fail();
  let key:ReturnType<typeof createPublicKey>;
  try { key=createPublicKey(approvalPublicPem); } catch { return fail(); }
  if (key.type!=="public" || key.asymmetricKeyType!=="ed25519" ||
      sha(key.export({type:"spki",format:"der"}))!==independentlyPinnedPublicKeySha256) return fail();
  // Canonical serialization follows the strict Zod schema, not caller key order.
  const expected=JSON.stringify(parsed.data);
  const source:C2P7SourceVerifier=Object.freeze({verify(proof:Uint8Array):unknown {
    if (!(proof instanceof Uint8Array) || !proof.byteLength || proof.byteLength>65536) return fail();
    const input=Buffer.from(proof);
    let wrapped:unknown;
    try { wrapped=JSON.parse(input.toString("utf8")); } catch { return fail(); }
    const env=envelope.safeParse(wrapped);
    if (!env.success || !input.equals(Buffer.from(JSON.stringify(env.data),"utf8"))) return fail();
    const payload=decode(env.data.payload), signature=decode(env.data.signature);
    if (payload.length>24000 || signature.length!==64 || !verify(null,payload,key,signature)) return fail();
    let document:unknown;
    try { document=JSON.parse(payload.toString("utf8")); } catch { return fail(); }
    const actual=binding.safeParse(document);
    if (!actual.success || !payload.equals(Buffer.from(JSON.stringify(actual.data),"utf8")) ||
        JSON.stringify(actual.data)!==expected) return fail();
    const {a1_sha256: _a1,jwks_sha256: _jwks,p8_spki_sha256: _p8,...p7}=actual.data;
    return {...p7,source_evidence_sha256:sha(input)};
  }});
  registeredPins.set(source,Object.freeze({attestor:independentlyPinnedPublicKeySha256,p8:parsed.data.p8_spki_sha256}));
  return source;
}
