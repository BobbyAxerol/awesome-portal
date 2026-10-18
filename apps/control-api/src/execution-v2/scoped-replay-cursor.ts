import { createCipheriv,createDecipheriv,createHash,randomBytes } from "node:crypto";
import { accessDigest } from "./access-policy";
import { scopedReplayBinding,type ScopedReplayBinding,type ScopedRealtimeFrame } from "./realtime.contract";

export class ScopedReplayError extends Error {
  constructor(readonly code:NonNullable<ScopedRealtimeFrame["reason_code"]>){super("Execution updates require a current authorized snapshot.");}
}
type CodecState={active:string;keys:ReadonlyMap<string,Buffer>;ttlMs:number;now:()=>number;};
// Actual construction only. No public property, inherited method, clone or
// custom decoder can reconstruct this private fixed key-ring/clock closure.
const codecs=new WeakMap<object,CodecState>();
function stateOf(value:unknown):CodecState {
  const state=value&&typeof value==="object"?codecs.get(value):undefined;
  if(!state)throw new ScopedReplayError("CURSOR_INVALID_OR_EXPIRED");
  return state;
}
/** Original encrypted cursor algorithm/domain/key rotation/padding, factored
 * out of realtime to keep read-scope imports acyclic. No installed key/source
 * authority follows from constructing this private codec. */
export class ScopedReplayCursorCodec {
  constructor(active:string,keys:Readonly<Record<string,string>>,ttlMs:number,now:()=>number=Date.now){
    if(!/^[A-Za-z0-9_-]{1,32}$/.test(active)||!Number.isSafeInteger(ttlMs)||ttlMs<1||ttlMs>300_000||
      !Object.hasOwn(keys,active)||Object.keys(keys).length>4||Object.entries(keys).some(([id,key])=>
        !/^[A-Za-z0-9_-]{1,32}$/.test(id)||Buffer.byteLength(key)<32))throw new Error("REPLAY_CURSOR_CONFIG_INVALID");
    const captured=new Map(Object.entries(keys).map(([id,key])=>[id,createHash("sha256").update("portal-scoped-replay-v1\0").update(key).digest()]));
    codecs.set(this,Object.freeze({active,keys:captured,ttlMs,now}));
  }
  encode(binding:ScopedReplayBinding,sourceCursor:string):string{
    return encodeScopedReplayContinuation(this,binding,sourceCursor);
  }
  decode(token:string,binding:ScopedReplayBinding):string{
    return decodeScopedReplayContinuation(this,token,binding);
  }
}
/** Internal intrinsic entry points: never invoke an overridden instance or
 * prototype method. The original state is captured at real construction. */
export function encodeScopedReplayContinuation(codec:ScopedReplayCursorCodec,binding:ScopedReplayBinding,sourceCursor:string):string{
  const s=stateOf(codec);
  scopedReplayBinding.parse(binding);
  if(!/^[A-Za-z0-9._~-]+$/.test(sourceCursor)||Buffer.byteLength(sourceCursor)>2048)throw new ScopedReplayError("CURSOR_INVALID_OR_EXPIRED");
  const issued=s.now(),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",s.keys.get(s.active)!,iv);
  cipher.setAAD(Buffer.from(`portal-scoped-replay.v1:${s.active}`));
  if(!Number.isSafeInteger(issued)||issued<0||!Number.isSafeInteger(issued+s.ttlMs))throw new Error("REPLAY_CLOCK_INVALID");
  const json=Buffer.from(JSON.stringify({binding:accessDigest(binding),source:sourceCursor,issued,expires:issued+s.ttlMs}));
  const payload=randomBytes(2816);payload.writeUInt32BE(json.length);json.copy(payload,4);
  const data=Buffer.concat([cipher.update(payload),cipher.final()]);
  return ["sr1",s.active,iv.toString("base64url"),data.toString("base64url"),cipher.getAuthTag().toString("base64url")].join(".");
}
export function decodeScopedReplayContinuation(codec:ScopedReplayCursorCodec,token:string,binding:ScopedReplayBinding):string{
  const s=stateOf(codec);
  try{
    scopedReplayBinding.parse(binding);
    if(token.length>4096||!/^[A-Za-z0-9_.-]+$/.test(token))throw Error();
    const [version,id,iv,ciphertext,tag,...extra]=token.split("."),key=s.keys.get(id);
    if(version!=="sr1"||!key||extra.length)throw Error();
    const nonce=Buffer.from(iv,"base64url"),authTag=Buffer.from(tag,"base64url");
    const data=Buffer.from(ciphertext,"base64url");
    if(nonce.length!==12||authTag.length!==16||data.length!==2816||
      nonce.toString("base64url")!==iv||authTag.toString("base64url")!==tag||data.toString("base64url")!==ciphertext)throw Error();
    const decipher=createDecipheriv("aes-256-gcm",key,nonce);
    decipher.setAAD(Buffer.from(`portal-scoped-replay.v1:${id}`));decipher.setAuthTag(authTag);
    const payload=Buffer.concat([decipher.update(data),decipher.final()]),length=payload.readUInt32BE();
    if(length>2812)throw Error();
    const raw=JSON.parse(payload.subarray(4,4+length).toString("utf8"));
    const now=s.now();
    if(!Number.isSafeInteger(now)||now<0||Object.keys(raw).sort().join()!=="binding,expires,issued,source"||raw.binding!==accessDigest(binding)||
      !Number.isSafeInteger(raw.issued)||!Number.isSafeInteger(raw.expires)||raw.issued>now||raw.expires<=now||
      raw.expires-raw.issued<1||raw.expires-raw.issued>300_000||typeof raw.source!=="string"||!raw.source||
      Buffer.byteLength(raw.source)>2048)throw Error();
    return raw.source;
  }catch{throw new ScopedReplayError("CURSOR_INVALID_OR_EXPIRED");}
}
