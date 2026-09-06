import { Inject, Injectable } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { ExecutionCurrentSourceProxy } from "./current-source.proxy";
import {
  acceptedMarketContextCapability,
  MARKET_CONTEXT_PUBLICATION_INTAKE_V1,
  MarketContextIntakeError,
} from "./market-context.intake";
import {
  marketCandlesPolicy,
  marketContextOperation,
  marketContextProfileBinding,
  marketLatestPolicy,
  type MarketCandlesQuery,
  type MarketContextOperationId,
  type MarketLatestQuery,
} from "./market-context.registry";
import type { MaximumDataEnvironment } from "./maximum-data-intake";

const DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const FRESHNESS = new Set(["FRESH", "AGING", "DEGRADED", "STALE"]);
const COMPLETENESS = new Set(["COMPLETE", "PARTIAL", "POLL_BOUNDED"]);
const CANDLE_COVERAGE = new Set(["COMPLETE", "PARTIAL", "UNKNOWN"]);
const CANDLE_SAMPLING = new Set(["NONE", "SOURCE_BOUNDED", "SOURCE_AGGREGATED"]);
const OBSERVATION_KIND = new Set(["TRADE", "MARK", "INDEX", "BAR_CLOSE"]);

export interface MarketContextPrincipal {
  readonly user: PortalUser;
  readonly session: AuthSession;
  readonly workspaceId: string;
}

export interface MarketContextLatestRequest extends MarketLatestQuery {
  readonly environment: MaximumDataEnvironment;
}

export interface MarketContextCandlesRequest extends MarketCandlesQuery {
  readonly environment: MaximumDataEnvironment;
}

export class MarketContextError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

/**
 * Named same-origin BFF for the two EDS-11R4 routes.  The compiled intake is
 * pending until Trading System returns a digest-pinned adapter pack, so this
 * service cannot create an mTLS connection merely because a deployment flag
 * was toggled.  Once accepted, it reuses the existing private Manager-v2
 * transport and strips its source envelope before returning to the browser.
 */
@Injectable()
export class MarketContextService {
  constructor(
    @Inject(ExecutionCurrentSourceProxy) private readonly currentSource: ExecutionCurrentSourceProxy,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async latest(principal: MarketContextPrincipal, request: MarketContextLatestRequest) {
    this.assertActivated("managerMarketContextLatestV1", request.environment);
    const response = await this.currentSource.fixedPathForNamedOperation(
      principal,
      request.environment,
      marketLatestPolicy(request.environment, request),
    );
    return translateMarketLatest(response, request);
  }

  async candles(principal: MarketContextPrincipal, request: MarketContextCandlesRequest) {
    this.assertActivated("managerMarketContextCandlesV1", request.environment);
    const response = await this.currentSource.fixedPathForNamedOperation(
      principal,
      request.environment,
      marketCandlesPolicy(request.environment, request),
    );
    return translateMarketCandles(response, request);
  }

  private assertActivated(operationId: MarketContextOperationId, environment: MaximumDataEnvironment): void {
    try {
      acceptedMarketContextCapability(MARKET_CONTEXT_PUBLICATION_INTAKE_V1, operationId, environment);
    } catch (error) {
      if (error instanceof MarketContextIntakeError) {
        throw new MarketContextError(error.code, error.status);
      }
      throw error;
    }
    if (this.config.FEATURE_EXECUTION_MARKET_CONTEXT !== "true") {
      throw new MarketContextError("MARKET_CONTEXT_RUNTIME_NOT_ACTIVATED", 404);
    }
  }
}

export function translateMarketLatest(response: unknown, request: MarketContextLatestRequest) {
  const operation = marketContextOperation("managerMarketContextLatestV1");
  const source = sourceEnvelope(response, operation.operationId, request.environment);
  const data = asObject(source.data);
  const items = asArray(data.items, operation.maximumItems).map((item) => {
    const observation = asObject(item);
    const venue = boundedString(observation.venue, 96);
    const instrument = boundedString(observation.instrument, 191);
    if (venue !== request.venue || instrument !== request.instrument) throw sourceContractRejected();
    const value = decimal(observation.value);
    const observationKind = stringIn(observation.observation_kind, OBSERVATION_KIND);
    const observedAtMs = utcMilliseconds(observation.observed_at_ms);
    const quoteCurrency = boundedString(observation.quote_currency, 32);
    const provider = boundedString(observation.provider, 96);
    return Object.freeze({
      venue,
      instrument,
      value,
      observation_kind: observationKind,
      observed_at_ms: observedAtMs,
      quote_currency: quoteCurrency,
      provider,
    });
  });
  const result = {
    schema_version: "portal.execution.market-context.latest.v1",
    authority: "PORTAL_CONTROL_API",
    logical_operation_id: operation.operationId,
    environment: request.environment,
    profile_id: marketContextProfileBinding(request.environment).profileId,
    provenance: {
      source_contract_revision: operation.sourceContractRevision,
      history_semantics: "CURRENT_MARKET_OBSERVATION_NO_REPLAY_CLAIM",
      derived: false,
    },
    source_health: sourceHealth(source),
    state: items.length === 0 ? "AUTHORITATIVE_EMPTY" : "POPULATED",
    observations: items,
  };
  return assertResponseBound(result, operation.maximumResponseBytes);
}

export function translateMarketCandles(response: unknown, request: MarketContextCandlesRequest) {
  const operation = marketContextOperation("managerMarketContextCandlesV1");
  const source = sourceEnvelope(response, operation.operationId, request.environment);
  const data = asObject(source.data);
  if (
    boundedString(data.venue, 96) !== request.venue ||
    boundedString(data.instrument, 191) !== request.instrument ||
    boundedString(data.interval, 32) !== request.interval
  ) throw sourceContractRejected();
  const coverage = stringIn(data.coverage, CANDLE_COVERAGE);
  const sampling = stringIn(data.sampling, CANDLE_SAMPLING);
  let previousOpenMs = -1;
  const candles = asArray(data.items, operation.maximumItems).map((item) => {
    const candle = asObject(item);
    const openMs = utcMilliseconds(candle.open_ms);
    const closeMs = utcMilliseconds(candle.close_ms);
    if (openMs < request.fromMs || closeMs > request.toMs || closeMs < openMs || openMs <= previousOpenMs) {
      throw sourceContractRejected();
    }
    previousOpenMs = openMs;
    const open = decimal(candle.open);
    const high = decimal(candle.high);
    const low = decimal(candle.low);
    const close = decimal(candle.close);
    const volume = decimal(candle.volume);
    if (compareDecimal(high, open) < 0 || compareDecimal(high, close) < 0 ||
      compareDecimal(low, open) > 0 || compareDecimal(low, close) > 0) {
      throw sourceContractRejected();
    }
    return Object.freeze({
      open_ms: openMs,
      close_ms: closeMs,
      open,
      high,
      low,
      close,
      volume,
    });
  });
  if (candles.length > request.pointLimit) throw sourceContractRejected();
  const result = {
    schema_version: "portal.execution.market-context.candles.v1",
    authority: "PORTAL_CONTROL_API",
    logical_operation_id: operation.operationId,
    environment: request.environment,
    profile_id: marketContextProfileBinding(request.environment).profileId,
    provenance: {
      source_contract_revision: operation.sourceContractRevision,
      history_semantics: "BOUNDED_PROVIDER_SERIES_NO_REPLAY_CLAIM",
      derived: false,
    },
    source_health: sourceHealth(source),
    range: {
      venue: request.venue,
      instrument: request.instrument,
      interval: request.interval,
      from_ms: request.fromMs,
      to_ms: request.toMs,
      point_limit: request.pointLimit,
    },
    coverage,
    sampling,
    state: candles.length === 0 ? "AUTHORITATIVE_EMPTY" : "POPULATED",
    candles,
  };
  return assertResponseBound(result, operation.maximumResponseBytes);
}

function sourceEnvelope(
  response: unknown,
  operationId: MarketContextOperationId,
  environment: MaximumDataEnvironment,
): Record<string, unknown> {
  const bff = asObject(response);
  const profile = marketContextProfileBinding(environment);
  if (
    bff.schema_version !== "portal.execution.current-source-bff.v2" ||
    bff.authority !== "PORTAL_CONTROL_API" ||
    bff.requested_environment !== environment ||
    bff.source_environment !== environment ||
    bff.profile_id !== profile.profileId
  ) throw sourceContractRejected();
  const source = asObject(bff.source);
  if (
    source.schema_version !== "trading-system.portal-execution.market-context-envelope.v1" ||
    source.contract_revision !== "trading-system.portal-execution.market-context.v1" ||
    source.authority !== "EXECUTION_CELL" ||
    source.profile_id !== profile.profileId ||
    source.availability !== "AVAILABLE" ||
    !FRESHNESS.has(String(source.freshness)) ||
    !COMPLETENESS.has(String(source.completeness)) ||
    !isUtcMilliseconds(source.as_of_ms)
  ) throw sourceContractRejected();
  const data = asObject(source.data);
  if (data.operation_id !== operationId) throw sourceContractRejected();
  return source;
}

function sourceHealth(source: Record<string, unknown>) {
  return Object.freeze({
    availability: "AVAILABLE",
    freshness: String(source.freshness),
    completeness: String(source.completeness),
    as_of_ms: utcMilliseconds(source.as_of_ms),
  });
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw sourceContractRejected();
  return value as Record<string, unknown>;
}

function asArray(value: unknown, maximumItems: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw sourceContractRejected();
  return value;
}

function boundedString(value: unknown, maximumLength: number): string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength) throw sourceContractRejected();
  return value;
}

function stringIn(value: unknown, values: Set<string>): string {
  if (typeof value !== "string" || !values.has(value)) throw sourceContractRejected();
  return value;
}

function decimal(value: unknown): string {
  if (typeof value !== "string" || !DECIMAL.test(value)) throw sourceContractRejected();
  return value;
}

function isUtcMilliseconds(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 8_640_000_000_000_000;
}

function utcMilliseconds(value: unknown): number {
  if (!isUtcMilliseconds(value)) throw sourceContractRejected();
  return value;
}

function compareDecimal(left: string, right: string): number {
  const [leftInt, leftFraction = ""] = unsignedDecimalParts(left);
  const [rightInt, rightFraction = ""] = unsignedDecimalParts(right);
  const leftNegative = left.startsWith("-") && !zeroDecimal(left);
  const rightNegative = right.startsWith("-") && !zeroDecimal(right);
  if (leftNegative !== rightNegative) return leftNegative ? -1 : 1;
  const sign = leftNegative ? -1 : 1;
  const normalizedLeftInt = leftInt.replace(/^0+(?=\d)/, "");
  const normalizedRightInt = rightInt.replace(/^0+(?=\d)/, "");
  if (normalizedLeftInt.length !== normalizedRightInt.length) {
    return normalizedLeftInt.length > normalizedRightInt.length ? sign : -sign;
  }
  if (normalizedLeftInt !== normalizedRightInt) return normalizedLeftInt > normalizedRightInt ? sign : -sign;
  const length = Math.max(leftFraction.length, rightFraction.length);
  const normalizedLeftFraction = leftFraction.padEnd(length, "0");
  const normalizedRightFraction = rightFraction.padEnd(length, "0");
  if (normalizedLeftFraction === normalizedRightFraction) return 0;
  return normalizedLeftFraction > normalizedRightFraction ? sign : -sign;
}

function unsignedDecimalParts(value: string): [string, string?] {
  return value.replace(/^-/, "").split(".") as [string, string?];
}

function zeroDecimal(value: string): boolean {
  return /^-?0(?:\.0+)?$/.test(value);
}

function assertResponseBound<T>(value: T, maximumBytes: number): T {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > maximumBytes) {
    throw new MarketContextError("EDS11R4_RESPONSE_TOO_LARGE", 502);
  }
  return value;
}

function sourceContractRejected(): MarketContextError {
  return new MarketContextError("EDS11R4_SOURCE_CONTRACT_REJECTED", 502);
}
