import { ReviewedAccessPolicy, ScopedAccessGrant, TsMembershipAcceptance } from "./access.contract";
import { AccessRelations, unqualifiedAccessRelations } from "./access-policy";

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
  relations(userId:string,workspaceId:string):Promise<AccessRelations>;
  verifiedHumanMapping(portalUserId:string,workspaceId:string):Promise<null|{ts_user_id:string;revision:string}>;
}
export const unqualifiedAccessTrust:AccessTrustProvider={
  verifyPolicy:async()=>null,verifyReceipt:async()=>null,
  relations:async()=>unqualifiedAccessRelations(),verifiedHumanMapping:async()=>null,
};
