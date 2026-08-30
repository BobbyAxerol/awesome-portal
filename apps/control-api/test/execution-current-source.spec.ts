import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";
import {
  currentSourceResource,
  ExecutionDelegationService,
  MANAGER_V2_READ_RESOURCE,
} from "../src/execution/delegation";
import {
  assertN15bCurrentQueryAccepted,
  CurrentSourceBulkhead,
  CurrentSourceProxyError,
  CurrentSourceRateLimiter,
  N15B_CURRENT_QUERY_ACCEPTANCE,
  N17B_CURRENT_EXACT_QUERY_ACCEPTANCE,
  N22_PAPER_READ_ACCEPTANCE,
  assertN22PaperReadAccepted,
  currentManagerV2Path,
  paperManagerV2Path,
  currentSourcePath,
  currentSourceUpstreamError,
} from "../src/execution/current-source.proxy";

const base = {
  DATABASE_URL: "postgres://portal:portal@localhost/portal",
  PORTAL_ENV: "local",
  AUTH_MODE: "dev",
};

const edgeIdentity = {
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/execution-edge/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/execution-edge/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/execution-edge/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/execution-edge/client.key",
};

describe("N13B current-source BFF boundary", () => {
  it("keeps every profile dark by default and independently configurable", () => {
    const dark = loadConfig(base);
    expect(dark.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER).toBe("false");
    expect(dark.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX).toBe("false");
    expect(dark.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE).toBe("false");

    const paper = loadConfig({
      ...base,
      ...edgeIdentity,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
      EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
      EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
    });
    expect(paper.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER).toBe("true");
    expect(paper.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX).toBe("false");
    expect(paper.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE).toBe("false");
    expect(paper.EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND).toBe(15);
    expect(paper.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS).toBe(1_000);
    expect(() => loadConfig({
      ...base,
      EXECUTION_EDGE_CURRENT_SOURCE_MAX_REQUESTS_PER_SECOND: "16",
    })).toThrow();
  });

  it("fails closed on missing, non-TLS or drifted profile pins", () => {
    expect(() => loadConfig({
      ...base,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
    })).toThrow(/FEATURE_EXECUTION_EDGE/);
    expect(() => loadConfig({
      ...base,
      ...edgeIdentity,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
    })).toThrow(/EXECUTION_EDGE_PAPER_ORIGIN/);
    expect(() => loadConfig({
      ...base,
      ...edgeIdentity,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
      EXECUTION_EDGE_PAPER_ORIGIN: "http://paper-edge.internal",
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_OTHER",
      EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
    })).toThrow(/HTTPS/);
    expect(() => loadConfig({
      ...base,
      ...edgeIdentity,
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
      EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
      EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_OTHER",
      EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
    })).toThrow(/N13B pins/);
  });

  it("mints only exact screen/profile resources", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
    const delegation = await ExecutionDelegationService.create({
      issuer: "portal-control-api",
      audience: "portal-execution-edge-sandbox",
      keyId: "execution-k1",
      privateKeyPem: await exportPKCS8(privateKey),
      ttlSeconds: 45,
      environment: "sandbox",
      profileId: "SANDBOX_BINANCE_USDM",
    });
    const resource = currentSourceResource("EXECUTION_SANDBOX_CERTIFICATION_SCREEN");
    const token = await delegation.issueReadAssertion({
      principalId: "usr_bobby",
      sessionId: "ses_1",
      workspaceId: "ws_1",
      roles: ["ADMIN"],
      resources: [resource],
      authenticationTime: new Date("2026-08-29T00:00:00Z"),
      authenticationMethods: ["portal_session"],
    });
    const { payload } = await jwtVerify(token, await exportJWK(publicKey), {
      issuer: "portal-control-api",
      audience: "portal-execution-edge-sandbox",
      algorithms: ["RS256"],
    });
    expect(payload.resources).toEqual([resource]);
    expect(payload.profile_id).toBe("SANDBOX_BINANCE_USDM");
    expect(() => currentSourceResource("OTHER_SCREEN")).toThrow(/outside the N13B contract/);
  });

  it("builds only bounded screen/source/relation paths and profile-bound cursors", () => {
    expect(currentSourcePath("paper", "EXECUTION_FULL_BLOTTER_SCREEN")).toBe(
      "/internal/v1/current-source/screens/EXECUTION_FULL_BLOTTER_SCREEN",
    );
    expect(currentSourcePath(
      "live",
      "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN",
      "manager.orders",
      "orders",
      { limit: 50, cursor: "opaque+/=" },
    )).toBe(
      "/internal/v1/current-source/screens/EXECUTION_LIVE_FULL_OPERATIONS_SCREEN" +
      "/sources/manager.orders/relations/orders?limit=50&cursor=opaque%2B%2F%3D",
    );
    expect(() => currentSourcePath("canary", "LIVE_OPERATIONS_SCREEN"))
      .toThrowError(CurrentSourceProxyError);
    expect(() => currentSourcePath(
      "paper",
      "PAPER_TRADING_SCREEN",
      "manager.orders",
      "../orders",
    )).toThrowError(CurrentSourceProxyError);
    expect(() => currentSourcePath(
      "paper",
      "PAPER_TRADING_SCREEN",
      "manager.orders",
      "orders",
      { limit: 201 },
    )).toThrowError(CurrentSourceProxyError);
  });

  it("preserves typed availability without leaking arbitrary upstream detail", () => {
    const typed = currentSourceUpstreamError(Buffer.from(JSON.stringify({
      error: {
        code: "CURRENT_SOURCE_UNAVAILABLE",
        message: "do not forward this upstream detail",
        classification: "CONNECTED",
        availability: "UNAVAILABLE",
        reason_code: "MANAGER_TEMPORARILY_UNAVAILABLE",
      },
    })), true, 503);
    expect(typed).toMatchObject({
      code: "CURRENT_SOURCE_UNAVAILABLE",
      status: 503,
      details: {
        classification: "CONNECTED",
        availability: "UNAVAILABLE",
        reason_code: "MANAGER_TEMPORARILY_UNAVAILABLE",
      },
    });
    expect(typed.message).toBe("CURRENT_SOURCE_UNAVAILABLE");

    const rejected = currentSourceUpstreamError(Buffer.from(JSON.stringify({
      error: { code: "SOURCE_SECRET_DETAIL", message: "secret" },
    })), true, 403);
    expect(rejected).toMatchObject({
      code: "N13B_DELEGATED_IDENTITY_REJECTED",
      status: 502,
    });
  });

  it("bounds shared profile concurrency and queue residence", async () => {
    const bulkhead = new CurrentSourceBulkhead(1, 1, 1_000);
    const releaseFirst = await bulkhead.acquire();
    const second = bulkhead.acquire();
    await expect(bulkhead.acquire()).rejects.toMatchObject({
      code: "N13B_QUEUE_FULL",
      status: 503,
    });
    releaseFirst();
    (await second)();

    const expiring = new CurrentSourceBulkhead(1, 1, 10);
    const release = await expiring.acquire();
    await expect(expiring.acquire()).rejects.toMatchObject({ code: "N13B_QUEUE_TIMEOUT" });
    release();
  });

  it("paces the shared current source below the published 20 r/s boundary", async () => {
    let currentTime = 0;
    const waits: number[] = [];
    const limiter = new CurrentSourceRateLimiter(
      15,
      1_000,
      () => currentTime,
      async (milliseconds) => {
        waits.push(milliseconds);
        currentTime += milliseconds;
      },
    );
    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();
    expect(waits).toEqual([67, 67]);

    const saturated = new CurrentSourceRateLimiter(
      15,
      100,
      () => 0,
      async () => undefined,
    );
    await saturated.acquire();
    await saturated.acquire();
    await expect(saturated.acquire()).rejects.toMatchObject({
      code: "N17B_RATE_LIMIT_QUEUE_TIMEOUT",
      status: 503,
      details: expect.objectContaining({ retryable: false }),
    });
  });
});

describe("N15B current-capability Query acceptance", () => {
  it("accepts only the immutable Paper release screen", () => {
    expect(() => assertN15bCurrentQueryAccepted("paper", "PAPER_TRADING_SCREEN")).not.toThrow();
    expect(N15B_CURRENT_QUERY_ACCEPTANCE).toMatchObject({
      environment: "paper",
      profileId: "PAPER_BINANCE_USDM",
      screenId: "PAPER_TRADING_SCREEN",
      capabilityIds: [
        "deployments.positions",
        "deployments.execution-quality",
        "sessions.current",
      ],
    });
  });

  it("fails closed before transport for every unaccepted profile or screen", () => {
    for (const [environment, screenId] of [
      ["paper", "EXECUTION_FULL_BLOTTER_SCREEN"],
      ["sandbox", "EXECUTION_SANDBOX_CERTIFICATION_SCREEN"],
      ["canary", "EXECUTION_CANARY_CONTROL_ROOM_SCREEN"],
      ["live", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"],
    ] as const) {
      expect(() => assertN15bCurrentQueryAccepted(environment, screenId)).toThrowError(
        expect.objectContaining({
          code: "N15B_QUERY_CAPABILITY_NOT_ACCEPTED",
          status: 404,
          details: expect.objectContaining({
            classification: "SUPPORTED_BUT_NOT_ACTIVATED",
            availability: "UNAVAILABLE",
          }),
        }),
      );
    }
  });
});

describe("N17B exact current-set production acceptance", () => {
  it("maps the accepted Paper BFF routes onto current Manager-v2 without route widening", () => {
    expect(N17B_CURRENT_EXACT_QUERY_ACCEPTANCE).toMatchObject({
      decision: "N17B_EXACT_CURRENT_SET_ACCEPTED",
      lineageDecision: "N15B_CURRENT_SOURCE_ACCEPTED",
      environment: "paper",
      profileId: "PAPER_BINANCE_USDM",
      delegatedResource: MANAGER_V2_READ_RESOURCE,
      sourceMaximumRequestsPerSecond: 20,
    });
    expect(currentManagerV2Path("PAPER_TRADING_SCREEN")).toBe(
      "/internal/v2/manager/capabilities",
    );
    expect(currentManagerV2Path(
      "PAPER_TRADING_SCREEN",
      "manager.positions",
      "positions_v2",
      { limit: 50, cursor: "opaque+/=" },
    )).toBe(
      "/internal/v2/manager/relations/public/positions_v2?limit=50&cursor=opaque%2B%2F%3D",
    );
    expect(() => currentManagerV2Path(
      "PAPER_TRADING_SCREEN",
      "manager.positions",
      "orders",
    )).toThrowError(expect.objectContaining({ code: "N17B_BINDING_NOT_ACCEPTED" }));
    expect(() => currentManagerV2Path("EXECUTION_FULL_BLOTTER_SCREEN"))
      .toThrowError(expect.objectContaining({ code: "N17B_QUERY_CAPABILITY_NOT_ACCEPTED" }));
  });

  it("maps current Manager-v2 failures to bounded Portal errors without blind retry", () => {
    const limited = currentSourceUpstreamError(Buffer.from(JSON.stringify({
      error: { code: "MANAGER_V2_RATE_LIMITED", message: "upstream detail" },
    })), true, 429);
    expect(limited).toMatchObject({
      code: "N17B_SOURCE_RATE_LIMITED",
      status: 503,
      details: {
        availability: "DEGRADED",
        reason_code: "MANAGER_V2_RATE_LIMITED",
        retryable: false,
      },
    });
    expect(limited.message).toBe("N17B_SOURCE_RATE_LIMITED");

    const unavailable = currentSourceUpstreamError(Buffer.from(JSON.stringify({
      error: { code: "MANAGER_V2_RELATION_NOT_CATALOGUED", relation: "secret" },
    })), true, 404);
    expect(unavailable).toMatchObject({
      code: "N17B_SOURCE_RELATION_UNAVAILABLE",
      status: 404,
      details: expect.objectContaining({
        reason_code: "MANAGER_V2_RELATION_NOT_CATALOGUED",
        retryable: false,
      }),
    });
  });
});

describe("N22 full Paper read acceptance", () => {
  it("widens only the four canonical Paper BFF screens", () => {
    expect(N22_PAPER_READ_ACCEPTANCE).toMatchObject({
      decision: "N22_FULL_PAPER_READ_ACCEPTED",
      lineageDecision: "N17B_EXACT_CURRENT_SET_ACCEPTED",
      environment: "paper",
      profileId: "PAPER_BINANCE_USDM",
      screenIds: [
        "EXECUTION_FULL_BLOTTER_SCREEN",
        "EXECUTION_PAPER_WORKBENCH_SCREEN",
        "EXECUTION_PAPER_WORKBENCH_VNM_SCREEN",
        "PAPER_TRADING_SCREEN",
      ],
    });
    for (const screenId of N22_PAPER_READ_ACCEPTANCE.screenIds) {
      expect(() => assertN22PaperReadAccepted("paper", screenId)).not.toThrow();
    }
    expect(() => assertN22PaperReadAccepted("sandbox", "PAPER_TRADING_SCREEN"))
      .toThrowError(expect.objectContaining({ code: "N22_PAPER_READ_NOT_ACCEPTED" }));
    expect(() => assertN22PaperReadAccepted("paper", "EXECUTION_LIVE_FULL_OPERATIONS_SCREEN"))
      .toThrowError(expect.objectContaining({ code: "N22_PAPER_READ_NOT_ACCEPTED" }));
  });

  it("uses server-owned source bindings and bounded Manager pages", () => {
    expect(paperManagerV2Path(
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "manager.orders",
      "orders",
      { limit: 200, cursor: "opaque+/=" },
    )).toBe("/internal/v2/manager/relations/public/orders?limit=200&cursor=opaque%2B%2F%3D");
    expect(paperManagerV2Path(
      "EXECUTION_FULL_BLOTTER_SCREEN",
      "manager.conditional-orders",
      "conditional_order_group_legs",
      { limit: 100 },
    )).toBe("/internal/v2/manager/relations/public/conditional_order_group_legs?limit=100");
    expect(() => paperManagerV2Path(
      "EXECUTION_PAPER_WORKBENCH_SCREEN",
      "manager.orders",
      "command_journal",
    )).toThrowError(expect.objectContaining({ code: "N22_PAPER_BINDING_NOT_ACCEPTED" }));
    expect(() => paperManagerV2Path(
      "EXECUTION_FULL_BLOTTER_SCREEN",
      "manager.orders",
      "orders",
      { limit: 201 },
    )).toThrowError(expect.objectContaining({ code: "N22_PAPER_PAGE_INVALID" }));
  });
});
