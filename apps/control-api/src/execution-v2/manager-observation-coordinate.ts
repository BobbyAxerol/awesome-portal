import { z } from "zod";
import { ScopedReplayError } from "./scoped-replay-cursor";

/** Internal projection observation coordinate, NOT TS/global replay authority.
 * Original baseline identity survives all continuation/heartbeat tokens. */
const coordinate=z.object({
  version:z.literal(1),
  projection_epoch:z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$(?![\s\S])/),
  original_snapshot_id:z.string().regex(/^sha256:[a-f0-9]{64}$(?![\s\S])/),
  baseline_sequence:z.number().int().safe().min(1),
  after_sequence:z.number().int().safe().min(1),
}).strict().refine(v=>v.after_sequence>=v.baseline_sequence,"OBSERVATION_SEQUENCE_BEFORE_BASELINE");
export type ManagerObservationCoordinate=z.infer<typeof coordinate>;
const prefix="mo1.";

export function encodeManagerObservationCoordinate(value:ManagerObservationCoordinate):string{
  try{
    const parsed=coordinate.parse(value),token=prefix+Buffer.from(JSON.stringify(parsed),"utf8").toString("base64url");
    if(Buffer.byteLength(token)>2048)throw Error();
    return token;
  }catch{throw new ScopedReplayError("CURSOR_INVALID_OR_EXPIRED");}
}
export function decodeManagerObservationCoordinate(token:string):Readonly<ManagerObservationCoordinate>{
  try{
    if(typeof token!=="string"||Buffer.byteLength(token)>2048||!/^mo1\.[A-Za-z0-9_-]+$/.test(token))throw Error();
    const body=token.slice(prefix.length),bytes=Buffer.from(body,"base64url");
    if(bytes.toString("base64url")!==body)throw Error();
    const parsed=coordinate.parse(JSON.parse(bytes.toString("utf8")));
    if(encodeManagerObservationCoordinate(parsed)!==token)throw Error();
    return Object.freeze(parsed);
  }catch{throw new ScopedReplayError("CURSOR_INVALID_OR_EXPIRED");}
}
