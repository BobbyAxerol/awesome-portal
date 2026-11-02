import { canonicalOrderStatus } from "../paper-read/order-status-map";
import { freshnessPolicies } from "./environment-parity";
import { retainedReview, projectionExpired } from "./retained-read-profile";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ControlApiConfig, querySigningKeys } from "../config";
import { ExecutionReadScopes, ExecutionReadScopeError, scopeReadPopulation,
  type AuthorizedExecutionReadScope } from "../execution-v2/read-scope";
import { authorizeRetainedRelation, scopedRetainedRows, retainedFieldAllowed, retainedRelationAction, fenceRetainedSnapshot } from "./retained-operation-page";
import { projectionRowVisible } from "../execution-v2/read-projection";
import {scopedLiveSource} from "../profile-read/scoped-live-source";
import { deploymentIdentityFromRetained, type DeploymentIdentity } from "./deployment-identity";
import type {LiveSourceOperationsRead,LiveSourceReadQuery} from "../live/live-source.contract";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  CurrentSourceEnvironment,
  CurrentSourcePageQuery,
  CurrentSourcePrincipal,
  CurrentSourceProxyError,
  managerListManagerV2Path,
  paperManagerV2Path,
  profileManagerV2Path,
} from "./current-source.proxy";
import {
  MaximumDataOperationError,
  MaximumDataOperationService,
} from "./maximum-data-operation.service";
import {
  ManagerRelationOperation,
  managerRelationOperationByRelation,
  managerRelationProfileBinding,
} from "./eds11r-manager-relation.registry";
import { MaximumDataEnvironment } from "./maximum-data-intake";
import {
  ExecutionProfileProjectionRepository,
  ProjectionEnvironment,
  ProfileProjectionSnapshot,
  ProjectionScalar,
} from "./profile-projection.repository";

const MANAGER_LIST_SCREENS = new Set([
  "EXECUTION_ALPHA_FLEET_LIST_SCREEN",
  "EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN",
]);
const LOCAL_CURSOR = /^lp1:(\d+):([0-9a-f]{16})$/;
const DECIMAL_FIELD = new Set([
  "total", "locked", "free", "initial", "maintenance", "buying_power",
  "allocated_capital", "max_capital", "signed_qty", "quantity", "avg_px_open",
  "avg_px_close", "realized_pnl", "unrealized_pnl", "mark_price", "notional",
  "peak_qty", "price", "trigger_price", "commission", "position_qty",
  "exposure_long", "exposure_short", "cash_total", "cash_free", "cash_locked",
  "fee_total", "funding_pnl", "gross_pnl", "net_pnl", "equity", "drawdown",
  "total_notional", "margin_initial", "margin_maintenance", "target_quantity",
  "filled_quantity", "open_quantity", "excess_quantity", "average_fill_price",
]);
// Deployment-scoped execution facts require BOTH the Alpha/deployment view
// and the independently authorized Account. Sharing an account must never
// turn either permission into access to another deployment's observations.
const DEPLOYMENT_ACCOUNT_RELATIONS = new Set(["positions_v2", "execution_sessions", "orders", "fills"]);
const ACCOUNT_PROFILE_ALPHA_RELATIONS = new Set(["strategy_deployments", "positions_v2"]);
const ACCOUNT_PROFILE_RELATIONS = new Set(["accounts", "account_balances", "margin_balances", "account_sync_effective",
  "broker_account_sync_effective", "venue_accounts", "strategy_deployments", "positions_v2", "reconciliation_findings"]);
// Only locally constructed, non-secret failures may cross the combined scope
// fence as their original public contract after every authority has renewed.
const RETAINED_SAFE_REFUSALS: Readonly<Record<string, number>> = Object.freeze({
  N31_PROJECTED_RELATION_NOT_AVAILABLE: 503,
  N31_PROJECTED_RELATION_UNAVAILABLE: 503,
  N31_PROJECTION_NOT_READY: 503,
  N31_PROJECTION_STALE_CEILING_EXCEEDED: 503,
  N31_PROJECTION_CURSOR_INVALID: 400,
  N31_PROJECTION_CURSOR_AHEAD: 409,
  N31_PROJECTION_SCALAR_INVALID: 500,
});

/**
 * A server-only resource identity recovered from the local, profile-bound
 * projection.  The Edge's current Manager page API deliberately does not
 * accept arbitrary filters, so a detail route must never emulate one by
 * fetching a first global page and filtering it in the BFF.
 */
export interface DeploymentResourceScope {
  readonly deploymentId: string;
  readonly strategyId: string;
  readonly accountId: string;
  readonly mode: ProjectionEnvironment;
  readonly venue: string;
  readonly portfolioId: string | null;
  readonly externalAccountRef: string | null;
  /** A tuple-only relation is safe only when its tuple names one deployment. */
  readonly tupleUnique: boolean;
}

export type DeploymentScopeResolution =
  | {
    readonly state: "FOUND";
    readonly reasonCode: null;
    readonly scope: DeploymentResourceScope;
    readonly deployment: Record<string, ProjectionScalar>;
    /** FE-066: Alpha-Portfolio identity, composed inside the same authority fence. */
    readonly identity?: DeploymentIdentity;
  }
  | {
    readonly state: "EMPTY" | "PARTIAL" | "UNAVAILABLE";
    readonly reasonCode: string;
    readonly scope?: undefined;
    readonly deployment?: Record<string, ProjectionScalar>;
  };

interface DeploymentScopeQuery {
  /** Internal only; never serialised to the Edge or browser. */
  deploymentScope?: DeploymentResourceScope;
}

/** Server-owned exact target; valid only inside the matching Account 360
 * composition. Never serialized to the browser or the Edge. */
interface AccountTargetQuery { accountTarget?: string }
type ProductReadQuery = CurrentSourcePageQuery & LocalProductQuery & DeploymentScopeQuery & AccountTargetQuery;

export type RetainedAccountIdentityProof = Readonly<{
  state: "FOUND" | "MISSING" | "DUPLICATE" | "UNRESOLVED";
}>;

declare const profileReadCompositionBrand: unique symbol;
/** Private, in-process obligation collector, never a browser-supplied scope. */
export interface ProfileReadComposition { readonly [profileReadCompositionBrand]: true }
type ProfileReadHead = Pick<ProfileProjectionSnapshot, "payloadDigest" | "projectionEpoch" | "sourceCatalogueSha256">;
type ProfileReadCompositionState = {
  actor: string; workspace: string; screenId: string; environments: ReadonlySet<CurrentSourceEnvironment>;
  accountId?: string; accountProofs: Map<CurrentSourceEnvironment, RetainedAccountIdentityProof>;
  scopes: AuthorizedExecutionReadScope[];
  heads: Array<{ environment: ProjectionEnvironment; profileId: string; head: ProfileReadHead }>;
  unscoped: boolean; active: boolean;
};
const PROFILE_COMPOSITION_SCREENS = new Set([
  "SANDBOX_TRADING_SCREEN", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN", "LIVE_OPERATIONS_SCREEN",
  "EXECUTION_CANARY_CONTROL_ROOM_SCREEN", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN", "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
]);
const profileActor = (principal: CurrentSourcePrincipal) => JSON.stringify([
  principal.user.userId, principal.user.role, principal.session.userId, principal.session.sessionId,
  principal.session.sessionVersion, principal.workspaceId, principal.viewerWorkspaceId ?? principal.workspaceId,
]);

/**
 * Product-facing relation source.
 *
 * The durable local projection remains the normal path.  Before it has a
 * first committed snapshot (or while the feature is intentionally disabled),
 * a simple current page can use a checked-in EDS-11R named operation as a
 * server-side warm-up path.  It never restores the old generic direct
 * relation read: the browser cannot select a relation, upstream cursor or
 * source identity in either mode.
 */
@Injectable()
export class ExecutionProductReadSource {
  private readonly profileCompositions = new WeakMap<object, ProfileReadCompositionState>();
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
    @Inject(MaximumDataOperationService) private readonly namedOperations: MaximumDataOperationService,
    @Optional() @Inject(ExecutionReadScopes) private readonly readScopes?: ExecutionReadScopes,
  ) {}

  /** Keep every relation/scope the Profile screen used until the whole body
   * (or data-derived error) is ready. This is a retained point-in-time fence;
   * it does not implement native source custody at physical HTTP delivery. */
  async composeProfile<T>(principal: CurrentSourcePrincipal, screenId: string,
    environments: readonly CurrentSourceEnvironment[],
    read: (composition: ProfileReadComposition) => Promise<T>, options?: { readonly accountId: string }): Promise<T> {
    if (!PROFILE_COMPOSITION_SCREENS.has(screenId) || !Array.isArray(environments) || !environments.length ||
      environments.length > 3 || new Set(environments).size !== environments.length ||
      environments.some(environment => !["paper", "sandbox", "live", "canary"].includes(environment)) ||
      (screenId !== "EXECUTION_ACCOUNT_BROKER_360_SCREEN" && environments.length !== 1) ||
      (screenId === "EXECUTION_ACCOUNT_BROKER_360_SCREEN" && environments.includes("canary")) ||
      (options !== undefined && (screenId !== "EXECUTION_ACCOUNT_BROKER_360_SCREEN" ||
        !/^[A-Za-z0-9._:-]{1,128}$/.test(options.accountId))))
      throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
    const token = Object.freeze({}) as ProfileReadComposition;
    const state: ProfileReadCompositionState = { actor: profileActor(principal), workspace: principal.workspaceId, screenId,
      environments: new Set(environments), accountId: options?.accountId, accountProofs: new Map(),
      scopes: [], heads: [], unscoped: false, active: true };
    this.profileCompositions.set(token, state);
    let value: T | undefined, held: unknown, failed = false;
    try { value = await read(token); } catch (error) { held = error; failed = true; }
    state.active = false;
    const finish = async () => {
      const heads = new Map<string, typeof state.heads[number]>();
      for (const item of state.heads) {
        const key = JSON.stringify([item.environment, item.profileId]);
        const previous = heads.get(key);
        if (previous && JSON.stringify(previous.head) !== JSON.stringify(item.head))
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
        heads.set(key, item);
      }
      for (const item of heads.values()) {
        const current = await this.repository.snapshotMetadata(state.workspace, item.environment, item.profileId);
        if (!current || current.payloadDigest !== item.head.payloadDigest ||
          current.projectionEpoch !== item.head.projectionEpoch || current.sourceCatalogueSha256 !== item.head.sourceCatalogueSha256)
          throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      }
      if (failed) throw held;
      return value as T;
    };
    if (!state.scopes.length) {
      if (failed) throw held;
      return value as T;
    }
    if (state.unscoped || !this.readScopes) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    const validateActor = () => {
      if (profileActor(principal) !== state.actor) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    };
    if (new Set(state.scopes.map(scope => scope.environment)).size > 1) {
      if (screenId !== "EXECUTION_ACCOUNT_BROKER_360_SCREEN")
        throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
      return this.readScopes.deliverRetainedProfileAccounts(state.scopes, finish, validateActor);
    }
    return this.readScopes.deliverScopedTogether(state.scopes, finish, validateActor);
  }

  /** Read only inside the owning in-process composition; this is not an API
   * field, independent entitlement, or proof from a native Edge source. */
  retainedAccountIdentityProof(composition: ProfileReadComposition, principal: CurrentSourcePrincipal,
    environment: CurrentSourceEnvironment, accountId: string): RetainedAccountIdentityProof | null {
    const state = this.profileCompositions.get(composition);
    if (!state?.active || state.actor !== profileActor(principal) || state.screenId !== "EXECUTION_ACCOUNT_BROKER_360_SCREEN" ||
      state.accountId !== accountId || !state.environments.has(environment))
      throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
    return state.accountProofs.get(environment) ?? null;
  }

  private retainProfileRead(composition: ProfileReadComposition | undefined, principal: CurrentSourcePrincipal,
    requestedEnvironment: CurrentSourceEnvironment, screenId: string, profileId?: string,
    scope?: AuthorizedExecutionReadScope, head?: ProfileReadHead | null): void {
    if (!composition) return;
    const state = this.profileCompositions.get(composition);
    if (!state?.active || state.actor !== profileActor(principal) || state.screenId !== screenId ||
      !state.environments.has(requestedEnvironment)) throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
    if (!scope || scope.mode === "LEGACY_COMPATIBILITY") { state.unscoped = true; return; }
    const environment = maximumDataEnvironment(requestedEnvironment);
    if (!head || !profileId || scope.workspaceId !== principal.workspaceId || scope.environment !== environment || scope.profileId !== profileId)
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    const maximum = state.screenId === "EXECUTION_ACCOUNT_BROKER_360_SCREEN" ? 27 : 16;
    if (state.scopes.length >= maximum) throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT", 503);
    state.scopes.push(scope);
    state.heads.push({ environment, profileId, head: { payloadDigest: head.payloadDigest,
      projectionEpoch: head.projectionEpoch, sourceCatalogueSha256: head.sourceCatalogueSha256 } });
  }

  async relation(
    principal: CurrentSourcePrincipal,
    environment: CurrentSourceEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    query: ProductReadQuery,
    composition?: ProfileReadComposition,
  ): Promise<unknown> {
    if (query.accountTarget !== undefined) {
      const state = composition && this.profileCompositions.get(composition);
      if (!state?.active || state.actor !== profileActor(principal) || state.screenId !== screenId ||
        screenId !== "EXECUTION_ACCOUNT_BROKER_360_SCREEN" || !state.environments.has(environment) ||
        state.accountId !== query.accountTarget || !ACCOUNT_PROFILE_RELATIONS.has(relation))
        throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
    }
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      if (hasLocalQuery(query)) {
        throw new CurrentSourceProxyError("PHASE2_LOCAL_QUERY_REQUIRED", 503, {
          availability: "UNAVAILABLE", retryable: false,
        });
      }
      this.retainProfileRead(composition, principal, environment, screenId);
      return this.namedCurrentRelation(principal, environment, screenId, sourceId, relation, query);
    }
    try {
      return await this.localRelation(principal, environment, screenId, sourceId, relation, query, composition);
    } catch (error) {
      // A missing initial snapshot is the only safe read-through case.  A
      // stale, corrupt, scoped or otherwise rejected projection must remain
      // truthful rather than silently changing its consistency model.
      if (
        error instanceof CurrentSourceProxyError &&
        error.code === "N31_PROJECTION_NOT_READY" &&
        !retainedReview(this.config) &&
        !hasLocalQuery(query)
      ) {
        this.retainProfileRead(composition, principal, environment, screenId);
        return this.namedCurrentRelation(principal, environment, screenId, sourceId, relation, query);
      }
      throw error;
    }
  }

  /** One bounded exact-resource SOURCE_ONLY screen. Existing named source and
   * legacy reads remain unchanged; V2 never falls through to their authority. */
  async scopedLiveOperations<T=LiveSourceOperationsRead>(principal:CurrentSourcePrincipal,deploymentId:string,
    project:(view:LiveSourceOperationsRead)=>T=(value=>value as unknown as T),query:LiveSourceReadQuery={}):Promise<T>{
    if(!this.readScopes)throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
    const profileId=profile(this.config,"live"),scopeService=this.readScopes;
    const gate=await scopeService.authorize(principal,{environment:"live",profileId},
      {action:"governance.live.read",resource:{kind:"DEPLOYMENT",id:deploymentId}});
    if(gate.mode!=="SCOPED_V2")throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
    const checks:Array<()=>void>=[],keyId=this.config.QUERY_CURSOR_ACTIVE_KEY_ID;
    // Preserve the SAME codec; translate only its known safe cursor refusal
    // into this flight's typed public error. Arbitrary exceptions remain503.
    const decode=(token:string|undefined,binding:string)=>{
      try{return decodeScopedCursor(this.config,token,binding);}catch(error){
        if(error instanceof CurrentSourceProxyError&&error.code==="N31_PROJECTION_CURSOR_INVALID"&&error.status===400)
          throw new ExecutionReadScopeError("EXECUTION_READ_CURSOR_INVALID",400);
        throw error;
      }
    };
    const remember=(token:string,binding:string)=>{
      if(checks.length>=21)throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
      checks.push(()=>{
        if(keyId!==this.config.QUERY_CURSOR_ACTIVE_KEY_ID)
          throw new ExecutionReadScopeError("EXECUTION_READ_CURSOR_INVALID",400);
        decode(token,binding);
      });
    };
    const cursors={gateFingerprint:gate.fingerprint,
      decode:(token:string|undefined,binding:string)=>{
        if(token)remember(token,binding);
        return decode(token,binding);
      },
      encode:(offset:number,binding:string)=>{
        const token=encodeScopedCursor(this.config,offset,binding);remember(token,binding);return token;
      }};
    return scopeService.deliverScopedTogether([gate],async retain=>{
      if(principal.workspaceId!==this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID)
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE",404);
      if(this.config.FEATURE_EXECUTION_LOCAL_PROJECTION!=="true")
        throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED",503);
      const metadata=await this.repository.snapshotMetadata(principal.workspaceId,"live",profileId);
      // Establish the original exact Alpha/Deployment authority before loading
      // the full private document; the independent Live gate is insufficient.
      const deploymentScope=await authorizeRetainedRelation(scopeService,principal,"live",profileId,
        "manager.deployments","strategy_deployments",metadata??undefined,{kind:"DEPLOYMENT",id:deploymentId});
      if(!deploymentScope||deploymentScope.mode!=="SCOPED_V2")throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
      retain(deploymentScope);
      const {snapshot}=await this.localSnapshot("live",true);
      if(!metadata||snapshot.payloadDigest!==metadata.payloadDigest||snapshot.projectionEpoch!==metadata.projectionEpoch||
        snapshot.sourceCatalogueSha256!==metadata.sourceCatalogueSha256)
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED",409);
      let result:T|undefined,held:unknown,failed=false;
      try{
        const view=await scopedLiveSource(this.config,scopeService,principal,snapshot,deploymentId,retain,query,cursors);
        result=project(view);
        // Projectors are trusted PURE composition only. Reject accidental async
        // work rather than create an invisible authority gap after final delivery.
        if(result&&typeof result==="object"&&typeof (result as {then?:unknown}).then==="function")
          throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE",503);
        const encoded=JSON.stringify(result);
        if(typeof encoded!=="string"||Buffer.byteLength(encoded,"utf8")>1048576)
          throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_LIMIT",503);
      }catch(error){held=error;failed=true;}
      // Revalidate the original retained document even when decode, exact
      // purpose acquisition, pure composition or byte-cap errors are held.
      // The group then renews EVERY already-minted obligation and confirms
      // actual Core last; neither an error nor omitted panel skips that fence.
      await fenceRetainedSnapshot(this.repository,principal.workspaceId,"live",profileId,snapshot);
      if(failed)throw held;
      return result as T;
    },()=>{for(const check of checks)check();});
  }

  /**
   * Convert the safe R1 named DTO back into the pre-existing internal
   * Manager-page envelope.  This is strictly an in-process compatibility
   * adapter so the established Paper/Profile composers can retain their rich
   * layouts.  It does not expose a generic relation route or a raw source
   * record/cursor to any browser response.
   */
  private async namedCurrentRelation(
    principal: CurrentSourcePrincipal,
    requestedEnvironment: CurrentSourceEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    query: ProductReadQuery,
  ): Promise<unknown> {
    // Retain the frozen product composition binding before translating to the
    // EDS-11R operation.  Both values are server-owned constants from the
    // calling service, not browser selectors.
    validateBinding(requestedEnvironment, screenId, sourceId, relation, query);
    const operation = managerRelationOperationByRelation(relation);
    if (!operation || !operation.screenIds.includes(screenId)) {
      throw new CurrentSourceProxyError("EDS11R_PANEL_REQUIRES_PROJECTION", 503, {
        availability: "UNAVAILABLE",
        reason_code: "NO_SCREEN_BOUND_NAMED_CURRENT_OPERATION",
        retryable: false,
      });
    }
    const environment = maximumDataEnvironment(requestedEnvironment);
    try {
      const page = await this.namedOperations.relationPage(principal, operation.routeId, {
        environment,
        limit: query.limit ?? 100,
        ...(query.cursor ? { cursor: query.cursor } : {}),
      });
      return namedOperationPageAsManagerEnvelope(page, operation, requestedEnvironment, environment);
    } catch (error) {
      if (error instanceof MaximumDataOperationError) {
        throw new CurrentSourceProxyError(error.code, error.status, {
          availability: error.status >= 500 ? "UNAVAILABLE" : "DEGRADED",
          retryable: error.status >= 500,
        });
      }
      throw error;
    }
  }

  /**
   * Resolve one deployment from the full accepted local snapshot.  It is a
   * named Portal operation, not an exposed relation query and not a source
   * call.  Absence from a partial projection is deliberately PARTIAL rather
   * than a false 404.
   */
  async resolveDeploymentScope(
    principal: CurrentSourcePrincipal,
    requestedEnvironment: CurrentSourceEnvironment,
    screenId: string,
    deploymentId: string,
    composition?: ProfileReadComposition,
  ): Promise<DeploymentScopeResolution> {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      return { state: "UNAVAILABLE", reasonCode: "EDS03_EXACT_RESOURCE_REQUIRES_LOCAL_PROJECTION" };
    }
    if (!isOpaqueId(deploymentId)) {
      return { state: "EMPTY", reasonCode: "EDS03_DEPLOYMENT_ID_INVALID" };
    }
    try {
      validateBinding(requestedEnvironment, screenId, "manager.deployments", "strategy_deployments", { limit: 1 });
      const environment = maximumDataEnvironment(requestedEnvironment), profileId = profile(this.config, environment);
      if (this.readScopes && principal.workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID)
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const metadata = this.readScopes ? await this.repository.snapshotMetadata(principal.workspaceId, environment, profileId) : null;
      const readScope = await authorizeRetainedRelation(this.readScopes, principal, environment, profileId,
        "manager.deployments", "strategy_deployments", metadata ?? undefined, { kind: "DEPLOYMENT", id: deploymentId });
      this.retainProfileRead(composition, principal, requestedEnvironment, screenId, profileId, readScope, metadata);
      const read = async (): Promise<DeploymentScopeResolution> => {
      const { snapshot } = await this.localSnapshot(requestedEnvironment, readScope?.mode === "SCOPED_V2");
      if (readScope?.mode === "SCOPED_V2" && (snapshot.payloadDigest !== metadata?.payloadDigest || snapshot.projectionEpoch !== metadata?.projectionEpoch ||
          snapshot.sourceCatalogueSha256 !== metadata?.sourceCatalogueSha256)) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      try {
      const deployments = snapshot.document.relations["manager.deployments:strategy_deployments"];
      if (!deployments || deployments.availability === "UNAVAILABLE") {
        return {
          state: "UNAVAILABLE",
          reasonCode: deployments?.reason_code ?? "EDS03_DEPLOYMENT_RELATION_UNAVAILABLE",
        };
      }
      const visibleDeployments = scopedRetainedRows(readScope, deployments.items);
      const matches = visibleDeployments
        .map((row) => row.fields)
        .filter((fields) => fields.deployment_id === deploymentId);
      const completeDeploymentCensus = deployments.completeness === "COMPLETE" &&
        deployments.window?.truncated !== true &&
        Object.values(deployments.lineage_rejects ?? {}).every((count) => count === 0);
      if (matches.length === 0) {
        return completeDeploymentCensus
          ? { state: "EMPTY", reasonCode: "EDS03_DEPLOYMENT_NOT_FOUND" }
          : { state: "PARTIAL", reasonCode: "EDS03_DEPLOYMENT_OUTSIDE_RETAINED_WINDOW" };
      }
      if (matches.length !== 1) {
        return { state: "PARTIAL", reasonCode: "EDS03_DEPLOYMENT_ID_DUPLICATE" };
      }
      const deployment = matches[0];
      const strategyId = textField(deployment.strategy_id);
      const accountId = textField(deployment.account_id);
      const mode = textField(deployment.mode);
      const venue = textField(deployment.venue);
      if (!strategyId?.trim() || !accountId?.trim() || !venue?.trim() || mode?.toLowerCase() !== environment) {
        return {
          state: "PARTIAL",
          reasonCode: "EDS03_DEPLOYMENT_SCOPE_INCOMPLETE",
          deployment,
        };
      }
      // A tuple is not unique merely because the rows observed so far have
      // one exact match. A truncated/lineage-held census or an otherwise
      // compatible row with a missing dimension can hide a second owner.
      // Only the known environment enum is compared case-insensitively; do
      // not rewrite source identifiers or the returned payload.
      const tupleMatches = deployments.items
        .map((row) => row.fields)
        .filter((fields) => maybeTupleFieldMatches(fields.strategy_id, strategyId) &&
          maybeTupleFieldMatches(fields.account_id, accountId) &&
          maybeTupleFieldMatches(fields.mode, environment, true) && maybeTupleFieldMatches(fields.venue, venue));
      const accounts = snapshot.document.relations["manager.accounts:accounts"];
      const accountMatches = accounts?.availability === "AVAILABLE"
        ? scopedRetainedRows(readScope, accounts.items).map((row) => row.fields).filter((fields) => fields.account_id === accountId)
        : [];
      const account = accountMatches.length === 1 ? accountMatches[0] : undefined;
      const candidateReference = account ? textField(account.external_account_ref) : null;
      // This is a private join key, never a new field grant. A partial account
      // census, duplicate owner, unknown grain, or another possibly matching
      // reference cannot establish the venue/mode/broker identity.
      const completeAccountCensus = accounts?.availability === "AVAILABLE" && accounts.completeness === "COMPLETE" &&
        accounts.window?.truncated !== true &&
        Object.values(accounts.lineage_rejects ?? {}).every((count) => count === 0);
      const candidateOwners = candidateReference && accounts
        ? accounts.items.filter(({ fields }) => maybeTupleFieldMatches(fields.external_account_ref, candidateReference) &&
          maybeTupleFieldMatches(fields.mode, environment, true) && maybeTupleFieldMatches(fields.venue, venue))
        : [];
      const externalAccountRef = completeAccountCensus && candidateReference !== null && candidateReference.trim().length > 0 &&
        typeof account?.mode === "string" && account.mode.toLowerCase() === environment && account.venue === venue &&
        candidateOwners.length === 1 ? candidateReference : null;
      const result: DeploymentScopeResolution = {
        state: "FOUND",
        reasonCode: null,
        scope: {
          deploymentId,
          strategyId,
          accountId,
          mode: environment,
          venue,
          portfolioId: textField(deployment.portfolio_id),
          externalAccountRef,
          tupleUnique: completeDeploymentCensus && tupleMatches.length === 1,
        },
        deployment,
        identity: deploymentIdentityFromRetained({
          scope: readScope, deploymentId, deploymentFields: deployment,
          portfolios: snapshot.document.relations["manager.portfolios:portfolios"],
        }),
      };
      return result;
      } finally {
        // EMPTY, PARTIAL and source failures also depend on this snapshot.
        // A later revision must win over every result from the old one.
        if (readScope?.mode === "SCOPED_V2")
          await fenceRetainedSnapshot(this.repository, principal.workspaceId, environment, profileId, snapshot);
      }
      };
      return readScope && this.readScopes ? this.readScopes.deliver(readScope, read) : read();
    } catch (error) {
      if (error instanceof ExecutionReadScopeError) throw error;
      const reasonCode = error instanceof CurrentSourceProxyError ? error.code : "EDS03_DEPLOYMENT_SCOPE_UNAVAILABLE";
      return { state: "UNAVAILABLE", reasonCode };
    }
  }

  private async localRelation(
    principal: CurrentSourcePrincipal,
    requestedEnvironment: CurrentSourceEnvironment,
    screenId: string,
    sourceId: string,
    relation: string,
    query: ProductReadQuery,
    composition?: ProfileReadComposition,
  ): Promise<unknown> {
    validateBinding(requestedEnvironment, screenId, sourceId, relation, {
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    const environment = maximumDataEnvironment(requestedEnvironment), profileId = profile(this.config, environment),
      projectionWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!projectionWorkspaceId) throw new CurrentSourceProxyError("N31_PROJECTION_WORKSPACE_NOT_CONFIGURED", 503);
    if (this.readScopes && principal.workspaceId !== projectionWorkspaceId)
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const metadata = this.readScopes ? await this.repository.snapshotMetadata(projectionWorkspaceId, environment, profileId) : null;
    // A deployment selects the rows, but cannot turn an Alpha grant into an
    // account grant. Resolve the parent Account action independently against
    // the exact account selected by the already-resolved deployment.
    const action = retainedRelationAction(relation);
    const resource = query.deploymentScope ? action === "account.read"
      ? { kind: "ACCOUNT" as const, id: query.deploymentScope.accountId }
      : { kind: "DEPLOYMENT" as const, id: query.deploymentScope.deploymentId } : undefined;
    const readScope = await authorizeRetainedRelation(this.readScopes, principal, environment, profileId,
      sourceId, relation, metadata ?? undefined, resource, action);
    // These are physical-binding observations, not ordinary Account/Alpha
    // rows. Until the exact binding resolver and purpose are commissioned,
    // do not infer custody permission from a shared account or deployment.
    if (readScope?.mode === "SCOPED_V2" &&
        (relation === "broker_account_sync_effective" || relation === "venue_accounts"))
      throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
    this.retainProfileRead(composition, principal, requestedEnvironment, screenId, profileId, readScope, metadata);
    const read = async (accountScope?: AuthorizedExecutionReadScope) => {
    const isScoped = readScope?.mode === "SCOPED_V2";
    const accountTarget = isScoped ? query.accountTarget : undefined;
    const { snapshot, ageMs } = await this.localSnapshot(requestedEnvironment, isScoped);
    if (isScoped && (snapshot.payloadDigest !== metadata?.payloadDigest || snapshot.projectionEpoch !== metadata?.projectionEpoch ||
      snapshot.sourceCatalogueSha256 !== metadata?.sourceCatalogueSha256)) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    try {
    if (isScoped) {
      const fields = [query.status !== undefined || query.statuses !== undefined ? "status" : null,
        query.venue !== undefined ? "venue" : null, query.symbol !== undefined ? "symbol" : null,
        query.side !== undefined ? "side" : null,
        query.deployment_id !== undefined ? "deployment_id" : null,
        query.account_id !== undefined ? "account_id" : null,
        query.alpha_id !== undefined ? "alpha_id" : null,
        screenId === "EXECUTION_FULL_BLOTTER_SCREEN" && relation === "orders" ?
          query.sort === "updated_at_desc" ? "updated_at" : "submitted_at" : null];
      if ((accountTarget !== undefined && (!retainedFieldAllowed(readScope, "account_id") ||
        accountScope && !retainedFieldAllowed(accountScope, "account_id"))) || fields.some(field => field !== null &&
        (!retainedFieldAllowed(readScope, field) || accountScope && !retainedFieldAllowed(accountScope, field))))
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    }
    const projected = snapshot.document.relations[`${sourceId}:${relation}`];
    if (!projected) throw new CurrentSourceProxyError("N31_PROJECTED_RELATION_NOT_AVAILABLE", 503, {
      availability: "UNAVAILABLE", retryable: false,
    });
    if (projected.availability === "UNAVAILABLE") {
      throw new CurrentSourceProxyError("N31_PROJECTED_RELATION_UNAVAILABLE", 503, {
        availability: "UNAVAILABLE", reason_code: isScoped ? "EXECUTION_READ_NOT_AVAILABLE" : projected.reason_code, retryable: false,
      });
    }
    if (accountTarget !== undefined && relation === "accounts" && composition) {
      const owner = this.profileCompositions.get(composition);
      if (!owner?.active || owner.accountId !== accountTarget) throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
      const identityScope = readScope;
      if (!identityScope || identityScope.mode !== "SCOPED_V2")
        throw new ExecutionReadScopeError("EXECUTION_READ_SCOPE_REQUIRED");
      // A target not in the caller's authorized account population is the
      // same refusal whether or not an upstream row happens to exist.
      if (!scopeReadPopulation(identityScope).allowedTuples.some(tuple => tuple.account_id === accountTarget))
        throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
      const censusComplete = projected.completeness === "COMPLETE" && projected.window?.truncated !== true &&
        Object.values(projected.lineage_rejects ?? {}).every(count => count === 0) &&
        projected.items.every(({ fields }) => typeof fields.account_id === "string" && fields.account_id.trim().length > 0);
      const matches = projected.items.filter(({ fields }) => fields.account_id === accountTarget);
      const visible = matches.filter(row => projectionRowVisible(identityScope, row.fields));
      const state: RetainedAccountIdentityProof["state"] = !censusComplete ? "UNRESOLVED"
        : matches.length === 0 ? "MISSING"
          : visible.length !== matches.length ? "UNRESOLVED"
            : matches.length === 1 ? "FOUND" : "DUPLICATE";
      owner.accountProofs.set(requestedEnvironment, Object.freeze({ state }));
    }
    // Existing internal composers sometimes default absent money fields to zero.
    // Do not feed them a silently stripped protected value: this whole relation
    // remains unavailable until its purpose-built DTO can represent absence.
    if (isScoped && projected.items.some(row => projectionRowVisible(readScope, row.fields) &&
      (!accountScope || projectionRowVisible(accountScope, row.fields)) &&
      Object.keys(row.fields).some(field => DECIMAL_FIELD.has(field) &&
        (!retainedFieldAllowed(readScope, field) || accountScope && !retainedFieldAllowed(accountScope, field)))))
      throw new ExecutionReadScopeError("EXECUTION_READ_FIELD_POLICY_PENDING", 503);
    // Apply both population predicates to the original unredacted row. Only
    // then redact to the intersection of their field permissions: redacting
    // first could erase the anchors needed to reject a shared-account peer.
    const jointPopulation = accountScope ? projected.items.filter(row => projectionRowVisible(accountScope, row.fields)) : projected.items;
    const unknownAccountLineage = accountTarget !== undefined && jointPopulation.some(row =>
      projectionRowVisible(readScope!, row.fields) &&
      (typeof row.fields.account_id !== "string" || row.fields.account_id.trim().length === 0));
    const targetPopulation = accountTarget === undefined ? jointPopulation :
      jointPopulation.filter(row => row.fields.account_id === accountTarget);
    const primaryItems = scopedRetainedRows(readScope, targetPopulation);
    const authorizedItems = accountScope ? primaryItems.map(row => ({ ...row, fields: Object.fromEntries(
      Object.entries(row.fields).filter(([field]) => retainedFieldAllowed(accountScope, field)),
    ) })) : primaryItems;
    const resourceScoped = query.deploymentScope
      ? scopeRows(relation, authorizedItems, query.deploymentScope)
      : { items: authorizedItems, state: unknownAccountLineage ? "PARTIAL" as const : "EXACT" as const,
        reasonCode: unknownAccountLineage ? "EDS03_ACCOUNT_SCOPE_AMBIGUOUS" : null };
    // The same authorized relation population supplies rows, counts and the
    // continuation. Never filter an already-paginated Manager page in the BFF.
    const scoped = screenId === "EXECUTION_FULL_BLOTTER_SCREEN"
      ? blotterScopeRows(resourceScoped, query, environment, readScope)
      : resourceScoped;
    const scopedItems = screenId === "EXECUTION_FULL_BLOTTER_SCREEN" && relation === "orders"
      ? filterAndSort(scoped.items, query)
      : scoped.items;
    const limit = query.limit ?? 100;
    const cursorQuery = { ...query, cursor: undefined,
      ...(screenId === "EXECUTION_FULL_BLOTTER_SCREEN" ? { stage: query.stage ?? "PAPER" } : {}),
      ...(screenId === "EXECUTION_FULL_BLOTTER_SCREEN" && relation === "orders"
        ? { sort: query.sort ?? "submitted_at_desc" } : {}) };
    const cursorBinding = JSON.stringify([readScope?.fingerprint, requestedEnvironment, screenId, sourceId, relation,
      cursorQuery, snapshot.projectionEpoch, snapshot.payloadDigest, ...(accountScope ? [accountScope.fingerprint] : [])]);
    const boundCursor = isScoped || screenId === "EXECUTION_FULL_BLOTTER_SCREEN";
    const start = boundCursor ? decodeScopedCursor(this.config, query.cursor, cursorBinding) : decodeCursor(query.cursor, snapshot.payloadDigest);
    if (start > scopedItems.length) {
      throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_AHEAD", 409, {
        availability: "DEGRADED", retryable: false,
      });
    }
    const rows = scopedItems.slice(start, start + limit);
    const cursor = (offset: number) => boundCursor ? encodeScopedCursor(this.config, offset, cursorBinding) : encodeCursor(offset, snapshot.payloadDigest);
    const next = start + rows.length < scopedItems.length ? cursor(start + rows.length) : null;
    const previous = start > 0 ? cursor(Math.max(0, start - limit)) : null;
    /*
     * A hot projection is a current observation, not automatically a complete
     * population.  In particular, the worker marks a relation PARTIAL after
     * its bounded page budget.  Returning `projected_total_items` in that
     * state made a window look like an exact source count to Blotter.
     *
     * The only local exact-query proof this boundary may publish is one
     * complete relation under an exact server-owned scope.  It remains
     * explicitly Portal-derived downstream; it is never a claim about all
     * historical Trading-System rows.
     */
    const exactCurrentProjection = !isScoped && screenId === "EXECUTION_FULL_BLOTTER_SCREEN" && relation === "orders" &&
      projected.completeness === "COMPLETE" && scoped.state === "EXACT";
    // Existing non-Blotter resource pages use their local count purely as a
    // bounded page/navigation aid.  Blotter is the only consumer that labels
    // a count an exact query result, so its stricter proof must not silently
    // change those independent response contracts.
    const publishPageCounts = !isScoped &&
      (!(screenId === "EXECUTION_FULL_BLOTTER_SCREEN" && relation === "orders") || exactCurrentProjection);
    const result = {
      schema_version: "portal.execution.local-projection-bff.v1",
      authority: "PORTAL_CONTROL_API",
      requested_environment: requestedEnvironment,
      source_environment: environment,
      profile_id: profileId,
      workspace_id: projectionWorkspaceId,
      viewer_workspace_id: principal.workspaceId,
      // A scoped retained view is not the legacy complete-mirror proof. The
      // global checkpoint/clock stays private; do not synthesize a sequence,
      // relax the mirror parser, or let absent proof become TS exact totals.
      ...(!isScoped ? { projection: {
        authority: "SGP_POSTGRESQL",
        epoch: snapshot.projectionEpoch,
        sequence: snapshot.projectionSequence,
        payload_digest: snapshot.payloadDigest,
        source_contract_revision: snapshot.document.source_contract_revision,
        source_catalogue_sha256: snapshot.sourceCatalogueSha256 ?? snapshot.document.source_catalogue_sha256 ?? null,
        // The raw Manager checkpoint stays only in the durable SGP mirror.
        // Browser pagination uses Portal-signed continuation tokens; exposing
        // this value would make a current-page BFF an accidental source
        // selector and violates the EDS-11 revalidation boundary.
        source_cursor: null,
        received_at: snapshot.receivedAt.toISOString(),
        last_successful_refresh_at: snapshot.lastSuccessfulRefreshAt.toISOString(),
      } } : {}),
      source: {
        authority: "EXECUTION_CELL",
        profile_id: profileId,
        availability: "AVAILABLE",
        freshness: retainedReview(this.config) ? "STALE" : freshness(ageMs, this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS),
        completeness: isScoped || scoped.state === "PARTIAL" ? "PARTIAL" : projected.completeness,
        as_of: isScoped ? null : projected.as_of,
        data: {
          relation: { schema: "public", relation },
          items: rows.map((row) => ({
            relation: { schema: "public", relation },
            fields: Object.fromEntries(Object.entries(row.fields).map(([name, value]) => [name, tagged(name, value)])),
          })),
          next_cursor: next,
          previous_cursor: previous,
          ...(publishPageCounts ? {
            // These are deliberately derived from the one committed current
            // projection, after the same server-owned filter used for rows.
            // Do not emit them for an incomplete relation or ambiguous scope.
            projected_total_items: authorizedItems.length,
            filtered_total_items: scopedItems.length,
            ...(exactCurrentProjection ? { window_aggregates: countByDimensions(scopedItems) } : {}),
          } : {}),
          scope: query.deploymentScope || accountTarget !== undefined || hasBlotterScope(query) ? {
            ...(query.deploymentScope ? { resource_kind: "DEPLOYMENT",
              resource_id: query.deploymentScope.deploymentId } : {}),
            ...(accountTarget !== undefined ? { resource_kind: "ACCOUNT", resource_id: accountTarget } : {}),
            state: scoped.state,
            reason_code: scoped.reasonCode,
          } : undefined,
        },
      },
      ...(isScoped ? { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", policy_revision: readScope.policyRevision } : {}),
    };
    return result;
    } finally {
      // A data-derived refusal (including a cursor/scope error) is also an
      // observation of this document; do not emit it after a revision change.
      if (isScoped) await fenceRetainedSnapshot(this.repository, projectionWorkspaceId, environment, profileId, snapshot);
    }
    };
    if (readScope?.mode === "SCOPED_V2" && this.readScopes &&
        ((query.deploymentScope && DEPLOYMENT_ACCOUNT_RELATIONS.has(relation)) ||
         (query.accountTarget !== undefined && ACCOUNT_PROFILE_ALPHA_RELATIONS.has(relation)))) {
      // Hold the existing Alpha scope even if the account authorization fails,
      // and hold both successful obligations through the terminal fence.
      let refusal: { original: CurrentSourceProxyError; marker: ExecutionReadScopeError } | undefined;
      try {
        return await this.readScopes.deliverScopedTogether([readScope], async retain => {
          const accountScope = await authorizeRetainedRelation(this.readScopes, principal, environment, profileId,
            sourceId, relation, metadata ?? undefined,
            query.deploymentScope ? { kind: "ACCOUNT", id: query.deploymentScope.accountId } : undefined, "account.read");
          if (!accountScope || accountScope.mode !== "SCOPED_V2")
            throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
          retain(accountScope);
          this.retainProfileRead(composition, principal, requestedEnvironment, screenId, profileId, accountScope, metadata);
          try { return await read(accountScope); } catch (error) {
            if (error instanceof CurrentSourceProxyError && RETAINED_SAFE_REFUSALS[error.code] === error.status) {
              const marker = new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", error.status);
              refusal = { original: error, marker };
              throw marker;
            }
            throw error;
          }
        });
      } catch (error) {
        // Object identity guarantees that a later authority failure cannot be
        // mistaken for the earlier, held input/source refusal.
        if (refusal && error === refusal.marker) throw refusal.original;
        throw error;
      }
    }
    return readScope && this.readScopes ? this.readScopes.deliver(readScope, () => read()) : read();
  }

  private async localSnapshot(requestedEnvironment: CurrentSourceEnvironment, raw = false): Promise<{
    snapshot: ProfileProjectionSnapshot;
    environment: ProjectionEnvironment;
    profileId: string;
    projectionWorkspaceId: string;
    ageMs: number | null;
  }> {
    const environment: ProjectionEnvironment = requestedEnvironment === "canary" ? "live" : requestedEnvironment;
    const profileId = profile(this.config, environment);
    const projectionWorkspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!projectionWorkspaceId) {
      throw new CurrentSourceProxyError("N31_PROJECTION_WORKSPACE_NOT_CONFIGURED", 503);
    }
    const snapshot = raw ? await this.repository.rawSnapshot(projectionWorkspaceId, environment, profileId)
      : await this.repository.snapshot(projectionWorkspaceId, environment, profileId);
    if (!snapshot) throw new CurrentSourceProxyError("N31_PROJECTION_NOT_READY", 503, {
      availability: "UNAVAILABLE", retryable: true,
    });
    // A refresh stamp that will not parse is an age nobody measured, not an
    // age of zero: `valueOf()` gives NaN and every comparison below would then
    // be false, which used to read as FRESH.
    const refreshedAt = snapshot.lastSuccessfulRefreshAt.valueOf();
    const ageMs = Number.isFinite(refreshedAt) ? Date.now() - refreshedAt : null;
    if (ageMs !== null && projectionExpired(this.config, snapshot.lastSuccessfulRefreshAt)) {
      throw new CurrentSourceProxyError("N31_PROJECTION_STALE_CEILING_EXCEEDED", 503, {
        availability: "UNAVAILABLE", retryable: true,
      });
    }
    return { snapshot, environment, profileId, projectionWorkspaceId, ageMs };
  }
}

function maximumDataEnvironment(environment: CurrentSourceEnvironment): MaximumDataEnvironment {
  // Canary is deliberately a Portal governance composition over the approved
  // Live read profile.  It is never a fourth source profile.
  return environment === "canary" ? "live" : environment;
}

function namedOperationPageAsManagerEnvelope(
  value: unknown,
  operation: ManagerRelationOperation,
  requestedEnvironment: CurrentSourceEnvironment,
  environment: MaximumDataEnvironment,
): Record<string, unknown> {
  const page = namedObject(value, "EDS11R_NAMED_PAGE_INVALID");
  const binding = managerRelationProfileBinding(environment);
  if (
    page.schema_version !== "portal.execution.eds11r.manager-relation-page.v1" ||
    page.logical_operation_id !== operation.operationId ||
    page.field_id !== operation.fieldId ||
    page.environment !== environment ||
    page.profile_id !== binding.profileId ||
    typeof page.source_contract_revision !== "string" ||
    typeof page.source_catalogue_sha256 !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(page.source_catalogue_sha256)
  ) throw namedContractError();

  const sourceHealth = namedObject(page.source_health, "EDS11R_NAMED_SOURCE_HEALTH_INVALID");
  if (
    sourceHealth.availability !== "AVAILABLE" ||
    typeof sourceHealth.as_of_ms !== "number" ||
    !Number.isSafeInteger(sourceHealth.as_of_ms) ||
    sourceHealth.as_of_ms < 0 || sourceHealth.as_of_ms > 8_640_000_000_000_000
  ) throw namedContractError();
  const sourceFreshness = namedFreshness(sourceHealth.freshness);
  const sourceCompleteness = namedCompleteness(sourceHealth.completeness);

  const pageInfo = namedObject(page.page, "EDS11R_NAMED_PAGE_METADATA_INVALID");
  const nextCursor = namedOptionalCursor(pageInfo.next_cursor);
  if (!Array.isArray(page.records) || page.records.length > 200) throw namedContractError();
  const records = page.records.map((candidate) => {
    const record = namedObject(candidate, "EDS11R_NAMED_RECORD_INVALID");
    const values = namedObject(record.values, "EDS11R_NAMED_RECORD_VALUES_INVALID");
    const fields: Record<string, unknown> = {};
    for (const field of operation.fields) {
      if (!(field.name in values)) continue;
      fields[field.name] = namedTaggedValue(field.kind, values[field.name]);
    }
    if (Object.keys(fields).length === 0) throw namedContractError();
    // `resource_id` is intentionally not copied: it is a Portal BFF identity
    // for the named route, not the Manager record key or a new browser join
    // selector.  The existing narrow composer consumes approved safe fields.
    return {
      relation: { schema: operation.schema, relation: operation.relation },
      fields,
    };
  });

  return {
    schema_version: "portal.execution.current-source-bff.v2",
    authority: "PORTAL_CONTROL_API",
    requested_environment: requestedEnvironment,
    source_environment: environment,
    profile_id: binding.profileId,
    source: {
      contract_version: page.source_contract_revision,
      authority: "EXECUTION_CELL",
      profile_id: binding.profileId,
      catalogue_sha256: page.source_catalogue_sha256,
      availability: "AVAILABLE",
      freshness: sourceFreshness,
      completeness: sourceCompleteness,
      as_of: new Date(sourceHealth.as_of_ms).toISOString(),
      data: {
        relation: { schema: operation.schema, relation: operation.relation },
        items: records,
        next_cursor: nextCursor,
      },
    },
  };
}

function namedFreshness(value: unknown): "FRESH" | "AGING" | "STALE" | "UNKNOWN" {
  if (value === "FRESH" || value === "AGING" || value === "UNKNOWN") return value;
  if (value === "DEGRADED" || value === "STALE" || value === "PAUSED" || value === "UNAVAILABLE") return "STALE";
  throw namedContractError();
}

function namedCompleteness(value: unknown): "COMPLETE" | "PARTIAL" | "UNKNOWN" {
  if (value === "COMPLETE" || value === "UNKNOWN") return value;
  if (value === "PARTIAL" || value === "POLL_BOUNDED" || value === "EVENT_SOURCED") return "PARTIAL";
  throw namedContractError();
}

function namedTaggedValue(
  kind: ManagerRelationOperation["fields"][number]["kind"],
  value: unknown,
): Record<string, unknown> {
  if (value === null) return { kind: "NULL", value: null };
  if (kind === "BOOLEAN" && typeof value === "boolean") return { kind, value };
  if (
    kind === "INTEGER" && typeof value === "string" && value.length <= 96 &&
    /^-?(?:0|[1-9]\d*)$/.test(value)
  ) return { kind, value };
  if (
    kind === "DECIMAL" && typeof value === "string" && value.length <= 96 &&
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  ) return { kind, value };
  if (kind === "TEXT" && typeof value === "string" && Buffer.byteLength(value, "utf8") <= 4_096) {
    return { kind, value };
  }
  if (kind === "TIMESTAMP" && typeof value === "number" && Number.isSafeInteger(value) &&
      value >= 0 && value <= 8_640_000_000_000_000) {
    return { kind, value: new Date(value).toISOString() };
  }
  throw namedContractError();
}

function namedOptionalCursor(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length < 1 || Buffer.byteLength(value, "utf8") > 4_096) {
    throw namedContractError();
  }
  return value;
}

function namedObject(value: unknown, code: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CurrentSourceProxyError(code, 502, {
      availability: "UNAVAILABLE", reason_code: "SOURCE_CONTRACT_REJECTED", retryable: false,
    });
  }
  return value as Record<string, unknown>;
}

function namedContractError(): CurrentSourceProxyError {
  return new CurrentSourceProxyError("EDS11R_NAMED_SOURCE_CONTRACT_REJECTED", 502, {
    availability: "UNAVAILABLE", reason_code: "SOURCE_CONTRACT_REJECTED", retryable: false,
  });
}

interface LocalProductQuery {
  stage?: "PAPER" | "SANDBOX" | "CANARY" | "LIVE";
  deployment_id?: string;
  account_id?: string;
  alpha_id?: string;
  status?: string;
  statuses?: readonly string[];
  venue?: string;
  symbol?: string;
  side?: "BUY" | "SELL";
  sort?: "submitted_at_desc" | "submitted_at_asc" | "updated_at_desc";
}

function hasLocalQuery(query: LocalProductQuery & DeploymentScopeQuery): boolean {
  return query.status !== undefined || query.statuses !== undefined || query.venue !== undefined || query.symbol !== undefined ||
    query.side !== undefined || query.sort !== undefined || query.deploymentScope !== undefined || hasBlotterScope(query);
}

function hasBlotterScope(query: LocalProductQuery): boolean {
  return query.stage !== undefined || query.deployment_id !== undefined ||
    query.account_id !== undefined || query.alpha_id !== undefined;
}

type ScopedRows = {
  readonly items: readonly { fields: Record<string, ProjectionScalar> }[];
  readonly state: "EXACT" | "PARTIAL";
  readonly reasonCode: string | null;
};

/** Closed query axes over the already-authorized relation. Alpha and strategy
 * are different namespaces: only the qualified publication may connect them.
 * Rows with ambiguous/missing attribution are absent with a typed PARTIAL
 * reason, never counted as an exact empty result or assigned to one sibling.
 */
function blotterScopeRows(rows: ScopedRows, query: LocalProductQuery,
  environment: ProjectionEnvironment, scope: AuthorizedExecutionReadScope | undefined): ScopedRows {
  if (query.stage !== undefined && query.stage !== environment.toUpperCase()) {
    throw new CurrentSourceProxyError("N22_BLOTTER_STAGE_NOT_AVAILABLE", 400, {
      availability: "UNAVAILABLE", retryable: false,
    });
  }
  const axes = ["deployment_id", "account_id", "alpha_id"] as const;
  const requested = axes.filter(axis => query[axis] !== undefined);
  if (requested.length === 0) return rows;
  const selected = (tuple: Record<typeof axes[number], string>) =>
    requested.every(axis => tuple[axis] === query[axis]);
  const population = scope?.mode === "SCOPED_V2" ? scopeReadPopulation(scope) : null;
  if (population && !population.allowedTuples.some(selected)) {
    // Hidden IDs, unknown IDs and impossible correlated selections share one
    // refusal, before counting, sorting or returning any source row.
    throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
  }
  const strategyPairs = new Map<string, string>();
  for (const pair of population?.strategyPairs ?? []) {
    if (strategyPairs.has(pair.strategy_id))
      throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503);
    strategyPairs.set(pair.strategy_id, pair.alpha_id);
  }
  const anchors = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id"] as const;
  const exactSelection = new Map(population?.allowedTuples.map(tuple =>
    [JSON.stringify(anchors.map(axis => tuple[axis])), selected(tuple)] as const));
  const partialSelection = new Map<string, boolean | null>();
  let incomplete = false;
  const items = rows.items.filter(row => {
    if (!population) {
      if (requested.some(axis => typeof row.fields[axis] !== "string" || row.fields[axis] === "")) {
        incomplete = true;
        return false;
      }
      return requested.every(axis => row.fields[axis] === query[axis]);
    }
    if (anchors.every(axis => typeof row.fields[axis] === "string")) {
      const exact = exactSelection.get(JSON.stringify(anchors.map(axis => row.fields[axis])));
      if (exact === undefined || row.fields.strategy_id !== undefined && row.fields.strategy_id !== null &&
          (typeof row.fields.strategy_id !== "string" || strategyPairs.get(row.fields.strategy_id) !== row.fields.alpha_id)) {
        incomplete = true;
        return false;
      }
      return exact;
    }
    // Orders often share the same partial lineage. Cache by lineage, not by
    // order ID, so a long retained history does not rescan every source tuple
    // for every order. Complete tuple witnesses above stay constant-time.
    const key = JSON.stringify([...anchors.map(axis => row.fields[axis] ?? null), row.fields.strategy_id ?? null]);
    if (partialSelection.has(key)) {
      const cached = partialSelection.get(key)!;
      if (cached === null) incomplete = true;
      return cached === true;
    }
    const candidates = population.allowedTuples.filter(tuple => anchors.every(axis =>
      row.fields[axis] === undefined || row.fields[axis] === null || row.fields[axis] === tuple[axis]) &&
      (row.fields.strategy_id === undefined || row.fields.strategy_id === null ||
        typeof row.fields.strategy_id === "string" && strategyPairs.get(row.fields.strategy_id) === tuple.alpha_id));
    if (candidates.length === 0) {
      partialSelection.set(key, null);
      incomplete = true;
      return false;
    }
    const matching = candidates.filter(selected);
    if (matching.length > 0 && matching.length !== candidates.length) {
      partialSelection.set(key, null);
      incomplete = true;
      return false;
    }
    partialSelection.set(key, matching.length > 0);
    return matching.length > 0;
  });
  return { items, state: incomplete ? "PARTIAL" : rows.state,
    reasonCode: rows.reasonCode ?? (incomplete ? "N22_BLOTTER_SCOPE_LINEAGE_NOT_PUBLISHED" : null) };
}

/**
 * Scope rows before local keyset pagination.  A row with an explicit
 * deployment_id wins.  Relations without that id may use the complete
 * four-part tuple only when that tuple names exactly one deployment; this is
 * intentionally narrower than the historical two-of-four heuristic.
 */
function scopeRows(
  relation: string,
  rows: readonly { fields: Record<string, ProjectionScalar> }[],
  scope: DeploymentResourceScope,
): ScopedRows {
  if (relation === "strategy_deployments") {
    return exactRows(rows, (fields) => fields.deployment_id === scope.deploymentId);
  }
  if (["accounts", "account_balances", "margin_balances", "account_sync_effective", "venue_accounts"].includes(relation)) {
    return exactRows(rows, (fields) => fields.account_id === scope.accountId);
  }
  if (relation === "broker_account_sync_effective") {
    if (!scope.externalAccountRef) {
      return { items: [], state: "PARTIAL", reasonCode: "EDS03_EXTERNAL_ACCOUNT_REF_UNAVAILABLE" };
    }
    const items: Array<(typeof rows)[number]> = [];
    let unclassified = false;
    for (const row of rows) {
      const fields = row.fields;
      const possible = maybeTupleFieldMatches(fields.external_account_ref, scope.externalAccountRef) &&
        maybeTupleFieldMatches(fields.mode, scope.mode, true) && maybeTupleFieldMatches(fields.venue, scope.venue);
      if (!possible) continue;
      if (fields.external_account_ref === scope.externalAccountRef && typeof fields.mode === "string" &&
          fields.mode.toLowerCase() === scope.mode && fields.venue === scope.venue) items.push(row);
      else unclassified = true;
    }
    return { items, state: unclassified ? "PARTIAL" : "EXACT",
      reasonCode: unclassified ? "EDS03_DEPLOYMENT_SCOPE_AMBIGUOUS" : null };
  }
  if (relation === "portfolio_equity_snapshots") {
    if (!scope.portfolioId) {
      return { items: [], state: "PARTIAL", reasonCode: "EDS03_PORTFOLIO_SCOPE_UNAVAILABLE" };
    }
    return exactRows(rows, (fields) => fields.portfolio_id === scope.portfolioId);
  }
  // Explicit deployment ids always win. A source may mix them with rows that
  // have only the tuple: do not silently discard the latter and call the
  // result complete, and never override an explicit foreign deployment id.
  const items: Array<(typeof rows)[number]> = [];
  let unclassified = false;
  for (const row of rows) {
    const fields = row.fields;
    const id = fields.deployment_id;
    if (typeof id === "string" && id.trim()) {
      if (id === scope.deploymentId) items.push(row);
      continue;
    }
    const possible = maybeTupleFieldMatches(fields.strategy_id, scope.strategyId) &&
      maybeTupleFieldMatches(fields.account_id, scope.accountId) &&
      maybeTupleFieldMatches(fields.mode, scope.mode, true) && maybeTupleFieldMatches(fields.venue, scope.venue);
    if (!possible) continue;
    const exact = fields.strategy_id === scope.strategyId && fields.account_id === scope.accountId &&
      typeof fields.mode === "string" && fields.mode.toLowerCase() === scope.mode && fields.venue === scope.venue;
    if ((id === null || id === undefined) && exact && scope.tupleUnique) items.push(row);
    else unclassified = true;
  }
  return { items, state: unclassified ? "PARTIAL" : "EXACT",
    reasonCode: unclassified ? "EDS03_DEPLOYMENT_SCOPE_AMBIGUOUS" : null };
}

/** Missing tuple dimensions cannot disprove that a row has the target owner. */
function maybeTupleFieldMatches(value: ProjectionScalar | undefined, expected: string, environment = false): boolean {
  if (typeof value !== "string" || !value.trim()) return true;
  return environment ? value.toLowerCase() === expected : value === expected;
}

function exactRows(
  rows: readonly { fields: Record<string, ProjectionScalar> }[],
  predicate: (fields: Record<string, ProjectionScalar>) => boolean,
): ScopedRows {
  return { items: rows.filter((row) => predicate(row.fields)), state: "EXACT", reasonCode: null };
}

function textField(value: ProjectionScalar | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isOpaqueId(value: string): boolean {
  return value.length > 0 && value.length <= 191 && !/[\u0000-\u001f]/.test(value);
}

function filterAndSort(
  rows: readonly { fields: Record<string, ProjectionScalar> }[],
  query: LocalProductQuery,
) {
  const equals = (value: ProjectionScalar | undefined, expected: string | undefined) =>
    expected === undefined || String(value ?? "").toUpperCase() === expected.toUpperCase();
  // A canonical query word must match the raw source word too (P4-F): the
  // projection still holds e.g. RISK_REJECTED, which the map reads REJECTED.
  const statusEquals = (value: ProjectionScalar | undefined, expected: string | undefined) => {
    if (expected === undefined) return true;
    const raw = String(value ?? "").toUpperCase();
    return raw === expected.toUpperCase() || canonicalOrderStatus(raw) === expected.toUpperCase();
  };
  const selected = rows.filter((row) =>
    statusEquals(row.fields.status, query.status) &&
    (query.statuses === undefined || query.statuses.some((status) => statusEquals(row.fields.status, status))) &&
    equals(row.fields.venue, query.venue) &&
    equals(row.fields.symbol, query.symbol) && equals(row.fields.side, query.side));
  const sort = query.sort ?? "submitted_at_desc";
  const field = sort === "updated_at_desc" ? "updated_at" : "submitted_at";
  const direction = sort === "submitted_at_asc" ? 1 : -1;
  return [...selected].sort((left, right) => direction * (
    String(left.fields[field] ?? "").localeCompare(String(right.fields[field] ?? "")) ||
    String(left.fields.order_id ?? "").localeCompare(String(right.fields.order_id ?? ""))
  ));
}

function countByDimensions(rows: readonly { fields: Record<string, ProjectionScalar> }[]) {
  const dimensions = ["status", "venue", "side"] as const;
  return Object.fromEntries(dimensions.map((dimension) => [dimension, rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row.fields[dimension] ?? "UNKNOWN");
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {})]));
}

function validateBinding(
  environment: CurrentSourceEnvironment,
  screenId: string,
  sourceId: string,
  relation: string,
  query: CurrentSourcePageQuery,
): void {
  if (MANAGER_LIST_SCREENS.has(screenId)) {
    managerListManagerV2Path(environment, screenId, sourceId, relation, query);
  } else if (environment === "paper") {
    paperManagerV2Path(screenId, sourceId, relation, query);
  } else {
    profileManagerV2Path(environment, screenId, sourceId, relation, query);
  }
}

function profile(config: ControlApiConfig, environment: ProjectionEnvironment): string {
  const value = environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  if (!value) throw new CurrentSourceProxyError("N31_PROFILE_NOT_CONFIGURED", 503);
  return value;
}

/**
 * PHASE 3C (round 2) · the tier comes from a declared policy, not a multiplier
 * somebody liked the look of.
 *
 * A38.7 item 3: stale-after is at least three declared poll intervals plus
 * proven operational jitter — three because two missed cycles are ordinary
 * under load and a third means the ladder is not running, and the jitter is
 * the observed spread of drain completion rather than a guess. The thresholds
 * live in `environment-parity.ts` beside the manifest that publishes them, so
 * a screen showing a tier and the manifest explaining it cannot drift apart.
 *
 * An age nobody could compute is `UNKNOWN`. It used to be impossible to reach
 * that branch here: `ageMs` was always a number, so a snapshot with no usable
 * refresh timestamp would have been drawn as FRESH.
 */
function freshness(
  ageMs: number | null,
  pollIntervalMs: number,
): "FRESH" | "AGING" | "STALE" | "UNKNOWN" {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) return "UNKNOWN";
  const [policy] = freshnessPolicies({
    EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: pollIntervalMs,
  } as unknown as Parameters<typeof freshnessPolicies>[0]);
  if (!policy) return "UNKNOWN";
  // One cadence plus jitter is a read that arrived on time.
  if (ageMs <= policy.declared_poll_interval_ms + policy.operational_jitter_ms) return "FRESH";
  if (ageMs <= policy.stale_after_ms) return "AGING";
  return "STALE";
}

function encodeCursor(offset: number, digest: string): string {
  return `lp1:${offset}:${digest.slice("sha256:".length, "sha256:".length + 16)}`;
}

function encodeScopedCursor(config: ControlApiConfig, offset: number, binding: string): string {
  const prefix = `lps2.${config.QUERY_CURSOR_ACTIVE_KEY_ID}.${offset}.${Math.floor(Date.now() / 1000) + config.QUERY_CURSOR_TTL_SECONDS}`;
  const signature = createHmac("sha256", querySigningKeys(config)[config.QUERY_CURSOR_ACTIVE_KEY_ID])
    .update(binding).update("\u0000" + prefix).digest("base64url");
  return `${prefix}.${signature}`;
}
function decodeScopedCursor(config: ControlApiConfig, cursor: string | undefined, binding: string): number {
  if (!cursor) return 0;
  const match = /^lps2\.([A-Za-z0-9_-]{1,32})\.(\d{1,8})\.(\d{10})\.([A-Za-z0-9_-]{43})$(?![\s\S])/.exec(cursor);
  const keys = querySigningKeys(config);
  if (!match || !keys[match[1]] || Number(match[3]) <= Math.floor(Date.now() / 1000))
    throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_INVALID", 400);
  const expected = createHmac("sha256", keys[match[1]]).update(binding)
    .update("\u0000" + cursor.slice(0, cursor.lastIndexOf("."))).digest();
  const received = Buffer.from(match[4], "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected))
    throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_INVALID", 400);
  return Number(match[2]);
}

function decodeCursor(cursor: string | undefined, digest: string): number {
  if (!cursor) return 0;
  const match = LOCAL_CURSOR.exec(cursor);
  if (!match || match[2] !== digest.slice("sha256:".length, "sha256:".length + 16)) {
    throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_INVALID", 400);
  }
  const value = Number(match[1]);
  if (!Number.isSafeInteger(value)) throw new CurrentSourceProxyError("N31_PROJECTION_CURSOR_INVALID", 400);
  return value;
}

function tagged(name: string, value: ProjectionScalar): { kind: string; value: ProjectionScalar } {
  if (value === null) return { kind: "NULL", value };
  if (Array.isArray(value)) return { kind: "ARRAY", value };
  if (typeof value === "boolean") return { kind: "BOOLEAN", value };
  if (typeof value === "number") return { kind: "INTEGER", value };
  if (typeof value !== "string") {
    throw new CurrentSourceProxyError("N31_PROJECTION_SCALAR_INVALID", 500);
  }
  if (DECIMAL_FIELD.has(name) && /^-?\d+(?:\.\d+)?$/.test(value)) return { kind: "DECIMAL", value };
  if ((name === "ts" || name === "trade_time" || name.endsWith("_at")) &&
      !Number.isNaN(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return { kind: "TIMESTAMP", value };
  }
  return { kind: "TEXT", value };
}
