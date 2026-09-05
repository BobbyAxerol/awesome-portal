/**
 * EDS-05 derivation envelopes — `GET /api/v1/execution/derivations/*`.
 *
 * Every route answers the same envelope: a server-computed `state`
 * (READY/PARTIAL/EMPTY/UNAVAILABLE), a `reason_code`, the formula that produced
 * the figures, and the input relations with their own state and population.
 * The readers keep every number a string — these are counts and balances the
 * server already summed; the browser prints them, it does not add to them.
 * `reject_rate` arrives as numerator/denominator and is shown as that pair:
 * dividing it here would be a figure the server never published.
 */
import type { PanelStatus } from "../contracts";

export type DerivationState = "READY" | "PARTIAL" | "EMPTY" | "UNAVAILABLE" | "DENIED" | "UNKNOWN";

export interface DerivationFormula {
  id: string | null;
  version: string | null;
  currencyPolicy: string | null;
  temporalPolicy: string | null;
}

export interface DerivationInput {
  relation: string;
  state: string | null;
  reasonCode: string | null;
  population: string | null;
  freshness: string | null;
  completeness: string | null;
  asOfMs: number | null;
}

export interface DerivationEnvelope<T> {
  schemaVersion: string | null;
  logicalOperationId: string | null;
  environment: string | null;
  profileId: string | null;
  readAt: string | null;
  asOf: string | null;
  state: DerivationState;
  reasonCode: string | null;
  freshness: string | null;
  completeness: string | null;
  formula: DerivationFormula;
  inputs: readonly DerivationInput[];
  inputDigest: string | null;
  data: T;
}

export interface SourceHealthProfile {
  environment: string | null;
  profileId: string | null;
  state: DerivationState;
  reasonCode: string | null;
  availability: string | null;
  freshness: string | null;
  completeness: string | null;
  asOf: string | null;
  readAtMs: number | null;
  globalSequence: string | null;
  retentionFloorMs: number | null;
  replayEligible: boolean | null;
  projectionEpoch: string | null;
  projectionSequence: string | null;
}

export interface SourceHealthData {
  requestedEnvironment: string | null;
  profiles: readonly SourceHealthProfile[];
  sourceSideEffectRequested: boolean | null;
}

export interface DeploymentQualityData {
  deploymentId: string | null;
  executionSessionPopulation: string | null;
  orderPopulation: string | null;
  fillPopulation: string | null;
  submittedCount: string | null;
  riskRejectedCount: string | null;
  brokerRejectedCount: string | null;
  filledCount: string | null;
  rejectedCount: string | null;
  rejectRate: { numerator: string; denominator: string } | null;
  latencyState: string | null;
  latencyReasonCode: string | null;
  currentObservationOnly: boolean;
}

export interface CurrencyBucket {
  currency: string;
  population: string | null;
  values: Record<string, string | null>;
}

export interface PortfolioCapitalData {
  portfolioId: string | null;
  portfolio: { name: string | null; baseCurrency: string | null; state: string | null; createdAt: string | null; updatedAt: string | null } | null;
  allocationByCurrency: readonly CurrencyBucket[];
  accountBalanceByCurrency: readonly CurrencyBucket[];
  currencyPolicy: string | null;
  unpublishedInputs: readonly string[];
  currentObservationOnly: boolean;
}

export interface AlphaActivityData {
  alphaId: string | null;
  strategyId: string | null;
  deploymentPopulation: string | null;
  sessionPopulation: string | null;
  orderPopulation: string | null;
  fillPopulation: string | null;
  stateCounts: Record<string, string>;
  orderStatusCounts: Record<string, string>;
  latestObservedAt: string | null;
  retainedInputRangeNotEventReplay: boolean;
}

export type SourceHealth = DerivationEnvelope<SourceHealthData>;
export type DeploymentQuality = DerivationEnvelope<DeploymentQualityData>;
export type PortfolioCapital = DerivationEnvelope<PortfolioCapitalData>;
export type AlphaActivity = DerivationEnvelope<AlphaActivityData>;

/* ── readers ─────────────────────────────────────────────────────────── */

const obj = (v: unknown): Record<string, unknown> | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const STATES: readonly DerivationState[] = ["READY", "PARTIAL", "EMPTY", "UNAVAILABLE", "DENIED"];
const state = (v: unknown): DerivationState => (STATES as readonly string[]).includes(String(v)) ? (v as DerivationState) : "UNKNOWN";

function stringMap(v: unknown): Record<string, string> {
  const o = obj(v);
  if (!o) return {};
  return Object.fromEntries(Object.entries(o).flatMap(([k, x]) => (str(x) !== null ? [[k, str(x)!]] : [])));
}

function formula(v: unknown): DerivationFormula {
  const o = obj(v);
  return { id: str(o?.id), version: str(o?.version), currencyPolicy: str(o?.currency_policy), temporalPolicy: str(o?.temporal_policy) };
}

function inputs(v: unknown): DerivationInput[] {
  return list(v).flatMap((row) => {
    const o = obj(row);
    const relation = str(o?.relation);
    if (!o || !relation) return [];
    return [{
      relation,
      state: str(o.state),
      reasonCode: str(o.reason_code),
      population: str(o.population),
      freshness: str(o.freshness),
      completeness: str(o.completeness),
      asOfMs: int(o.as_of_ms),
    }];
  });
}

function envelope<T>(raw: unknown, data: (root: Record<string, unknown>) => T | null): DerivationEnvelope<T> | null {
  const root = obj(raw);
  if (!root || typeof root.schema_version !== "string") return null;
  const body = data(root);
  if (body === null) return null;
  return {
    schemaVersion: str(root.schema_version),
    logicalOperationId: str(root.logical_operation_id),
    environment: str(root.environment) ?? str(root.requested_environment),
    profileId: str(root.profile_id),
    readAt: str(root.read_at),
    asOf: str(root.as_of),
    state: state(root.state),
    reasonCode: str(root.reason_code),
    freshness: str(root.freshness),
    completeness: str(root.completeness),
    formula: formula(root.formula),
    inputs: inputs(root.input_population),
    inputDigest: str(root.input_digest),
    data: body,
  };
}

export function readSourceHealth(raw: unknown): SourceHealth | null {
  return envelope(raw, (root) => ({
    requestedEnvironment: str(root.requested_environment),
    sourceSideEffectRequested: bool(root.source_side_effect_requested),
    profiles: list(root.profiles).flatMap((row) => {
      const o = obj(row);
      if (!o) return [];
      const rev = obj(o.projection_revision);
      return [{
        environment: str(o.environment),
        profileId: str(o.profile_id),
        state: state(o.state),
        reasonCode: str(o.reason_code),
        availability: str(o.availability),
        freshness: str(o.freshness),
        completeness: str(o.completeness),
        asOf: str(o.as_of),
        readAtMs: int(o.read_at_ms),
        globalSequence: str(o.global_sequence),
        retentionFloorMs: int(o.retention_floor_ms),
        replayEligible: bool(o.replay_eligible),
        projectionEpoch: str(rev?.epoch),
        projectionSequence: str(rev?.sequence),
      }];
    }),
  }));
}

export function readDeploymentQuality(raw: unknown): DeploymentQuality | null {
  return envelope(raw, (root) => {
    const d = obj(root.data);
    if (!d) return null;
    const rate = obj(d.reject_rate);
    const numerator = str(rate?.numerator);
    const denominator = str(rate?.denominator);
    return {
      deploymentId: str(d.deployment_id),
      executionSessionPopulation: str(d.execution_session_population),
      orderPopulation: str(d.order_population),
      fillPopulation: str(d.fill_population),
      submittedCount: str(d.submitted_count),
      riskRejectedCount: str(d.risk_rejected_count),
      brokerRejectedCount: str(d.broker_rejected_count),
      filledCount: str(d.filled_count),
      rejectedCount: str(d.rejected_count),
      rejectRate: numerator !== null && denominator !== null ? { numerator, denominator } : null,
      latencyState: str(d.latency_state),
      latencyReasonCode: str(d.latency_reason_code),
      currentObservationOnly: d.current_observation_only === true,
    };
  });
}

function currencyBuckets(v: unknown, fields: readonly string[]): CurrencyBucket[] {
  return list(v).flatMap((row) => {
    const o = obj(row);
    const currency = str(o?.currency);
    if (!o || !currency) return [];
    return [{ currency, population: str(o.population), values: Object.fromEntries(fields.map((f) => [f, str(o[f])])) }];
  });
}

export function readPortfolioCapital(raw: unknown): PortfolioCapital | null {
  return envelope(raw, (root) => {
    const d = obj(root.data);
    if (!d) return null;
    const p = obj(d.portfolio);
    return {
      portfolioId: str(d.portfolio_id),
      portfolio: p
        ? { name: str(p.name), baseCurrency: str(p.base_currency), state: str(p.state), createdAt: str(p.created_at), updatedAt: str(p.updated_at) }
        : null,
      allocationByCurrency: currencyBuckets(d.allocation_by_currency, ["allocated_capital", "max_capital"]),
      accountBalanceByCurrency: currencyBuckets(d.account_balance_by_currency, ["total", "free", "locked"]),
      currencyPolicy: str(d.currency_policy),
      unpublishedInputs: list(d.unpublished_inputs).flatMap((x) => (str(x) !== null ? [str(x)!] : [])),
      currentObservationOnly: d.current_observation_only === true,
    };
  });
}

export function readAlphaActivity(raw: unknown): AlphaActivity | null {
  return envelope(raw, (root) => {
    const d = obj(root.data);
    if (!d) return null;
    return {
      alphaId: str(d.alpha_id),
      strategyId: str(d.strategy_id),
      deploymentPopulation: str(d.deployment_population),
      sessionPopulation: str(d.session_population),
      orderPopulation: str(d.order_population),
      fillPopulation: str(d.fill_population),
      stateCounts: stringMap(d.state_counts),
      orderStatusCounts: stringMap(d.order_status_counts),
      latestObservedAt: str(d.latest_observed_at),
      retainedInputRangeNotEventReplay: d.retained_input_range_not_event_replay === true,
    };
  });
}

/** The server's state is the panel state; an HTTP 200 alone never means product-ready. */
export function derivationPanelStatus(s: DerivationState): PanelStatus {
  switch (s) {
    case "READY": return "ok";
    case "PARTIAL": return "partial";
    case "EMPTY": return "empty";
    case "DENIED": return "denied";
    default: return "unavailable";
  }
}
