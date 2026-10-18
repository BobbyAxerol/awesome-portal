/** PRIVATE original08 stable BFF consumer / NOT_RUN / NOT_MOUNTED.
 * Actual SessionGuard actor -> current SAME-Core Manager READ -> existing safe
 * DTO preparation -> sole selected native Candidate -> physical final send.
 * Fetch-before-ENTER is intentional. Private cache/mdc1 writes are not browser
 * delivery. The native epoch below is correlation ONLY, never a permission.
 * No ROOT, fake ADMIN, grant installation, source publication or new transport.
 */
import { createHash, randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { Pool } from "pg";
import { MaximumDataOperationError, MaximumDataOperationService,
  type MaximumDataDeploymentQuery, type MaximumDataOperationPrincipal, type NativeManagerOperation } from "../execution/maximum-data-operation.service";
export { nativeManagerDataEpoch, type NativeManagerOperation } from "../execution/maximum-data-operation.service";
import { MAXIMUM_DATA_DEPLOYMENT_OPERATION, maximumDataDeploymentBinding } from "../execution/maximum-data-operation.registry";
import { managerRelationOperationByRoute, managerRelationProfileBinding } from "../execution/eds11r-manager-relation.registry";
import { MAXIMUM_DATA_INTAKE_V1 } from "../execution/maximum-data-intake";
import { accessDigest } from "./access-policy";
import type { AccessActor } from "./access.contract";
import type { composeNativeCore, NativeCorePersonProfileSelector, NativeCoreSelection } from "./native-core-composition";
import { selectedNativeBusinessReadSelection, selectedNativeBusinessReadInstallationExpiresAtMs,
  type SelectedNativeBusinessReadSource } from "./native-business-read-selected-source";
import type { NativeBusinessReadBase } from "./native-business-read-codec";
import { managerNativeReplayContext,type AuthorizedManagerNativeNoticeScope } from "./read-scope";

type Composition = Pick<Awaited<ReturnType<typeof composeNativeCore>>, "selectedCandidate">;
type Selection = ReturnType<typeof selectedNativeBusinessReadSelection>;
type Entry = Readonly<{ selector:NativeCorePersonProfileSelector; source:Selection; selectedSource:SelectedNativeBusinessReadSource;
  ttl_ms:number; installation_until_ms:number; maximum_response_bytes:number }>;
export interface NativeManagerRequest {
  principal:MaximumDataOperationPrincipal;
  operation:NativeManagerOperation;
  query:MaximumDataDeploymentQuery;
}
const unavailable = () => new MaximumDataOperationError("NATIVE_MANAGER_READ_UNAVAILABLE", 503);
const denied = () => new MaximumDataOperationError("NATIVE_MANAGER_READ_DENIED", 403);
const raw = (value:string) => value.startsWith("sha256:") ? value.slice(7) : value;
const bodyDigest = (body:Buffer) => `sha256:${createHash("sha256").update(body).digest("hex")}`;

/** Construct only from the SAME reviewed private composition/selections used
 * by the app's mutation/recovery coordinator. Construction is inert. Known
 * selected people never fall through to the legacy route on a native DENY,
 * missing mode/profile, expired source, policy error or installation error. */
export class NativeManagerReadConsumer {
  private readonly entries:readonly Entry[];
  private readonly knownPeople:ReadonlySet<string>;
  constructor(private readonly pool:Pool, private readonly operations:MaximumDataOperationService,
    private readonly composition:Composition, selections:readonly NativeCoreSelection[]) {
    if(selections.length<1||selections.length>64)throw unavailable();
    const entries:Entry[]=[],keys=new Set<string>();
    for(const entry of selections){
      const source=selectedNativeBusinessReadSelection(entry.config.selected_source);
      const selector=structuredClone(entry.selector);
      if(selector.portal_user_id!==source.human.portal_user_id||selector.subject!==source.binding.subject||
        selector.human_issuer!==source.binding.human_issuer||selector.workspace_id!==source.binding.workspace_id||
        selector.environment!==source.binding.environment||accessDigest(selector.domain)!==accessDigest(source.domain))throw unavailable();
      const key=accessDigest(selector);
      if(keys.has(key))throw unavailable();keys.add(key);
      entries.push(Object.freeze({selector:Object.freeze({...selector,domain:Object.freeze({...selector.domain})}),source,
        selectedSource:entry.config.selected_source,
        ttl_ms:entry.config.limits.ttl_ms,
        installation_until_ms:Math.min(entry.config.installation_scope.valid_until_ms,
          selectedNativeBusinessReadInstallationExpiresAtMs(entry.config.selected_source)),
        maximum_response_bytes:entry.config.egress.maximum_response_bytes}));
    }
    this.entries=Object.freeze(entries);this.knownPeople=new Set(entries.map(e=>e.selector.portal_user_id));
  }
  /** Existing factory checks exact service/pool identity before init. */
  uses(pool:Pool,operations:MaximumDataOperationService):boolean{return pool===this.pool&&operations===this.operations;}

  /** Trusted server selector for the SAME shared Hub. The opaque scope must
   * come from the genuine current issuer; this method does not authorize a
   * request or reread/rebaseline it. Hub captures the returned Candidate once
   * and Candidate still checks current rights before each physical frame. */
  managerNoticeCandidate(scope:AuthorizedManagerNativeNoticeScope){
    const context=managerNativeReplayContext(scope);
    const entries=this.entries.filter(entry=>
      entry.source.source_identity_digest===context.source_identity_digest&&
      entry.selector.workspace_id===context.workspace_id&&
      entry.selector.environment===context.environment&&
      entry.source.domain.profile_id===context.profile_id&&
      accessDigest(entry.source.domain)===accessDigest(context.domain));
    if(entries.length!==1)throw unavailable();
    const candidate=this.composition.selectedCandidate(entries[0]!.selector);
    if(!candidate.usesPool(this.pool))throw unavailable();
    return candidate;
  }

  async serve(request:NativeManagerRequest,reply:FastifyReply):Promise<boolean>{
    const {principal,operation,query}=structuredClone(request);
    if(!this.knownPeople.has(principal.user.userId))return false;
    const selected=this.operation(operation,query.environment);
    const candidates=this.entries.filter(e=>e.selector.portal_user_id===principal.user.userId&&
      e.selector.workspace_id===principal.workspaceId&&e.selector.environment===query.environment&&
      e.source.domain.profile_id===selected.profile_id&&e.source.domain.catalogue_sha256===raw(selected.catalogue_sha256));
    if(candidates.length!==1)throw denied();
    const entry=candidates[0]!;
    if(principal.session.userId!==principal.user.userId||principal.session.state!=="ACTIVE"||
      principal.user.status!=="ACTIVE"||principal.user.mustChangePassword||principal.user.archivedAt!==null||
      principal.session.sessionVersion!==principal.user.sessionVersion||
      entry.source.binding.subject!==principal.user.userId||entry.source.human.portal_user_id!==principal.user.userId)throw denied();
    if(!["paper","sandbox","live"].includes(query.environment)||!Number.isInteger(query.limit)||query.limit<1||query.limit>200||
      query.cursor!==undefined&&(typeof query.cursor!=="string"||query.cursor.length<1||query.cursor.length>128))throw denied();
    if(selected.profile_id!==entry.source.domain.profile_id||raw(selected.catalogue_sha256)!==entry.source.domain.catalogue_sha256)
      throw unavailable();
    const candidate=this.composition.selectedCandidate(entry.selector);
    if(!candidate.usesPool(this.pool))throw unavailable();
    const actor:AccessActor={user_id:principal.user.userId,session_id:principal.session.sessionId,
      session_generation:principal.session.sessionVersion};
    // Genuine DB authority, not a DTO/config/nativeEpochDigest authorization.
    const {decision,dto,nativeEpochDigest}=await this.operations.prepareNativeManagerPage(
      this.pool,principal,operation,query,entry.selectedSource);
    if(decision.actor.user_id!==actor.user_id||decision.actor.session_id!==actor.session_id||
      decision.actor.session_generation!==actor.session_generation||
      decision.field_policy_sha256!==entry.source.domain.field_policy_sha256)throw denied();
    // Existing bounded cache/source-cursor preparation remains private. Never
    // cache/share this final body or create a second data/permission adapter.
    const body=Buffer.from(JSON.stringify(dto),"utf8");
    if(body.length<2||body.length>Math.min(entry.maximum_response_bytes,MAXIMUM_DATA_INTAKE_V1.pageBounds.maximumResponseBytes))throw unavailable();
    const bound=Math.min(decision.valid_until_ms,entry.installation_until_ms,
      Date.parse(entry.source.native.expires_at),Date.now()+entry.ttl_ms);
    // Fresh Base only. Whole-second deadline fits NC03's independent ceil-JWT
    // checks. It never rewrites any retained source Base during recovery.
    const deadlineMs=Math.floor(bound/1000)*1000;
    if(!Number.isSafeInteger(deadlineMs)||deadlineMs<=Date.now())throw denied();
    const binding={lease_id:randomUUID(),attempt_id:randomUUID(),human_issuer:entry.source.binding.human_issuer,
      subject:entry.source.binding.subject,workspace_id:entry.source.binding.workspace_id,
      environment:entry.source.binding.environment,workload_id:entry.source.binding.workload_id,operation:"READ" as const};
    const deadline=new Date(deadlineMs).toISOString();
    // v1's digest is opaque correlation. Bind actual safe bytes, fixed route,
    // real actor/epoch and full page query; do not pretend it is scoped_notice.
    const intentDigest=raw(accessDigest({schema_version:"portal.native-manager-http.delivery-intent.v1",
      binding,domain:entry.source.domain,deadline,actor,native_epoch_digest:nativeEpochDigest,
      operation_id:selected.operation_id,query:{environment:query.environment,limit:query.limit,cursor:query.cursor??null},
      body_digest:bodyDigest(body)}));
    const base:NativeBusinessReadBase={schema_version:"pma.native-business-read.request.v1",
      binding:{...binding,request_digest:intentDigest},domain:{...entry.source.domain},
      manager_intent:{schema_version:"pma.manager-read-intent.v1",action:"relation_page",digest:intentDigest},deadline};
    if(reply.raw.headersSent||reply.raw.writableEnded||reply.raw.destroyed)throw unavailable();
    reply.raw.statusCode=200;reply.raw.setHeader("content-type","application/json; charset=utf-8");
    reply.raw.setHeader("cache-control","no-store");reply.raw.setHeader("x-content-type-options","nosniff");
    // No Nest/Fastify automatic writer can reply after uncertain admission.
    // hijack itself emits zero HTTP bytes. Candidate owns final physical send.
    reply.hijack();
    try{
      const handle=await candidate.acquireNativeRead(actor,base,decision.scope_digest);
      await candidate.sendNativeRead(handle,reply.raw,body);
    }catch{
      // Same durable key/recovery owner. Never ordinary error JSON, response
      // replay, fake terminal, TTL-as-closure or a fallback after admission.
      reply.raw.destroy();
      await candidate.reconcileNativeRead(base.binding.lease_id).catch(()=>undefined);
    }
    return true;
  }
  private operation(operation:NativeManagerOperation,environment:"paper"|"sandbox"|"live"){
    if(operation.kind==="DEPLOYMENTS")return{operation_id:MAXIMUM_DATA_DEPLOYMENT_OPERATION.logicalOperationId,
      profile_id:maximumDataDeploymentBinding(environment).profileId,
      catalogue_sha256:MAXIMUM_DATA_DEPLOYMENT_OPERATION.sourceCatalogueSha256};
    if(operation.kind!=="RELATION")throw denied();
    const selected=managerRelationOperationByRoute(operation.route_id);
    if(!selected)throw new MaximumDataOperationError("EDS11R_OPERATION_NOT_FOUND",404);
    return{operation_id:selected.operationId,profile_id:managerRelationProfileBinding(environment).profileId,
      catalogue_sha256:MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest};
  }
}
