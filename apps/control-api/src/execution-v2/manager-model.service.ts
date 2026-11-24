import { rejectManagerAsOf } from "./manager-query-p1";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Pool } from "pg";
import type { ServerResponse } from "node:http";
import { CONTROL_API_CONFIG, EXECUTION_DATA_POOL } from "../tokens";
import { ControlApiConfig, querySigningKeys } from "../config";
import { KeysetCursorCodec } from "../query/cursor";
import { QueryContractError } from "../query/contracts";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeReadPopulation, type ReadScopePrincipal, type ReadScopeRequirement } from "./read-scope";
import { managerModelQuery, type ManagerMember, type ManagerModelQuery } from "./manager-model.contract";
import { ManagerModelRepository } from "./manager-model.store";
import { assertManagerAllQuery, collectManagerRows, fleetReadRequirement, managerAllEnvironmentQuery, managerAllReasonOf, queryManagerModel,
  queryManagerModelAll, type ManagerAllRead, type ManagerEnvironmentName, type ManagerSurface } from "./manager-model";
import { MANAGER_ALL_ENVIRONMENTS } from "./manager-all-scope";
import type { ManagerScoreReadFence } from "./manager-score-publication";
import type { ManagerCompositionReadFence } from "./manager-composition-publication";
import type { ManagerRegimeReadFence } from "./manager-regime-publication";
import type { AuthorizedExecutionReadScope } from "./read-scope";
import type { ManagerModelDocument } from "./manager-model.contract";
import { ExecutionManagerRuntime } from "./manager-runtime";
import type { ManagerScorePublication } from "./manager-score-publication.contract";
import type { ManagerCompositionPublication } from "./manager-composition-publication.contract";
import type { ManagerRegimePublication } from "./manager-regime-publication.contract";
import { NativeCurrentAccountScopes } from "./native-current-runtime";
import type { ManagerEconomicSourceRuntime } from "./manager-economic-source-runtime";
import { resolveManagerProfile } from "./manager-profile-registry";

interface ManagerReadObligation {
  scope: AuthorizedExecutionReadScope;
  validateSnapshot: () => Promise<void>;
  validatePublications: () => void;
}
interface NativeManagerDelivery {
  response: ServerResponse;
  beforeDispatch: () => void;
}

@Injectable()
export class ManagerModelService {
  private readonly repository: ManagerModelRepository;
  private readonly codec: KeysetCursorCodec;
  constructor(@Inject(EXECUTION_DATA_POOL) pool: Pool,
    @Inject(ExecutionReadScopes) private readonly scopes: ExecutionReadScopes,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() @Inject(ExecutionManagerRuntime) private readonly runtime?: ExecutionManagerRuntime,
    @Optional() @Inject(NativeCurrentAccountScopes) private readonly nativeAccount?: NativeCurrentAccountScopes) {
    this.repository = new ManagerModelRepository(pool);
    this.codec = new KeysetCursorCodec({ activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID,
      keys: querySigningKeys(config), ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS });
  }

  async read(principal: ReadScopePrincipal, surface: ManagerSurface, raw: unknown, id?: string) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) rejectManagerAsOf(raw as Record<string, unknown>);
    const parsed = managerModelQuery.safeParse(raw);
    if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    const q = parsed.data;
    // FE-CAT-3: the Fleet ALL lens is a fan-out of single-environment reads, each under its own scope.
    if (q.environment === "ALL") {
      if (q.workspace_id && q.workspace_id !== principal.workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      return this.readAll(principal, surface, q, id);
    }
    const env = q.environment;
    const allowedStages = env === "paper" ? ["PAPER"] : env === "sandbox" ? ["SANDBOX"] : ["CANARY", "LIVE"];
    if (q.stage_filter.some(stage => !allowedStages.includes(stage)))
      throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    if (q.workspace_id && q.workspace_id !== principal.workspaceId) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    if(this.shouldUseNativeCurrent(principal,q))throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
    return this.readEnvironment(principal, env, surface, q, id, (scope, doc, fences) =>
      ({...queryManagerModel(scope, doc, q, this.codec, surface, id, fences.score, fences.composition, fences.regime, fences.economic, true),profile_id:doc.profile_id}));
  }

  /** Actual installed composition, never a browser/profile flag. Optional
   * invocation keeps old explicit test doubles compatible; real scopes always
   * implement this accessor. No native path falls back to ordinary delivery. */
  hasNativeCurrentRelations(): boolean { return this.nativeAccount?.scopes.hasNativeCurrentRelations() === true; }

  /** Routing only. The native provider must independently prove its selected
   * binding at authorization and physical delivery; config grants no authority. */
  shouldUseNativeCurrent(principal:ReadScopePrincipal,raw:unknown):boolean {
    const parsed=managerModelQuery.safeParse(raw);
    if(!parsed.success)throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",400);
    if(parsed.data.environment==="ALL")return false;
    const profile=this.resolveProfile(principal,parsed.data.environment,parsed.data.profile_id);
    return parsed.data.environment==="paper"&&profile===this.profileFor("paper")&&this.hasNativeCurrentRelations();
  }

  /** Closed named public finite slices. Ordinary per-surface requirements still
   * select the exact resource and action; CURRENT never grants ALL/history/STREAM. */
  async readNativeAccount(principal: ReadScopePrincipal, raw: unknown, id: string, response: ServerResponse,
    beforeDispatch: () => void): Promise<void> {
    return this.readNativeEntity(principal, raw, "ACCOUNT", id, response, beforeDispatch);
  }

  async readNativeAlpha(principal: ReadScopePrincipal, raw: unknown, id: string, response: ServerResponse,
    beforeDispatch: () => void): Promise<void> {
    return this.readNativeEntity(principal, raw, "ALPHA", id, response, beforeDispatch);
  }

  async readNativeManager(principal: ReadScopePrincipal, raw: unknown,
    surface: "FUND" | "FLEET" | "PORTFOLIO" | "DEPLOYMENT", id: string | undefined,
    response: ServerResponse, beforeDispatch: () => void): Promise<void> {
    return this.readNativeEntity(principal, raw, surface, id, response, beforeDispatch);
  }

  private async readNativeEntity(principal: ReadScopePrincipal, raw: unknown, surface: ManagerSurface, id: string | undefined,
    response: ServerResponse, beforeDispatch: () => void): Promise<void> {
    if (!this.hasNativeCurrentRelations()) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) rejectManagerAsOf(raw as Record<string, unknown>);
    const parsed = managerModelQuery.safeParse(raw);
    if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    const q = parsed.data;
    if (q.environment !== "paper") throw new ExecutionReadScopeError("EXECUTION_READ_CURRENT_ONLY", 503);
    if(this.resolveProfile(principal,"paper",q.profile_id)!==this.profileFor("paper"))
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
    if ((["ACCOUNT", "ALPHA", "PORTFOLIO", "DEPLOYMENT"].includes(surface) && !id) ||
      id !== undefined && (!id || id.length > 256) || q.workspace_id && q.workspace_id !== principal.workspaceId)
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    if (q.stage_filter.some(stage => stage !== "PAPER")) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    await this.readEnvironment(principal, "paper", surface, q, id, (scope, doc, fences) =>
      ({...queryManagerModel(scope, doc, q, this.codec, surface, id, fences.score, fences.composition, fences.regime, fences.economic, true),profile_id:doc.profile_id}),
      undefined, { response, beforeDispatch }, this.nativeAccount!.scopes);
  }

  private profileFor(env: ManagerEnvironmentName) {
    return env === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID : env === "sandbox" ?
      this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  }
  private resolveProfile(principal:ReadScopePrincipal,env:ManagerEnvironmentName,requestedProfileId?:string):string {
    try{return resolveManagerProfile({defaultProfileId:this.profileFor(env),requestedProfileId,
      installedProfileIds:this.runtime?.profilesFor?.(principal.workspaceId,env)});}
    catch(error){throw new ExecutionReadScopeError(error instanceof Error&&error.message==="EXECUTION_READ_NOT_AVAILABLE"?
      "EXECUTION_READ_NOT_AVAILABLE":"EXECUTION_READ_AUTHORITY_UNAVAILABLE",error instanceof Error&&error.message==="EXECUTION_READ_NOT_AVAILABLE"?404:503);}
  }

  /** FE-CAT-3 v1: exactly three configured environment defaults, NOT all installed
   * profiles and never an economic union. An initially unavailable environment has a typed reason; every successful contribution remains an
   * obligation at the final whole-response fence. Sequential on purpose: the repository bounds its concurrent flights. */
  private async readAll(principal: ReadScopePrincipal, surface: ManagerSurface, q: ManagerModelQuery, id?: string) {
    if (surface !== "FLEET" || id !== undefined) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    assertManagerAllQuery(q);
    const reads: ManagerAllRead[] = [];
    const obligations: ManagerReadObligation[] = [];
    for (const environment of MANAGER_ALL_ENVIRONMENTS) {
      if (!this.profileFor(environment)) { reads.push({ environment, unavailable: "NOT_CONFIGURED" }); continue; }
      try {
        const collected = await this.readEnvironment(principal, environment, "FLEET", q, undefined, (scope, doc, fences) =>
          collectManagerRows(scope, doc, managerAllEnvironmentQuery(q, environment), "FLEET", undefined, fences.score, fences.composition, fences.regime, fences.economic, true),
        obligation => obligations.push(obligation));
        reads.push({ environment, collected });
      } catch (error) { reads.push({ environment, unavailable: managerAllReasonOf(error) }); }
    }
    // An earlier environment's successful delivery is NOT authority to release
    // it after later environment I/O. Keep every contributing obligation until
    // the whole body is ready; a changed one fails the whole response, never a
    // silently smaller partial page or a stale count.
    if (obligations.length === 0) return queryManagerModelAll(reads, q, this.codec, principal.workspaceId);
    return this.scopes.deliverFleetEnvironments(obligations.map(item => item.scope), async () => {
      for (const item of obligations) await item.validateSnapshot();
      return queryManagerModelAll(reads, q, this.codec, principal.workspaceId);
    }, () => { for (const item of obligations) item.validatePublications(); });
  }

  /** One environment's read under its own scope: authorize, load the current head's document, `compute` inside `deliver`, and verify
   * that the head, the recalculation and every accepted publication are still current when the answer is returned. */
  private async readEnvironment<T>(principal: ReadScopePrincipal, env: ManagerEnvironmentName, surface: ManagerSurface, q: { workspace_id?: string;profile_id?:string },
    id: string | undefined, compute: (scope: AuthorizedExecutionReadScope, doc: ManagerModelDocument,
      fences: { score?: ManagerScoreReadFence; composition?: ManagerCompositionReadFence; regime?: ManagerRegimeReadFence;
        economic?: ManagerEconomicSourceRuntime }) => T,
    retain?: (obligation: ManagerReadObligation) => void, native?: NativeManagerDelivery,
    scopes: ExecutionReadScopes = this.scopes): Promise<T> {
    const profile = this.resolveProfile(principal,env,q.profile_id);
    try {
      const head = await this.repository.head(principal.workspaceId, env, profile);
      const action = surface === "FUND" ? "business.read_all" : surface === "PORTFOLIO" ? "portfolio.read" :
        surface === "ACCOUNT" ? "account.read" : "alpha.read";
      const resource = !id ? undefined : { kind: surface === "PORTFOLIO" ? "PORTFOLIO" as const : surface === "ACCOUNT" ? "ACCOUNT" as const :
        surface === "DEPLOYMENT" ? "DEPLOYMENT" as const : "ALPHA" as const, id };
      // Deployment ownership is evaluated through the authorized Alpha tuples,
      // not a new/invented alpha.read grant on a DEPLOYMENT resource.
      const dataset = { dataset_id: "alpha_fleet_overview", source_revision: head?.revision ?? "NOT_PUBLISHED",
        projection_generation: head?.projection_generation ?? "NOT_PUBLISHED", catalogue_revision: head?.catalogue_digest ?? null, window: null };
      // The Fleet requirement is shared with the realtime baseline (CR-01): it names the scope whose fingerprint `lineage.revision` carries.
      const requirement: ReadScopeRequirement = surface === "FLEET" && resource === undefined ? fleetReadRequirement(dataset) :
        { action, resource: surface === "DEPLOYMENT" ? undefined : resource, requireWholePopulation: surface === "FUND", dataset };
      let scope;
      try { scope = await scopes.authorize(principal, { environment: env, profileId: profile }, requirement); }
      catch (error) {
        if (surface !== "PORTFOLIO" || !(error instanceof ExecutionReadScopeError) || error.code !== "EXECUTION_READ_NOT_AVAILABLE") throw error;
        scope = await scopes.authorize(principal, { environment: env, profileId: profile }, { ...requirement, action: "portfolio.read_restricted" });
      }
      if (scope.mode !== "SCOPED_V2" || !head) throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
      if (surface === "DEPLOYMENT" && !scopeReadPopulation(scope).allowedTuples.some(t => t.deployment_id === id))
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const acceptedScores: ManagerScorePublication[]=[];
      const economicSource = this.runtime?.economicSourceFor({workspace_id:principal.workspaceId,environment:env,profile_id:profile});
      const acceptedRegimes: ManagerRegimePublication[] = [];
      const regimeCurrent = () => acceptedRegimes.every(value => this.runtime?.regimeFence.accepts(value));
      const acceptedCompositions:Array<{publication:ManagerCompositionPublication;rawScores:ManagerScorePublication[];members:readonly Pick<ManagerMember,"tuple"|"stage">[]|undefined}>=[];
      const compositionCurrent=()=>acceptedCompositions.every(item=>this.runtime?.compositionFence.accepts(item.publication,item.rawScores,item.members));
      const validatePublications = () => {
        if (economicSource && !economicSource.isCurrent() || acceptedScores.some(score => !this.runtime?.scoreFence.accepts(score)) || !compositionCurrent() || !regimeCurrent())
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      };
      let validateSnapshot: (() => Promise<void>) | undefined;
      const read = async () => {
        const original = await this.repository.document(principal.workspaceId, env, profile, head.revision);
        // TEST_ONLY rows can be exercised through the pure component in a
        // disposable cell, never served by a product constructor/environment flag.
        if (!original || original.qualification !== "SOURCE_VERIFIED") throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
        const recalculation=this.runtime?.recalculationFor({workspace_id:principal.workspaceId,environment:env,profile_id:profile});
        const derived=recalculation?await recalculation.snapshot(original):null;
        const doc=derived?.document??original;
        const response = compute(scope, doc, {
          economic: economicSource,
          score: this.runtime ? {accepts:score=>{
            if(!this.runtime!.scoreFence.accepts(score))return false;
            acceptedScores.push(score);return true;
          }} : undefined,
          composition: this.runtime?{project:(publication,rawScores)=>this.runtime!.compositionFence.project!(publication,rawScores),accepts:(publication,rawScores,members)=>{
            if(!this.runtime!.compositionFence.accepts(publication,rawScores,members))return false;
            acceptedCompositions.push({publication,rawScores:[...rawScores],members:members?structuredClone(members):members});return true;
          }}:undefined,
          regime: this.runtime?{accepts:publication=>{
            if(!this.runtime!.regimeFence.accepts(publication))return false;
            acceptedRegimes.push(publication);return true;
          }}:undefined });
        validateSnapshot = async () => {
          const current = await this.repository.head(principal.workspaceId, env, profile);
          if (current?.payload_digest !== head.payload_digest || current.revision !== head.revision ||
            current.projection_generation !== head.projection_generation)
            throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
          if (recalculation && derived && !await recalculation.unchanged(original, derived.key))
            throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        };
        await validateSnapshot();
        validatePublications();
        return response;
      };
      let result: T;
      if (native) {
        let prepared: { value: T } | undefined;
        await scopes.deliverNative(scope, native.response, async () => {
          const value = await read();
          prepared = { value };
          return Buffer.from(JSON.stringify(value), "utf8");
        }, {
          // Recheck the same immutable projection after all source ENTER I/O,
          // without holding a Core transaction across the data query.
          validateAfterEnter: async () => {
            if (!validateSnapshot) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
            await validateSnapshot();
            validatePublications();
          },
          // Final synchronous accepted-publication check follows Core COMMIT
          // and pool release, immediately before the sole physical send.
          validateBeforeDispatch: () => { validatePublications(); native.beforeDispatch(); },
        });
        if (!prepared) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        result = prepared.value;
      } else result = await scopes.deliver(scope, read);
      // deliver itself awaits the final current authority publication. A policy
      // expiry/revoke during that I/O must not return an earlier numeric score.
      if (!native) validatePublications();
      if (retain && validateSnapshot) retain({ scope, validateSnapshot, validatePublications });
      return result;
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      if (error instanceof QueryContractError) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }
}
