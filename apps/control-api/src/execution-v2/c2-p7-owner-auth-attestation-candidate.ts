import {createHash,createPublicKey,verify,type KeyObject} from "node:crypto";
import {z} from "zod";

/** Unmounted verifier for an independently operated owner authentication
 * authority. A valid signature is necessary, not proof the key/operator was
 * actually commissioned independently of Core's database writer. */
const hex=z.string().regex(/^[a-f0-9]{64}$/);
const id=z.string().min(1).max(128).refine(s=>s.trim()===s&&!/[\u0000-\u001f\u007f]/u.test(s));
const ms=z.number().int().nonnegative().safe();
const claims=z.object({schema:z.literal("portal.c2-p7.owner-auth-attestation.candidate.v1"),
  issuer:id,audience:id,workspace_id:id,owner_user_id:id,session_id:id,session_generation:ms,
  cycle_sha256:hex,b1_sha256:hex,confirmation_sha256:hex,idempotency_sha256:hex,
  issued_at_ms:ms,expires_at_ms:ms}).strict();
const expectedSchema=claims.omit({schema:true,issuer:true,audience:true,issued_at_ms:true,expires_at_ms:true});
export type C2P7OwnerAuthClaims=z.infer<typeof claims>;
type Expected=Omit<C2P7OwnerAuthClaims,"schema"|"issuer"|"audience"|"issued_at_ms"|"expires_at_ms">;
const envelope=z.object({payload:z.string().min(1).max(16384),signature:z.string().min(1).max(256)}).strict();
const fail=():never=>{throw new Error("C2_P7_OWNER_AUTH_ATTESTATION_INVALID");};
const decode=(s:string):Buffer=>{if(!/^[A-Za-z0-9_-]+$/.test(s))return fail();
  const b=Buffer.from(s,"base64url");if(b.toString("base64url")!==s)return fail();return b;};
export class C2P7OwnerAuthAttestationCandidate {
  readonly #key:KeyObject;readonly #pin:string;readonly #issuer:string;readonly #audience:string;
  constructor(publicPem:string,pin:string,issuer:string,audience:string) {
    if(typeof publicPem!=="string"||publicPem.length>8192||
      !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(publicPem)||!hex.safeParse(pin).success||
      !id.safeParse(issuer).success||!id.safeParse(audience).success)throw new Error("C2_P7_OWNER_AUTH_ATTESTATION_INVALID");
    let key:KeyObject;try {key=createPublicKey(publicPem);}catch{throw new Error("C2_P7_OWNER_AUTH_ATTESTATION_INVALID");}
    if(key.type!=="public"||key.asymmetricKeyType!=="ed25519"||
      createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex")!==pin)throw new Error("C2_P7_OWNER_AUTH_ATTESTATION_INVALID");
    this.#key=key;this.#pin=pin;this.#issuer=issuer;this.#audience=audience;
  }
  keySha256():string{return this.#pin;}
  verify(proof:Uint8Array,expected:Expected,now:number):void {
    const wanted=expectedSchema.safeParse(expected);
    if(!wanted.success||!(proof instanceof Uint8Array)||proof.byteLength<1||proof.byteLength>24576||!Number.isSafeInteger(now)||now<0)return fail();
    const bytes=Buffer.from(proof);let raw:unknown,payload:Buffer|undefined,signature:Buffer|undefined;
    try {
    try {raw=JSON.parse(bytes.toString("utf8"));}catch{return fail();}
    const wrapped=envelope.safeParse(raw);
    if(!wrapped.success||!bytes.equals(Buffer.from(JSON.stringify(wrapped.data))))return fail();
    payload=decode(wrapped.data.payload);signature=decode(wrapped.data.signature);
    if(payload.length>12288||signature.length!==64||!verify(null,payload,this.#key,signature))return fail();
    try {raw=JSON.parse(payload.toString("utf8"));}catch{return fail();}
    const parsed=claims.safeParse(raw);if(!parsed.success||!payload.equals(Buffer.from(JSON.stringify(parsed.data))))return fail();
    const c=parsed.data;
    if(c.issuer!==this.#issuer||c.audience!==this.#audience||c.issued_at_ms>now||now>=c.expires_at_ms||
      c.expires_at_ms<=c.issued_at_ms||c.expires_at_ms-c.issued_at_ms>120000)return fail();
    for(const key of Object.keys(wanted.data) as Array<keyof Expected>)if(c[key]!==wanted.data[key])return fail();
    } finally {bytes.fill(0);payload?.fill(0);signature?.fill(0);}
  }
}
