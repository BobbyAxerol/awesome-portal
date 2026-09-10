/**
 * PHASE 3A (round 2) · a stack states what it is running, so a comparison is a
 * diff and not an argument.
 *
 * Dev and stable run eight different feature values, and one of them —
 * `FEATURE_EXECUTION_DURABLE_MIRROR` — does not toggle a view: it chooses
 * which table every history read comes from. Each stack keeps its own table
 * fresh and lets the other rot, so flipping the flag would put days-old rows on
 * screen with nothing to say so.
 *
 * This block is read-only evidence. It flips nothing and backfills nothing; it
 * exists so the decision can be made against measured facts (A38.7 item 1).
 */
import type { ControlApiConfig } from "../config";

/** The two tables `historyTable()` chooses between, named once. */
export const DURABLE_MIRROR_HISTORY_TABLE = "execution_durable_mirror_range_rows";
export const TIMESERIES_HISTORY_TABLE = "execution_timeseries_history";

/**
 * The flags whose value differs the behaviour of one stack from another.
 *
 * Listed explicitly rather than scraped from the environment: a scrape would
 * carry whatever happened to be set, including values that mean nothing here,
 * and a reader could not tell which ones matter.
 */
export const BEHAVIOUR_FLAGS = [
  "FEATURE_EXECUTION_DURABLE_MIRROR",
  "FEATURE_EXECUTION_DURABLE_MIRROR_READS",
  "FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT",
  "FEATURE_EXECUTION_LOCAL_R0_TASKS",
  "FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES",
  "FEATURE_EXECUTION_MARKET_CONTEXT",
  "FEATURE_EXECUTION_PAPER_WORKBENCH_SHADOW",
  "FEATURE_EXECUTION_SHADOW_QUERY",
  "FEATURE_EXECUTION_ANALYTICS_QUERY",
  "FEATURE_EXECUTION_REALTIME_SSE",
  "FEATURE_EXECUTION_LOCAL_PROJECTION",
  "FEATURE_EXECUTION_EDGE",
] as const;

/**
 * How old a read may be before it stops being fresh, per ingestion class.
 *
 * A38.7 item 3: three times the declared poll interval plus proven operational
 * jitter — not one global number that happens to look reasonable. The multiple
 * is three because two consecutive missed cycles are ordinary under load and a
 * third means the ladder is not running; the jitter allowance is the observed
 * spread of drain completion on dev, not a guess.
 */
export interface FreshnessPolicy {
  readonly ingestion_class: string;
  readonly declared_poll_interval_ms: number;
  readonly missed_cycles_allowed: number;
  readonly operational_jitter_ms: number;
  readonly stale_after_ms: number;
}

const MISSED_CYCLES_ALLOWED = 3;
/** Measured on dev 2026-09-10: drains completed within 15s of their cadence. */
const OPERATIONAL_JITTER_MS = 15_000;

export function freshnessPolicies(config: ControlApiConfig): readonly FreshnessPolicy[] {
  const declared = Number(config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS ?? 0);
  const interval = Number.isFinite(declared) && declared > 0 ? declared : null;
  if (interval === null) return [];
  return [{
    ingestion_class: "LOCAL_PROJECTION_LADDER",
    declared_poll_interval_ms: interval,
    missed_cycles_allowed: MISSED_CYCLES_ALLOWED,
    operational_jitter_ms: OPERATIONAL_JITTER_MS,
    stale_after_ms: interval * MISSED_CYCLES_ALLOWED + OPERATIONAL_JITTER_MS,
  }];
}

/**
 * The tier a reader is owed, from an age it may not have.
 *
 * `UNKNOWN` is its own tier and never collapses into `FRESH`: a missing
 * timestamp means nobody measured, and drawing that as current is the lie this
 * whole phase exists to prevent.
 */
export type FreshnessTier = "FRESH" | "STALE" | "UNKNOWN";

export function freshnessTier(ageMs: number | null, staleAfterMs: number | null): FreshnessTier {
  if (ageMs === null || staleAfterMs === null) return "UNKNOWN";
  return ageMs <= staleAfterMs ? "FRESH" : "STALE";
}

export interface EnvironmentParity {
  readonly schema_version: "portal.execution.environment-parity.v1";
  readonly history_source: {
    readonly table: string;
    readonly selected_by: string;
    readonly flag_enabled: boolean;
    readonly unselected_table: string;
    readonly note: string;
  };
  readonly behaviour_flags: Readonly<Record<string, string | null>>;
  readonly profiles: readonly {
    readonly environment: string;
    readonly profile_id: string | null;
    readonly origin_configured: boolean;
  }[];
  readonly freshness_policy: readonly FreshnessPolicy[];
  readonly capability_readiness: readonly {
    readonly capability: string;
    readonly state: "READY" | "UNAVAILABLE";
    readonly reason_code: string | null;
  }[];
}

export function environmentParity(config: ControlApiConfig): EnvironmentParity {
  const mirrorEnabled = config.FEATURE_EXECUTION_DURABLE_MIRROR === "true";
  const flags: Record<string, string | null> = {};
  for (const flag of BEHAVIOUR_FLAGS) {
    const value = (config as unknown as Record<string, unknown>)[flag];
    flags[flag] = typeof value === "string" ? value : null;
  }
  return {
    schema_version: "portal.execution.environment-parity.v1",
    history_source: {
      table: mirrorEnabled ? DURABLE_MIRROR_HISTORY_TABLE : TIMESERIES_HISTORY_TABLE,
      selected_by: "FEATURE_EXECUTION_DURABLE_MIRROR",
      flag_enabled: mirrorEnabled,
      unselected_table: mirrorEnabled ? TIMESERIES_HISTORY_TABLE : DURABLE_MIRROR_HISTORY_TABLE,
      note: "The unselected table receives no writes on this stack, so its rows"
        + " age from the moment the flag was set. Flipping the flag without a"
        + " backfill would serve those rows as current.",
    },
    behaviour_flags: flags,
    profiles: [
      { environment: "paper", profile_id: config.EXECUTION_EDGE_PAPER_PROFILE_ID ?? null,
        origin_configured: Boolean(config.EXECUTION_EDGE_PAPER_ORIGIN) },
      { environment: "sandbox", profile_id: config.EXECUTION_EDGE_SANDBOX_PROFILE_ID ?? null,
        origin_configured: Boolean(config.EXECUTION_EDGE_SANDBOX_ORIGIN) },
      { environment: "live", profile_id: config.EXECUTION_EDGE_LIVE_PROFILE_ID ?? null,
        origin_configured: Boolean(config.EXECUTION_EDGE_LIVE_ORIGIN) },
      { environment: "paper-dnse", profile_id: config.EXECUTION_EDGE_PAPER_DNSE_PROFILE_ID ?? null,
        origin_configured: Boolean(config.EXECUTION_EDGE_PAPER_DNSE_ORIGIN) },
    ],
    freshness_policy: freshnessPolicies(config),
    capability_readiness: [{
      capability: "source.paper-dnse",
      // A38.7: an empty DNSE origin is its own readiness fact. It states itself
      // and never blocks the parity of the environments that do have one.
      state: config.EXECUTION_EDGE_PAPER_DNSE_ORIGIN ? "READY" : "UNAVAILABLE",
      reason_code: config.EXECUTION_EDGE_PAPER_DNSE_ORIGIN ? null : "EDS_DNSE_ORIGIN_NOT_CONFIGURED",
    }],
  };
}
