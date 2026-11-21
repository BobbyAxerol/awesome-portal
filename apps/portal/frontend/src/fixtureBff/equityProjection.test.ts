/**
 * R-C · the equity projection fixture route, over EVERY deployment of the world (booked, retired, history records, generated at medium
 * scale), against the strict reader and the world's own figures. Lane: FIXTURE_LAB. The real route is source-dark/unmounted; this proves
 * the fixture body and the reader agree, not that a producer exists.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.setConfig({ testTimeout: 180_000 });

import { answerEquityProjection, drawdownText, EQUITY_PROJECTION_PATTERN, MAX_BUCKETS } from "../../../fixture-bff/equity-projection";
import { resetFixtureGlobals } from "../../../fixture-bff/app";
import { answerExecutionBff } from "../../e2e/bffDouble";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { WORLD_NOW_MS, fromCents, toCents, worldAlphas } from "../../e2e/bffWorld";
import { bookSpan, equityOf } from "../../e2e/bffWorldBooks";
import { historyDeploymentId, isRetired, resolveStageDeployment, standingOf } from "../../e2e/bffWorldStage";
import { readEquityProjectionV1, type EquityProjection } from "../execution/v2/readers/equityProjection";
import { validateAgainst } from "../execution/v2/testkit/schema";

const SCHEMA = "execution-analytics-series.v1";
const PTR = "/$defs/EquityProjectionResponse";

function call(id: string, search = "") {
  return answerEquityProjection({ method: "GET", path: `/api/v1/execution/deployments/${id}/equity-projection`, search, headers: {}, body: null });
}
function read(id: string, window = "30d"): { body: unknown; projection: EquityProjection } {
  const response = call(id, `window=${window}`)!;
  expect(response.status, id).toBe(200);
  const result = readEquityProjectionV1(response.body, { deploymentId: id, window: window as never });
  expect(result.kind, `${id} ${JSON.stringify(result)}`).toBe("equity_projection");
  return { body: response.body, projection: (result as { projection: EquityProjection }).projection };
}

let ids: string[] = [];
let retired: string[] = [];
let generated: string[] = [];
beforeAll(() => {
  resetFixtureGlobals();
  setFixtureNow("2026-10-17T12:04:00Z");
  setFixtureScale("medium");
  const all = new Set<string>();
  for (const alpha of worldAlphas()) {
    for (const d of alpha.deployments) all.add(d.id);
    for (const stage of ["paper", "sandbox", "canary", "live"] as const) {
      const hist = historyDeploymentId(alpha.id, stage);
      if (resolveStageDeployment(hist) !== null) all.add(hist);
    }
  }
  ids = [...all];
  retired = ids.filter((id) => isRetired(id));
  const native = new Set(["alpha_a", "alpha_b", "alpha_c", "alpha_d", "alpha_btc_trend"]);
  const generatedIds = new Set(worldAlphas().filter((a) => !native.has(a.id)).flatMap((a) => a.deployments.map((d) => d.id)));
  generated = ids.filter((id) => generatedIds.has(id));
});
afterAll(() => {
  setFixtureScale("small");
  resetFixtureGlobals();
});

describe("coverage of the world", () => {
  it("the world has booked, retired, history and generated deployments to test", () => {
    expect(ids.length).toBeGreaterThan(40);
    expect(retired.length).toBeGreaterThan(0);
    expect(ids.some((id) => /_hist$/.test(id))).toBe(true);
    expect(generated.length).toBeGreaterThan(0);
  });
});

describe("every deployment, every window", () => {
  it("is schema-valid, read by the strict reader, and is the asked deployment", () => {
    for (const id of ids) {
      for (const window of ["1d", "7d", "30d", "90d", "1y"]) {
        const { body, projection } = read(id, window);
        // the checker walks every point: all windows of one id, the cheap and the 1y window of every id
        if (window === "1d" || window === "7d" || id === ids[0] || id === ids[ids.length - 1]) expect(validateAgainst(SCHEMA, PTR, body), `${id} ${window}`).toEqual([]);
        expect(projection.deploymentId).toBe(id);
        expect(projection.runtimeActive).toBe(false);
        expect(projection.points.length).toBeLessThanOrEqual(MAX_BUCKETS);
        expect(projection.expectedBuckets).toBe(projection.points.length);
        expect(projection.completeness).toBe("COMPLETE");
        expect(projection.gaps).toEqual([]);
        expect(projection.isEmpty).toBe(false);
      }
    }
  }, 180_000);

  it("currency, equity, and the last bucket are the world's: equity ends at the deployment's equity, on its exit for a retired one", () => {
    for (const id of ids) {
      const spec = resolveStageDeployment(id)!.deployment;
      const { projection } = read(id, "30d");
      expect(projection.currency, id).toBe(spec.currency);
      const last = projection.points[projection.points.length - 1]!;
      expect(last.equity, id).toBe(fromCents(equityOf({ id, allocation: spec.allocation, realized: spec.realized, unrealized: spec.unrealized })));
      const span = bookSpan([id])!;
      expect(last.atMs, id).toBe(span.end);
      expect(projection.toMs, id).toBe(span.end);
      expect(span.end, id).toBeLessThanOrEqual(WORLD_NOW_MS);
    }
  });

  it("retired deployments end at their exit and never run to the world clock", () => {
    for (const id of retired) {
      const standing = standingOf(id)!;
      const { projection } = read(id, "1y");
      expect(standing.exitMs, id).not.toBeNull();
      expect(projection.toMs, id).toBe(Math.min(standing.exitMs!, WORLD_NOW_MS));
      expect(projection.toMs, id).toBeLessThan(WORLD_NOW_MS);
      // and it opens no earlier than its first stage day
      expect(projection.fromMs, id).toBeGreaterThanOrEqual(standing.fromMs);
    }
  });

  it("a long window opens at the deployment's allocation on its first stage day", () => {
    for (const id of ids) {
      const spec = resolveStageDeployment(id)!.deployment;
      const span = bookSpan([id])!;
      const { projection } = read(id, "1y");
      if (projection.fromMs === span.first) expect(projection.points[0]!.equity, id).toBe(fromCents(toCents(spec.allocation)));
      expect(projection.fromMs, id).toBeGreaterThanOrEqual(span.first);
    }
  });

  it("drawdown = value / running max - 1 over the projection's own buckets (a fraction, 0 at a high, never above 0)", () => {
    for (const id of ids.slice(0, 120)) {
      const { projection } = read(id, "30d");
      let peak = toCents(projection.points[0]!.equity!);
      for (const p of projection.points) {
        const v = toCents(p.equity!);
        if (v > peak) peak = v;
        expect(p.drawdown, `${id} ${p.bucketStart}`).toBe(drawdownText(v, peak));
        if (peak > 0n) expect(Math.abs(Number(p.drawdown) - (Number(v) / Number(peak) - 1)), `${id}`).toBeLessThan(1.1e-6);
        expect(Number(p.drawdown)).toBeLessThanOrEqual(0);
      }
    }
  }, 180_000);

  it("the band is a labelled illustrative fixture band joined to the series' own run and digest", () => {
    for (const id of ids.slice(0, 30)) {
      const { projection } = read(id, "30d");
      expect(projection.warnings.map((w) => w.code)).toContain("FIXTURE_ILLUSTRATIVE_BAND");
      expect(projection.band!.runId).toBe(projection.joinedRunId);
      expect(projection.band!.artifactDigest).toBe(projection.artifactDigest);
      expect(projection.joinedRunId).toContain("fixture");
      expect(projection.band!.points).toHaveLength(projection.points.length);
    }
  });

  it("the server picks the finest canonical interval at or below 5,000 buckets (a client cannot force one)", () => {
    const id = "dep_live_01";
    const year = read(id, "1y").projection;
    const day = read(id, "1d").projection;
    expect(year.expectedBuckets).toBeLessThanOrEqual(5000);
    expect(day.intervalSeconds).toBeLessThanOrEqual(year.intervalSeconds);
    expect(call(id, "window=30d&interval=1m")!.status).toBe(400);
  });

  it("is deterministic", () => {
    expect(call("dep_live_01", "window=30d")!.body).toEqual(call("dep_live_01", "window=30d")!.body);
  });
});

describe("the workspace boundary (workspace_id)", () => {
  it("the home and the scoped V2 workspaces serve the same deployment with the same body; no workspace is the session's own", () => {
    const none = call("dep_live_01", "window=30d")!;
    for (const ws of ["ws_TEST_ONLY", "ws_TEST_SCOPED_V2"]) {
      const r = call("dep_live_01", `window=30d&workspace_id=${ws}`)!;
      expect(r.status, ws).toBe(200);
      expect(r.body, ws).toEqual(none.body);
    }
  });
  it("a denied workspace is 403 ACCESS_DENIED, like the other fixture reads", () => {
    const r = call("dep_live_01", "workspace_id=ws_TEST_DENIED")!;
    expect(r.status).toBe(403);
    expect((r.body as { error: { code: string } }).error.code).toBe("ACCESS_DENIED");
  });
  it("another workspace than the deployment's is refused (404, no existence oracle) and so is an unknown one; a malformed id is 400", () => {
    for (const ws of ["ws_OTHER", "ws_TEST_NOTE_OFF", "unknown"]) {
      const r = call("dep_live_01", `workspace_id=${ws}`)!;
      expect(r.status, ws).toBe(404);
      expect((r.body as { error: { code: string } }).error.code).toBe("EXECUTION_DEPLOYMENT_NOT_FOUND");
    }
    expect(call("dep_live_01", "workspace_id=a%20b")!.status).toBe(400);
  });
  it("the denial comes before the deployment is looked up: a denied workspace learns nothing about an id", () => {
    expect(call("dep_does_not_exist", "workspace_id=ws_TEST_DENIED")!.status).toBe(403);
  });
});

describe("the e2e double (browser cells)", () => {
  it("answers the real API's typed 404 for the source-dark route, never the 501 gap that fails a visual cell", () => {
    for (const options of [{}, { screensV2: true }, { screensV2: true, reviewManager: true }]) {
      const answer = answerExecutionBff("GET", "/api/v1/execution/deployments/dep_live_01/equity-projection", new URLSearchParams("window=30d"), options);
      expect(answer.status).toBe(404);
      expect((answer.body as { error: { code: string } }).error.code).toBe("EXECUTION_DEPLOYMENT_NOT_FOUND");
    }
  });
});

describe("refusals", () => {
  it("unknown deployment 404, bad window or intent or key 400, other methods and paths are not mine", () => {
    expect(call("dep_does_not_exist")!.status).toBe(404);
    expect(call("dep_live_01", "window=2d")!.status).toBe(400);
    expect(call("dep_live_01", "intent=full")!.status).toBe(400);
    expect(call("dep_live_01", "window=30d&intent=inspect")!.status).toBe(200);
    expect(answerEquityProjection({ method: "POST", path: "/api/v1/execution/deployments/dep_live_01/equity-projection", search: "", headers: {}, body: null })).toBeNull();
    expect(answerEquityProjection({ method: "GET", path: "/api/v1/execution/deployments/dep_live_01/live", search: "", headers: {}, body: null })).toBeNull();
    expect(EQUITY_PROJECTION_PATTERN.test("/api/v1/execution/deployments/x/equity-projection")).toBe(true);
  });

  it("the body for one deployment is refused when read as another", () => {
    const { body } = read("dep_live_01");
    expect(readEquityProjectionV1(body, { deploymentId: "dep_b1" })).toMatchObject({ kind: "refused", reason: "identity_mismatch" });
  });
});
