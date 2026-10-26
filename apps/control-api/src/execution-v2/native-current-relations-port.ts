import type { ServerResponse } from "node:http";
import type { AccessActor,AccessAction,AccessResource } from "./access.contract";
import type { AccessRelations,AccessEvaluationContext } from "./access-policy";

export type NativeCurrentRelationsPurpose=Readonly<{action:AccessAction;resources:readonly AccessResource[]}>;
/** Ordered, bounded purposes of ONE physical finite response. A separate
 * context is retained for every purpose; a source may narrow its relations by
 * action/resource and those cuts must never overwrite one another. */
export interface NativeCurrentRelationsComposition {
  actor:AccessActor;workspace_id:string;purposes:readonly NativeCurrentRelationsPurpose[];scope_digest:string;
  response:ServerResponse;build:(contexts:readonly AccessEvaluationContext[])=>Promise<Buffer>;
  afterEnter?:()=>Promise<void>;beforeDispatch?:()=>void;
  assertAllowed:(contexts:readonly AccessEvaluationContext[])=>void;
}

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
  /** Optional for older private providers. A mixed-purpose caller must fail
   * closed when absent, not borrow the first purpose or return a detached DTO. */
  sendFiniteComposition?(input:NativeCurrentRelationsComposition):Promise<void>;
}
