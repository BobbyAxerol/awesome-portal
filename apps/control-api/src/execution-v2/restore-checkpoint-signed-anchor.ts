import {createHash,createPublicKey,verify,type KeyObject} from "node:crypto";
import {z} from "zod";
import {RestoreCheckpointAuthorityReader,type VerifiedClosedObservation} from "./restore-checkpoint-authority-reader";
import type {RestoreCheckpointPin} from "./restore-checkpoint-authority";

/** UNMOUNTED. A signature authenticates the selected bytes to a pinned key;
 * it does not prove signer independence, old-holder fencing, complete source
 * or ACK census, or grant permission to restore. Key commissioning, rollback
 * protection across authority database rewrites, and custody remain separate. */
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const cluster=z.string().regex(/^(?:0|[1-9][0-9]{0,19})$/);
const gen=z.string().refine(v=>/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9_223_372_036_854_775_807n);
const label=z.string().min(1).max(128).refine(v=>v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v));
const millis=z.number().int().nonnegative().safe();
const payload=z.object({schema:z.literal("portal.restore-checkpoint-anchor.candidate.v1"),
  issuer:label,audience:label,checkpoint_id:uuid,source_system_identifier:cluster,authority_system_identifier:cluster,
  generation:gen,event_hash:digest,operation_id:uuid,issued_at_ms:millis,expires_at_ms:millis}).strict();
const envelope=z.object({payload:z.string().min(1).max(16384),signature:z.string().min(1).max(256)}).strict();
type Claims=z.infer<typeof payload>;
type Trust=Readonly<{issuer:string;audience:string;public_key_pem:string;public_key_sha256:string;pin:RestoreCheckpointPin}>;
const invalid=():never=>{throw new Error("V2_CHECKPOINT_ANCHOR_INVALID");};
const decode=(s:string):Buffer=>{if(!/^[A-Za-z0-9_-]+$/.test(s))return invalid();
  const b=Buffer.from(s,"base64url");if(b.toString("base64url")!==s)return invalid();return b;};
const readerMatches=RestoreCheckpointAuthorityReader.prototype.matchesPin;
const readClosed=RestoreCheckpointAuthorityReader.prototype.readLatestClosed;

export class RestoreCheckpointSignedAnchor {
  readonly #reader:RestoreCheckpointAuthorityReader;readonly #key:KeyObject;readonly #issuer:string;
  readonly #audience:string;readonly #pin:RestoreCheckpointPin;
  readonly #keyHash:string;
  constructor(reader:RestoreCheckpointAuthorityReader,trust:Trust) {
    if(!reader||Object.getPrototypeOf(reader)!==RestoreCheckpointAuthorityReader.prototype||!trust||
      !trust.pin||!uuid.safeParse(trust.pin.checkpoint_id).success||!cluster.safeParse(trust.pin.source_system_identifier).success||
      !cluster.safeParse(trust.pin.authority_system_identifier).success||trust.pin.source_system_identifier===trust.pin.authority_system_identifier||
      !readerMatches.call(reader,trust.pin)||!label.safeParse(trust.issuer).success||!label.safeParse(trust.audience).success||
      !digest.safeParse(trust.public_key_sha256).success||typeof trust.public_key_pem!=="string"||trust.public_key_pem.length>8192||
      !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(trust.public_key_pem))throw new Error("V2_CHECKPOINT_ANCHOR_INVALID");
    let key:KeyObject;try{key=createPublicKey(trust.public_key_pem);}catch{throw new Error("V2_CHECKPOINT_ANCHOR_INVALID");}
    if(key.type!=="public"||key.asymmetricKeyType!=="ed25519"||
      createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex")!==trust.public_key_sha256)throw new Error("V2_CHECKPOINT_ANCHOR_INVALID");
    this.#reader=reader;this.#key=key;this.#issuer=trust.issuer;this.#audience=trust.audience;
    this.#pin=Object.freeze({...trust.pin});this.#keyHash=trust.public_key_sha256;
  }
  /** Public identity only; it does not establish independent custody. */
  matchesTrust(pin:RestoreCheckpointPin,keyHash:string):boolean {
    return !!pin&&pin.checkpoint_id===this.#pin.checkpoint_id&&
      pin.source_system_identifier===this.#pin.source_system_identifier&&
      pin.authority_system_identifier===this.#pin.authority_system_identifier&&keyHash===this.#keyHash;
  }
  #verify(bytes:Uint8Array):Claims {
    if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>24576)return invalid();
    const copy=Buffer.from(bytes);let body:Buffer|undefined,signature:Buffer|undefined;let raw:unknown;
    try {
      try{raw=JSON.parse(copy.toString("utf8"));}catch{return invalid();}
      const wrapped=envelope.safeParse(raw);
      if(!wrapped.success||!copy.equals(Buffer.from(JSON.stringify(wrapped.data))))return invalid();
      body=decode(wrapped.data.payload);signature=decode(wrapped.data.signature);
      if(body.length>12288||signature.length!==64||!verify(null,body,this.#key,signature))return invalid();
      try{raw=JSON.parse(body.toString("utf8"));}catch{return invalid();}
      const parsed=payload.safeParse(raw);if(!parsed.success||!body.equals(Buffer.from(JSON.stringify(parsed.data))))return invalid();
      const c=parsed.data,now=Date.now();
      if(c.issuer!==this.#issuer||c.audience!==this.#audience||c.checkpoint_id!==this.#pin.checkpoint_id||
        c.source_system_identifier!==this.#pin.source_system_identifier||c.authority_system_identifier!==this.#pin.authority_system_identifier||
        c.issued_at_ms>now||now>=c.expires_at_ms||c.expires_at_ms<=c.issued_at_ms||c.expires_at_ms-c.issued_at_ms>120000)return invalid();
      return c;
    } finally {copy.fill(0);body?.fill(0);signature?.fill(0);}
  }
  async readSignedClosed(proof:Uint8Array,requiredAncestor?:{generation:string;event_hash:string;operation_id:string}):Promise<VerifiedClosedObservation & {anchor:"SIGNED_NOT_CUTOVER";anchor_expires_at_ms:number}> {
    const selected=this.#verify(proof);
    const result=await readClosed.call(this.#reader,{generation:selected.generation,event_hash:selected.event_hash,operation_id:selected.operation_id},requiredAncestor);
    // Refuse a proof which expires while the journal is being read.
    if(Date.now()>=selected.expires_at_ms)return invalid();
    return Object.freeze({...result,anchor:"SIGNED_NOT_CUTOVER" as const,anchor_expires_at_ms:selected.expires_at_ms});
  }
}
