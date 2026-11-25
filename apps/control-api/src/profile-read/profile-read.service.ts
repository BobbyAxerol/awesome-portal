import { VENUE_ACCOUNT_FIELDS } from "../execution/profile-projection.catalog";
import { Inject, Injectable } from "@nestjs/common";
import { AuthSession, PortalUser } from "../domain";
import {
  CurrentSourcePrincipal,
  CurrentSourceProxyError,
} from "../execution/current-source.proxy";
import {
  DeploymentResourceScope,
  DeploymentScopeResolution,
  ExecutionProductReadSource,
  type ProfileReadComposition,
} from "../execution/product-read-source";
import { ManagerPage, ManagerReadContext, managerPage } from "../paper-read/manager-records";
import { enforceProfileLineage } from "../execution/profile-lineage";
import { accountComparisonAvailability, exactFinancialDecimal } from "../execution/account-comparison-availability";
import { attachDeploymentIdentity, IDENTITY_NOT_AUTHORIZED, IDENTITY_NOT_READ, type DeploymentIdentity } from "../execution/deployment-identity";
import { ExecutionReadScopeError } from "../execution-v2/read-scope";
import {
  oldestStageAsOfMs,
  stagePanels,
  type StageRelation,
  wireStageValue,
} from "../execution/stage-screen-wire";

export type N23ReadEnvironment = "paper" | "sandbox" | "live" | "canary";
type SourceEnvironment = "paper" | "sandbox" | "live";
type CapabilityState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

export interface ProfileReadPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
  /** Trusted session workspace, distinct from a retained source workspace. */
  viewerWorkspaceId?: string;
}

interface RelationSpec {
  key: string;
  sourceId: string;
  relation: string;
  fields: readonly string[];
  limit: number;
}

interface RelationResult {
  spec: RelationSpec;
  page: ManagerPage | null;
  state: CapabilityState;
  reasonCode: string | null;
  /** Rows we could not account for, by missing-parent class. */
  lineageRejects?: Readonly<Record<string, number>>;
  /** Rows proven to belong to another profile, by parent class. */
  lineageScopedOut?: Readonly<Record<string, number>>;
}

const DEPLOYMENT_FIELDS = [
  "deployment_id", "strategy_id", "account_id", "mode", "venue", "currency",
  "active", "portfolio_id", "state", "account_policy_id", "risk_profile_id", "created_at", "updated_at",
] as const;
const POSITION_FIELDS = [
  "position_id", "strategy_id", "account_id", "mode", "venue", "instrument_id",
  "side", "signed_qty", "quantity", "avg_px_open", "avg_px_close", "realized_pnl",
  "unrealized_pnl", "mark_price", "mark_price_at", "notional", "peak_qty",
  "opened_at", "closed_at", "updated_at",
] as const;
const SESSION_FIELDS = [
  "execution_session_id", "strategy_id", "account_id", "mode", "venue", "cycle_key", "state",
  "submitted_count", "risk_approved_count", "risk_rejected_count", "sent_count", "filled_count",
  "partial_fill_count", "broker_rejected_count", "accounting_recovered_count",
  "reconciliation_deferred_count", "reconciliation_actionable_count",
  "started_at", "updated_at", "completed_at",
] as const;
const RECONCILIATION_FIELDS = [
  "finding_id", "account_id", "strategy_id", "execution_session_id", "mode", "venue",
  "finding_type", "severity", "status", "created_at", "resolved_at",
] as const;
const ACCOUNT_FIELDS = [
  "account_id", "trader_id", "strategy_id", "mode", "venue", "account_type",
  "base_currency", "external_account_ref", "active", "created_at", "updated_at",
] as const;
const ACCOUNT_BALANCE_FIELDS = ["account_id", "currency", "total", "locked", "free", "updated_at"] as const;
const MARGIN_BALANCE_FIELDS = [
  "account_id", "instrument_id", "currency", "initial", "maintenance", "updated_at",
] as const;
const ACCOUNT_SYNC_FIELDS = [
  "sync_id", "account_id", "mode", "venue", "source", "status", "buying_power",
  "currency", "synced_at", "created_at",
] as const;
const BROKER_SYNC_FIELDS = [
  "sync_id", "external_account_ref", "mode", "venue", "source", "status",
  "buying_power", "currency", "synced_at", "created_at",
] as const;
const ORDER_FIELDS = [
  "order_id", "client_order_id", "venue_order_id", "trader_id", "strategy_id", "account_id",
  "execution_session_id", "mode", "venue", "instrument_id", "symbol", "side", "position_side",
  "order_type", "time_in_force", "quantity", "price", "trigger_price", "status", "reduce_only",
  "post_only", "submitted_at", "updated_at", "error_code", "error_message", "risk_grant_id", "intent",
] as const;
const FILL_FIELDS = [
  "fill_id", "event_id", "trade_time", "trade_id", "client_order_id", "venue_order_id",
  "strategy_id", "account_id", "execution_session_id", "mode", "venue", "instrument_id",
  "side", "price", "quantity", "commission", "commission_currency", "liquidity_side", "realized_pnl",
] as const;

const COMMON = [
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 200),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  spec("sessions", "manager.sessions", "execution_sessions", SESSION_FIELDS, 200),
] as const;
const ACCOUNTS = [
  spec("accounts", "manager.accounts", "accounts", ACCOUNT_FIELDS, 200),
  spec("account_balances", "manager.accounts", "account_balances", ACCOUNT_BALANCE_FIELDS, 200),
  spec("margin_balances", "manager.accounts", "margin_balances", MARGIN_BALANCE_FIELDS, 200),
  spec("account_sync", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC_FIELDS, 200),
  spec("broker_sync", "manager.accounts", "broker_account_sync_effective", BROKER_SYNC_FIELDS, 200),
] as const;
const RECONCILIATION = spec(
  "reconciliation", "manager.reconciliation", "reconciliation_findings", RECONCILIATION_FIELDS, 200,
);
const LIVE_FLOW = [
  spec("orders", "manager.orders", "orders", ORDER_FIELDS, 200),
  spec("fills", "manager.fills", "fills", FILL_FIELDS, 200),
] as const;
const ACCOUNT_360 = [
  spec("accounts", "manager.accounts", "accounts", ACCOUNT_FIELDS, 200),
  spec("account_balances", "manager.accounts", "account_balances", ACCOUNT_BALANCE_FIELDS, 200),
  spec("margin_balances", "manager.accounts", "margin_balances", MARGIN_BALANCE_FIELDS, 200),
  spec("account_sync", "manager.accounts", "account_sync_effective", ACCOUNT_SYNC_FIELDS, 200),
  spec("broker_sync", "manager.accounts", "broker_account_sync_effective", BROKER_SYNC_FIELDS, 200),
  spec("venue_accounts", "manager.venue-accounts", "venue_accounts", VENUE_ACCOUNT_FIELDS, 200),
  spec("deployments", "manager.deployments", "strategy_deployments", DEPLOYMENT_FIELDS, 200),
  spec("positions", "manager.positions", "positions_v2", POSITION_FIELDS, 200),
  RECONCILIATION,
] as const;

const SCREEN_SPECS = Object.freeze({
  SANDBOX_TRADING_SCREEN: [...COMMON, RECONCILIATION],
  EXECUTION_SANDBOX_CERTIFICATION_SCREEN: [...COMMON, RECONCILIATION, ...ACCOUNTS],
  LIVE_OPERATIONS_SCREEN: [...COMMON, ...ACCOUNTS],
  EXECUTION_CANARY_CONTROL_ROOM_SCREEN: [...COMMON, ...LIVE_FLOW, RECONCILIATION, ...ACCOUNTS],
  EXECUTION_LIVE_FULL_OPERATIONS_SCREEN: [...COMMON, ...LIVE_FLOW, RECONCILIATION, ...ACCOUNTS],
  EXECUTION_ACCOUNT_BROKER_360_SCREEN: ACCOUNT_360,
} as const);

const PROFILE = Object.freeze({
  paper: { profileId: "PAPER_BINANCE_USDM", mode: "paper" },
  sandbox: { profileId: "SANDBOX_BINANCE_USDM", mode: "sandbox" },
  live: { profileId: "LIVE_BINANCE_USDM", mode: "live" },
} as const);

@Injectable()
export class ProfileReadService {
  constructor(
    @Inject(ExecutionProductReadSource) private readonly source: ExecutionProductReadSource,
  ) {}

  overview(principal: ProfileReadPrincipal, environment: SourceEnvironment) {
    const screenId = environment === "sandbox" ? "SANDBOX_TRADING_SCREEN" : "LIVE_OPERATIONS_SCREEN";
    return this.snapshot(principal, environment, screenId);
  }

  /** SAME ProductRead source/scopes and combined final fence, never the legacy
   * Promise.allSettled path which intentionally tolerates source failures. */
  liveOperations<T=import("../live/live-source.contract").LiveSourceOperationsRead>(
    principal:ProfileReadPrincipal,deploymentId:string,
    project?:(view:import("../live/live-source.contract").LiveSourceOperationsRead)=>T,
    query:import("../live/live-source.contract").LiveSourceReadQuery={}):Promise<T>{
    return this.source.scopedLiveOperations(principal,deploymentId,project,query);
  }

  /**
   * BE-P12 - the Alpha-Portfolio identity of one deployment for a SCOPED_V2 Sandbox / Canary
   * parent. It is the SAME resolution the legacy composer uses (the viewer's alpha.read scope
   * on the retained deployment row, the qualified tuple publication, the viewer's field policy,
   * the combined final authority fence) but returns only the identity; the legacy composer is
   * never run. A 403/404 from the scope is one uniform answer (hidden = missing) and becomes a
   * typed NOT_AUTHORIZED absence; a changed (409) or unavailable (503) authority is NOT turned
   * into an absence, it ends the request.
   */
  async deploymentIdentity(
    principal: ProfileReadPrincipal,
    requestedEnvironment: "sandbox" | "canary",
    deploymentId: string,
  ): Promise<DeploymentIdentity> {
    const screenId = requestedEnvironment === "sandbox"
      ? "EXECUTION_SANDBOX_CERTIFICATION_SCREEN" : "EXECUTION_CANARY_CONTROL_ROOM_SCREEN";
    try {
      const resolution = await this.source.resolveDeploymentScope(
        principal as CurrentSourcePrincipal, requestedEnvironment, screenId, deploymentId,
      );
      return resolution.state === "FOUND" && resolution.identity ? resolution.identity : IDENTITY_NOT_READ;
    } catch (error) {
      if (error instanceof ExecutionReadScopeError && (error.status === 403 || error.status === 404)) return IDENTITY_NOT_AUTHORIZED;
      throw error;
    }
  }

  async accountBroker(
    principal: ProfileReadPrincipal,
    accountId: string,
    requestedEnvironment?: SourceEnvironment,
  ) {
    const environments: readonly SourceEnvironment[] = requestedEnvironment
      ? [requestedEnvironment]
      : ["live", "sandbox", "paper"];
    return this.source.composeProfile(principal as CurrentSourcePrincipal, "EXECUTION_ACCOUNT_BROKER_360_SCREEN", environments,
      (composition) => this.accountBrokerComposed(principal, accountId, requestedEnvironment, environments, composition), { accountId });
  }

  private async accountBrokerComposed(principal: ProfileReadPrincipal, accountId: string,
    requestedEnvironment: SourceEnvironment | undefined, environments: readonly SourceEnvironment[],
    composition: ProfileReadComposition) {
    // Do not let a rejected profile return while sibling reads are still
    // registering their obligations in the same composition.
    const settled = await Promise.allSettled(environments.map(async (environment) => {
      const profile = PROFILE[environment];
      const context: ManagerReadContext = {
        ...profile,
        errorPrefix: environment === "paper" ? "N22" : "N23",
      };
      const relations = enforceProfileLineage(await this.fetch(
        principal,
        environment,
        "EXECUTION_ACCOUNT_BROKER_360_SCREEN",
        SCREEN_SPECS.EXECUTION_ACCOUNT_BROKER_360_SCREEN,
        context,
        undefined,
        composition,
        accountId,
      ), "N30");
      const proof = this.source.retainedAccountIdentityProof?.(composition, principal as CurrentSourcePrincipal,
        environment, accountId) ?? null;
      const accounts = relations.find((item) => item.spec.key === "accounts")
        ?.page?.items.filter((row) => row.account_id === accountId) ?? [];
      return { environment, profile, relations, accounts, proof };
    }));
    const failure = settled.find((item) => item.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const candidates = settled.flatMap((item) => item.status === "fulfilled" ? [item.value] : []);
    const matches = candidates.filter((candidate) => candidate.accounts.length > 0);
    const selected = matches[0] ?? candidates[0];
    // A first page cannot prove the requested account absent (or prove a
    // match unique across environments). This is especially important when
    // another profile failed or returned a continuation.
    const completeCandidate = (candidate: typeof candidates[number]) => {
      if (!candidate.proof) return accountIdentityCensusComplete(candidate.relations);
      const accountsRelation = candidate.relations.find((item) => item.spec.key === "accounts");
      // The private full-snapshot proof cannot replace the redacted relation's
      // lineage validation: if the latter lost the target, neither a match
      // nor its absence has been established for this composed screen.
      if (!accountsRelation?.page || Object.keys(accountsRelation.lineageRejects ?? {}).length > 0) return false;
      return candidate.proof.state === "FOUND" ? candidate.accounts.length === 1
        : candidate.proof.state === "MISSING" ? candidate.accounts.length === 0
          : candidate.proof.state === "DUPLICATE" ? candidate.accounts.length > 1 : false;
    };
    const completeIdentity = candidates.length === environments.length && candidates.every(completeCandidate);
    const ambiguous = requestedEnvironment === undefined &&
      (matches.length > 1 || (matches.length > 0 && !completeIdentity));
    const duplicateIdentity = selected?.proof?.state === "DUPLICATE" || (selected?.accounts.length ?? 0) > 1;
    const accountFound = (selected?.accounts.length ?? 0) > 0;
    // An exact environment is not proof of a unique account within that
    // environment: another matching identity may be on an unread page. Never
    // join the first observed account's children until its census is complete.
    const incompleteMatchedIdentity = accountFound && !ambiguous && !duplicateIdentity && !completeIdentity;
    const profileKnown = requestedEnvironment !== undefined || (accountFound && !ambiguous);
    const unresolvedIdentityState = candidates.some((candidate) =>
      candidate.relations.find((item) => item.spec.key === "accounts")?.page != null) ? "PARTIAL" as const : "UNAVAILABLE" as const;
    // An auto-selected first match is not the account the caller asked for
    // when another environment matches or has not been ruled out. Likewise,
    // orphan child rows and duplicate identities cannot identify an account.
    // Keep only the existing typed identity reason; never publish one
    // candidate's balances/positions under an unresolved identity.
    const identityIssue = ambiguous
      ? { state: "PARTIAL" as const, reasonCode: matches.length > 1
        ? "PHASE2_ACCOUNT_ENVIRONMENT_AMBIGUOUS" : "PHASE2_ACCOUNT_ENVIRONMENT_UNRESOLVED" }
      : duplicateIdentity ? { state: "PARTIAL" as const, reasonCode: "PHASE2_ACCOUNT_IDENTITY_DUPLICATE" }
        : !accountFound ? { state: completeIdentity ? "EMPTY" as const : unresolvedIdentityState,
          reasonCode: completeIdentity ? "PHASE2_ACCOUNT_NOT_FOUND" : "PHASE2_ACCOUNT_IDENTITY_UNRESOLVED" }
          : incompleteMatchedIdentity ? { state: "PARTIAL" as const, reasonCode: "PHASE2_ACCOUNT_IDENTITY_UNRESOLVED" } : null;
    // An external broker reference may be joined only from a unique account
    // on a complete selected profile, never a first of several candidates.
    const uniqueAccount = selected && !ambiguous && !duplicateIdentity &&
      completeCandidate(selected) ? selected.accounts[0] : undefined;
    const requestedBrokerRef = uniqueAccount?.external_account_ref;
    const brokerRef = typeof requestedBrokerRef === "string" && requestedBrokerRef.trim().length > 0
      ? requestedBrokerRef : null;
    const requestedVenue = uniqueAccount?.venue;
    const venue = typeof requestedVenue === "string" && requestedVenue.trim() ? requestedVenue : null;
    const requestedMode = uniqueAccount?.mode;
    const mode = typeof requestedMode === "string" && requestedMode.toLowerCase() === selected?.environment
      ? selected.environment : null;
    const brokerGrain: AccountBrokerGrain | null = brokerRef && venue && mode ? { externalRef: brokerRef, venue, mode } : null;
    const referenceCount = brokerGrain === null ? 0 : selected?.relations.find((item) => item.spec.key === "accounts")
      ?.page?.items.filter((row) => possibleBrokerGrain(row, brokerGrain)).length ?? 0;
    // The exact account proof is not a broker-ownership census. Do not infer
    // uniqueness of an external reference from the filtered account page.
    const ownerIssue = !uniqueAccount ? null : brokerGrain === null || selected?.proof ? "PHASE2_BROKER_REFERENCE_UNAVAILABLE"
      : referenceCount !== 1 ? "PHASE2_BROKER_REFERENCE_AMBIGUOUS" : null;
    const qualifiedGrain = ownerIssue === null ? brokerGrain : null;
    const ambiguousObservation = qualifiedGrain !== null && (selected?.relations.find((item) => item.spec.key === "broker_sync")
      ?.page?.items.some((row) => possibleBrokerGrain(row, qualifiedGrain) && !exactBrokerGrain(row, qualifiedGrain)) ?? false);
    const brokerIdentityIssue = ownerIssue ?? (ambiguousObservation ? "PHASE2_BROKER_REFERENCE_AMBIGUOUS" : null);
    const data: Record<string, Array<Record<string, unknown>>> = selected
      ? identityIssue ? Object.fromEntries(selected.relations.map((item) => [item.spec.key, []]))
        : accountData(selected.relations, accountId, qualifiedGrain)
      : {};
    const relationState = selected ? productState(selected.relations) : "unavailable";
    const freshness = selected ? relationFreshness(selected.relations) : "UNKNOWN";
    const comparisonRelations = identityIssue || brokerIdentityIssue ? [] : selected?.relations ?? [];
    const comparisons = accountDifferences(data, comparisonRelations);
    const comparisonAvailability = accountComparisonAvailability(
      qualifiedAccountRelations(data, comparisonRelations, ["accounts", "account_balances", "broker_sync"]),
      data.account_balances?.length ?? 0, comparisons.length,
    );
    return {
      schema_version: "execution.account-broker-360.v1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: profileKnown ? selected?.profile.profileId ?? null : null,
      requested_environment: requestedEnvironment ?? "auto",
      selected_environment: accountFound && identityIssue === null ? selected!.environment : null,
      candidate_environments: matches.map((candidate) => candidate.environment),
      workspace_id: principal.workspaceId,
      resource: { kind: "ACCOUNT", id: accountId },
      read_at: new Date().toISOString(),
      as_of: selected && profileKnown ? oldestAsOf(selected.relations) : null,
      state: ambiguous || duplicateIdentity || incompleteMatchedIdentity || brokerIdentityIssue ? "partial" : !accountFound ? (!completeIdentity
        ? (unresolvedIdentityState === "UNAVAILABLE" ? "unavailable" : "partial")
        : relationState === "unavailable" ? "unavailable" : "empty")
        : freshness === "STALE" ? "stale" : relationState,
      freshness: profileKnown ? freshness : "UNKNOWN",
      completeness: identityIssue !== null || brokerIdentityIssue !== null || !accountFound || selected!.relations.some((item) =>
        item.state === "UNAVAILABLE" || item.state === "PARTIAL") ? "PARTIAL" : "COMPLETE",
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      capabilities: selected ? [...selected.relations.map((item) => ({
        capability_id: `source.${item.spec.key}`,
        state: identityIssue && item.state !== "UNAVAILABLE" ? identityIssue.state
          : item.spec.key === "broker_sync" && brokerIdentityIssue && item.state !== "UNAVAILABLE" ? "PARTIAL" : item.state,
        // Relation names are Edge implementation details. The product route
        // is already named and bounded by this BFF.
        relations: [],
        reason_code: identityIssue && item.state !== "UNAVAILABLE" ? identityIssue.reasonCode
          : item.spec.key === "broker_sync" && brokerIdentityIssue && item.state !== "UNAVAILABLE" ? brokerIdentityIssue : item.reasonCode,
        retryable: false,
        ...lineageCounts(item),
      })), { capability_id: "derived.differences", ...comparisonAvailability, relations: ["derived.differences"], retryable: false }] : [],
      data: {
        ...data,
        differences: comparisons,
        exposure_headroom: exposureHeadroom(data, identityIssue ? [] : selected?.relations ?? []),
      },
      unavailable_branches: [
        ...(!accountFound ? [{ capability_id: "account.identity", state: completeIdentity ? "EMPTY" : unresolvedIdentityState,
          reason_code: completeIdentity ? "PHASE2_ACCOUNT_NOT_FOUND" : "PHASE2_ACCOUNT_IDENTITY_UNRESOLVED", retryable: false }] : []),
        ...(ambiguous ? [{ capability_id: "account.identity", state: "PARTIAL", reason_code: matches.length > 1
          ? "PHASE2_ACCOUNT_ENVIRONMENT_AMBIGUOUS" : "PHASE2_ACCOUNT_ENVIRONMENT_UNRESOLVED", retryable: false }] : []),
        ...(duplicateIdentity ? [{ capability_id: "account.identity", state: "PARTIAL", reason_code: "PHASE2_ACCOUNT_IDENTITY_DUPLICATE", retryable: false }] : []),
        ...(incompleteMatchedIdentity ? [{ capability_id: "account.identity", state: "PARTIAL", reason_code: "PHASE2_ACCOUNT_IDENTITY_UNRESOLVED", retryable: false }] : []),
        ...(brokerIdentityIssue ? [{ capability_id: "account.broker_identity", state: brokerIdentityIssue === "PHASE2_BROKER_REFERENCE_AMBIGUOUS"
          ? "PARTIAL" : "UNAVAILABLE", reason_code: brokerIdentityIssue, retryable: false }] : []),
      ],
    };
  }

  async snapshot(
    principal: ProfileReadPrincipal,
    requestedEnvironment: N23ReadEnvironment,
    screenId: keyof typeof SCREEN_SPECS,
    deploymentId?: string,
  ) {
    return this.source.composeProfile(principal as CurrentSourcePrincipal, screenId, [requestedEnvironment],
      (composition) => this.snapshotComposed(principal, requestedEnvironment, screenId, deploymentId, composition));
  }

  private async snapshotComposed(principal: ProfileReadPrincipal, requestedEnvironment: N23ReadEnvironment,
    screenId: keyof typeof SCREEN_SPECS, deploymentId: string | undefined, composition: ProfileReadComposition) {
    const sourceEnvironment: SourceEnvironment = requestedEnvironment === "canary" ? "live" : requestedEnvironment;
    const profile = PROFILE[sourceEnvironment];
    const context: ManagerReadContext = { ...profile, errorPrefix: "N23" };
    const resolution = deploymentId
      ? await this.source.resolveDeploymentScope(
        principal as CurrentSourcePrincipal, requestedEnvironment, screenId, deploymentId, composition,
      )
      : null;
    const relations = resolution === null || resolution.state === "FOUND"
      ? enforceProfileLineage(await this.fetch(
        principal,
        requestedEnvironment,
        screenId,
        SCREEN_SPECS[screenId],
        context,
        resolution?.scope,
        composition,
      ), "N30")
      : unresolvedRelations(SCREEN_SPECS[screenId], resolution);
    // Detail rows are already exact-scoped before keyset pagination by the
    // local projection.  This layer must never broaden a record using an
    // account, portfolio or two-dimension heuristic.
    const data = this.data(relations);
    const state = productState(relations);
    const freshness = relations.some((item) => item.page?.freshness === "STALE") ? "STALE"
      : relations.some((item) => item.page?.freshness === "AGING") ? "AGING"
        : relations.some((item) => item.page?.freshness === "FRESH") ? "FRESH" : "UNKNOWN";
    const rawProjection = relations.map((item) => item.page?.projection ?? null)
      .find((item) => item !== null) ?? null;
    // The current-page source cursor remains in the local projection only.
    // Browser consumers receive epoch/sequence/digest and opaque Portal
    // continuations, never a Manager cursor.
    const projection = rawProjection ? { ...rawProjection, sourceCursor: null } : null;
    const readAtMs = Date.now();
    const body = {
      schema_version: requestedEnvironment === "sandbox"
        ? deploymentId ? "execution.sandbox-current-source.v1" : "execution.sandbox-overview.v1"
        : requestedEnvironment === "canary"
          ? "execution.canary-live-facts.v1"
          : deploymentId ? "execution.live-current-source.v1" : "execution.live-overview.v1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      delivery_profile: profile.profileId,
      requested_environment: requestedEnvironment,
      source_environment: sourceEnvironment,
      composition: requestedEnvironment === "canary"
        ? "PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS"
        : "DIRECT_PROFILE_READ",
      workspace_id: principal.workspaceId,
      resource: deploymentId ? { kind: "DEPLOYMENT", id: deploymentId } : { kind: "WORKSPACE", id: principal.workspaceId },
      read_at_ms: readAtMs,
      as_of_ms: oldestStageAsOfMs(asStageRelations(relations)),
      read_at: new Date(readAtMs).toISOString(),
      as_of: oldestAsOf(relations),
      state: freshness === "STALE" && state === "ready" ? "stale" : state,
      freshness,
      completeness: relations.some((item) => item.state === "UNAVAILABLE" || item.state === "PARTIAL")
        ? "PARTIAL" : "COMPLETE",
      projection,
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      capabilities: relations.map((item) => ({
        capability_id: `source.${item.spec.key}`,
        state: item.state,
        relations: [],
        reason_code: item.reasonCode,
        retryable: false,
        ...lineageCounts(item),
      })),
      ...(resolution?.state !== "FOUND" ? {
        resource_resolution: { state: resolution?.state, reason_code: resolution?.reasonCode ?? null },
      } : {}),
      panels: stagePanels(asStageRelations(relations), readAtMs),
      data: wireStageValue(data),
      unavailable_branches: screenId === "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"
        ? [{ capability_id: "market.ticks", state: "UNAVAILABLE", reason_code: "N28_MARKET_TICKS_NOT_ACTIVATED", retryable: false }]
        : [],
    };
    // FE-066: the deployment's Alpha-Portfolio identity rides beside the body
    // (not inside it) for the Sandbox/Canary/Live composers.
    return resolution?.state === "FOUND" && resolution.identity
      ? attachDeploymentIdentity(body, resolution.identity) : body;
  }

  private async fetch(
    principal: ProfileReadPrincipal,
    environment: N23ReadEnvironment,
    screenId: keyof typeof SCREEN_SPECS,
    specs: readonly RelationSpec[],
    context: ManagerReadContext,
    deploymentScope?: DeploymentResourceScope,
    composition?: ProfileReadComposition,
    accountTarget?: string,
  ): Promise<RelationResult[]> {
    const results = await Promise.allSettled(specs.map(async (item) => {
      const response = await this.source.relation(
        principal as CurrentSourcePrincipal,
        environment,
        screenId,
        item.sourceId,
        item.relation,
        { limit: item.limit, ...(deploymentScope ? { deploymentScope } : {}), ...(accountTarget ? { accountTarget } : {}) },
        composition,
      );
      return managerPage(response, item.relation, item.fields, context);
    }));
    // Do not return earlier successful relations after another relation detects
    // an authority/snapshot change or cannot revalidate current authority.
    // Ordinary unavailable panels and scoped denials remain typed partials.
    const unsafe = results.find((result) => result.status === "rejected" &&
      result.reason instanceof ExecutionReadScopeError &&
      (result.reason.code === "EXECUTION_READ_ACCESS_CHANGED" ||
       result.reason.code === "EXECUTION_READ_AUTHORITY_UNAVAILABLE" ||
       result.reason.code === "EXECUTION_READ_SCOPE_REQUIRED" ||
       result.reason.code === "EXECUTION_READ_SCOPE_LIMIT"));
    if (unsafe?.status === "rejected") throw unsafe.reason;
    return results.map((result, index) => {
      const item = specs[index];
      if (result.status === "fulfilled") {
        const page = result.value;
        const reasonCode = page.scope?.state === "PARTIAL"
          ? page.scope.reasonCode ?? "EDS03_RESOURCE_SCOPE_PARTIAL"
          : page.completeness === "PARTIAL" ? "SOURCE_PARTIAL"
            : page.completeness === "UNKNOWN" ? "SOURCE_COMPLETENESS_UNKNOWN"
              : page.nextCursor !== null || page.previousCursor != null ? "SOURCE_CONTINUATION_NOT_READ" : null;
        return {
          spec: item,
          page,
          state: reasonCode !== null ? "PARTIAL" as const : page.items.length === 0 ? "EMPTY" as const : "AVAILABLE" as const,
          reasonCode,
        };
      }
      return { spec: item, page: null, state: "UNAVAILABLE" as const, reasonCode: safeReason(result.reason) };
    });
  }

  private data(relations: readonly RelationResult[]): Record<string, unknown> {
    return Object.fromEntries(relations.map((item) => [item.spec.key, item.page?.items ?? []]));
  }
}

function spec(
  key: string,
  sourceId: string,
  relation: string,
  fields: readonly string[],
  limit: number,
): RelationSpec {
  return { key, sourceId, relation, fields, limit };
}

function safeReason(error: unknown): string {
  // This static refusal is safe only after the relation has passed its parent
  // authorization. It does not imply that a binding or upstream source exists.
  if (error instanceof ExecutionReadScopeError && error.code === "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED") {
    return error.code;
  }
  if (error instanceof CurrentSourceProxyError && /^(?:N(?:13B|17B|21|22|23|30)_[A-Z0-9_]+|EDS(?:03|11R)_[A-Z0-9_]+)$/.test(error.code)) {
    return error.code;
  }
  return "N23_SOURCE_UNAVAILABLE";
}

function productState(relations: readonly RelationResult[]): "ready" | "empty" | "partial" | "unavailable" {
  const states = relations.map((item) => item.state);
  if (states.every((state) => state === "UNAVAILABLE")) return "unavailable";
  if (states.some((state) => state === "UNAVAILABLE" || state === "PARTIAL")) return "partial";
  if (states.every((state) => state === "EMPTY")) return "empty";
  return "ready";
}

/**
 * PHASE 3 (round 2) · the aggregate age must belong to the tier beside it.
 *
 * `freshness` here is the WORST of the parts; publishing the NEWEST instant
 * next to it described a different part than the tier did — a reader saw
 * "STALE" with an age of seconds and could not reconcile the two. An
 * aggregate never borrows a newer timestamp from a fresher contributor.
 */
/**
 * PHASE 5 (round 2) · both lineage counts, never merged.
 *
 * `lineage_rejects` is a row we could not account for; `lineage_scoped_out` is
 * a row that was never ours. They look identical in a row count and mean
 * opposite things, so a capability publishes whichever applies and never
 * folds one into the other.
 */
function lineageCounts(item: RelationResult): Record<string, Readonly<Record<string, number>>> {
  return {
    ...(item.lineageRejects && Object.keys(item.lineageRejects).length > 0
      ? { lineage_rejects: item.lineageRejects } : {}),
    ...(item.lineageScopedOut && Object.keys(item.lineageScopedOut).length > 0
      ? { lineage_scoped_out: item.lineageScopedOut } : {}),
  };
}

function oldestAsOf(relations: readonly RelationResult[]): string | null {
  return relations.map((item) => item.page?.asOf ?? null).filter((value): value is string => value !== null)
    .sort().at(0) ?? null;
}

function relationFreshness(relations: readonly RelationResult[]): "FRESH" | "AGING" | "STALE" | "UNKNOWN" {
  return relations.some((item) => item.page?.freshness === "STALE") ? "STALE"
    : relations.some((item) => item.page?.freshness === "AGING") ? "AGING"
      : relations.some((item) => item.page?.freshness === "FRESH") ? "FRESH" : "UNKNOWN";
}

function accountIdentityCensusComplete(relations: readonly RelationResult[]): boolean {
  const accounts = relations.find((item) => item.spec.key === "accounts");
  const page = accounts?.page;
  return page != null && (accounts?.state === "AVAILABLE" || accounts?.state === "EMPTY") &&
    page.completeness === "COMPLETE" && page.nextCursor === null && page.previousCursor == null &&
    page.scope?.state !== "PARTIAL";
}

interface AccountBrokerGrain { externalRef: string; venue: string; mode: SourceEnvironment }

function brokerFact(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function possibleBrokerGrain(row: Record<string, unknown>, grain: AccountBrokerGrain): boolean {
  const externalRef = brokerFact(row.external_account_ref), venue = brokerFact(row.venue), mode = brokerFact(row.mode);
  return (externalRef === null || externalRef === grain.externalRef) && (venue === null || venue === grain.venue) &&
    (mode === null || mode.toLowerCase() === grain.mode);
}

function exactBrokerGrain(row: Record<string, unknown>, grain: AccountBrokerGrain): boolean {
  const mode = brokerFact(row.mode);
  return row.external_account_ref === grain.externalRef && row.venue === grain.venue && mode?.toLowerCase() === grain.mode;
}

function accountData(
  relations: readonly RelationResult[],
  accountId: string,
  brokerGrain: AccountBrokerGrain | null,
): Record<string, Array<Record<string, unknown>>> {
  return Object.fromEntries(relations.map((item) => [
    item.spec.key,
    (item.page?.items ?? []).filter((row) => {
      if (item.spec.key === "accounts") return row.account_id === accountId;
      if (item.spec.key === "broker_sync") return brokerGrain !== null && exactBrokerGrain(row, brokerGrain);
      if (row.account_id !== undefined) return row.account_id === accountId;
      return false;
    }),
  ]));
}

function accountDifferences(
  data: Record<string, Array<Record<string, unknown>>>,
  relations: readonly RelationResult[],
): Array<Record<string, unknown>> {
  if (!qualifiedAccountRelations(data, relations, ["accounts", "account_balances", "broker_sync"])) return [];
  const balances = data.account_balances ?? [], brokerRows = data.broker_sync ?? [];
  return balances.flatMap((balance) => {
    if (typeof balance.currency !== "string" || !balance.currency || balances.filter(item => item.currency === balance.currency).length !== 1) return [];
    const candidates = brokerRows.filter(row => row.currency === balance.currency);
    if (!candidates.length || candidates.some(row => typeof row.synced_at !== "string" || !Number.isFinite(Date.parse(row.synced_at)))) return [];
    const latest = Math.max(...candidates.map(row => Date.parse(row.synced_at as string)));
    const latestRows = candidates.filter(row => Date.parse(row.synced_at as string) === latest);
    // A timestamp tie is not an authority to choose between source records.
    if (latestRows.length !== 1) return [];
    const broker = latestRows[0];
    const free = exactFinancialDecimal(balance.free), buyingPower = exactFinancialDecimal(broker.buying_power);
    if (free === null || buyingPower === null) return [];
    const delta = subtractDecimal(free, buyingPower);
    return delta === null ? [] : [{
      field: "buying_power",
      currency: balance.currency,
      internal_value: free,
      broker_value: buyingPower,
      portal_free: free,
      broker_buying_power: buyingPower,
      delta,
      in_sync: decimalIsZero(delta),
    }];
  });
}

function qualifiedAccountRelations(data: Record<string, Array<Record<string, unknown>>>, relations: readonly RelationResult[], keys: readonly string[]): boolean {
  const inputs = keys.map(key => relations.find(item => item.spec.key === key));
  const baseline = inputs[0]?.page?.projection;
  return (data.accounts?.length ?? 0) === 1 && baseline != null && inputs.every(input => {
    const page = input?.page, projection = page?.projection;
    return input?.state === "AVAILABLE" && page?.completeness === "COMPLETE" && page.nextCursor === null && page.previousCursor == null &&
      projection != null && projection.epoch === baseline.epoch && projection.sequence === baseline.sequence &&
      projection.payloadDigest === baseline.payloadDigest && page.scope?.state !== "PARTIAL";
  });
}

function exposureHeadroom(
  data: Record<string, Array<Record<string, unknown>>>,
  relations: readonly RelationResult[],
): Array<Record<string, unknown>> {
  const balances = data.account_balances ?? [];
  const margins = data.margin_balances ?? [];
  // A partial page, a missing account, or independently refreshed relations
  // cannot prove a complete same-snapshot account/currency total.
  const qualified = qualifiedAccountRelations(data, relations, ["accounts", "account_balances", "margin_balances"]);
  // A margin without a currency cannot be safely assigned to any balance.
  const unattributedMargin = margins.some(item => typeof item.currency !== "string" || !item.currency);
  const balanceCounts = new Map<unknown, number>();
  for (const row of balances) balanceCounts.set(row.currency, (balanceCounts.get(row.currency) ?? 0) + 1);
  const marginKeys = new Set<string>(), ambiguousMarginCurrencies = new Set<unknown>();
  for (const row of margins) {
    const key = JSON.stringify([row.currency ?? null, row.instrument_id ?? null]);
    if (marginKeys.has(key)) ambiguousMarginCurrencies.add(row.currency);
    marginKeys.add(key);
  }
  const exact = exactFinancialDecimal;
  return balances.map((balance) => {
    const currency = balance.currency;
    const free = exact(balance.free);
    const maintenance = margins.filter((item) => item.currency === currency).map((item) => exact(item.maintenance));
    let used: string | null = qualified && typeof currency === "string" && currency.length > 0 && !unattributedMargin &&
      balanceCounts.get(currency) === 1 && !ambiguousMarginCurrencies.has(currency) &&
      maintenance.length > 0 && maintenance.every(value => value !== null) ? "0" : null;
    if (used !== null) for (const value of maintenance) {
      used = addDecimal(used, value!);
      if (used === null || used.length > 128) { used = null; break; }
    }
    const headroom = free !== null && used !== null ? subtractDecimal(free, used) : null;
    return {
      currency,
      free,
      maintenance: used,
      headroom,
      verdict: headroom === null ? "UNAVAILABLE" : headroom.startsWith("-") ? "BREACHED" : "AVAILABLE",
    };
  });
}

function decimalIsZero(value: string): boolean { return /^-?0(?:\.0+)?$/.test(value); }

function addDecimal(left: string, right: string): string | null {
  return decimalOperation(left, right, (a, b) => a + b);
}

function subtractDecimal(left: string, right: string): string | null {
  return decimalOperation(left, right, (a, b) => a - b);
}

function decimalOperation(left: string, right: string, operation: (a: bigint, b: bigint) => bigint): string | null {
  const pattern = /^(-?)(\d+)(?:\.(\d+))?$/;
  const a = pattern.exec(left);
  const b = pattern.exec(right);
  if (!a || !b) return null;
  const scale = Math.max(a[3]?.length ?? 0, b[3]?.length ?? 0);
  const value = (match: RegExpExecArray) => BigInt(`${match[1]}${match[2]}${(match[3] ?? "").padEnd(scale, "0")}`);
  const result = operation(value(a), value(b));
  const negative = result < 0n;
  const digits = (negative ? -result : result).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, -scale);
  const fraction = scale === 0 ? "" : digits.slice(-scale).replace(/0+$/, "");
  return exactFinancialDecimal(`${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`);
}

function unresolvedRelations(
  specs: readonly RelationSpec[],
  resolution: Exclude<DeploymentScopeResolution, { state: "FOUND" }>,
): RelationResult[] {
  const state: CapabilityState = resolution.state === "EMPTY" ? "EMPTY"
    : resolution.state === "PARTIAL" ? "PARTIAL" : "UNAVAILABLE";
  return specs.map((specification) => ({
    spec: specification,
    page: null,
    state,
    reasonCode: resolution.reasonCode,
  }));
}

function asStageRelations(relations: readonly RelationResult[]): StageRelation[] {
  return relations.map((item) => ({
    key: item.spec.key,
    page: item.page,
    state: item.state,
    reasonCode: item.reasonCode,
  }));
}
