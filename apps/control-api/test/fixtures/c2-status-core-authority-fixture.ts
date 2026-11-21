/** TEST_ONLY fixture: real Core access/command store with synthetic TS facts.
 * No command is sent, no production role is granted, no Edge ACK is created. */
import {createHash,randomUUID} from "node:crypto";
import type {Pool} from "pg";
import {AuthService} from "../../src/auth/auth.service";
import {loadConfig} from "../../src/config";
import {ExecutionAccessService} from "../../src/execution-v2/access.service";
import {AccessRepository} from "../../src/execution-v2/access.repository";
import {accessDigest,canonicalSelector,type AccessRelations} from "../../src/execution-v2/access-policy";
import {grantBindingDigest,type CurrentAccessRelations} from "../../src/execution-v2/access-current-relations";
import {tsRootMembershipAcceptance,type AccessActor,type ReviewedAccessPolicy,type ScopedAccessGrant} from "../../src/execution-v2/access.contract";
import type {AccessTrustProvider} from "../../src/execution-v2/access-trust";
import {commandAuthorization} from "../../src/execution-v2/command-trust";
import {intentHash} from "../../src/execution-v2/command.service";
import {CommandStore} from "../../src/execution-v2/command.store";
import type {CommandIntent} from "../../src/execution-v2/command.contract";
import {COMMAND_STATUS_PM_PATH,type CommandStatusInput,type CommandSourceAssertionRequest} from "../../src/execution-v2/command-source-assertion";
import {pmHttpRequestDigest} from "../../src/execution-v2/pm-http-request-binding";
import {PgCommandStatusOriginalFingerprints} from "../../src/execution-v2/command-status-original-fingerprints";

export async function makeTestStatusCoreAuthority(pool:Pool,actor:AccessActor,workspace:string,policy:ReviewedAccessPolicy,
  workload:string,gateway:string) {
  const now=Date.now(),portfolio="paper-portfolio-g1",next=(s:string)=>`TEST_ONLY:${s}:${randomUUID()}`;
  const source:CurrentAccessRelations={schema_version:"pma.core-current-relations.v1",subject_user_id:actor.user_id,
    workspace_id:workspace,ts_user_id:next("ts-user"),mapping_revision:next("mapping"),
    resources:[{environment:"paper",revision:next("cut"),own_alpha_ids:[],member_portfolio_ids:[portfolio],roots:[]}],grants:[]};
  const grant:ScopedAccessGrant={grant_id:next("grant"),workspace_id:workspace,subject_user_id:actor.user_id,
    action:"audit.read",effect:"ALLOW",selector:{kind:"EXPLICIT_RESOURCE_SET",resource_kind:"PORTFOLIO",ids:[portfolio]},
    environments:["paper"],valid_from_ms:now-60000,valid_until_ms:now+300000,delegable_actions:[],issued_by:actor.user_id,
    parent_grant_id:null,revision:next("grant-revision"),policy_revision:policy.revision,revoked_at_ms:null,
    requires_ts_acceptance:true,ts_receipt:null,field_policy_ref:null};
  const fact=tsRootMembershipAcceptance.parse({context:"REVIEWED_POLICY_ROOT",source:"TEST_ONLY:PM",source_contract:"TEST_ONLY:normalized",
    trust_profile:"TEST_ONLY:uninstalled",receipt_id:next("receipt"),portal_user_id:actor.user_id,ts_user_id:source.ts_user_id,
    mapping_revision:source.mapping_revision,human_requester_user_id:actor.user_id,workspace_id:workspace,action:"audit.read",
    selector_digest:accessDigest(canonicalSelector(grant.selector)),environments:["paper"],previous_membership_revision:null,
    membership_revision:next("membership"),effective_at_ms:now-30000,expires_at_ms:now+240000,outcome:"ACCEPTED",
    payload_digest:accessDigest(["TEST_ONLY payload",grant.grant_id]),provenance_ref:"TEST_ONLY:NOT_NATIVE_PM_ACCEPTANCE",
    policy_revision:policy.revision,policy_artifact_digest:policy.artifact_digest,policy_install_digest:accessDigest(["TEST_ONLY install",workspace]),
    approval_ref:policy.approval_ref,grant_id:grant.grant_id,grant_digest:accessDigest(grant),expected_grant_revision:grant.revision});
  grant.ts_receipt={receipt_id:fact.receipt_id,membership_revision:fact.membership_revision,mapping_revision:fact.mapping_revision,
    effective_at_ms:fact.effective_at_ms,expires_at_ms:fact.expires_at_ms};
  grant.ts_acceptance_digest=accessDigest(fact);
  source.grants.push({grant_id:grant.grant_id,binding_digest:grantBindingDigest(grant),accepted:fact,
    targets:[{environment:"paper",resource:{kind:"PORTFOLIO",id:portfolio},revision:next("leg"),
      native_reference_digest:accessDigest(["TEST_ONLY native",grant.grant_id]),valid_from_ms:now-20000,valid_until_ms:now+180000}]});
  await new AccessRepository(pool).saveGrant(grant,true);
  const relation:AccessRelations={qualified:true,revision:"TEST_ONLY:current-observation",own_alpha_ids:[],
    member_portfolio_ids:[portfolio],roots:{},membership:null,current_authority:source};
  const trust:AccessTrustProvider={verifyPolicy:async()=>null,verifyReceipt:async()=>null,relations:async()=>relation,
    verifiedHumanMapping:async()=>({ts_user_id:source.ts_user_id,revision:source.mapping_revision})};
  const auth=new AuthService(pool,loadConfig({PORTAL_ENV:"local",AUTH_MODE:"dev",DATABASE_URL:"postgres://TEST_ONLY/TEST_ONLY_core"}),{} as never);
  const access=new ExecutionAccessService(pool,auth,trust,true);
  const intent:CommandIntent={schema_version:"execution.capital-intent.v2",workspace_id:workspace,
    resource:{kind:"PORTFOLIO",id:portfolio},environment:"paper",expected_policy_revision:policy.revision,
    business_payload:{schema_version:"pma.capital-command.v1.1",operation:"TOP_UP",idempotency_key:next("key"),
      recipient_kind:"PORTFOLIO",currency:"USDT",reason:"TEST_ONLY stored original; no source send",amount:"10.000000000000000001",
      expected_versions:{budget:"9007199254740993",source:"2",parent:"3"}}};
  const authorization=commandAuthorization.parse({qualification:"OWNER_VERIFIED",reference:next("authorization"),
    authority_ref:"TEST_ONLY:PM",profile_ref:"TEST_ONLY:uninstalled",audience:"pma.management.v1",actor_id:actor.user_id,
    ts_user_id:source.ts_user_id,workload_ref:"TEST_ONLY:old-command-workload",delegation_ref:next("native-reference"),
    mapping_revision:grant.ts_receipt.mapping_revision,membership_revision:grant.ts_receipt.membership_revision,
    membership_receipt_ref:grant.ts_receipt.receipt_id,workspace_id:workspace,environment:"paper",operation:intent.business_payload.operation,
    resource_kind:intent.resource.kind,resource_id:portfolio,policy_revision:policy.revision,intent_hash:intentHash(actor,intent),
    source_intent_digest:accessDigest(["TEST_ONLY source-intent",intent]).slice(7),expected_versions:intent.business_payload.expected_versions,
    issued_at_ms:now-1000,expires_at_ms:now+50000,idempotency_retained_until_ms:now+240000,approval_required:false,
    required_approval_gate:null,approval:null,r2_basis:null,commit_checks:{human:true,workload:true,membership:true,
      scope:true,versions:true,capacity:true,approval:true}});
  const store=new CommandStore(pool),db=await pool.connect();let record;
  try {
    await db.query("BEGIN");record=await store.insert(db,actor.user_id,intent,intentHash(actor,intent),authorization);
    const attempt=await store.claim(db,record);if(!attempt)throw new Error("TEST_ONLY_CLAIM_REQUIRED");
    await db.query("COMMIT");
    record=await store.update(workspace,record.id,attempt,old=>({...old.status,delivery:"DELIVERY_UNKNOWN"}));
  } catch(error) {await db.query("ROLLBACK").catch(()=>{});throw error;} finally {db.release();}
  const original={gateway_ref:gateway,reference:next("edge-original"),authorization_digest:accessDigest(record.authorization),
    intent_hash:record.hash,request_digest:accessDigest(["TEST_ONLY Edge request",record.id]),
    transport_payload_digest:accessDigest(["TEST_ONLY source payload",record.id]),source_intent_digest:authorization.source_intent_digest,
    source_key:["TEST_ONLY:scope","TOP_UP",intent.business_payload.idempotency_key] as [string,string,string],target_ref:portfolio};
  const input:CommandStatusInput={authorization:record.authorization,intent:record.intent,actor,original,action:"STATUS",
    // Match the selected gateway binding's current-requester STATUS digest;
    // arbitrary synthetic digests cannot be resumed after context loss.
    call_digest:accessDigest({action:"STATUS",authority:"CURRENT_REQUESTER",requester_digest:accessDigest(actor),original,
      authorization_digest:accessDigest(record.authorization),intent_hash:record.authorization.intent_hash}),
    contract:{reference:"TEST_ONLY:contract",sha256:"a".repeat(64),
      edge_source_revision:"TEST_ONLY:source"},signal:new AbortController().signal};
  const pmBody=JSON.stringify({schema_version:"pma.edge-command-transport.v1",reference:next("pm-reference"),
    payload:{TEST_ONLY:"owning source mapping"},transport_payload_digest:original.transport_payload_digest});
  const requestDigest=pmHttpRequestDigest({method:"POST",raw_path:Buffer.from(COMMAND_STATUS_PM_PATH),
    query_string:Buffer.alloc(0),body:Buffer.from(pmBody)},{request_bytes:1048576});
  const body=JSON.stringify({schema_version:"execution.core-command-status-request.v1",original,call_digest:input.call_digest,
    pm_status_request_digest:requestDigest,core_request:{schema_version:"execution.core-pm-original.v1",action:"STATUS",
      operation:"TOP_UP",key:intent.business_payload.idempotency_key,payload:{TEST_ONLY:"source mapping"},
      payload_digest:original.transport_payload_digest,request_digest:original.request_digest}});
  const issue:CommandSourceAssertionRequest={schema_version:"portal.execution.command-source-assertion-request.v1",
    binding_digest:accessDigest({original,call:input.call_digest}),receiver_id:gateway,workload_id:workload,method:"POST",
    path:COMMAND_STATUS_PM_PATH,body_utf8:pmBody,request_digest:requestDigest,delivery_sequence:0,previous_lease_id:null};
  const coreRequest=JSON.stringify(JSON.parse(body).core_request);
  // Use the actual fingerprint writer with a synthetic, source-owned original.
  // This is not proof that Edge stored or returned the original.
  await new PgCommandStatusOriginalFingerprints(pool).pin({
    binding_digest:accessDigest({gateway_ref:original.gateway_ref,authorization_digest:original.authorization_digest,
      intent_hash:original.intent_hash,source_intent_digest:original.source_intent_digest}),original_digest:accessDigest(original),
    status_bytes_digest:`sha256:${createHash("sha256").update(coreRequest).digest("hex")}`,
    pm_status_request_digest:requestDigest,workspace_id:workspace,key_hash:accessDigest(intent.business_payload.idempotency_key),
    intent_hash:authorization.intent_hash,intent_digest:accessDigest(intent),authorization_digest:accessDigest(authorization),actor_id:actor.user_id});
  return {access,input,body,issue,record,source};
}
