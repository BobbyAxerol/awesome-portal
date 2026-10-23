/**
 * WP-P: how a selected scenario reaches the doubles and the served bodies. FIXTURE_LAB only.
 *
 * Three levers, nothing else:
 *  1. the doubles' own variants (command center, blotter, admin, users): `scenarioVariants`;
 *  2. the request, for the doubles that already model a negative case by workspace id: `scenarioRequest`;
 *  3. a body shaper for the scenarios that are value rewrites (zero, dense, empty): `applyScenarioBody`.
 * The producers in review-manager.ts / bffSimulated*.ts read `getScenario()` themselves for the rest.
 */
import type { OverviewDoubleVariants } from "../frontend/e2e/bffDoubleOverview";
import type { UsersDoubleVariant } from "../frontend/e2e/bffDoubleUsers";
import type { BffRequest } from "../frontend/e2e/bffAnswerer";
import { healsDoubles, type FixtureScenario } from "./scenario";

export interface ScenarioVariants {
  overview: Partial<OverviewDoubleVariants>;
  users: UsersDoubleVariant;
}

/** The doubles' variants a scenario selects. `positive` is the doubles' own defaults . */
export function scenarioVariants(scenario: FixtureScenario): ScenarioVariants {
  switch (scenario) {
    case "partial": return { overview: { commandCenter: "partial", blotter: "partial", admin: "partial" }, users: "paged" };
    case "stale": return { overview: { commandCenter: "stale", blotter: "stale" }, users: "paged" };
    case "denied": return { overview: { blotter: "denied", admin: "denied" }, users: "denied" };
    case "empty": return { overview: { commandCenter: "quiet", blotter: "empty" }, users: "empty" };
    case "missing": return { overview: { commandCenter: "feed-unavailable" }, users: "paged" };
    default: return { overview: {}, users: "paged" };
  }
}

/** Rewrites the request of a scenario that the doubles already model by a workspace id. Identity otherwise. */
export function scenarioRequest(scenario: FixtureScenario, request: BffRequest): BffRequest {
  void scenario;
  return request;
}

/** Clears the in-memory command-story state (plan/apply/status/retry, WP-P deliverable 5). Nothing to clear until the story is wired. */
export function resetFixtureTransitions(): void {
  /* wired with the command story */
}

/** Shapes a served JSON body for the value-rewrite scenarios. Identity for the others. */
export function applyScenarioBody(scenario: FixtureScenario, path: string, body: unknown): unknown {
  const healed = healsDoubles(scenario) ? aliasIds(healBody(body)) : body;
  void path;
  return healed;
}

/**
 * The positive world's source health: the canonical source-health read the command center and the operations composition embed says AGING and
 * PARTIAL for all three environments (a real-looking degraded snapshot). Here every environment is AVAILABLE, FRESH and COMPLETE. Only that
 * envelope is rewritten, found by its schema_version at any depth; nothing else is touched.
 */
function healBody(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((entry) => healBody(entry, depth + 1));
  const record = value as Record<string, unknown>;
  if (record.schema_version === "execution.derivation.source-health.v1" && Array.isArray(record.profiles)) {
    return { ...record, state: "AVAILABLE", profiles: (record.profiles as Record<string, unknown>[]).map((profile) => ({ ...profile, state: "AVAILABLE", reason_code: null, availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE" })) };
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    const next = healBody(child, depth + 1);
    if (next !== child) changed = true;
    out[key] = next;
  }
  return changed ? out : value;
}

/**
 * ONE id space for the navigation spine (WP-P). Ids the doubles print as a link target but that no read serves are pointed at the entity that does
 * answer, in every served body of the positive-like scenarios: the operation queue names accounts `acc_TEST_ONLY_*`, the account double names the
 * portfolios `pf_core`, `pf_satellite`, `pf_canary`. Exact string match only (a bare id or the id as the last path segment of a link); nothing else is
 * rewritten, so a free-text field that merely contains the word is left alone. The legacy `missing` scenario keeps the dangling ids on purpose.
 */
export const ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  acc_TEST_ONLY_operational: "acc_bnc_core",
  acc_TEST_ONLY_binance01: "acc_bnc_sub",
  acc_TEST_ONLY_binance02: "acc_okx_main",
  pf_core: "pf_TEST_ONLY_core",
  pf_satellite: "pf_TEST_ONLY_satellite",
  pf_canary: "pf_TEST_ONLY_canary",
});
function aliasIds(value: unknown, depth = 0): unknown {
  if (depth > 12) return value;
  if (typeof value === "string") {
    const direct = ID_ALIASES[value];
    if (direct !== undefined) return direct;
    const slash = value.lastIndexOf("/");
    if (slash > 0 && value.startsWith("/")) {
      const tail = ID_ALIASES[value.slice(slash + 1)];
      if (tail !== undefined) return `${value.slice(0, slash + 1)}${tail}`;
    }
    return value;
  }
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((entry) => { const next = aliasIds(entry, depth + 1); if (next !== entry) changed = true; return next; });
    return changed ? out : value;
  }
  let changed = false;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const next = aliasIds(child, depth + 1);
    if (next !== child) changed = true;
    out[key] = next;
  }
  return changed ? out : value;
}
