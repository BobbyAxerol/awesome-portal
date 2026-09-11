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
/**
 * These values are deliberately the intersection of the fixed Edge request
 * and the Source Proxy/Data Layer adapter. They are not a generic market
 * catalogue and must stay narrow enough that a browser cannot turn the BFF
 * into a provider query surface.
 */
export const MARKET_CONTEXT_VENUE = "BINANCE";
export const MARKET_CONTEXT_INTERVALS = Object.freeze([
  "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
] as const);
export const MARKET_CONTEXT_MAXIMUM_VISUAL_CANDLES = 2_000;
/** The Edge clamps this source provider's raw page request to this bound. */
export const MARKET_CONTEXT_DATA_LAYER_MAXIMUM_RAW_CANDLES = 1_500;
const INSTRUMENT = /^[A-Z0-9]{2,30}$/;
const INTERVALS = new Set<string>(MARKET_CONTEXT_INTERVALS);

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
    maximumItems: MARKET_CONTEXT_MAXIMUM_VISUAL_CANDLES,
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
  assertVenue(query.venue);
  assertInstrument(query.instrument);
  return `/internal/v2/manager/market/latest?${new URLSearchParams({
    venue: query.venue,
    instrument: query.instrument,
  }).toString()}`;
}

export function marketCandlesPath(query: MarketCandlesQuery): string {
  assertVenue(query.venue);
  assertInstrument(query.instrument);
  if (!INTERVALS.has(query.interval)) throw invalidQuery("interval");
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

function assertVenue(value: string): void {
  if (value !== MARKET_CONTEXT_VENUE) throw invalidQuery("venue");
}

function assertInstrument(value: string): void {
  if (!INSTRUMENT.test(value)) throw invalidQuery("instrument");
}

function invalidQuery(field: string): Error {
  return new Error(`EDS11R4_MARKET_QUERY_INVALID:${field}`);
}
