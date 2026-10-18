import { rejectManagerAsOf } from "./manager-query-p1";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Pool } from "pg";
import { CONTROL_API_CONFIG, EXECUTION_DATA_POOL } from "../tokens";
import { ControlApiConfig, querySigningKeys } from "../config";
import { KeysetCursorCodec } from "../query/cursor";
import { QueryContractError } from "../query/contracts";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeReadPopulation, type ReadScopePrincipal, type ReadScopeRequirement } from "./read-scope";
import { managerModelQuery, type ManagerMember } from "./manager-model.contract";
import { ManagerModelRepository } from "./manager-model.store";
import { queryManagerModel, type ManagerSurface } from "./manager-model";
import { ExecutionManagerRuntime } from "./manager-runtime";
import type { ManagerScorePublication } from "./manager-score-publication.contract";
import type { ManagerCompositionPublication } from "./manager-composition-publication.contract";
import type { ManagerRegimePublication } from "./manager-regime-publication.contract";

@Injectable()
export class ManagerModelService {
  private readonly repository: ManagerModelRepository;
  private readonly codec: KeysetCursorCodec;
  constructor(@Inject(EXECUTION_DATA_POOL) pool: Pool,
    @Inject(ExecutionReadScopes) private readonly scopes: ExecutionReadScopes,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() @Inject(ExecutionManagerRuntime) private readonly runtime?: ExecutionManagerRuntime) {
    this.repository = new ManagerModelRepository(pool);
    this.codec = new KeysetCursorCodec({ activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config), ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS });
  }

  async read(principal: ReadScopePrincipal, surface: ManagerSurface, raw: unknown, id?: string) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) rejectManagerAsOf(raw as Record<string, unknown>);
    const parsed = managerModelQuery.safeParse(raw);
    if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    const q = parsed.data, env = q.environment;
    const allowedStages = env === "paper" ? ["PAPER"] : env === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
    if (q.stage_filter.some(stage => !allowedStages.includes(stage)))
      throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    if (q.workspace_id && q.workspace_id !== principal.workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const profile = env === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID : env === "sandbox" ?
      this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    if (!profile) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    try {
      const head = await this.repository.head(principal.workspaceId, env, profile);
      const action = surface === "FUND" ? "business.read_all" : surface === "PORTFOLIO" ? "portfolio.read" :
        surface === "ACCOUNT" ? "account.read" : "alpha.read";
      const resource = !id ? undefined : { kind: surface === "PORTFOLIO" ? "PORTFOLIO" as const : surface === "ACCOUNT" ? "ACCOUNT" as const :
        surface === "DEPLOYMENT" ? "DEPLOYMENT" as const : "ALPHA" as const, id };
      // Deployment ownership is evaluated through the authorized Alpha tuples,
      // not a new/invented alpha.read grant on a DEPLOYMENT resource.
      const requirement: ReadScopeRequirement = { action, resource: surface === "DEPLOYMENT" ? undefined : resource,
        requireWholePopulation: surface === "FUND", dataset: { dataset_id: "alpha_fleet_overview", source_revision: head?.revision ?? "NOT_PUBLISHED",
          projection_generation: head?.projection_generation ?? "NOT_PUBLISHED", catalogue_revision: head?.catalogue_digest ?? null, window: null } };
      let scope;
      try { scope = await this.scopes.authorize(principal, { environment: env, profileId: profile }, requirement); }
      catch (error) {
        if (surface !== "PORTFOLIO" || !(error instanceof ExecutionReadScopeError) || error.code !== "EXECUTION_READ_NOT_AVAILABLE") throw error;
        scope = await this.scopes.authorize(principal, { environment: env, profileId: profile }, { ...requirement, action: "portfolio.read_restricted" });
      }
      if (scope.mode !== "SCOPED_V2" || !head) throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
      if (surface === "DEPLOYMENT" && !scopeReadPopulation(scope).allowedTuples.some(t => t.deployment_id === id))
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const acceptedScores: ManagerScorePublication[]=[];
      const acceptedRegimes: ManagerRegimePublication[] = [];
      const regimeCurrent = () => acceptedRegimes.every(value => this.runtime?.regimeFence.accepts(value));
      const acceptedCompositions:Array<{publication:ManagerCompositionPublication;rawScores:ManagerScorePublication[];members:readonly Pick<ManagerMember,"tuple"|"stage">[]|undefined}>=[];
      const compositionCurrent=()=>acceptedCompositions.every(item=>this.runtime?.compositionFence.accepts(item.publication,item.rawScores,item.members));
      const result = await this.scopes.deliver(scope, async () => {
        const original = await this.repository.document(principal.workspaceId, env, profile, head.revision);
        // TEST_ONLY rows can be exercised through the pure component in a
        // disposable cell, never served by a product constructor/environment flag.
        if (!original || original.qualification !== "SOURCE_VERIFIED") throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
        const recalculation=this.runtime?.recalculationFor({workspace_id:principal.workspaceId,environment:env,profile_id:profile});
        const derived=recalculation?await recalculation.snapshot(original):null;
        const doc=derived?.document??original;
        const response = queryManagerModel(scope, doc, q, this.codec, surface, id, this.runtime ? {accepts:score=>{
          if(!this.runtime!.scoreFence.accepts(score))return false;
          acceptedScores.push(score);return true;
        }} : undefined,this.runtime?{project:(publication,rawScores)=>this.runtime!.compositionFence.project!(publication,rawScores),accepts:(publication,rawScores,members)=>{
          if(!this.runtime!.compositionFence.accepts(publication,rawScores,members))return false;
          acceptedCompositions.push({publication,rawScores:[...rawScores],members:members?structuredClone(members):members});return true;
        }}:undefined,this.runtime?{accepts:publication=>{
          if(!this.runtime!.regimeFence.accepts(publication))return false;
          acceptedRegimes.push(publication);return true;
        }}:undefined);
        const current = await this.repository.head(principal.workspaceId, env, profile);
        if (current?.payload_digest !== head.payload_digest || current.revision !== head.revision)
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        if(recalculation&&derived&&!await recalculation.unchanged(original,derived.key))
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
        if(acceptedScores.some(score=>!this.runtime?.scoreFence.accepts(score)))
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
        if(!compositionCurrent() || !regimeCurrent())throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
        return response;
      });
      // deliver itself awaits the final current authority publication. A policy
      // expiry/revoke during that I/O must not return an earlier numeric score.
      if(acceptedScores.some(score=>!this.runtime?.scoreFence.accepts(score)))
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
      if(!compositionCurrent() || !regimeCurrent())throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
      return result;
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      if (error instanceof QueryContractError) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }
}
