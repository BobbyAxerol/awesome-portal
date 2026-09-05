import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionProfileProjectionRepository,
  type ProfileProjectionSnapshot,
  type ProjectionCompleteness,
  type ProjectionEnvironment,
  type ProjectionFreshness,
  type ProjectionRelation,
  type ProjectionScalar,
  projectionDigest,
} from "./profile-projection.repository";

export interface PortalDerivationPrincipal {
  user: PortalUser;
  session: AuthSession;
  workspaceId: string;
}

export class PortalDerivationError extends Error {
  constructor(readonly code: string, readonly status: number, message = code) {
    super(message);
  }
}

type Environment = ProjectionEnvironment;
type Fact = Record<string, ProjectionScalar>;
type PublishedState = "AVAILABLE" | "EMPTY" | "PARTIAL" | "UNAVAILABLE";

const RELATION = Object.freeze({
  strategies: "manager.strategies:strategies",
  deployments: "manager.deployments:strategy_deployments",
  accounts: "manager.accounts:accounts",
  balances: "manager.accounts:account_balances",
  portfolios: "manager.portfolios:portfolios",
  allocations: "manager.portfolios:portfolio_allocations",
  sessions: "manager.sessions:execution_sessions",
  orders: "manager.orders:orders",
  fills: "manager.fills:fills",
  conditionalGroups: "manager.conditional-orders:conditional_order_groups",
  conditionalLegs: "manager.conditional-orders:conditional_order_group_legs",
} as const);

const PROFILE_ORDER: readonly Environment[] = ["paper", "sandbox", "live"];

// A derivation is not a raw relation exporter.  These named DTOs disclose only
// the current structure/capital fields their product contract needs, even if a
// future source relation grows additional columns.
const CONDITIONAL_GROUP_FIELDS = new Set([
  "group_id", "strategy_id", "account_id", "execution_session_id", "mode", "venue", "instrument_id", "symbol",
  "position_side", "contingency_type", "activation_policy", "state", "winner_leg_id", "target_quantity",
  "filled_quantity", "open_quantity", "excess_quantity", "version", "created_at", "updated_at",
]);
const CONDITIONAL_LEG_FIELDS = new Set([
  "group_id", "leg_id", "parent_leg_id", "role", "sequence", "side", "position_side", "order_type",
  "quantity", "filled_quantity", "price", "trigger_price", "trigger_reference", "time_in_force",
  "good_till_date", "reduce_only", "post_only", "state", "average_fill_price", "version", "created_at", "updated_at",
]);
const PORTFOLIO_FIELDS = new Set(["portfolio_id", "name", "base_currency", "state", "created_at", "updated_at"]);

/**
 * EDS-05's only calculation boundary.  It reads committed Portal projection
 * observations; it never turns an HTTP request into an Edge or Trading System
 * read.  Each public method maps to exactly one named product need.
 */
@Injectable()
export class PortalDerivationsService {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionProfileProjectionRepository) private readonly repository: ExecutionProfileProjectionRepository,
  ) {}

  async sourceHealth(principal: PortalDerivationPrincipal, requested?: Environment): Promise<Record<string, unknown>> {
    const readAt = new Date();
    const environments = requested ? [requested] : PROFILE_ORDER;
    const profiles = await Promise.all(environments.map(async (environment) => {
      const profileId = profileIdFor(environment, this.config);
      if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
        return healthEntry(environment, profileId, null, "UNAVAILABLE", "EDS05_LOCAL_PROJECTION_REQUIRED", readAt);
      }
      if (!this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID || !profileId) {
        return healthEntry(environment, profileId, null, "UNAVAILABLE", "EDS05_PROFILE_NOT_CONFIGURED", readAt);
      }
      const snapshot = await this.repository.snapshot(
        this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID,
        environment,
        profileId,
      );
      if (!snapshot) return healthEntry(environment, profileId, null, "UNAVAILABLE", "N31_PROJECTION_NOT_READY", readAt);
      if (ageMs(snapshot, readAt) > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) {
        return healthEntry(environment, profileId, snapshot, "UNAVAILABLE", "N31_PROJECTION_STALE_CEILING_EXCEEDED", readAt);
      }
      return healthEntry(environment, profileId, snapshot, healthState(snapshot), null, readAt);
    }));
    const state = aggregateState(profiles.map((profile) => profile.state as PublishedState));
    const inputDigest = digest(profiles.map((profile) => ({
      environment: profile.environment,
      projection_revision: profile.projection_revision,
      state: profile.state,
      reason_code: profile.reason_code,
    })));
    return {
      schema_version: "execution.derivation.source-health.v1",
      logical_operation_id: "executionSourceHealthV1",
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      workspace_id: principal.workspaceId,
      requested_environment: requested ?? "all",
      read_at_ms: readAt.valueOf(),
      read_at: readAt.toISOString(),
      state,
      formula: {
        id: "source_health_envelope",
        version: "v1",
        currency_policy: "NOT_APPLICABLE",
        temporal_policy: "UTC_EPOCH_MS",
      },
      input_digest: inputDigest,
      profiles,
      source_side_effect_requested: false,
    };
  }

  async deploymentQuality(
    principal: PortalDerivationPrincipal,
    deploymentId: string,
    environment: Environment,
  ): Promise<Record<string, unknown>> {
    const { snapshot, profileId, readAt } = await this.requiredSnapshot(environment);
    const deployments = facts(snapshot, RELATION.deployments);
    const selected = deployments.filter((row) => text(row, "deployment_id") === deploymentId);
    const deploymentRelation = relation(snapshot, RELATION.deployments);
    if (selected.length === 0) {
      return this.envelope(principal, "executionDeploymentQualityV1", environment, profileId, readAt, snapshot, {
        formula: formula("deployment_execution_quality", "v1", "NOT_APPLICABLE"),
        inputs: [input(snapshot, RELATION.deployments)],
        state: deploymentRelation?.completeness === "COMPLETE" ? "EMPTY" : "PARTIAL",
        reasonCode: deploymentRelation?.completeness === "COMPLETE"
          ? "EDS05_DEPLOYMENT_NOT_FOUND" : "EDS05_DEPLOYMENT_OUTSIDE_RETAINED_WINDOW",
        data: emptyQuality(deploymentId),
      });
    }
    if (selected.length !== 1) {
      return this.envelope(principal, "executionDeploymentQualityV1", environment, profileId, readAt, snapshot, {
        formula: formula("deployment_execution_quality", "v1", "NOT_APPLICABLE"),
        inputs: [input(snapshot, RELATION.deployments)],
        state: "PARTIAL", reasonCode: "EDS05_DEPLOYMENT_ID_DUPLICATE", data: emptyQuality(deploymentId),
      });
    }
    const deployment = selected[0]!;
    const tuple = deploymentTuple(deployment, environment);
    if (!tuple || deployments.filter((row) => deploymentTuple(row, environment) === tuple).length !== 1) {
      return this.envelope(principal, "executionDeploymentQualityV1", environment, profileId, readAt, snapshot, {
        formula: formula("deployment_execution_quality", "v1", "NOT_APPLICABLE"),
        inputs: [input(snapshot, RELATION.deployments), input(snapshot, RELATION.sessions)],
        state: "PARTIAL", reasonCode: "EDS05_DEPLOYMENT_TUPLE_AMBIGUOUS", data: emptyQuality(deploymentId),
      });
    }
    const sessionRelation = relation(snapshot, RELATION.sessions);
    const orderRelation = relation(snapshot, RELATION.orders);
    const fillRelation = relation(snapshot, RELATION.fills);
    const sessions = facts(snapshot, RELATION.sessions).filter((row) => tupleOf(row, environment) === tuple);
    const orders = facts(snapshot, RELATION.orders).filter((row) => tupleOf(row, environment) === tuple);
    const fills = facts(snapshot, RELATION.fills).filter((row) => tupleOf(row, environment) === tuple);
    const counter = counterTotals(sessions);
    const invalidCounter = counter.invalid;
    const inputRows = [
      input(snapshot, RELATION.deployments),
      input(snapshot, RELATION.sessions),
      input(snapshot, RELATION.orders),
      input(snapshot, RELATION.fills),
    ];
    const sourceState = stateForInputs(inputRows, sessions.length > 0);
    const state: PublishedState = invalidCounter ? "PARTIAL" : sourceState;
    const reasonCode = invalidCounter ? "EDS05_EXECUTION_QUALITY_COUNTER_INVALID"
      : firstInputReason(inputRows) ?? null;
    return this.envelope(principal, "executionDeploymentQualityV1", environment, profileId, readAt, snapshot, {
      formula: formula("deployment_execution_quality", "v1", "NOT_APPLICABLE"),
      inputs: inputRows,
      state,
      reasonCode,
      data: {
        deployment_id: deploymentId,
        execution_session_population: String(sessions.length),
        order_population: String(orders.length),
        fill_population: String(fills.length),
        submitted_count: counter.submitted.toString(),
        risk_rejected_count: counter.riskRejected.toString(),
        broker_rejected_count: counter.brokerRejected.toString(),
        filled_count: counter.filled.toString(),
        rejected_count: (counter.riskRejected + counter.brokerRejected).toString(),
        reject_rate: counter.submitted === 0n ? null : {
          numerator: (counter.riskRejected + counter.brokerRejected).toString(),
          denominator: counter.submitted.toString(),
        },
        latency_state: "UNAVAILABLE",
        latency_reason_code: "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED",
        current_observation_only: true,
      },
    });
  }

  async conditionalLegs(
    principal: PortalDerivationPrincipal,
    groupId: string,
    environment: Environment,
  ): Promise<Record<string, unknown>> {
    const { snapshot, profileId, readAt } = await this.requiredSnapshot(environment);
    const groupsInput = input(snapshot, RELATION.conditionalGroups);
    const legsInput = input(snapshot, RELATION.conditionalLegs);
    const groupRelation = relation(snapshot, RELATION.conditionalGroups);
    const groups = facts(snapshot, RELATION.conditionalGroups).filter((row) => text(row, "group_id") === groupId);
    if (groups.length === 0) {
      return this.envelope(principal, "executionConditionalLegsV1", environment, profileId, readAt, snapshot, {
        formula: formula("conditional_legs", "v1", "NOT_APPLICABLE"), inputs: [groupsInput, legsInput],
        state: groupRelation?.completeness === "COMPLETE" ? "EMPTY" : "PARTIAL",
        reasonCode: groupRelation?.completeness === "COMPLETE"
          ? "EDS05_CONDITIONAL_GROUP_NOT_FOUND" : "EDS05_CONDITIONAL_GROUP_OUTSIDE_RETAINED_WINDOW",
        data: { group_id: groupId, group: null, legs: [], current_structure_only: true },
      });
    }
    if (groups.length !== 1) {
      return this.envelope(principal, "executionConditionalLegsV1", environment, profileId, readAt, snapshot, {
        formula: formula("conditional_legs", "v1", "NOT_APPLICABLE"), inputs: [groupsInput, legsInput],
        state: "PARTIAL", reasonCode: "EDS05_CONDITIONAL_GROUP_ID_DUPLICATE",
        data: { group_id: groupId, group: null, legs: [], current_structure_only: true },
      });
    }
    const legs = facts(snapshot, RELATION.conditionalLegs)
      .filter((row) => text(row, "group_id") === groupId)
      .sort((left, right) => String(left.sequence ?? "").localeCompare(String(right.sequence ?? "")) || String(left.leg_id ?? "").localeCompare(String(right.leg_id ?? "")));
    const inputs = [groupsInput, legsInput];
    return this.envelope(principal, "executionConditionalLegsV1", environment, profileId, readAt, snapshot, {
      formula: formula("conditional_legs", "v1", "NOT_APPLICABLE"), inputs,
      state: stateForInputs(inputs, true), reasonCode: firstInputReason(inputs),
      data: {
        group_id: groupId,
        group: pickFields(groups[0]!, CONDITIONAL_GROUP_FIELDS),
        legs: legs.map((row) => pickFields(row, CONDITIONAL_LEG_FIELDS)),
        current_structure_only: true,
      },
    });
  }

  async portfolioCapital(
    principal: PortalDerivationPrincipal,
    portfolioId: string,
    environment: Environment,
  ): Promise<Record<string, unknown>> {
    const { snapshot, profileId, readAt } = await this.requiredSnapshot(environment);
    const portfolioInput = input(snapshot, RELATION.portfolios);
    const allocationInput = input(snapshot, RELATION.allocations);
    const balanceInput = input(snapshot, RELATION.balances);
    const portfolioRows = facts(snapshot, RELATION.portfolios).filter((row) => text(row, "portfolio_id") === portfolioId);
    if (portfolioRows.length !== 1) {
      const state = portfolioRows.length > 1 ? "PARTIAL"
        : portfolioInput.completeness === "COMPLETE" ? "EMPTY" : "PARTIAL";
      const reasonCode = portfolioRows.length > 1 ? "EDS05_PORTFOLIO_ID_DUPLICATE"
        : portfolioInput.completeness === "COMPLETE" ? "EDS05_PORTFOLIO_NOT_FOUND" : "EDS05_PORTFOLIO_OUTSIDE_RETAINED_WINDOW";
      return this.envelope(principal, "executionPortfolioCapitalV1", environment, profileId, readAt, snapshot, {
        formula: formula("portfolio_capital_contribution", "v1", "EXACT_PARTITION_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE"),
        inputs: [portfolioInput, allocationInput, balanceInput, missingInput("portfolio_capital_ledger"), missingInput("account_reservations")],
        state, reasonCode,
        data: { portfolio_id: portfolioId, allocation_by_currency: [], account_balance_by_currency: [], unpublished_inputs: ["portfolio_capital_ledger", "account_reservations"] },
      });
    }
    const allocations = facts(snapshot, RELATION.allocations).filter((row) => text(row, "portfolio_id") === portfolioId);
    const accountIds = new Set(allocations.flatMap((row) => text(row, "account_id") ? [text(row, "account_id")!] : []));
    const balances = facts(snapshot, RELATION.balances).filter((row) => accountIds.has(text(row, "account_id") ?? ""));
    const allocationPartitions = partitions(allocations, ["allocated_capital", "max_capital"]);
    const balancePartitions = partitions(balances, ["total", "free", "locked"]);
    const invalid = allocationPartitions.invalid || balancePartitions.invalid;
    const inputs = [portfolioInput, allocationInput, balanceInput, missingInput("portfolio_capital_ledger"), missingInput("account_reservations")];
    return this.envelope(principal, "executionPortfolioCapitalV1", environment, profileId, readAt, snapshot, {
      formula: formula("portfolio_capital_contribution", "v1", "EXACT_PARTITION_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE"),
      inputs,
      // The owner has not published the ledger/reservation relations through
      // the current Manager profile.  Allocation/current-balance facts are
      // still useful, but the composite remains honestly partial.
      state: "PARTIAL",
      reasonCode: invalid ? "EDS05_PORTFOLIO_CAPITAL_DECIMAL_INVALID" : "EDS05_PORTFOLIO_CAPITAL_LEDGER_NOT_PUBLISHED",
      data: {
        portfolio_id: portfolioId,
        portfolio: pickFields(portfolioRows[0]!, PORTFOLIO_FIELDS),
        allocation_by_currency: allocationPartitions.rows,
        account_balance_by_currency: balancePartitions.rows,
        currency_policy: "EXACT_PARTITION_BY_SOURCE_CURRENCY_NO_FX_AGGREGATE",
        unpublished_inputs: ["portfolio_capital_ledger", "account_reservations"],
        current_observation_only: true,
      },
    });
  }

  async alphaActivity(
    principal: PortalDerivationPrincipal,
    alphaId: string,
    environment: Environment,
  ): Promise<Record<string, unknown>> {
    const { snapshot, profileId, readAt } = await this.requiredSnapshot(environment);
    const strategyInput = input(snapshot, RELATION.strategies);
    const strategies = facts(snapshot, RELATION.strategies).filter((row) => text(row, "alpha_id") === alphaId);
    if (strategies.length !== 1) {
      const state = strategies.length > 1 ? "PARTIAL" : strategyInput.completeness === "COMPLETE" ? "EMPTY" : "PARTIAL";
      const reasonCode = strategies.length > 1 ? "EDS05_ALPHA_ID_DUPLICATE"
        : strategyInput.completeness === "COMPLETE" ? "EDS05_ALPHA_NOT_FOUND" : "EDS05_ALPHA_OUTSIDE_RETAINED_WINDOW";
      return this.envelope(principal, "executionAlphaActivityV1", environment, profileId, readAt, snapshot, {
        formula: formula("alpha_activity_rollup", "v1", "NOT_APPLICABLE"), inputs: [strategyInput], state, reasonCode,
        data: emptyActivity(alphaId),
      });
    }
    const strategyId = text(strategies[0]!, "strategy_id");
    if (!strategyId) {
      return this.envelope(principal, "executionAlphaActivityV1", environment, profileId, readAt, snapshot, {
        formula: formula("alpha_activity_rollup", "v1", "NOT_APPLICABLE"), inputs: [strategyInput],
        state: "PARTIAL", reasonCode: "EDS05_ALPHA_STRATEGY_ID_MISSING", data: emptyActivity(alphaId),
      });
    }
    const inputs = [
      strategyInput,
      input(snapshot, RELATION.deployments),
      input(snapshot, RELATION.sessions),
      input(snapshot, RELATION.orders),
      input(snapshot, RELATION.fills),
    ];
    const deployments = facts(snapshot, RELATION.deployments).filter((row) => text(row, "strategy_id") === strategyId);
    const sessions = facts(snapshot, RELATION.sessions).filter((row) => text(row, "strategy_id") === strategyId);
    const orders = facts(snapshot, RELATION.orders).filter((row) => text(row, "strategy_id") === strategyId);
    const fills = facts(snapshot, RELATION.fills).filter((row) => text(row, "strategy_id") === strategyId);
    return this.envelope(principal, "executionAlphaActivityV1", environment, profileId, readAt, snapshot, {
      formula: formula("alpha_activity_rollup", "v1", "NOT_APPLICABLE"), inputs,
      state: stateForInputs(inputs, true), reasonCode: firstInputReason(inputs),
      data: {
        alpha_id: alphaId,
        strategy_id: strategyId,
        deployment_population: String(deployments.length),
        session_population: String(sessions.length),
        order_population: String(orders.length),
        fill_population: String(fills.length),
        state_counts: countBy([...deployments, ...sessions], "state"),
        order_status_counts: countBy(orders, "status"),
        latest_observed_at: latestTime([...deployments, ...sessions, ...orders, ...fills]),
        retained_input_range_not_event_replay: true,
      },
    });
  }

  private async requiredSnapshot(environment: Environment): Promise<{ snapshot: ProfileProjectionSnapshot; profileId: string; readAt: Date }> {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      throw new PortalDerivationError("EDS05_LOCAL_PROJECTION_REQUIRED", 404, "Local execution projection is not enabled.");
    }
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    const profileId = profileIdFor(environment, this.config);
    if (!workspaceId || !profileId) {
      throw new PortalDerivationError("EDS05_PROFILE_NOT_CONFIGURED", 503, "Execution profile is not configured.");
    }
    const snapshot = await this.repository.snapshot(workspaceId, environment, profileId);
    if (!snapshot) throw new PortalDerivationError("N31_PROJECTION_NOT_READY", 503, "Execution projection is not ready.");
    const readAt = new Date();
    if (ageMs(snapshot, readAt) > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS) {
      throw new PortalDerivationError("N31_PROJECTION_STALE_CEILING_EXCEEDED", 503, "Execution projection is stale.");
    }
    return { snapshot, profileId, readAt };
  }

  private envelope(
    principal: PortalDerivationPrincipal,
    operationId: string,
    environment: Environment,
    profileId: string,
    readAt: Date,
    snapshot: ProfileProjectionSnapshot,
    value: {
      formula: Record<string, unknown>;
      inputs: readonly DerivationInput[];
      state: PublishedState;
      reasonCode: string | null;
      data: Record<string, unknown>;
    },
  ): Record<string, unknown> {
    const asOf = latestInputAsOf(value.inputs) ?? snapshot.sourceAsOf?.toISOString() ?? snapshot.lastSuccessfulRefreshAt.toISOString();
    return {
      schema_version: `execution.derivation.${operationId.replace(/^execution/, "").replace(/V1$/, "").replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^-/, "")}.v1`,
      logical_operation_id: operationId,
      record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM",
      workspace_id: principal.workspaceId,
      environment,
      profile_id: profileId,
      read_at_ms: readAt.valueOf(),
      read_at: readAt.toISOString(),
      as_of_ms: toEpochMs(asOf),
      as_of: asOf,
      state: value.state,
      reason_code: value.reasonCode,
      freshness: worstFreshness(value.inputs.map((entry) => entry.freshness)),
      completeness: worstCompleteness(value.inputs.map((entry) => entry.completeness)),
      projection: {
        epoch: snapshot.projectionEpoch,
        sequence: snapshot.projectionSequence,
        payload_digest: snapshot.payloadDigest,
        last_successful_refresh_at: snapshot.lastSuccessfulRefreshAt.toISOString(),
      },
      formula: value.formula,
      input_population: value.inputs.map((entry) => ({
        relation: entry.relation,
        state: entry.state,
        reason_code: entry.reasonCode,
        population: entry.population,
        freshness: entry.freshness,
        completeness: entry.completeness,
        as_of_ms: toEpochMs(entry.asOf),
        input_digest: entry.digest,
      })),
      input_digest: digest(value.inputs),
      data: value.data,
      source_side_effect_requested: false,
    };
  }
}

interface DerivationInput {
  relation: string;
  state: PublishedState;
  reasonCode: string | null;
  population: string;
  freshness: ProjectionFreshness | "UNKNOWN";
  completeness: ProjectionCompleteness | "UNKNOWN";
  asOf: string | null;
  digest: string;
}

function input(snapshot: ProfileProjectionSnapshot, key: string): DerivationInput {
  const value = relation(snapshot, key);
  if (!value || value.availability === "UNAVAILABLE") {
    return {
      relation: key, state: "UNAVAILABLE", reasonCode: value?.reason_code ?? "EDS05_RELATION_NOT_PROJECTED",
      population: "0", freshness: value?.freshness ?? "UNKNOWN", completeness: value?.completeness ?? "UNKNOWN",
      asOf: value?.as_of ?? null, digest: projectionDigest(value ?? null),
    };
  }
  return {
    relation: key,
    state: value.completeness === "PARTIAL" ? "PARTIAL" : value.items.length === 0 ? "EMPTY" : "AVAILABLE",
    reasonCode: value.completeness === "PARTIAL" ? value.reason_code ?? "SOURCE_PARTIAL" : null,
    population: String(value.items.length), freshness: value.freshness, completeness: value.completeness,
    asOf: value.as_of, digest: projectionDigest(value.items),
  };
}

function missingInput(relation: string): DerivationInput {
  return {
    relation, state: "UNAVAILABLE", reasonCode: "EDS05_INPUT_NOT_PUBLISHED",
    population: "0", freshness: "UNKNOWN", completeness: "UNKNOWN", asOf: null, digest: digest(null),
  };
}

function formula(id: string, version: string, currencyPolicy: string) {
  return { id, version, currency_policy: currencyPolicy, temporal_policy: "UTC_EPOCH_MS" };
}

function facts(snapshot: ProfileProjectionSnapshot, key: string): Fact[] {
  const value = relation(snapshot, key);
  return value?.availability === "AVAILABLE" ? value.items.map((item) => item.fields) : [];
}

function relation(snapshot: ProfileProjectionSnapshot, key: string): ProjectionRelation | null {
  return snapshot.document.relations[key] ?? null;
}

function profileIdFor(environment: Environment, config: ControlApiConfig): string | undefined {
  return environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
}

function healthEntry(
  environment: Environment,
  profileId: string | undefined,
  snapshot: ProfileProjectionSnapshot | null,
  state: PublishedState,
  reasonCode: string | null,
  readAt: Date,
) {
  const asOf = snapshot?.sourceAsOf?.toISOString() ?? snapshot?.lastSuccessfulRefreshAt.toISOString() ?? null;
  return {
    environment,
    profile_id: profileId ?? null,
    state,
    reason_code: reasonCode,
    availability: snapshot ? "AVAILABLE" : "UNAVAILABLE",
    freshness: snapshot ? freshnessFor(snapshot, readAt) : "UNKNOWN",
    completeness: snapshot?.completeness ?? "UNKNOWN",
    as_of_ms: toEpochMs(asOf),
    as_of: asOf,
    read_at_ms: readAt.valueOf(),
    global_sequence: null,
    retention_floor_ms: null,
    replay_eligible: false,
    projection_revision: snapshot ? {
      epoch: snapshot.projectionEpoch,
      sequence: snapshot.projectionSequence,
      payload_digest: snapshot.payloadDigest,
    } : null,
  };
}

function healthState(snapshot: ProfileProjectionSnapshot): PublishedState {
  return snapshot.completeness === "PARTIAL" || snapshot.completeness === "UNKNOWN" ? "PARTIAL" : "AVAILABLE";
}

function ageMs(snapshot: ProfileProjectionSnapshot, readAt: Date): number {
  return Math.max(0, readAt.valueOf() - snapshot.lastSuccessfulRefreshAt.valueOf());
}

function freshnessFor(snapshot: ProfileProjectionSnapshot, readAt: Date): ProjectionFreshness {
  const age = ageMs(snapshot, readAt);
  return age === 0 ? "FRESH" : "AGING";
}

function aggregateState(states: readonly PublishedState[]): PublishedState {
  if (states.some((state) => state === "UNAVAILABLE")) return states.some((state) => state !== "UNAVAILABLE") ? "PARTIAL" : "UNAVAILABLE";
  if (states.some((state) => state === "PARTIAL")) return "PARTIAL";
  if (states.every((state) => state === "EMPTY")) return "EMPTY";
  return "AVAILABLE";
}

function stateForInputs(inputs: readonly DerivationInput[], hasRows: boolean): PublishedState {
  if (inputs.some((entry) => entry.state === "UNAVAILABLE" || entry.state === "PARTIAL")) return "PARTIAL";
  return hasRows ? "AVAILABLE" : "EMPTY";
}

function firstInputReason(inputs: readonly DerivationInput[]): string | null {
  return inputs.find((entry) => entry.reasonCode !== null)?.reasonCode ?? null;
}

function worstFreshness(values: readonly (ProjectionFreshness | "UNKNOWN")[]): ProjectionFreshness | "UNKNOWN" {
  const rank = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 } as const;
  return values.reduce((worst, value) => rank[value] > rank[worst] ? value : worst, "FRESH" as ProjectionFreshness | "UNKNOWN");
}

function worstCompleteness(values: readonly (ProjectionCompleteness | "UNKNOWN")[]): ProjectionCompleteness | "UNKNOWN" {
  const rank = { COMPLETE: 0, PARTIAL: 1, UNKNOWN: 2 } as const;
  return values.reduce((worst, value) => rank[value] > rank[worst] ? value : worst, "COMPLETE" as ProjectionCompleteness | "UNKNOWN");
}

function latestInputAsOf(inputs: readonly DerivationInput[]): string | null {
  return inputs.flatMap((entry) => entry.asOf ? [entry.asOf] : []).sort().at(-1) ?? null;
}

function toEpochMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pickFields(row: Fact, allowed: ReadonlySet<string>): Record<string, ProjectionScalar> {
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => allowed.has(key))
    .sort(([left], [right]) => left.localeCompare(right)));
}

function tupleOf(row: Fact, environment: Environment): string | null {
  const strategy = text(row, "strategy_id");
  const account = text(row, "account_id");
  const venue = text(row, "venue");
  const mode = text(row, "mode");
  return strategy && account && venue && mode === environment ? `${strategy}\u001f${account}\u001f${mode}\u001f${venue}` : null;
}

function deploymentTuple(row: Fact, environment: Environment): string | null { return tupleOf(row, environment); }

function counterTotals(rows: readonly Fact[]) {
  let submitted = 0n;
  let riskRejected = 0n;
  let brokerRejected = 0n;
  let filled = 0n;
  let invalid = false;
  for (const row of rows) {
    for (const [field, setter] of [
      ["submitted_count", (value: bigint) => { submitted += value; }],
      ["risk_rejected_count", (value: bigint) => { riskRejected += value; }],
      ["broker_rejected_count", (value: bigint) => { brokerRejected += value; }],
      ["filled_count", (value: bigint) => { filled += value; }],
    ] as const) {
      const raw = row[field];
      if (raw === undefined || raw === null) continue;
      const value = integer(raw);
      if (value === null) { invalid = true; continue; }
      setter(value);
    }
  }
  return { submitted, riskRejected, brokerRejected, filled, invalid };
}

function integer(value: ProjectionScalar): bigint | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value)) return BigInt(value);
  return null;
}

function emptyQuality(deploymentId: string) {
  return {
    deployment_id: deploymentId, execution_session_population: "0", order_population: "0", fill_population: "0",
    submitted_count: "0", risk_rejected_count: "0", broker_rejected_count: "0", filled_count: "0", rejected_count: "0",
    reject_rate: null, latency_state: "UNAVAILABLE", latency_reason_code: "N28_BROKER_ACK_TIMESTAMPS_NOT_ACTIVATED",
    current_observation_only: true,
  };
}

function emptyActivity(alphaId: string) {
  return {
    alpha_id: alphaId, strategy_id: null, deployment_population: "0", session_population: "0", order_population: "0", fill_population: "0",
    state_counts: {}, order_status_counts: {}, latest_observed_at: null, retained_input_range_not_event_replay: true,
  };
}

function countBy(rows: readonly Fact[], field: string): Record<string, string> {
  const counts = new Map<string, bigint>();
  for (const row of rows) {
    const key = text(row, field) ?? "UNKNOWN";
    counts.set(key, (counts.get(key) ?? 0n) + 1n);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => [key, value.toString()]));
}

function latestTime(rows: readonly Fact[]): string | null {
  const candidates = rows.flatMap((row) => ["updated_at", "created_at", "completed_at", "trade_time"]
    .flatMap((key) => typeof row[key] === "string" && !Number.isNaN(Date.parse(row[key] as string)) ? [row[key] as string] : []));
  return candidates.sort().at(-1) ?? null;
}

function partitions(rows: readonly Fact[], amountFields: readonly string[]) {
  const totals = new Map<string, Map<string, Decimal>>();
  let invalid = false;
  for (const row of rows) {
    const currency = text(row, "currency");
    if (!currency) { invalid = true; continue; }
    const byField = totals.get(currency) ?? new Map<string, Decimal>();
    totals.set(currency, byField);
    for (const field of amountFields) {
      const raw = row[field];
      if (raw === undefined || raw === null) continue;
      const parsed = decimal(raw);
      if (!parsed) { invalid = true; continue; }
      byField.set(field, addDecimal(byField.get(field) ?? zeroDecimal(), parsed));
    }
  }
  return {
    invalid,
    rows: [...totals.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([currency, byField]) => ({
      currency,
      population: String(rows.filter((row) => text(row, "currency") === currency).length),
      ...Object.fromEntries(amountFields.map((field) => [field, byField.has(field) ? formatDecimal(byField.get(field)!) : null])),
    })),
  };
}

interface Decimal { units: bigint; scale: number; }
function zeroDecimal(): Decimal { return { units: 0n, scale: 0 }; }
function decimal(value: ProjectionScalar): Decimal | null {
  const raw = typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : null;
  if (!raw || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = (negative ? raw.slice(1) : raw).split(".");
  const units = BigInt(`${whole}${fraction}`) * (negative ? -1n : 1n);
  return { units, scale: fraction.length };
}
function addDecimal(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return {
    units: left.units * 10n ** BigInt(scale - left.scale) + right.units * 10n ** BigInt(scale - right.scale),
    scale,
  };
}
function formatDecimal(value: Decimal): string {
  const negative = value.units < 0n;
  const absolute = (negative ? -value.units : value.units).toString().padStart(value.scale + 1, "0");
  const whole = value.scale === 0 ? absolute : absolute.slice(0, -value.scale);
  const fraction = value.scale === 0 ? "" : absolute.slice(-value.scale).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonical(value), "utf8").digest("hex")}`;
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}
