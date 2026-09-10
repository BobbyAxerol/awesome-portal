/**
 * PHASE 3 (round 2) · a stack states what it runs, and a tier comes from a
 * declared policy.
 *
 * Dev and stable differ by eight feature values, and one of them chooses which
 * table every history read comes from. Each stack keeps its own table fresh and
 * lets the other rot, so the flag is not a view toggle — it is a source switch,
 * and flipping it without a backfill would serve days-old rows as current.
 *
 * These tests pin the two things that make that safe to reason about: the
 * manifest says which table is live and which is not, and no age nobody
 * measured can come out as FRESH.
 */
import { buildPool } from "../src/db/pool";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BEHAVIOUR_FLAGS,
  DURABLE_MIRROR_HISTORY_TABLE,
  TIMESERIES_HISTORY_TABLE,
  environmentParity,
  freshnessPolicies,
  freshnessTier,
} from "../src/execution/environment-parity";
import { testConfig } from "./harness";
import { oldestStageAsOfMs } from "../src/execution/stage-screen-wire";
import type { ManagerPage } from "../src/paper-read/manager-records";

const base = {
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: "PAPER_BINANCE_USDM",
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: "ws_parity",
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
};

/** One config for the database-backed checks below. */
const config = testConfig({ ...base, FEATURE_EXECUTION_DURABLE_MIRROR: "true" });

describe("the environment manifest", () => {
  it("names the table history is read from, and the one that is not", () => {
    const withMirror = environmentParity(testConfig({ ...base, FEATURE_EXECUTION_DURABLE_MIRROR: "true" }));
    expect(withMirror.history_source.table).toBe(DURABLE_MIRROR_HISTORY_TABLE);
    expect(withMirror.history_source.unselected_table).toBe(TIMESERIES_HISTORY_TABLE);
    expect(withMirror.history_source.flag_enabled).toBe(true);

    const withoutMirror = environmentParity(testConfig({ ...base, FEATURE_EXECUTION_DURABLE_MIRROR: "false" }));
    expect(withoutMirror.history_source.table).toBe(TIMESERIES_HISTORY_TABLE);
    expect(withoutMirror.history_source.unselected_table).toBe(DURABLE_MIRROR_HISTORY_TABLE);
  });

  it("says why the unselected table cannot simply be switched to", () => {
    const parity = environmentParity(testConfig({ ...base, FEATURE_EXECUTION_DURABLE_MIRROR: "true" }));
    expect(parity.history_source.note).toMatch(/receives no writes/i);
    expect(parity.history_source.note).toMatch(/backfill/i);
  });

  it("reports every behaviour flag, so a comparison is a diff and not an argument", () => {
    const parity = environmentParity(testConfig({ ...base, FEATURE_EXECUTION_DURABLE_MIRROR: "true" }));
    for (const flag of BEHAVIOUR_FLAGS) {
      expect(Object.keys(parity.behaviour_flags), flag).toContain(flag);
    }
  });

  it("states an unconfigured DNSE origin as its own readiness fact", () => {
    const parity = environmentParity(testConfig({ ...base, FEATURE_EXECUTION_DURABLE_MIRROR: "true" }));
    const dnse = parity.capability_readiness.find((entry) => entry.capability === "source.paper-dnse");
    expect(dnse?.state).toBe("UNAVAILABLE");
    expect(dnse?.reason_code).toBe("EDS_DNSE_ORIGIN_NOT_CONFIGURED");
    // A38.7: it must not take the environments that do have an origin with it.
    const paper = parity.profiles.find((entry) => entry.environment === "paper");
    expect(paper?.origin_configured).toBe(true);
  });
});

describe("the freshness policy", () => {
  it("derives stale-after from the declared interval, not from a chosen number", () => {
    const [policy] = freshnessPolicies(testConfig({ ...base, FEATURE_EXECUTION_DURABLE_MIRROR: "true" }));
    expect(policy.declared_poll_interval_ms).toBe(15_000);
    expect(policy.missed_cycles_allowed).toBeGreaterThanOrEqual(3);
    // stale-after >= 3 x interval + jitter, and it shows its working.
    expect(policy.stale_after_ms)
      .toBe(policy.declared_poll_interval_ms * policy.missed_cycles_allowed + policy.operational_jitter_ms);
    expect(policy.stale_after_ms).toBeGreaterThanOrEqual(policy.declared_poll_interval_ms * 3);
  });

  it("calls an age nobody measured UNKNOWN, never FRESH", () => {
    expect(freshnessTier(null, 60_000)).toBe("UNKNOWN");
    expect(freshnessTier(1_000, null)).toBe("UNKNOWN");
    expect(freshnessTier(null, null)).toBe("UNKNOWN");
  });

  it("separates fresh from stale at the declared boundary", () => {
    expect(freshnessTier(59_999, 60_000)).toBe("FRESH");
    expect(freshnessTier(60_000, 60_000)).toBe("FRESH");
    expect(freshnessTier(60_001, 60_000)).toBe("STALE");
  });
});


/**
 * PHASE 3B (round 2) · the comparison that raised a false alarm.
 *
 * Comparing the two history tables on raw `ts` made 591,274 rows look like a
 * disagreement about when a trade happened. Every one of them was millisecond
 * truncation: the mirror stores EDS-02's canonical datetime64[ms] and the older
 * table kept the source's microseconds. I reported the alarm before measuring
 * the magnitude, which is the whole reason this test exists — comparing at the
 * canonical precision is the only comparison that means anything, and a real
 * disagreement must still survive it.
 */
describe("comparing two history tables", () => {
  const CANONICAL = "date_trunc('milliseconds', $2::timestamptz)";
  // One pool for the block: buildPool hands back a shared handle, so ending it
  // per test closes it for the next one.
  let pool: Pool;
  beforeAll(() => { pool = buildPool(config.DATABASE_URL); });
  afterAll(async () => { await pool.end(); });

  const equal = async (left: string, right: string): Promise<boolean> => {
    const result = await pool.query<{ equal: boolean }>(
      `SELECT $1::timestamptz = ${CANONICAL} AS equal`, [left, right]);
    return result.rows[0]?.equal === true;
  };

  it("treats a sub-millisecond difference as the same instant", async () => {
    expect(await equal("2026-07-02T18:11:41.108+00", "2026-07-02T18:11:41.108010+00")).toBe(true);
  });

  it("still sees a difference that is larger than the canonical precision", async () => {
    // One millisecond apart is a real difference and must not be absorbed.
    expect(await equal("2026-07-02T18:11:41.108+00", "2026-07-02T18:11:41.109000+00")).toBe(false);
  });
});


/**
 * PHASE 3 (round 2) · an aggregate age must justify the aggregate tier.
 *
 * The lists that span several environments take the worst freshness of their
 * pages. They used to publish the newest instant beside it, which on dev read
 * "AGING · 6s ago" — the tier from sandbox at 39 seconds, the age from paper at
 * six, and no way for a reader to reconcile the two. This is the same rule
 * codex applied to composite entity kinds in P4-E: no borrowing a fresher
 * contributor's timestamp.
 */
describe("an aggregate that shows the worst tier", () => {
  const page = (asOf: string | null, freshness: "FRESH" | "AGING" | "STALE") => ({
    key: `relation-${asOf ?? "none"}`,
    state: "AVAILABLE" as const,
    reasonCode: null,
    page: { asOf, freshness, completeness: "COMPLETE", items: [], nextCursor: null } as unknown as ManagerPage,
  });
  const relations = [
    page("2026-09-10T16:42:29.000Z", "FRESH"),
    page("2026-09-10T16:41:50.000Z", "AGING"),
    page("2026-09-10T16:41:55.000Z", "FRESH"),
  ];

  it("publishes the oldest contributing instant, not the newest", () => {
    // The bug, written down: the newest instant belongs to a FRESH page and
    // would have been shown beside an AGING tier, 39 seconds apart.
    expect(oldestStageAsOfMs(relations)).toBe(Date.parse("2026-09-10T16:41:50.000Z"));
    expect(oldestStageAsOfMs(relations)).not.toBe(Date.parse("2026-09-10T16:42:29.000Z"));
  });

  it("shows the instant that belongs to the relation the tier came from", () => {
    const worst = relations.find((relation) => relation.page?.freshness === "AGING");
    expect(oldestStageAsOfMs(relations)).toBe(Date.parse(worst!.page!.asOf!));
  });

  it("ignores relations that published no instant rather than counting them as now", () => {
    expect(oldestStageAsOfMs([page(null, "STALE"), ...relations]))
      .toBe(Date.parse("2026-09-10T16:41:50.000Z"));
  });

  it("returns null when no relation published an instant at all", () => {
    expect(oldestStageAsOfMs([page(null, "STALE"), page(null, "FRESH")])).toBeNull();
  });
});
