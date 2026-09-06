import type { CurrentSourceFixedPathOperationPolicy } from "./current-source.proxy";
import { MAXIMUM_DATA_INTAKE_V1, type MaximumDataEnvironment } from "./maximum-data-intake";

/**
 * EDS-11R4 is intentionally a two-operation BFF, not a relation browser.
 * Both paths are frozen in the owner-request manifest and the only variable
 * values are the bounded product inputs below.
 */
export type MarketContextOperationId =
  | "managerMarketContextLatestV1"
  | "managerMarketContextCandlesV1";

export interface MarketLatestQuery {
  readonly venue: string;
  readonly instrument: string;
}

export interface MarketCandlesQuery extends MarketLatestQuery {
  readonly interval: string;
  readonly fromMs: number;
  readonly toMs: number;
  readonly pointLimit: number;
}

export interface MarketContextOperation {
  readonly operationId: MarketContextOperationId;
  readonly capabilityId: "market.latest.v1" | "market.candles.v1";
  readonly sourceId: "market.context";
  readonly sourceContractRevision: "trading-system.portal-execution.market-context.v1";
  readonly maximumResponseBytes: number;
  readonly maximumItems: number;
  readonly sourceMaximumConcurrency: number;
}

export const MARKET_CONTEXT_MAXIMUM_CANDLE_RANGE_MS = 366 * 24 * 60 * 60 * 1_000;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/;
const INTERVAL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

const REGISTRY = Object.freeze({
  managerMarketContextLatestV1: Object.freeze({
    operationId: "managerMarketContextLatestV1",
    capabilityId: "market.latest.v1",
    sourceId: "market.context",
    sourceContractRevision: "trading-system.portal-execution.market-context.v1",
    maximumResponseBytes: 1_048_576,
    maximumItems: 200,
    sourceMaximumConcurrency: 2,
  }),
  managerMarketContextCandlesV1: Object.freeze({
    operationId: "managerMarketContextCandlesV1",
    capabilityId: "market.candles.v1",
    sourceId: "market.context",
    sourceContractRevision: "trading-system.portal-execution.market-context.v1",
    maximumResponseBytes: 8_388_608,
    maximumItems: 2_000,
    sourceMaximumConcurrency: 2,
  }),
} satisfies Record<MarketContextOperationId, MarketContextOperation>);

export const MARKET_CONTEXT_OPERATION_REGISTRY = REGISTRY;

export function marketContextOperation(operationId: MarketContextOperationId): MarketContextOperation {
  return REGISTRY[operationId];
}

export function marketContextProfileBinding(environment: MaximumDataEnvironment) {
  const profile = MAXIMUM_DATA_INTAKE_V1.profiles.find((candidate) => candidate.environment === environment);
  if (!profile) throw new Error(`EDS11R4 market context environment is not accepted: ${environment}`);
  return profile;
}

export function marketLatestPolicy(
  environment: MaximumDataEnvironment,
  query: MarketLatestQuery,
): CurrentSourceFixedPathOperationPolicy {
  const operation = REGISTRY.managerMarketContextLatestV1;
  return fixedPathPolicy(operation, environment, marketLatestPath(query));
}

export function marketCandlesPolicy(
  environment: MaximumDataEnvironment,
  query: MarketCandlesQuery,
): CurrentSourceFixedPathOperationPolicy {
  const operation = REGISTRY.managerMarketContextCandlesV1;
  return fixedPathPolicy(operation, environment, marketCandlesPath(query));
}

export function marketLatestPath(query: MarketLatestQuery): string {
  assertToken(query.venue, "venue");
  assertToken(query.instrument, "instrument");
  return `/internal/v2/manager/market/latest?${new URLSearchParams({
    venue: query.venue,
    instrument: query.instrument,
  }).toString()}`;
}

export function marketCandlesPath(query: MarketCandlesQuery): string {
  assertToken(query.venue, "venue");
  assertToken(query.instrument, "instrument");
  if (!INTERVAL.test(query.interval)) throw invalidQuery("interval");
  if (
    !Number.isSafeInteger(query.fromMs) ||
    !Number.isSafeInteger(query.toMs) ||
    query.fromMs < 0 ||
    query.toMs <= query.fromMs ||
    query.toMs - query.fromMs > MARKET_CONTEXT_MAXIMUM_CANDLE_RANGE_MS ||
    !Number.isSafeInteger(query.pointLimit) ||
    query.pointLimit < 1 ||
    query.pointLimit > REGISTRY.managerMarketContextCandlesV1.maximumItems
  ) throw invalidQuery("candle-range");
  return `/internal/v2/manager/market/candles?${new URLSearchParams({
    venue: query.venue,
    instrument: query.instrument,
    interval: query.interval,
    from_ms: String(query.fromMs),
    to_ms: String(query.toMs),
    point_limit: String(query.pointLimit),
  }).toString()}`;
}

function fixedPathPolicy(
  operation: MarketContextOperation,
  environment: MaximumDataEnvironment,
  fixedPath: string,
): CurrentSourceFixedPathOperationPolicy {
  return Object.freeze({
    operationId: operation.operationId,
    sourceId: operation.sourceId,
    adapterRevision: operation.sourceContractRevision,
    maximumResponseBytes: operation.maximumResponseBytes,
    sourceMaximumConcurrency: operation.sourceMaximumConcurrency,
    profileMaximumConcurrency: marketContextProfileBinding(environment).maximumObservedConcurrency,
    fixedPath,
  });
}

function assertToken(value: string, field: string): void {
  if (!TOKEN.test(value)) throw invalidQuery(field);
}

function invalidQuery(field: string): Error {
  return new Error(`EDS11R4_MARKET_QUERY_INVALID:${field}`);
}
