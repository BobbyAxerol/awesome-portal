/**
 * Connected conformance (F5): ask a REAL Portal Edge the read-only routes the fixture BFF imitates, and judge each body against the
 * same published schema the fixture is judged against, then through the real reader (what the screen would draw).
 *
 * Off by default: nothing runs unless `EDGE_BASE_URL` is set. It never writes: GET only, no body, at most `EDGE_MAX_REQUESTS`
 * requests (default 150) spaced by `EDGE_DELAY_MS` (default 250), each request cut off after `EDGE_TIMEOUT_MS` (default 15000), the host
 * must be named by the operator, and the report keeps no header, cookie or token. The limits must be finite and non-negative or the run
 * refuses to start. The report carries a `verdict` (PASS, FAIL, NOTHING_SENT); a run is report-only unless `EDGE_REQUIRE_PASS=1`, which
 * fails the suite on anything but PASS, because report-only success is not a source-conformance verdict. It is an acceptance probe for a commissioned read, not a load test and not permission to enable commands.
 *
 *   EDGE_BASE_URL=https://edge.example EDGE_I_UNDERSTAND_READ_ONLY=1 EDGE_CONFIG=./edge.config.json \
 *   EDGE_REPORT=./edge-report.json npx vitest run src/edgeConformance
 *
 * edge.config.json: { "headers": {"cookie": "..."}, "workspaceId": "ws_real", "environment": "paper",
 *                     "ids": { "alpha_btc_trend": "<real alpha id>", "pf_TEST_ONLY_core": "<real portfolio id>" } }
 * `ids` rewrites a fixture id to the real one anywhere in the URL; a route that still carries a fixture-only id (`TEST_ONLY`, `ws_TEST`)
 * is reported SKIPPED_NO_REAL_ID, never sent. Self-test against the fixture BFF: `EDGE_ALLOW_FIXTURE_IDS=1` and its loopback URL.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readCommandCenter } from "../execution/commandCenter";
import { readAlphaFleet, readPortfolioList } from "../execution/api/profileRead";
import { readManagerSeries } from "../execution/v2/readers/managerSeries";
import { coverageOf } from "../execution/v2/fieldcoverage/fieldCoverage";
import { ROUTES, SCHEMAS } from "../fixtureBff/routeTable";
import { violationsOf } from "../fixtureBff/schemaCheck";
import { classify, parseLimits, verdictOf, type ProbeResult } from "./edgeProbe";

const BASE = process.env.EDGE_BASE_URL ?? "";
const ENABLED = BASE !== "";

interface Config { headers?: Record<string, string>; workspaceId?: string; environment?: string; ids?: Record<string, string> }
const config: Config = ENABLED && process.env.EDGE_CONFIG ? JSON.parse(readFileSync(process.env.EDGE_CONFIG, "utf8")) : {};

const READERS: Record<string, { schema: string; read: (raw: unknown) => unknown }> = {
  "/api/v1/execution/portfolios": { schema: "execution-portfolio-list.v1.schema.json", read: readPortfolioList },
  "/api/v1/execution/alphas": { schema: "execution-alpha-fleet-list.v2.schema.json", read: readAlphaFleet },
  "/api/v1/execution/command-center": { schema: "execution-command-center-snapshot.v1.schema.json", read: readCommandCenter },
  "/api/v1/execution/manager/series": { schema: "execution-manager-series.v1.schema.json", read: readManagerSeries },
};

// A fixture id sent to a real Edge asks a question it cannot answer. `EDGE_ALLOW_FIXTURE_IDS=1` is for a self-test against the fixture BFF itself.
const FIXTURE_ONLY = process.env.EDGE_ALLOW_FIXTURE_IDS === "1" ? /^$/ : /TEST_ONLY|ws_TEST|FIXTURE/;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!ENABLED)("connected conformance against a real Portal Edge (read-only)", () => {
  it("judges each commissioned read against its published schema and its reader", async () => {
    expect(process.env.EDGE_I_UNDERSTAND_READ_ONLY, "set EDGE_I_UNDERSTAND_READ_ONLY=1: this sends GET requests to a real service").toBe("1");
    const { maxRequests: max, delayMs: delay, timeoutMs } = parseLimits(process.env);
    const rows: Record<string, unknown>[] = [];
    const results: ProbeResult[] = [];
    let sent = 0;
    const seen = new Set<string>();
    for (const route of ROUTES) {
      if (route.method !== "GET" || !(`GET ${route.pattern}` in SCHEMAS)) continue;
      let url = route.url;
      for (const [fixtureId, realId] of Object.entries(config.ids ?? {})) url = url.split(fixtureId).join(realId);
      if (config.workspaceId) url = url.replace(/workspace_id=[^&]*/, `workspace_id=${encodeURIComponent(config.workspaceId)}`);
      if (config.environment) url = url.replace(/environment=[a-z]+/, `environment=${config.environment}`);
      // A fixture variant ("[found]", "[empty]") often asks the same URL: one request per distinct URL.
      if (seen.has(url)) continue;
      seen.add(url);
      if (FIXTURE_ONLY.test(url)) { rows.push({ pattern: route.pattern, result: "SKIPPED_NO_REAL_ID" }); results.push("SKIPPED_NO_REAL_ID"); continue; }
      if (sent >= max) { rows.push({ pattern: route.pattern, result: "SKIPPED_REQUEST_CAP" }); results.push("SKIPPED_REQUEST_CAP"); continue; }
      sent += 1;
      const started = Date.now();
      let status = 0;
      let body: unknown = null;
      let nonJson = false;
      try {
        const response = await fetch(new URL(url, BASE), {
          method: "GET", headers: { accept: "application/json", ...config.headers }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs),
        });
        status = response.status;
        if (status === 200) {
          try {
            body = response.headers.get("content-type")?.includes("json") ? await response.json() : null;
          } catch {
            body = null;
          }
          nonJson = body === null;
        }
      } catch (error) {
        const timedOut = (error as Error).name === "TimeoutError" || (error as Error).name === "AbortError";
        const result: ProbeResult = timedOut ? "TIMEOUT" : "NETWORK_ERROR";
        results.push(result);
        rows.push({ pattern: route.pattern, result, message: String((error as Error).message).slice(0, 120) });
        await sleep(delay);
        continue;
      }
      const verdict = SCHEMAS[`GET ${route.pattern}`]!;
      const judgeable = status === 200 && body !== null;
      const schema = judgeable ? violationsOf(verdict.ref, body) : null;
      const probe = READERS[route.pattern];
      const reader = judgeable && probe ? coverageOf(probe.schema, body, probe.read) : null;
      const result = classify({ status, body, nonJson }, () => ({
        schemaViolations: schema?.violations.length ?? 0,
        readerAccepted: reader === null ? null : reader.result !== null,
      }));
      results.push(result);
      rows.push({
        pattern: route.pattern,
        status,
        ms: Date.now() - started,
        result,
        violations: schema?.violations.slice(0, 8) ?? [],
        readerAccepted: reader === null ? null : reader.result !== null,
        unreadFields: reader?.unread.length ?? null,
        unknownReads: reader?.unknown ?? null,
      });
      await sleep(delay);
    }
    const verdict = verdictOf(results);
    const report = { at: new Date().toISOString(), base: new URL(BASE).origin, sent, ...verdict, rows };
    writeFileSync(process.env.EDGE_REPORT ?? "edge-conformance-report.json", `${JSON.stringify(report, null, 2)}\n`);
    // Report-only by default: a body that violates its schema is the finding, not a failed suite. It is NOT a pass either: the report's
    // `verdict` says so, and EDGE_REQUIRE_PASS=1 turns anything but PASS into a failure for the run that is meant to qualify a source.
    expect(rows.length).toBeGreaterThan(0);
    if (process.env.EDGE_REQUIRE_PASS === "1") expect(verdict.verdict, JSON.stringify(verdict.counts)).toBe("PASS");
  }, 300_000);
});
