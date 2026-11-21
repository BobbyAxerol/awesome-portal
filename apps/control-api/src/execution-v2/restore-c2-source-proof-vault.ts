import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** UNMOUNTED recovery candidate, not an authority checkpoint or cutover.
 * Source-signed lease proofs are replay-sensitive: keep them encrypted under
 * an independently provisioned key, never store a human bearer here, and
 * never put plaintext or the encryption key in logs, API output or Git.
 * Authenticating a vault record does not prove ACK delivery or source census.
 */
export type SourceProofKind = "SIGNED_SOURCE_ENTER" | "SIGNED_SOURCE_UNKNOWN" | "SIGNED_SOURCE_TERMINAL";
export type SourceProofBinding = Readonly<{ custody_id:string; operation_id:string; generation:string;
  kind:SourceProofKind; lease_id:string; proof_hash:string }>;
export type SealedSourceProof = Readonly<{ version:"c2-source-proof-v1"; key_id:string;
  nonce:string; ciphertext:string; tag:string }>;

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const decimal=/^[1-9][0-9]{0,18}$/;
const hex=/^[0-9a-f]{64}$/;
const identifier=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const fail=():never=>{throw new Error("C2_SOURCE_PROOF_VAULT_INVALID");};
function capture(b:SourceProofBinding):SourceProofBinding {
  if(!b||!uuid.test(b.custody_id)||!uuid.test(b.operation_id)||!decimal.test(b.generation)||
    BigInt(b.generation)>9223372036854775807n||!uuid.test(b.lease_id)||!hex.test(b.proof_hash)||
    !["SIGNED_SOURCE_ENTER","SIGNED_SOURCE_UNKNOWN","SIGNED_SOURCE_TERMINAL"].includes(b.kind))return fail();
  return Object.freeze({custody_id:b.custody_id,operation_id:b.operation_id,generation:b.generation,
    kind:b.kind,lease_id:b.lease_id,proof_hash:b.proof_hash});
}
const aad=(b:SourceProofBinding,keyId:string)=>Buffer.from(JSON.stringify(["portal.c2-source-proof-vault.v1",
  keyId,b.custody_id,b.operation_id,b.generation,b.kind,b.lease_id,b.proof_hash]),"utf8");
function decode(s:unknown,length?:number):Buffer {
  if(typeof s!=="string"||!s.length||s.length>12000||!/^[A-Za-z0-9_-]+$/.test(s))return fail();
  const b=Buffer.from(s,"base64url");
  if(b.toString("base64url")!==s||(length!==undefined&&b.length!==length))return fail();
  return b;
}

export class C2SourceProofVault {
  readonly #key:Buffer;
  readonly #keyId:string;
  constructor(key:Uint8Array,keyId:string) {
    if(!(key instanceof Uint8Array)||key.byteLength!==32||typeof keyId!=="string"||!identifier.test(keyId)||key.every(b=>b===0))
      throw new Error("C2_SOURCE_PROOF_VAULT_INVALID");
    this.#key=Buffer.from(key);this.#keyId=keyId;
  }
  /** Called only AFTER the actual source signature and original binding have
   * been validated. The caller must atomically store the event + envelope. */
  seal(binding:SourceProofBinding,proof:string):SealedSourceProof {
    const b=capture(binding);
    if(typeof proof!=="string"||!proof.length||Buffer.byteLength(proof,"utf8")>8192||
      createHash("sha256").update(proof,"utf8").digest("hex")!==b.proof_hash)return fail();
    const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",this.#key,nonce);
    cipher.setAAD(aad(b,this.#keyId));
    const ciphertext=Buffer.concat([cipher.update(proof,"utf8"),cipher.final()]);
    return Object.freeze({version:"c2-source-proof-v1",key_id:this.#keyId,nonce:nonce.toString("base64url"),
      ciphertext:ciphertext.toString("base64url"),tag:cipher.getAuthTag().toString("base64url")});
  }
  /** Returns sensitive source proof bytes to trusted recovery code only. The
   * caller must erase the buffer after use; this is NOT a permission to replay. */
  open(binding:SourceProofBinding,value:unknown):Buffer {
    const b=capture(binding);
    let provisional:Buffer|undefined,tail:Buffer|undefined,plaintext:Buffer|undefined;
    try {
      if(!value||typeof value!=="object"||Array.isArray(value))return fail();
      const keys=Object.keys(value).sort();
      if(JSON.stringify(keys)!==JSON.stringify(["ciphertext","key_id","nonce","tag","version"]))return fail();
      const e=value as SealedSourceProof;
      if(e.version!=="c2-source-proof-v1"||e.key_id!==this.#keyId)return fail();
      const nonce=decode(e.nonce,12),tag=decode(e.tag,16),ciphertext=decode(e.ciphertext);
      if(ciphertext.length>8192)return fail();
      const decipher=createDecipheriv("aes-256-gcm",this.#key,nonce);
      decipher.setAAD(aad(b,this.#keyId));decipher.setAuthTag(tag);
      provisional=decipher.update(ciphertext);tail=decipher.final();
      plaintext=Buffer.concat([provisional,tail]);provisional.fill(0);tail.fill(0);
      const expected=Buffer.from(b.proof_hash,"hex"),actual=createHash("sha256").update(plaintext).digest();
      if(!timingSafeEqual(actual,expected)){plaintext.fill(0);return fail();}
      return plaintext;
    } catch {provisional?.fill(0);tail?.fill(0);plaintext?.fill(0);return fail();}
  }
}
