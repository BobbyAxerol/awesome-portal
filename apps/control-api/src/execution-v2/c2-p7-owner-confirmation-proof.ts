import {createHash,createPublicKey,verify,type KeyObject} from "node:crypto";
import {z} from "zod";

/** Candidate verifier only. The signing authority must independently verify
 * authenticated owner confirmation and must not share its private key with a
 * database writer. This module neither signs nor establishes that authority. */
const hex=z.string().regex(/^[0-9a-f]{64}$/);
const id=z.string().min(1).max(128).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s));
const ms=z.number().int().nonnegative().safe();
const claims=z.object({
  schema:z.literal("portal.c2-p7.owner-confirmation.v1"),
  cycle_sha256:hex,confirmation_sha256:hex,intent_id:z.string().uuid(),
  registration_key:id,registration_sha256:hex,source_evidence_sha256:hex,b1_sha256:hex,
  workspace_id:id,owner_user_id:id,session_id:id,session_generation:ms,
  authority_revision:ms,acceptance_sha256:hex,delegation_sha256:hex,
  issued_at_ms:ms,expires_at_ms:ms,
}).strict();
export type C2P7ConfirmationClaims=z.infer<typeof claims>;
const envelope=z.object({payload:z.string().min(1).max(16384),signature:z.string().min(1).max(256)}).strict();
const sha=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
const fail=():never=>{throw new Error("C2_P7_OWNER_CONFIRMATION_PROOF_INVALID");};
const decode=(s:string):Buffer=>{
  if(!/^[A-Za-z0-9_-]+$/.test(s))return fail();
  const result=Buffer.from(s,"base64url");
  if(result.toString("base64url")!==s)return fail();
  return result;
};

/** Immutable, pinned public verifier; caller must hold current authority and
 * revocation locks through use and compare against facts read under that lock.
 * Passing does not itself authorize issuance, grant a scope or prove that
 * the signer was securely commissioned. */
export class C2P7OwnerConfirmationVerifier {
  readonly #key:KeyObject;
  readonly #keySha:string;
  constructor(publicPem:string,independentSpkiSha256:string) {
    if(typeof publicPem!=="string"||publicPem.length>8192||
      !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(publicPem)||
      !hex.safeParse(independentSpkiSha256).success)throw new Error("C2_P7_OWNER_CONFIRMATION_PROOF_INVALID");
    let key:KeyObject;
    try {key=createPublicKey(publicPem);} catch {throw new Error("C2_P7_OWNER_CONFIRMATION_PROOF_INVALID");}
    if(key.type!=="public"||key.asymmetricKeyType!=="ed25519"||
      sha(key.export({type:"spki",format:"der"}))!==independentSpkiSha256)throw new Error("C2_P7_OWNER_CONFIRMATION_PROOF_INVALID");
    this.#key=key;this.#keySha=independentSpkiSha256;
  }
  keySha256():string{return this.#keySha;}
  verify(proof:Uint8Array,expected:C2P7ConfirmationClaims,nowMs:number):Readonly<C2P7ConfirmationClaims> {
    const wanted=claims.safeParse(expected);
    if(!wanted.success||!Number.isSafeInteger(nowMs)||nowMs<0||
      !(proof instanceof Uint8Array)||proof.byteLength<1||proof.byteLength>24576)return fail();
    const input=Buffer.from(proof);let raw:unknown;
    try {raw=JSON.parse(input.toString("utf8"));} catch {return fail();}
    const wrapped=envelope.safeParse(raw);
    if(!wrapped.success||!input.equals(Buffer.from(JSON.stringify(wrapped.data),"utf8")))return fail();
    const payload=decode(wrapped.data.payload),signature=decode(wrapped.data.signature);
    if(payload.length>12288||signature.length!==64||!verify(null,payload,this.#key,signature))return fail();
    try {raw=JSON.parse(payload.toString("utf8"));} catch {return fail();}
    const parsed=claims.safeParse(raw);
    if(!parsed.success||!payload.equals(Buffer.from(JSON.stringify(parsed.data),"utf8"))||
      !payload.equals(Buffer.from(JSON.stringify(wanted.data),"utf8"))||
      parsed.data.issued_at_ms>nowMs||nowMs>=parsed.data.expires_at_ms||
      parsed.data.expires_at_ms<=parsed.data.issued_at_ms)return fail();
    return Object.freeze(parsed.data);
  }
}
