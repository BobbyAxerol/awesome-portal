import { describe, expect, it } from "vitest";
import { loadConfig, type ControlApiConfig } from "../src/config";
import { ExecutionCurrentSourceProxy } from "../src/execution/current-source.proxy";
import {
  acceptedMarketContextCapability,
  MARKET_CONTEXT_PUBLICATION_INTAKE_V1,
  MARKET_CONTEXT_REQUEST_MANIFEST_SHA256,
  type MarketContextPublicationIntake,
} from "../src/execution/market-context.intake";
import {
  marketCandlesPath,
  marketCandlesPolicy,
  marketLatestPath,
  marketLatestPolicy,
  MARKET_CONTEXT_MAXIMUM_CANDLE_RANGE_MS,
} from "../src/execution/market-context.registry";
import {
  MarketContextService,
  translateMarketCandles,
  translateMarketLatest,
} from "../src/execution/market-context.service";
import type { AuthSession, PortalUser } from "../src/domain";

const user: PortalUser = {
  userId: "usr_market_context", username: "market-context", displayName: "Market Context", role: "ADMIN",
  status: "ACTIVE", mustChangePassword: false, failedLoginCount: 0, lockedUntil: null, sessionVersion: 1,
  createdAt: new Date("2026-09-06T00:00:00.000Z"), updatedAt: new Date("2026-09-06T00:00:00.000Z"), disabledAt: null,
};
const session: AuthSession = {
  sessionId: "ses_market_context", userId: user.userId, state: "ACTIVE", sessionVersion: 1,
  authenticationTime: new Date("2026-09-06T00:00:00.000Z"),
  idleExpiresAt: new Date("2026-09-06T01:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-09-06T08:00:00.000Z"),
};
const principal = { user, session, workspaceId: "ws_market_context" };

class FakeCurrentSource {
  calls: unknown[] = [];

  async fixedPathForNamedOperation(...args: unknown[]): Promise<unknown> {
    this.calls.push(args);
    return latestEnvelope();
  }
}

const base = {
  DATABASE_URL: "postgres://portal:portal@localhost/portal",
  PORTAL_ENV: "local",
  AUTH_MODE: "dev",
};

describe("EDS-11R4 Market Context owner-gated BFF", () => {
  it("generates only the two exact bounded private paths", () => {
    expect(marketLatestPath({ venue: "BINANCE", instrument: "BTCUSDT" })).toBe(
      "/internal/v2/manager/market/latest?venue=BINANCE&instrument=BTCUSDT",
    );
    expect(marketCandlesPath({
      venue: "BINANCE", instrument: "BTCUSDT", interval: "1m", fromMs: 1_000, toMs: 2_000, pointLimit: 200,
    })).toBe(
      "/internal/v2/manager/market/candles?venue=BINANCE&instrument=BTCUSDT&interval=1m&from_ms=1000&to_ms=2000&point_limit=200",
    );
    expect(marketLatestPolicy("paper", { venue: "BINANCE", instrument: "BTCUSDT" })).toMatchObject({
      operationId: "managerMarketContextLatestV1", sourceId: "market.context", maximumResponseBytes: 1_048_576,
    });
    expect(marketCandlesPolicy("live", {
      venue: "BINANCE", instrument: "BTCUSDT", interval: "1m", fromMs: 1_000, toMs: 2_000, pointLimit: 200,
    })).toMatchObject({
      operationId: "managerMarketContextCandlesV1", sourceId: "market.context", maximumResponseBytes: 8_388_608,
    });
    expect(() => marketLatestPath({ venue: "BINANCE&bad=true", instrument: "BTCUSDT" })).toThrow(/MARKET_QUERY_INVALID/);
    expect(() => marketCandlesPath({
      venue: "BINANCE", instrument: "BTCUSDT", interval: "1m", fromMs: 0,
      toMs: MARKET_CONTEXT_MAXIMUM_CANDLE_RANGE_MS + 1, pointLimit: 200,
    })).toThrow(/MARKET_QUERY_INVALID/);
  });

  it("cannot be activated by an environment flag before a digest-pinned owner return", async () => {
    const source = new FakeCurrentSource();
    const service = new MarketContextService(
      source as unknown as ExecutionCurrentSourceProxy,
      { FEATURE_EXECUTION_MARKET_CONTEXT: "true" } as ControlApiConfig,
    );
    await expect(service.latest(principal, {
      environment: "paper", venue: "BINANCE", instrument: "BTCUSDT",
    })).rejects.toMatchObject({ code: "PENDING_MARKET_CONTEXT_ADAPTER", status: 503 });
    expect(source.calls).toEqual([]);
  });

  it("requires an accepted digest-pinned capability for each profile", () => {
    expect(() => acceptedMarketContextCapability(
      MARKET_CONTEXT_PUBLICATION_INTAKE_V1,
      "managerMarketContextLatestV1",
      "paper",
    )).toThrow(/PENDING_MARKET_CONTEXT_ADAPTER/);
    const accepted = acceptedPublication();
    expect(acceptedMarketContextCapability(accepted, "managerMarketContextLatestV1", "live")).toMatchObject({
      operationId: "managerMarketContextLatestV1",
    });
    expect(() => acceptedMarketContextCapability(accepted, "managerMarketContextCandlesV1", "sandbox"))
      .toThrow(/MARKET_CONTEXT_PROFILE_NOT_ACCEPTED/);
  });

  it("preserves exact decimal and UTC values while withholding the Edge envelope", () => {
    const latest = translateMarketLatest(latestEnvelope(), {
      environment: "paper", venue: "BINANCE", instrument: "BTCUSDT",
    });
    expect(latest).toMatchObject({
      schema_version: "portal.execution.market-context.latest.v1",
      state: "POPULATED",
      observations: [{ value: "105123.000000000000000001", observed_at_ms: 1_788_566_400_000 }],
    });
    const serialized = JSON.stringify(latest);
    for (const forbidden of ["/internal/v2/", "delegated", "mtls", "cursor", "source_secret"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    const candles = translateMarketCandles(candlesEnvelope(), {
      environment: "paper", venue: "BINANCE", instrument: "BTCUSDT", interval: "1m",
      fromMs: 1_000, toMs: 3_000, pointLimit: 2,
    });
    expect(candles).toMatchObject({
      schema_version: "portal.execution.market-context.candles.v1",
      state: "POPULATED",
      coverage: "COMPLETE",
      candles: [{ open: "100", high: "110", low: "90", close: "105", volume: "12.500" }],
    });
  });

  it("keeps source-empty authoritative and rejects drifted or malformed source truth", () => {
    const empty = latestEnvelope();
    (empty.source as Record<string, unknown>).data = {
      operation_id: "managerMarketContextLatestV1", items: [],
    };
    expect(translateMarketLatest(empty, {
      environment: "paper", venue: "BINANCE", instrument: "BTCUSDT",
    })).toMatchObject({ state: "AUTHORITATIVE_EMPTY", observations: [] });

    const drifted = latestEnvelope();
    (drifted.source as Record<string, unknown>).profile_id = "PAPER_OTHER";
    expect(() => translateMarketLatest(drifted, {
      environment: "paper", venue: "BINANCE", instrument: "BTCUSDT",
    })).toThrow(/EDS11R4_SOURCE_CONTRACT_REJECTED/);

    const malformed = candlesEnvelope();
    const data = (malformed.source as Record<string, unknown>).data as Record<string, unknown>;
    ((data.items as Array<Record<string, unknown>>)[0]).high = "99";
    expect(() => translateMarketCandles(malformed, {
      environment: "paper", venue: "BINANCE", instrument: "BTCUSDT", interval: "1m",
      fromMs: 1_000, toMs: 3_000, pointLimit: 2,
    })).toThrow(/EDS11R4_SOURCE_CONTRACT_REJECTED/);
  });

  it("keeps the deployment feature separately gated and permits the published 8 MiB candle maximum", () => {
    expect(() => loadConfig({ ...base, FEATURE_EXECUTION_MARKET_CONTEXT: "true" })).toThrow(/FEATURE_EXECUTION_EDGE/);
    const config = loadConfig({
      ...base,
      FEATURE_EXECUTION_EDGE: "true",
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
      FEATURE_EXECUTION_MARKET_CONTEXT: "true",
      EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/execution-edge/delegation.pem",
      EXECUTION_EDGE_CA_FILE: "/run/secrets/execution-edge/ca.crt",
      EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/execution-edge/client.crt",
      EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/execution-edge/client.key",
      EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
      EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
      EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES: "8388608",
    });
    expect(config.FEATURE_EXECUTION_MARKET_CONTEXT).toBe("true");
    expect(config.EXECUTION_EDGE_CURRENT_SOURCE_MAX_RESPONSE_BYTES).toBe(8_388_608);
  });
});

function acceptedPublication(): MarketContextPublicationIntake {
  const digest = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  return {
    schemaVersion: "portal.execution.eds11r.market-context-intake.v1",
    status: "ACCEPTED_OWNER_RETURN",
    requestManifestSha256: MARKET_CONTEXT_REQUEST_MANIFEST_SHA256,
    ownerReturnManifestSha256: digest,
    sourceCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    sourceImageDigest: digest,
    capabilities: {
      managerMarketContextLatestV1: {
        operationId: "managerMarketContextLatestV1", profiles: ["PAPER", "LIVE"],
        responseSchemaSha256: digest, fixtureIndexSha256: digest, acceptanceSha256: digest,
      },
      managerMarketContextCandlesV1: {
        operationId: "managerMarketContextCandlesV1", profiles: ["PAPER"],
        responseSchemaSha256: digest, fixtureIndexSha256: digest, acceptanceSha256: digest,
      },
    },
  };
}

function latestEnvelope() {
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    authority: "PORTAL_CONTROL_API",
    requested_environment: "paper",
    source_environment: "paper",
    profile_id: "PAPER_BINANCE_USDM",
    source: {
      schema_version: "trading-system.portal-execution.market-context-envelope.v1",
      contract_revision: "trading-system.portal-execution.market-context.v1",
      authority: "EXECUTION_CELL",
      profile_id: "PAPER_BINANCE_USDM",
      availability: "AVAILABLE",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of_ms: 1_788_566_400_500,
      data: {
        operation_id: "managerMarketContextLatestV1",
        items: [{
          venue: "BINANCE", instrument: "BTCUSDT", value: "105123.000000000000000001",
          observation_kind: "MARK", observed_at_ms: 1_788_566_400_000,
          quote_currency: "USDT", provider: "data-layer-v2",
        }],
      },
    },
  };
}

function candlesEnvelope() {
  return {
    schema_version: "portal.execution.current-source-bff.v2",
    authority: "PORTAL_CONTROL_API",
    requested_environment: "paper",
    source_environment: "paper",
    profile_id: "PAPER_BINANCE_USDM",
    source: {
      schema_version: "trading-system.portal-execution.market-context-envelope.v1",
      contract_revision: "trading-system.portal-execution.market-context.v1",
      authority: "EXECUTION_CELL",
      profile_id: "PAPER_BINANCE_USDM",
      availability: "AVAILABLE",
      freshness: "FRESH",
      completeness: "COMPLETE",
      as_of_ms: 3_000,
      data: {
        operation_id: "managerMarketContextCandlesV1",
        venue: "BINANCE", instrument: "BTCUSDT", interval: "1m", coverage: "COMPLETE", sampling: "NONE",
        items: [{ open_ms: 1_000, close_ms: 1_999, open: "100", high: "110", low: "90", close: "105", volume: "12.500" }],
      },
    },
  };
}
