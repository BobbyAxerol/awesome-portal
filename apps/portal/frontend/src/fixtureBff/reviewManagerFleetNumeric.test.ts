// @vitest-environment node
/**
 * QA1 R2-01: a numeric sort and a numeric range on the Fleet read answered 503 on the review BFF. The review lane now evaluates them itself:
 * exact decimals (never a lexical order), a null always last in both directions, a money key only inside ONE pinned economic partition.
 * Judged through the real HTTP route (the unmodified production port over the review answerer).
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { answerReviewManager } from "../../../fixture-bff/review-manager";
import { setFixtureNow, setFixtureScale } from "../../e2e/bffScale";
import { createHttpApi } from "../execution/api/httpApi";
import type { DeliveryPolicy } from "../execution/profile";
import type { ManagerRow } from "../execution/v2/readers/managerDataset";

const OPEN: DeliveryPolicy = { policyRevision: 4, queryEnabled: true, projectionIngestionEnabled: false, sseEnabled: false,
  governanceWriteEnabled: false, paperCommandsEnabled: false, sandboxCommandsEnabled: false,
  liveProtectiveCommandsEnabled: false, liveRiskIncreasingCommandsEnabled: false };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;
const prepare = () => { setFixtureScale("medium"); setFixtureNow("2026-10-22T12:00:00Z"); };
afterEach(() => { vi.unstubAllGlobals(); setFixtureScale("small"); setFixtureNow("2026-08-22T13:00:00Z"); });
const ask = (query: Record<string, string>): { status: number; body: Body } => {
  prepare();
  return answerReviewManager("GET", "/manager/fleet", new URLSearchParams({ limit: "200", ...query }), "populated") as { status: number; body: Body };
};
const scaled = (value: string): bigint => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  const n = BigInt(whole + fraction.padEnd(18, "0").slice(0, 18));
  return negative ? -n : n;
};
const scoreOf = (row: Body): string | null => (row.metrics.score.availability === "AVAILABLE" ? row.metrics.score.value : null);
const PIN = JSON.stringify({ economic_domain: "ACTUAL", currency: "USDT", basis: "FIXTURE_LAB:synthetic-book", native_profile_ref: "FIXTURE_LAB:live:synthetic", domain_proof_ref: "FIXTURE_LAB:NOT_PRODUCT_AUTHORITY" });
const moneyOf = (row: Body, key: string): string | null => {
  const entry = row.economic_partitions.find((e: Body) => e.partition.currency === "USDT");
  return entry !== undefined && entry.metrics[key]?.availability === "AVAILABLE" ? entry.metrics[key].value : null;
};

describe("numeric sort and range on the review BFF", () => {
  it("sorts by QBTS in exact numeric order with the empty ones last, in both directions", () => {
    for (const direction of ["asc", "desc"]) {
      const { status, body } = ask({ environment: "live", sort: JSON.stringify([{ field: "score", direction }]) });
      expect(status, direction).toBe(200);
      const values = body.items.map(scoreOf) as (string | null)[];
      const firstNull = values.indexOf(null);
      expect(firstNull, "a typed absence exists").toBeGreaterThan(0);
      expect(values.slice(firstNull).every((v) => v === null)).toBe(true);
      const present = values.slice(0, firstNull) as string[];
      for (let i = 1; i < present.length; i += 1) {
        const c = scaled(present[i - 1]!) < scaled(present[i]!) ? -1 : scaled(present[i - 1]!) > scaled(present[i]!) ? 1 : 0;
        expect(direction === "asc" ? c <= 0 : c >= 0, `${present[i - 1]} ${present[i]}`).toBe(true);
      }
    }
  });

  it("a QBTS range is inclusive GTE / LTE on exact decimals", () => {
    const all = ask({ environment: "live" }).body.items.map(scoreOf).filter((v: string | null): v is string => v !== null);
    const { status, body } = ask({ environment: "live", filters: JSON.stringify([{ field: "score", op: "GTE", value: "40" }, { field: "score", op: "LTE", value: "75" }]) });
    expect(status).toBe(200);
    const expected = all.filter((v: string) => scaled(v) >= scaled("40") && scaled(v) <= scaled("75"));
    expect(expected.length).toBeGreaterThan(0);
    expect(body.items.map(scoreOf)).toEqual(expect.arrayContaining(expected));
    expect(body.items).toHaveLength(expected.length);
    expect(body.page.authorized_filtered_count).toBe(expected.length);
    // a missing score is not zero: an upper bound of 0 does not match it
    const zero = ask({ environment: "live", filters: JSON.stringify([{ field: "score", op: "LTE", value: "0" }]) }).body.items;
    expect(zero.every((row: Body) => scoreOf(row) === "0")).toBe(true);
    expect(ask({ environment: "live", filters: JSON.stringify([{ field: "score", op: "IS_NULL" }]) }).body.items.every((row: Body) => scoreOf(row) === null)).toBe(true);
  });

  it("a money sort and a money range need ONE pinned partition, and work inside it", () => {
    expect(ask({ environment: "live", sort: JSON.stringify([{ field: "net_pnl", direction: "asc" }]) }).status).toBe(400);
    expect(ask({ environment: "live", filters: JSON.stringify([{ field: "allocation", op: "GTE", value: "1" }]) }).status).toBe(400);
    const sorted = ask({ environment: "live", economic_partition: PIN, sort: JSON.stringify([{ field: "net_pnl", direction: "asc" }]) });
    expect(sorted.status).toBe(200);
    const values = sorted.body.items.map((row: Body) => moneyOf(row, "net_pnl")) as (string | null)[];
    const firstNull = values.indexOf(null);
    const present = (firstNull < 0 ? values : values.slice(0, firstNull)) as string[];
    expect(present.length).toBeGreaterThan(3);
    for (let i = 1; i < present.length; i += 1) expect(scaled(present[i - 1]!) <= scaled(present[i]!)).toBe(true);
    const ranged = ask({ environment: "live", economic_partition: PIN, filters: JSON.stringify([{ field: "net_pnl", op: "GTE", value: "0" }, { field: "allocation", op: "LTE", value: "30000" }]) });
    expect(ranged.status).toBe(200);
    expect(ranged.body.items.length).toBeGreaterThan(0);
    for (const row of ranged.body.items) {
      expect(scaled(moneyOf(row, "net_pnl")!) >= 0n).toBe(true);
      expect(scaled(moneyOf(row, "allocation")!) <= scaled("30000")).toBe(true);
    }
    expect(ask({ environment: "live", economic_partition: "{\"economic_domain\":\"ACTUAL\"}" }).status).toBe(400);
  });

  it("the ALL read orders and filters across the environments in one exact order, each row only with its own partition's money", () => {
    const { status, body } = ask({ environment: "ALL", sort: JSON.stringify([{ field: "score", direction: "desc" }]), filters: JSON.stringify([{ field: "score", op: "GTE", value: "10" }]) });
    expect(status).toBe(200);
    const environments = new Set(body.items.map((row: Body) => row.environment));
    expect(environments.size).toBeGreaterThan(1);
    const values = body.items.map(scoreOf) as string[];
    for (let i = 1; i < values.length; i += 1) expect(scaled(values[i - 1]!) >= scaled(values[i]!)).toBe(true);
    expect(values.every((v) => scaled(v) >= scaled("10"))).toBe(true);
    const total = body.environment_coverage.reduce((n: number, c: Body) => n + (c.authorized_filtered_count ?? 0), 0);
    expect(body.page.authorized_filtered_count).toBe(total);
    // a money range pinned to Real-funded keeps the rows of that partition only
    const real = ask({ environment: "ALL", economic_partition: PIN, filters: JSON.stringify([{ field: "allocation", op: "GTE", value: "1" }]) });
    expect(real.status).toBe(200);
    expect(real.body.items.every((row: Body) => row.environment === "live")).toBe(true);
  });

  it("the unmodified production port reads a QBTS sort and a range as a dataset, for one environment and for ALL", async () => {
    prepare();
    vi.stubGlobal("fetch", async (input: string) => {
      const url = new URL(String(input), "http://fixture.test");
      const response = answerReviewManager("GET", url.pathname, url.searchParams, "populated");
      return new Response(JSON.stringify(response?.body ?? {}), { status: response?.status ?? 501, headers: { "content-type": "application/json" } });
    });
    const api = createHttpApi({ policy: OPEN, readScope: {} });
    for (const environment of ["live", "ALL"] as const) {
      const result = await api.getManagerDataset({ surface: "FLEET", environment, limit: 50, sort: [{ field: "score", direction: "desc" }],
        filters: [{ field: "score", op: "GTE", value: "10" }] });
      if (!result.ok) throw new Error(`${environment}: ${result.reason}`);
      const rows = result.value.items as readonly ManagerRow[];
      expect(rows.length).toBeGreaterThan(0);
      const first = rows[0]!.metrics.score;
      expect(first !== undefined && first.kind === "value").toBe(true);
    }
  });
});
