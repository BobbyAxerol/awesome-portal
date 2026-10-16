import { ReviewedAccessPolicy, ScopedAccessGrant, TsMembershipAcceptance } from "./access.contract";
import { AccessRelations, unqualifiedAccessRelations } from "./access-policy";
import type { ExecutionReadPublication, ExecutionReadPublicationRequest } from "./read-publication";
import type { QualifiedRootMembershipReceipt } from "./access-root-receipt";
import type { DelegatedReceiptScope, QualifiedDelegatedMembershipReceipt } from "./access-delegated-receipt";

export interface ReviewedPolicyArtifact {
  policy:ReviewedAccessPolicy;
  root_grants:ScopedAccessGrant[];
  provenance_ref:string;
}
/** Internal provider port. Authentication/signature/profile binding happens in a qualified adapter,
 * never by trusting JSON, a browser boolean or a fixture constant. No HTTP acceptance route exists. */
export interface AccessTrustProvider {
  verifyPolicy(input:unknown):Promise<ReviewedPolicyArtifact|null>;
  verifyReceipt(input:unknown):Promise<TsMembershipAcceptance|null>;
  /** Private reviewed-root intake, not an ordinary delegation or a TS wire.
   * The verifier resolves source I/O before Core locks and holds its current
   * mapping/membership revocation fence until release after COMMIT. */
  verifyRootReceipt?(input:unknown):Promise<QualifiedRootMembershipReceipt|null>;
  /** Ordinary asynchronous receipt authority, NOT the requester's old login.
   * All exact Core principal relations/mapping are reacquired outside Core
   * after drain recovery, then fenced through physical COMMIT/ROLLBACK. This
   * private optional port does not assert an existing TS wire capability. */
  qualifyDelegatedReceipt?(input:unknown,scope:DelegatedReceiptScope):Promise<QualifiedDelegatedMembershipReceipt|null>;
  relations(userId:string,workspaceId:string):Promise<AccessRelations>;
  verifiedHumanMapping(portalUserId:string,workspaceId:string):Promise<null|{ts_user_id:string;revision:string}>;
  /** Separate qualified proof: flat current IDs do not attest historical populations/joins. */
  readPublication?(request:ExecutionReadPublicationRequest):Promise<ExecutionReadPublication|null>;
}
export const unqualifiedAccessTrust:AccessTrustProvider={
  verifyPolicy:async()=>null,verifyReceipt:async()=>null,verifyRootReceipt:async()=>null,qualifyDelegatedReceipt:async()=>null,
  relations:async()=>unqualifiedAccessRelations(),verifiedHumanMapping:async()=>null,
};
