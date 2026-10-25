/** Synthetic component vectors, NEVER source registration/accepted authority.
 * Core canonical grant + exact original fact uses the real shared digest codec. */
import { randomUUID } from "node:crypto";
import { accessDigest,canonicalSelector } from "../../src/execution-v2/access-digest";
import { grantBindingDigest,type CurrentAccessRelations } from "../../src/execution-v2/access-current-relations";
import type { ScopedAccessGrant,TsRootMembershipAcceptance } from "../../src/execution-v2/access.contract";
import { nativeRootBase,type NativeRootSourceBase,type NativeRootSourceAction } from "../../src/execution-v2/native-root-codec";

export function rootWireFacts(now=Date.now()) {
  const grant:ScopedAccessGrant={grant_id:"TEST_ONLY-root",subject_user_id:"TEST_ONLY-human",workspace_id:"TEST_ONLY-workspace",
    action:"business.read_all",effect:"ALLOW",selector:{kind:"ROOT_SCOPE",root_id:"TEST_ONLY-root-resource"},environments:["paper"],
    valid_from_ms:now-60000,valid_until_ms:now+600000,delegable_actions:[],issued_by:"TEST_ONLY-owner",parent_grant_id:null,
    revision:"TEST_ONLY-grant-revision",policy_revision:"TEST_ONLY-policy",revoked_at_ms:null,requires_ts_acceptance:true,
    ts_receipt:null,field_policy_ref:null};
  const fact:TsRootMembershipAcceptance={context:"REVIEWED_POLICY_ROOT",source:"TEST_ONLY-source",source_contract:"TEST_ONLY-native-original",
    trust_profile:"TEST_ONLY",receipt_id:"TEST_ONLY-receipt",portal_user_id:grant.subject_user_id,ts_user_id:"11111111-1111-1111-1111-111111111111",
    mapping_revision:"ts-user:11111111-1111-1111-1111-111111111111:9",human_requester_user_id:grant.issued_by,workspace_id:grant.workspace_id,
    action:grant.action,selector_digest:accessDigest(canonicalSelector(grant.selector)),environments:["paper"],previous_membership_revision:null,
    membership_revision:"TEST_ONLY-membership",effective_at_ms:now-1000,expires_at_ms:now+60000,outcome:"ACCEPTED",
    payload_digest:accessDigest("TEST_ONLY-payload"),provenance_ref:"TEST_ONLY-component-original",policy_revision:grant.policy_revision,
    policy_artifact_digest:accessDigest("TEST_ONLY-policy"),policy_install_digest:accessDigest("TEST_ONLY-install"),approval_ref:"TEST_ONLY-owner-review",
    grant_id:grant.grant_id,grant_digest:accessDigest(grant),expected_grant_revision:grant.revision};
  const portfolio={kind:"PORTFOLIO" as const,id:"TEST_ONLY-portfolio"},root={kind:"ROOT" as const,id:"TEST_ONLY-root-resource"};
  const relations:CurrentAccessRelations={schema_version:"pma.core-current-relations.v1",subject_user_id:grant.subject_user_id,
    workspace_id:grant.workspace_id,ts_user_id:fact.ts_user_id,mapping_revision:fact.mapping_revision,
    resources:[{environment:"paper",revision:"TEST_ONLY-resource-cut",own_alpha_ids:[],member_portfolio_ids:[portfolio.id],
      roots:[{root_id:root.id,revision:"TEST_ONLY-root-cut",complete:true,resources:[portfolio]}]}],
    grants:[{grant_id:grant.grant_id,binding_digest:grantBindingDigest(grant),accepted:fact,targets:[root,portfolio].map(resource=>({resource,environment:"paper",
      revision:"TEST_ONLY-native-original",native_reference_digest:accessDigest(["TEST_ONLY",resource]),valid_from_ms:now-1000,valid_until_ms:now+60000}))}]};
  return{grant,fact,relations};
}
export function rootWireBase(phase:"QUALIFY"|"COMMIT"="QUALIFY",overrides:Partial<NativeRootSourceBase>={}):Readonly<NativeRootSourceBase> {
  const {fact}=rootWireFacts(),key=accessDigest(["ROOT_RECEIPT",fact.source,fact.receipt_id]),request=accessDigest(fact);
  const mutation=phase==="COMMIT"?{mutation_id:randomUUID(),family:"QUALIFIED_ROOT_RECEIPT" as const,key_digest:key,request_digest:request,
    target_id:fact.workspace_id,binding_digest:accessDigest({family:"QUALIFIED_ROOT_RECEIPT",operation:"ROOT_RECEIPT",key_digest:key,request_digest:request,target_id:fact.workspace_id})}:null;
  const base={schema_version:"pma.registered-native-relations.request.v1" as const,phase,
    registration:{correspondence_id:"TEST_ONLY-correspondence",expected_version:"9007199254741001",manifest_sha256:"a".repeat(64)},
    original:{grant_id:fact.grant_id,accepted_fact_digest:request},mutation,deadline:new Date(Date.now()+30000).toISOString(),...overrides};
  const binding=overrides.binding??{lease_id:randomUUID(),attempt_id:randomUUID(),human_issuer:"TEST_ONLY-core",subject:fact.portal_user_id,
    workspace_id:fact.workspace_id,environment:"paper" as const,workload_id:"TEST_ONLY-native-root",operation:"MUTATION" as const,request_digest:"0".repeat(64)};
  const {request_digest:_digest,...meaning}=binding;
  return nativeRootBase({...base,binding:{...binding,request_digest:accessDigest({phase:base.phase,registration:base.registration,original:base.original,
    mutation:base.mutation,deadline:base.deadline,binding:meaning}).slice(7)}});
}
export function rootWireReply(base:Readonly<NativeRootSourceBase>,action:NativeRootSourceAction,relations=rootWireFacts().relations) {
  const common={schema_version:"pma.registered-native-relations.result.v1",binding:base.binding};
  if(action==="issue")return{...common,state:"ISSUED",relations,correspondence:{registry_revision:accessDigest("TEST_ONLY-registry"),
    manifest_sha256:base.registration.manifest_sha256,payload_sha256:"b".repeat(64),approval_ref:"TEST_ONLY-independent-review"},
    lease:{source_digest:"c".repeat(64),source_fingerprint:"d".repeat(64),expires_at:base.deadline}};
  if(action==="enter")return{...common,state:"ENTERED"};
  if(action==="unknown")return{...common,state:"UNKNOWN"};
  if(action==="status")return{...common,state:"OBSERVATION",recovery:{state:"RECORDED",phase:"ENTERED",source_digest:"c".repeat(64),
    expires_at:base.deadline,terminal_authority:false,release_permitted:false}};
  if(action==="cancel-unentered")return{...common,state:"CANCELLED",recovery:{state:"CANCELLED",cancellation_authority:true,release_permitted:true}};
  return{...common,state:"SETTLED",recovery:{state:"SETTLED",phase:"COMMITTED",terminal_authority:true,release_permitted:true}};
}
