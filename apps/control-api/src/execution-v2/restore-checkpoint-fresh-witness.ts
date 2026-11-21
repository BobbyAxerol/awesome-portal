import {createHash,createPublicKey,randomBytes,verify,type KeyObject} from "node:crypto";
import {performance} from "node:perf_hooks";
import {z} from "zod";
import {RestoreCheckpointSignedAnchor} from "./restore-checkpoint-signed-anchor";
import type {RestoreCheckpointPin} from "./restore-checkpoint-authority";
import type {VerifiedClosedObservation} from "./restore-checkpoint-authority-reader";

/** UNMOUNTED protocol preparation, never a restore permit. A separately
 * operated signer MUST read its own durable, monotonic head before signing.
 * A second key, challenge or signature alone cannot prove that condition. */
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const cluster=z.string().regex(/^(?:0|[1-9][0-9]{0,19})$/);
const generation=z.string().refine(v=>/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9_223_372_036_854_775_807n);
const label=z.string().min(1).max(128).refine(v=>v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v));
const timestamp=z.number().int().nonnegative().safe();
const ancestorSchema=z.object({generation,event_hash:hash,operation_id:uuid}).strict();
const claims=z.object({schema:z.literal("portal.restore-checkpoint-fresh-witness.candidate.v1"),
  issuer:label,audience:label,checkpoint_id:uuid,source_system_identifier:cluster,authority_system_identifier:cluster,
  nonce:hash,generation,event_hash:hash,operation_id:uuid,issued_at_ms:timestamp,expires_at_ms:timestamp}).strict();
const envelope=z.object({payload:z.string().min(1).max(16384),signature:z.string().min(1).max(256)}).strict();
type WitnessClaims=z.infer<typeof claims>;
export type RestoreWitnessChallenge=Readonly<RestoreCheckpointPin & {nonce:string}>;
type Trust=Readonly<{pin:RestoreCheckpointPin;anchor_key_sha256:string;issuer:string;audience:string;
  public_key_pem:string;public_key_sha256:string;timeout_ms:number}>;
export type RestoreWitnessRequest=(challenge:RestoreWitnessChallenge,signal:AbortSignal)=>Promise<Uint8Array>;
const invalid=():never=>{throw new Error("V2_CHECKPOINT_WITNESS_INVALID");};
const decode=(s:string):Buffer=>{if(!/^[A-Za-z0-9_-]+$/.test(s))return invalid();
  const b=Buffer.from(s,"base64url");if(b.toString("base64url")!==s)return invalid();return b;};
const matchesTrust=RestoreCheckpointSignedAnchor.prototype.matchesTrust;
const readSigned=RestoreCheckpointSignedAnchor.prototype.readSignedClosed;

export class RestoreCheckpointFreshWitness {
  #active=false;
  #pending=0;
  /** A timeout/abort is not proof that a callback or DB read has stopped. */
  #track<T>(start:()=>Promise<T>):Promise<T> {
    this.#pending++;
    return Promise.resolve().then(start).finally(()=>{this.#pending--;});
  }
  readonly #anchor:RestoreCheckpointSignedAnchor;readonly #pin:RestoreCheckpointPin;readonly #key:KeyObject;
  readonly #issuer:string;readonly #audience:string;readonly #timeout:number;
  readonly #anchorHash:string;readonly #witnessHash:string;
  constructor(anchor:RestoreCheckpointSignedAnchor,trust:Trust) {
    if(!anchor||Object.getPrototypeOf(anchor)!==RestoreCheckpointSignedAnchor.prototype||!trust||!trust.pin||
      !uuid.safeParse(trust.pin.checkpoint_id).success||!cluster.safeParse(trust.pin.source_system_identifier).success||
      !cluster.safeParse(trust.pin.authority_system_identifier).success||
      trust.pin.source_system_identifier===trust.pin.authority_system_identifier||
      !hash.safeParse(trust.anchor_key_sha256).success||!hash.safeParse(trust.public_key_sha256).success||
      trust.anchor_key_sha256===trust.public_key_sha256||!matchesTrust.call(anchor,trust.pin,trust.anchor_key_sha256)||
      !label.safeParse(trust.issuer).success||!label.safeParse(trust.audience).success||
      !Number.isSafeInteger(trust.timeout_ms)||trust.timeout_ms<100||trust.timeout_ms>5000||
      typeof trust.public_key_pem!=="string"||trust.public_key_pem.length>8192||
      !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(trust.public_key_pem))throw new Error("V2_CHECKPOINT_WITNESS_INVALID");
    let key:KeyObject;try{key=createPublicKey(trust.public_key_pem);}catch{throw new Error("V2_CHECKPOINT_WITNESS_INVALID");}
    if(key.type!=="public"||key.asymmetricKeyType!=="ed25519"||
      createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex")!==trust.public_key_sha256)throw new Error("V2_CHECKPOINT_WITNESS_INVALID");
    this.#anchor=anchor;this.#pin=Object.freeze({...trust.pin});this.#key=key;
    this.#issuer=trust.issuer;this.#audience=trust.audience;this.#timeout=trust.timeout_ms;
    this.#anchorHash=trust.anchor_key_sha256;this.#witnessHash=trust.public_key_sha256;
  }
  matchesTrust(pin:RestoreCheckpointPin,anchorHash:string,witnessHash:string):boolean {
    return !!pin&&pin.checkpoint_id===this.#pin.checkpoint_id&&
      pin.source_system_identifier===this.#pin.source_system_identifier&&
      pin.authority_system_identifier===this.#pin.authority_system_identifier&&
      anchorHash===this.#anchorHash&&witnessHash===this.#witnessHash;
  }
  #verify(bytes:Uint8Array,challenge:RestoreWitnessChallenge,started:number):WitnessClaims {
    if(!(bytes instanceof Uint8Array)||bytes.byteLength<1||bytes.byteLength>24576)return invalid();
    const copy=Buffer.from(bytes);let body:Buffer|undefined,signature:Buffer|undefined;let raw:unknown;
    try {
      try{raw=JSON.parse(copy.toString("utf8"));}catch{return invalid();}
      const wrapped=envelope.safeParse(raw);
      if(!wrapped.success||!copy.equals(Buffer.from(JSON.stringify(wrapped.data))))return invalid();
      body=decode(wrapped.data.payload);signature=decode(wrapped.data.signature);
      if(body.length>12288||signature.length!==64||!verify(null,body,this.#key,signature))return invalid();
      try{raw=JSON.parse(body.toString("utf8"));}catch{return invalid();}
      const parsed=claims.safeParse(raw);if(!parsed.success||!body.equals(Buffer.from(JSON.stringify(parsed.data))))return invalid();
      const c=parsed.data,now=Date.now();
      if(c.issuer!==this.#issuer||c.audience!==this.#audience||c.checkpoint_id!==challenge.checkpoint_id||
        c.source_system_identifier!==challenge.source_system_identifier||c.authority_system_identifier!==challenge.authority_system_identifier||
        c.nonce!==challenge.nonce||now<started-1000||c.issued_at_ms<started-1000||c.issued_at_ms>now||
        c.expires_at_ms<=now||c.expires_at_ms<=c.issued_at_ms||c.expires_at_ms-c.issued_at_ms>10000)return invalid();
      return c;
    } finally {copy.fill(0);body?.fill(0);signature?.fill(0);}
  }
  async readFreshClosed(anchorProof:Uint8Array,request:RestoreWitnessRequest,requiredAncestor?:unknown):Promise<VerifiedClosedObservation &
    {anchor:"SIGNED_NOT_CUTOVER";anchor_expires_at_ms:number;witness:"FRESH_SIGNED_NOT_CUTOVER"}> {
    if(typeof request!=="function"||!(anchorProof instanceof Uint8Array)||anchorProof.byteLength<1||anchorProof.byteLength>24576)return invalid();
    if(this.#active||this.#pending)throw new Error("V2_CHECKPOINT_WITNESS_BUSY");
    // Snapshot the full exact ancestor, not merely a generation. A caller may
    // use this only with an independently obtained monotonic floor: this method
    // itself still does not authenticate that floor or authorize cutover.
    const parsedAncestor=requiredAncestor===undefined?undefined:ancestorSchema.safeParse(requiredAncestor);
    if(parsedAncestor&&!parsedAncestor.success)return invalid();
    this.#active=true;
    const capturedAncestor=parsedAncestor?.success?Object.freeze({...parsedAncestor.data}):undefined;
    // Snapshot caller-owned bytes before an asynchronous request; the caller
    // must not be able to substitute another anchor while it is in flight.
    const capturedAnchor=Buffer.from(anchorProof);
    const started=Date.now(),monotonic=performance.now(),controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error("V2_CHECKPOINT_WITNESS_TIMEOUT"));},this.#timeout);});
      const sample=async()=>{
        const sampleStart=Date.now();
        const challenge=Object.freeze({...this.#pin,nonce:randomBytes(32).toString("hex")});
        const bytes=await Promise.race([this.#track(()=>request(challenge,controller.signal)),deadline]);
        return this.#verify(bytes,challenge,sampleStart);
      };
      const before=await sample();
      const observed=await Promise.race([this.#track(()=>readSigned.call(this.#anchor,capturedAnchor,capturedAncestor)),deadline]);
      const after=await sample();
      const same=(w:WitnessClaims)=>w.generation===observed.generation&&w.event_hash===observed.event_hash&&w.operation_id===observed.operation_id;
      if(performance.now()-monotonic>this.#timeout||Date.now()<started-1000||Date.now()>=before.expires_at_ms||
        Date.now()>=after.expires_at_ms||Date.now()>=observed.anchor_expires_at_ms||!same(before)||!same(after))return invalid();
      return Object.freeze({...observed,witness:"FRESH_SIGNED_NOT_CUTOVER" as const});
    } finally {if(timer)clearTimeout(timer);controller.abort();capturedAnchor.fill(0);this.#active=false;}
  }
}
