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
  const healed = healsDoubles(scenario) ? healBody(body) : body;
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
