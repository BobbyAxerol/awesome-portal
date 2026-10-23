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
import type { FixtureScenario } from "./scenario";

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
  void scenario; void path;
  return body;
}
