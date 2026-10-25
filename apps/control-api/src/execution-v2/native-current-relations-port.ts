import type { ServerResponse } from "node:http";
import type { AccessActor,AccessAction,AccessResource } from "./access.contract";
import type { AccessRelations,AccessEvaluationContext } from "./access-policy";

/** Purpose-specific internal finite CURRENT port, not an ordinary transport
 * DTO or a ROOT/STREAM/command capability. Observe is advisory; only sendFinite
 * holds the real source fences through the physical Core egress boundary. */
export interface NativeCurrentRelationsPort {
  usesPool(pool:unknown):boolean;
  observe(input:{actor:AccessActor;workspace_id:string;principal_ids:readonly string[];
    action:AccessAction;resource_digest:string}):Promise<ReadonlyMap<string,AccessRelations>>;
  sendFinite(input:{actor:AccessActor;workspace_id:string;action:AccessAction;resources:readonly AccessResource[];
    response:ServerResponse;build:(context:AccessEvaluationContext)=>Promise<Buffer>;
    afterEnter?:()=>Promise<void>;beforeDispatch?:()=>void;
    assertAllowed:(context:AccessEvaluationContext)=>void}):Promise<void>;
}
