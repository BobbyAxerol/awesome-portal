/**
 * `GET /api/v1/execution/deployments/{deploymentId}/equity-projection` on the fixture lane (R-C, WP-R-C, FIXTURE_LAB). NOT acceptance evidence.
 *
 * The real route is source-dark and unmounted (`EquityProjectionResponse.runtime_active` is the constant `false`); real screens keep their
 * typed absence. This file only lets the fixture lane exercise the port and the strict reader (`v2/readers/equityProjection.ts`) with a body
 * that is the WORLD's:
 *
 * - the equity is the book's one level path (`bffWorldBooks`/`bffWorld` `bookLevels`): it opens at the deployment's allocation on its first
 *   stage day and ends at `equityOf(deployment)` (allocation + realized + unrealized; a retired deployment has no open PnL), the figure every
 *   other chart of that deployment ends on. Nothing is read from an account's equity;
 * - a retired deployment (a stage its alpha left, booked or history record) ends at its exit, not at the world clock, and the window is
 *   clamped to the deployment's life: no bucket is drawn, or zero-filled, before it began or after it ended;
 * - drawdown = value / running max - 1 over the projection's own buckets (a fraction, 6 decimals, `0` at a high);
 * - currency is the deployment's, deployment id is the asked id, the bucket interval is the finest canonical one at or below 5,000 buckets
 *   (clients cannot force one), buckets are aligned backwards from the last instant so the last bucket IS the end of the book;
 * - the approved band is an ILLUSTRATIVE FIXTURE band (equity -3% / +3%), joined to a fixture run id and digest, and the response carries the
 *   warning `FIXTURE_ILLUSTRATIVE_BAND` saying so. It is not an approved, immutable Research artifact.
 *
 * Deterministic: the same deployment and window give the same body. 404 for an id the world does not know, 400 for an unknown query key or value.
 */
import { createHash } from "node:crypto";

import type { BffRequest, BffResponse } from "../frontend/e2e/bffAnswerer";
import { LEVEL_NODES, bookLevels, fromCents, toCents } from "../frontend/e2e/bffWorld";
import { bookSpan, equityOf } from "../frontend/e2e/bffWorldBooks";
import { resolveStageDeployment } from "../frontend/e2e/bffWorldStage";

export const EQUITY_PROJECTION_PATTERN = /^\/api\/v1\/execution\/deployments\/([A-Za-z0-9._:-]{1,128})\/equity-projection$/;
export const MAX_BUCKETS = 5000;
export const WINDOW_DAYS = { "1d": 1, "7d": 7, "30d": 30, "90d": 90, "1y": 365 } as const;
export type ProjectionWindow = keyof typeof WINDOW_DAYS;
export const INTERVALS = [["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["4h", 14400], ["1d", 86400]] as const;
const DAY_MS = 86_400_000;
const INTENTS = new Set(["overview", "inspect"]);

const json = (status: number, body: unknown): BffResponse => ({ status, headers: { "content-type": "application/json" }, body });
const problem = (status: number, code: string): BffResponse => json(status, { error: { code, message: "Fixture refusal." }, request_id: "fixture-equity-projection" });
const iso = (ms: number): string => new Date(ms).toISOString().replace(".000Z", "Z");

/** value / running max - 1, as a fraction with six decimals (`0` at a high), truncated toward zero. */
export function drawdownText(value: bigint, peak: bigint): string {
  if (peak <= 0n || value >= peak) return "0";
  const scaled = ((peak - value) * 1_000_000n) / peak;
  return scaled === 0n ? "0" : `-${scaled / 1_000_000n}.${String(scaled % 1_000_000n).padStart(6, "0")}`;
}

export function projectionFor(deploymentId: string, window: ProjectionWindow): Record<string, unknown> | null {
  const found = resolveStageDeployment(deploymentId);
  if (found === null) return null;
  const spec = found.deployment;
  const span = bookSpan([deploymentId]);
  if (span === null) return null;
  const allocation = toCents(spec.allocation);
  const end = equityOf({ id: deploymentId, allocation: spec.allocation, realized: spec.realized, unrealized: spec.unrealized });
  const lattice = bookLevels([deploymentId], LEVEL_NODES, allocation, end);
  const levelAt = (t: number): bigint => {
    const den = BigInt(span.end - span.first);
    const num = BigInt(Math.min(Math.max(t, span.first), span.end) - span.first) * BigInt(LEVEL_NODES - 1);
    const low = Number(num / den);
    const rest = num % den;
    return rest === 0n || low + 1 >= LEVEL_NODES ? lattice[low]! : (lattice[low]! * (den - rest) + lattice[low + 1]! * rest) / den;
  };

  const windowStart = Math.max(span.first, span.end - WINDOW_DAYS[window] * DAY_MS);
  const length = span.end - windowStart;
  const [interval, seconds] = INTERVALS.find(([, s]) => Math.floor(length / (s * 1000)) + 1 <= MAX_BUCKETS) ?? INTERVALS[INTERVALS.length - 1]!;
  const step = seconds * 1000;
  const count = Math.min(MAX_BUCKETS, Math.floor(length / step) + 1);
  const from = span.end - (count - 1) * step;

  let peak = 0n;
  const levels: bigint[] = [];
  const points = Array.from({ length: count }, (_, i) => {
    const t = from + i * step;
    const value = levelAt(t);
    levels.push(value);
    if (i === 0 || value > peak) peak = value;
    return { bucket_start: iso(t), equity: fromCents(value), drawdown: drawdownText(value, peak) };
  });
  const digest = `sha256:${createHash("sha256").update(`equity-projection-fixture|${deploymentId}|${from}|${span.end}|${interval}`).digest("hex")}`;
  const runId = `run_fixture_${deploymentId}`.slice(0, 128);
  return {
    schema_version: "execution.analytics.equity-projection.v1",
    runtime_active: false,
    source_side_effect_requested: false,
    analytics: {
      schema_version: "execution.analytics.v1",
      formula_version: "equity_projection.v1",
      source_authority: "DERIVED",
      input_freshness_floor: "OK",
      panel_state: "ok",
      input_completeness: "COMPLETE",
      input_as_of: iso(span.end),
      warnings: [{ code: "FIXTURE_ILLUSTRATIVE_BAND", message: "The band is an illustrative fixture band, not an approved Research artifact." }],
      data: {
        deployment_id: deploymentId,
        currency: spec.currency,
        requested_from: iso(from),
        requested_to: iso(span.end),
        interval,
        interval_seconds: seconds,
        expected_buckets: count,
        returned_buckets: count,
        source_rows: count,
        coverage: "1",
        joined_run_id: runId,
        artifact_digest: digest,
        points,
        approved_band: {
          run_id: runId,
          artifact_digest: digest,
          points: levels.map((value, i) => ({ bucket_start: points[i]!.bucket_start, lower: fromCents((value * 97n) / 100n), upper: fromCents((value * 103n) / 100n) })),
        },
        gaps: [],
        retention: { availability: "HOT", policy_version: "retention.fixture.v1" },
      },
    },
  };
}

/** `null` is "not mine". */
export function answerEquityProjection(request: BffRequest): BffResponse | null {
  const match = EQUITY_PROJECTION_PATTERN.exec(request.path);
  if (match === null || request.method.toUpperCase() !== "GET") return null;
  const params = new URLSearchParams(request.search.startsWith("?") ? request.search.slice(1) : request.search);
  for (const key of params.keys()) if (key !== "window" && key !== "intent") return problem(400, "EXECUTION_READ_QUERY_INVALID");
  const rawWindow = params.get("window") ?? "30d";
  const intent = params.get("intent") ?? "overview";
  if (!Object.prototype.hasOwnProperty.call(WINDOW_DAYS, rawWindow) || !INTENTS.has(intent)) return problem(400, "EXECUTION_READ_QUERY_INVALID");
  const body = projectionFor(match[1]!, rawWindow as ProjectionWindow);
  return body === null ? problem(404, "EXECUTION_DEPLOYMENT_NOT_FOUND") : json(200, body);
}
