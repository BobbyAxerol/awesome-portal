import {createHash,createPublicKey,randomBytes,verify,type KeyObject} from "node:crypto";
import {performance} from "node:perf_hooks";
import {z} from "zod";
import type {RestoreCheckpointPin} from "./restore-checkpoint-authority";
import {RestoreCheckpointFreshWitness,type RestoreWitnessChallenge,type RestoreWitnessRequest} from "./restore-checkpoint-fresh-witness";

/** Unmounted protocol candidate, NOT restore authority. The floor signer must
 * actually maintain its head in an independently controlled non-rollbackable
 * system. A third key or a fresh signature does not establish that property. */
const uuid=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const cluster=z.string().regex(/^(?:0|[1-9][0-9]{0,19})$/);
const generation=z.string().refine(v=>/^[1-9][0-9]{0,18}$/.test(v)&&BigInt(v)<=9_223_372_036_854_775_807n);
const label=z.string().min(1).max(128).refine(v=>v.trim()===v&&!/[\u0000-\u001f\u007f]/u.test(v));
const millis=z.number().int().nonnegative().safe();
const claims=z.object({schema:z.literal("portal.restore-checkpoint-independent-floor.candidate.v1"),
  issuer:label,audience:label,checkpoint_id:uuid,source_system_identifier:cluster,authority_system_identifier:cluster,
  nonce:hash,generation,event_hash:hash,operation_id:uuid,issued_at_ms:millis,expires_at_ms:millis}).strict();
const envelope=z.object({payload:z.string().min(1).max(16384),signature:z.string().min(1).max(256)}).strict();
type FloorClaims=z.infer<typeof claims>;
type Trust=Readonly<{pin:RestoreCheckpointPin;anchor_key_sha256:string;witness_key_sha256:string;
  issuer:string;audience:string;public_key_pem:string;public_key_sha256:string;timeout_ms:number}>;
export type RestoreIndependentFloorRequest=(challenge:RestoreWitnessChallenge,signal:AbortSignal)=>Promise<Uint8Array>;
const invalid=():never=>{throw Error("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");};
const decode=(s:string):Buffer=>{if(!/^[A-Za-z0-9_-]+$/.test(s))return invalid();
  const b=Buffer.from(s,"base64url");if(b.toString("base64url")!==s)return invalid();return b;};
const matchesTrust=RestoreCheckpointFreshWitness.prototype.matchesTrust;
const readFresh=RestoreCheckpointFreshWitness.prototype.readFreshClosed;

export class RestoreCheckpointIndependentFloor {
  #active=false;
  #pending=0;
  /** Retain admission until the underlying callback really settles, even if
   * the deadline wins and the callback ignores its AbortSignal. */
  #track<T>(start:()=>Promise<T>):Promise<T> {
    this.#pending++;
    return Promise.resolve().then(start).finally(()=>{this.#pending--;});
  }
  readonly #witness:RestoreCheckpointFreshWitness;readonly #pin:RestoreCheckpointPin;readonly #key:KeyObject;
  readonly #issuer:string;readonly #audience:string;readonly #timeout:number;
  constructor(witness:RestoreCheckpointFreshWitness,trust:Trust) {
    if(!witness||Object.getPrototypeOf(witness)!==RestoreCheckpointFreshWitness.prototype||!trust||!trust.pin||
      !uuid.safeParse(trust.pin.checkpoint_id).success||!cluster.safeParse(trust.pin.source_system_identifier).success||
      !cluster.safeParse(trust.pin.authority_system_identifier).success||
      !hash.safeParse(trust.anchor_key_sha256).success||!hash.safeParse(trust.witness_key_sha256).success||
      !hash.safeParse(trust.public_key_sha256).success||new Set([trust.anchor_key_sha256,trust.witness_key_sha256,trust.public_key_sha256]).size!==3||
      !matchesTrust.call(witness,trust.pin,trust.anchor_key_sha256,trust.witness_key_sha256)||
      !label.safeParse(trust.issuer).success||!label.safeParse(trust.audience).success||
      !Number.isSafeInteger(trust.timeout_ms)||trust.timeout_ms<100||trust.timeout_ms>5000||
      typeof trust.public_key_pem!=="string"||trust.public_key_pem.length>8192||
      !/^-----BEGIN PUBLIC KEY-----\r?\n[A-Za-z0-9+/=\r\n]+-----END PUBLIC KEY-----\r?\n?$/.test(trust.public_key_pem))throw Error("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");
    let key:KeyObject;try{key=createPublicKey(trust.public_key_pem);}catch{throw Error("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");}
    if(key.type!=="public"||key.asymmetricKeyType!=="ed25519"||
      createHash("sha256").update(key.export({type:"spki",format:"der"})).digest("hex")!==trust.public_key_sha256)throw Error("V2_CHECKPOINT_INDEPENDENT_FLOOR_INVALID");
    this.#witness=witness;this.#pin=Object.freeze({...trust.pin});this.#key=key;
    this.#issuer=trust.issuer;this.#audience=trust.audience;this.#timeout=trust.timeout_ms;
  }
  #verify(bytes:Uint8Array,challenge:RestoreWitnessChallenge,started:number):FloorClaims {
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
  async readClosed(anchorProof:Uint8Array,witnessRequest:RestoreWitnessRequest,floorRequest:RestoreIndependentFloorRequest) {
    if(!(anchorProof instanceof Uint8Array)||anchorProof.byteLength<1||anchorProof.byteLength>24576||
      typeof witnessRequest!=="function"||typeof floorRequest!=="function")return invalid();
    if(this.#active||this.#pending)throw Error("V2_CHECKPOINT_INDEPENDENT_FLOOR_BUSY");
    this.#active=true;
    const captured=Buffer.from(anchorProof),started=Date.now(),monotonic=performance.now(),controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error("V2_CHECKPOINT_INDEPENDENT_FLOOR_TIMEOUT"));},this.#timeout);});
      const sample=async()=>{const sampleStart=Date.now(),challenge=Object.freeze({...this.#pin,nonce:randomBytes(32).toString("hex")});
        const bytes=await Promise.race([this.#track(()=>floorRequest(challenge,controller.signal)),deadline]);
        return this.#verify(bytes,challenge,sampleStart);};
      const before=await sample();
      const floor=Object.freeze({generation:before.generation,event_hash:before.event_hash,operation_id:before.operation_id});
      const observed=await Promise.race([this.#track(()=>readFresh.call(this.#witness,captured,witnessRequest,floor)),deadline]);
      const after=await sample();
      if(after.generation!==floor.generation||after.event_hash!==floor.event_hash||after.operation_id!==floor.operation_id||
        performance.now()-monotonic>this.#timeout||Date.now()<started-1000||Date.now()>=before.expires_at_ms||
        Date.now()>=after.expires_at_ms||Date.now()>=observed.anchor_expires_at_ms)return invalid();
      return Object.freeze({...observed,independent_floor:"ATTESTED_NOT_CUTOVER" as const,floor});
    } finally {if(timer)clearTimeout(timer);controller.abort();captured.fill(0);this.#active=false;}
  }
}
