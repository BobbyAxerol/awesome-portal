import { Controller, Get, Header, Inject, Optional, Query, Req, UseGuards } from "@nestjs/common";
import type { Pool } from "pg";
import { z } from "zod";
import type { ControlApiConfig } from "../config";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { OwnerAccessService } from "../auth/owner-access.service";
import { CONTROL_API_CONFIG, EXECUTION_DATA_POOL } from "../tokens";
import type { ExecutionReadRequest } from "./local-read-authority";
import { retainedReview, RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES } from "./retained-read-profile";
import { profileProjectionCatalog } from "./profile-projection.catalog";
import { LocalRealtimeError } from "./profile-realtime.service";
import { ExecutionProfileProjectionRepository, type ProfileProjectionSnapshot } from "./profile-projection.repository";
import { ExecutionReadScopes, ExecutionReadScopeError, type ReadScopePrincipal,
  type AuthorizedExecutionReadScope } from "../execution-v2/read-scope";
import { retainedContextV2Schema, type RetainedContextPanelV2, type RetainedContextProfileV2 } from "../execution-v2/retained-context.contract";
import { scopedRetainedRows, fenceRetainedSnapshot } from "./retained-operation-page";

export const RetainedReviewQuery = z.object({workspace_id:z.string().min(1).max(128).optional()}).strict();

/** Named review metadata, not a relation selector, resource grant editor or source probe. */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ExecutionRetainedReviewController {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(EXECUTION_DATA_POOL) private readonly pool: Pool,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(OwnerAccessService) private readonly owner: OwnerAccessService,
    @Optional() @Inject(ExecutionReadScopes) private readonly readScopes?: ExecutionReadScopes,
    @Optional() @Inject(ExecutionProfileProjectionRepository) private readonly projections?: ExecutionProfileProjectionRepository) {}

  @Get("/retained-review")
  @Header("Cache-Control", "private, no-store")
  async context(@Req() request: ExecutionReadRequest,@Query() raw: unknown) {
    const query=RetainedReviewQuery.safeParse(raw);
    if(!query.success) throw new LocalRealtimeError("UDB_RETAINED_QUERY_INVALID",400);
    if(!retainedReview(this.config)) throw new LocalRealtimeError("UDB_RETAINED_REVIEW_NOT_CONFIGURED",404);
    const workspace=this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!;
    if((query.data.workspace_id!==undefined && query.data.workspace_id!==workspace) ||
      !await this.workspaces.canReadExecution(workspace,request.portalUser.userId)) throw new LocalRealtimeError("WORKSPACE_NOT_FOUND",404);
    const principal: ReadScopePrincipal = { user: request.portalUser, session: request.portalSession, workspaceId: workspace,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId };
    const mode = await this.readScopes?.selectionMode(principal);
    const scoped = mode === "SCOPED_V2" ? await this.scopedProfileViews(principal) : undefined;
    const profiles=scoped?.profiles ?? await this.profileViews(workspace);
    // A concurrent revoke while a cold data view was being computed must
    // not turn a shared immutable data read into cached caller authority.
    if(!await this.workspaces.canReadExecution(workspace,request.portalUser.userId)) throw new LocalRealtimeError("WORKSPACE_NOT_FOUND",404);
    const access=await this.owner.effectiveAccess(request.portalUser.userId);
    if (scoped) {
      for (const scope of scoped.scopes) await this.readScopes!.deliver(scope, async () => undefined);
      for (const item of scoped.snapshots) await fenceRetainedSnapshot(this.projections!, workspace, item.environment, item.profile, item.snapshot);
      for (const scope of scoped.scopes) await this.readScopes!.deliver(scope, async () => undefined);
    }
    if (mode && await this.readScopes!.selectionMode(principal) !== mode)
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    const response={schema_version:scoped?"portal.execution.retained-review.v2":"portal.execution.retained-review.v1",read_profile:"retained_review_v1",workspace_id:workspace,
      authority:"PORTAL_RETAINED_OBSERVATION",upstream_enabled:false,source_refresh_enabled:false,stream_enabled:false,
      mutation_enabled:false,live_eligibility:false,history_semantics:"BOUNDED_RETAINED_OBSERVATIONS_NOT_AUTHORITATIVE_REPLAY",
      permissions:{read:true,query:true,download:false,manage:false,command:false,stream:false,
        research_create:false,governance_decide:false,is_owner:access.isOwner},
      revocation:{http:"EACH_REQUEST_CORE_SESSION_AND_ACCESS",permission_cache_seconds:0,
        data_view_cache_milliseconds:2000,data_view_cache_maximum_serialized_bytes:RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES,
        delegated_jwt_ttl_seconds:this.config.EXECUTION_EDGE_DELEGATION_TTL_SECONDS,delegation_enabled:false,
        upstream_revocation:"SHORT_LIVED_TOKEN_EXPIRY_NOT_INSTANT_REVOCATION"},profiles,
      future_resource_management:{state:"NOT_PUBLISHED",reason_code:"TS_RESOURCE_MANAGEMENT_CONTRACT_NOT_PUBLISHED"}};
    return scoped ? retainedContextV2Schema.parse(response) : response;
  }

  /** V2 never reuses the workspace-global metadata cache. Counts derive from
   * qualified raw rows before aggregation. Historical metadata is a separate
   * dataset; until qualified, null is absence, not the legacy global total. */
  private async scopedProfileViews(principal: ReadScopePrincipal) {
    if (!this.projections || !this.readScopes) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    const scopes: AuthorizedExecutionReadScope[] = [];
    const snapshots: { environment: "paper" | "sandbox" | "live"; profile: string; snapshot: ProfileProjectionSnapshot }[] = [];
    const profiles: RetainedContextProfileV2[] = [];
    for (const environment of ["paper", "sandbox", "live"] as const) {
      const profile = (environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID
        : environment === "sandbox" ? this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID)!;
      const snapshot = await this.projections.rawSnapshot(principal.workspaceId, environment, profile);
      if (snapshot) snapshots.push({ environment, profile, snapshot });
      const panels: RetainedContextPanelV2[] = [];
      for (const binding of profileProjectionCatalog(environment)) {
        const key = `${binding.sourceId}:${binding.relation}`;
        const source = snapshot?.document.relations[key];
        const base: RetainedContextPanelV2 = { panel_id: binding.key, screen_id: binding.screenId,
          retained_state: "UNAVAILABLE", metadata_state: "NOT_PUBLISHED", current_row_count: null, history_row_count: null,
          source_availability: "NOT_PUBLISHED", source_reason_code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",
          source_as_of_ms: null, source_freshness: "UNKNOWN", observed_at_ms: null,
          oldest_available_ms: null, newest_available_ms: null, reason_code: "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED" };
        if (!snapshot || !source) { panels.push(base); continue; }
        try {
          const scope = await this.readScopes.authorize(principal, { environment, profileId: profile }, { action: "alpha.read",
            dataset: { dataset_id: `relation:${key}`, source_revision: snapshot.payloadDigest,
              projection_generation: snapshot.projectionEpoch, catalogue_revision: snapshot.sourceCatalogueSha256, window: null } });
          scopes.push(scope);
          if (source.items.length > 10000) throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT", 503);
          const rows = scopedRetainedRows(scope, source.items);
          panels.push({ ...base, retained_state: "PARTIAL", metadata_state: "PARTIAL",
            current_row_count: source.availability === "AVAILABLE" ? rows.length : null,
            source_availability: source.availability,
            source_reason_code: source.availability === "AVAILABLE" ? null : "EXECUTION_READ_SOURCE_NOT_PUBLISHED",
            reason_code: "EXECUTION_READ_HISTORY_METADATA_NOT_PUBLISHED" });
        } catch (error) {
          if (!(error instanceof ExecutionReadScopeError) || !["EXECUTION_READ_NOT_AVAILABLE",
            "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", "EXECUTION_READ_FIELD_POLICY_PENDING"].includes(error.code)) throw error;
          panels.push({ ...base, metadata_state: error.code === "EXECUTION_READ_NOT_AVAILABLE" ? "DENIED" : "NOT_PUBLISHED",
            source_reason_code: error.code, reason_code: error.code });
        }
      }
      const hasScope = panels.some(panel => panel.metadata_state === "PARTIAL");
      profiles.push({ environment, profile_id: profile, metadata_state: hasScope ? "PARTIAL" : "NOT_PUBLISHED",
        metadata_reason_code: hasScope ? "EXECUTION_READ_HISTORY_METADATA_NOT_PUBLISHED" : "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",
        source_as_of_ms: null, snapshot_observed_ms: null, source_payload_digest: null,
        freshness: "STALE", completeness: "PARTIAL", panels });
    }
    return { profiles, scopes, snapshots };
  }

  // One configured source workspace. Cache only immutable metadata/data,
  // never permissions, owner, session or an error. HTTP remains no-store.
  private profileCache?: {key:string;profiles:Awaited<ReturnType<ExecutionRetainedReviewController["readProfiles"]>>;expiresAt:number};
  private profileFlight?: {key:string;read:ReturnType<ExecutionRetainedReviewController["readProfiles"]>};
  private async profileViews(workspace:string) {
    const key=JSON.stringify([workspace,this.config.EXECUTION_EDGE_PAPER_PROFILE_ID,
      this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID,this.config.EXECUTION_EDGE_LIVE_PROFILE_ID]);
    if(this.profileCache?.key===key&&this.profileCache.expiresAt>Date.now())return this.profileCache.profiles;
    this.profileCache=undefined;
    if(this.profileFlight?.key===key)return this.profileFlight.read;
    const read=this.readProfiles(workspace);this.profileFlight={key,read};
    try{
      const profiles=await read;
      if(Buffer.byteLength(JSON.stringify(profiles))<=RETAINED_DATA_VIEW_CACHE_MAXIMUM_SERIALIZED_BYTES)this.profileCache={key,profiles,expiresAt:Date.now()+2000};
      return profiles;
    }finally{if(this.profileFlight?.read===read)this.profileFlight=undefined;}
  }

  private async readProfiles(workspace:string) {
    const profiles=[];
    for(const environment of ["paper","sandbox","live"] as const) {
      const profile=environment==="paper"?this.config.EXECUTION_EDGE_PAPER_PROFILE_ID!
        :environment==="sandbox"?this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID!:this.config.EXECUTION_EDGE_LIVE_PROFILE_ID!;
      // A cold context shares one flight across viewers but used to consume
      // three domain clients at once, competing with a rich Portfolio mount.
      // Sequential bounded metadata reads keep its peak occupancy at one.
      const snapshot=await this.pool.query(`SELECT s.source_as_of,s.last_successful_refresh_at,s.payload_digest,s.completeness,
          (SELECT jsonb_object_agg(key,jsonb_build_object('availability',value->>'availability',
            'reason_code',value->>'reason_code','as_of',value->>'as_of','freshness',value->>'freshness',
            'completeness',value->>'completeness','count',jsonb_array_length(value->'items')))
            FROM jsonb_each(s.payload->'relations')) AS source_groups
          FROM execution_profile_projection_snapshots s WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3`,[workspace,environment,profile]);
      const entities=await this.pool.query(`SELECT relation_key,count(*)::text AS n,min(last_observed_at) AS oldest,max(last_observed_at) AS newest
          FROM execution_durable_mirror_current_entities WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
          GROUP BY relation_key`,[workspace,environment,profile]);
      const history=await this.pool.query(`SELECT relation_key,count(*)::text AS n,min(ts) AS oldest,max(ts) AS newest
          FROM execution_timeseries_history WHERE workspace_id=$1 AND environment=$2 AND profile_id=$3
          GROUP BY relation_key`,[workspace,environment,profile]);
      const source=snapshot.rows[0];
      const current=new Map(entities.rows.map(row=>[row.relation_key,row]));
      const ranges=new Map(history.rows.map(row=>[row.relation_key,row]));
      profiles.push({environment,profile_id:profile,source_as_of_ms:ms(source?.source_as_of),
        snapshot_observed_ms:ms(source?.last_successful_refresh_at),source_payload_digest:source?.payload_digest??null,
        freshness:"STALE",completeness:"PARTIAL",panels:profileProjectionCatalog(environment).map(binding=>{
          const key=`${binding.sourceId}:${binding.relation}`,original=source?.source_groups?.[key];
          const entity=current.get(key),range=ranges.get(key);
          const snapshotRows=original?.availability==="AVAILABLE"?Number(original.count):0;
          const count=snapshotRows>0?snapshotRows:Number(entity?.n??0);
          return {panel_id:binding.key,screen_id:binding.screenId,
            retained_state:count>0||Number(range?.n??0)>0?"PARTIAL":"UNAVAILABLE",
            current_row_count:count,history_row_count:String(range?.n??"0"),
            source_availability:original?.availability??"NOT_PUBLISHED",source_reason_code:original?.reason_code??null,
            source_as_of_ms:ms(original?.as_of),source_freshness:original?.freshness??"UNKNOWN",
            observed_at_ms:ms(entity?.newest),oldest_available_ms:ms(range?.oldest),newest_available_ms:ms(range?.newest),
            reason_code:count>0||Number(range?.n??0)>0?"UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE":"UDB_RETAINED_PANEL_NOT_CAPTURED"};
        })});
    }
    return profiles;
  }
}
function ms(value: Date|string|null|undefined):number|null {
  if(value===null||value===undefined)return null;
  const n=new Date(value).valueOf();return Number.isSafeInteger(n)?n:null;
}
