import { z } from "zod";

/**
 * FE-CAT-3 (closeout 2026-10-23 section 5): the Fleet "All" lens is NAVIGATION across separately labelled environment / economic
 * partitions, not consolidated money. `GET /manager/fleet?environment=ALL` returns the authorized rows of every authorized environment,
 * each row carrying its own environment, ONE cursor over one exact snapshot, a per-environment coverage list, and NO combined money total.
 *
 * This file holds the vocabulary and the producer invariants JSON Schema cannot state (counts that add up, identity between a row and
 * its environment). They run inside `managerDatasetResponse`, so a body that breaks one is never emitted. Codes are stable.
 */
export const MANAGER_ALL_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type ManagerAllEnvironment = (typeof MANAGER_ALL_ENVIRONMENTS)[number];

/**
 * Why an environment contributed nothing. Closed. `NOT_AVAILABLE_TO_VIEWER` deliberately merges "no grant" with "nothing visible":
 * a missing environment may never reveal whether rows exist behind it (the single-environment read answers 404 for both).
 */
export const MANAGER_ALL_REASONS = ["NOT_AVAILABLE_TO_VIEWER", "NOT_CONFIGURED", "POLICY_PENDING", "PUBLICATION_NOT_QUALIFIED",
  "SOURCE_UNAVAILABLE", "CHANGED_DURING_READ", "SCOPE_LIMIT_EXCEEDED"] as const;
export type ManagerAllReason = (typeof MANAGER_ALL_REASONS)[number];

/** The economic domain every partition of an environment must carry (store rule: live is ACTUAL). */
export const managerAllDomainOf = (environment: ManagerAllEnvironment): "ACTUAL" | "PAPER" | "SANDBOX" =>
  environment === "live" ? "ACTUAL" : environment === "paper" ? "PAPER" : "SANDBOX";
const STAGES: Readonly<Record<ManagerAllEnvironment, readonly string[]>> = { paper: ["PAPER"], sandbox: ["SANDBOX"], live: ["CANARY", "LIVE"] };

/** The ALL row identity: the environment first, then the single-environment key parts. One row of one environment. */
export const managerAllRowKey = (environment: ManagerAllEnvironment, row: { alpha_id: string; alpha_version_id: string; portfolio_id: string }): string =>
  JSON.stringify([environment, row.alpha_id, row.alpha_version_id, row.portfolio_id]);

interface CoverageLike {
  environment: ManagerAllEnvironment; availability: "INCLUDED" | "UNAVAILABLE"; reason_code: string | null;
  snapshot_id: string | null; as_of_ms: number | null; recorded_through_ms: number | null; facts_through_ms: number | null;
  quality: { completeness: string; freshness: string } | null; authorized_filtered_count: number | null; returned_count: number | null;
}
export interface ManagerAllScopeInput {
  environment: string;
  environment_coverage?: CoverageLike[];
  selected_window: unknown;
  quality: { completeness: string };
  page: { returned_count: number; authorized_filtered_count: number };
  items: Array<{ environment?: ManagerAllEnvironment; row_key: string; alpha_id: string; alpha_version_id: string; portfolio_id: string;
    economic_partitions: Array<{ partition: { economic_domain: string } }> }>;
}

export function validateManagerAllScope(v: ManagerAllScopeInput, c: z.RefinementCtx): void {
  const issue = (path: Array<string | number>, message: string) => c.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (v.environment !== "ALL") {
    // A single-environment body is never ALL-shaped: no coverage list, no per-row environment.
    if (v.environment_coverage !== undefined) issue(["environment_coverage"], "MANAGER_ALL_COVERAGE_FORBIDDEN");
    v.items.forEach((row, i) => { if (row.environment !== undefined) issue(["items", i, "environment"], "MANAGER_ALL_ROW_ENVIRONMENT_FORBIDDEN"); });
    return;
  }
  const coverage = v.environment_coverage;
  if (coverage === undefined) { issue(["environment_coverage"], "MANAGER_ALL_COVERAGE_REQUIRED"); return; }
  // ALL carries no window: a preset resolves against one environment's cutoff.
  if (v.selected_window !== null) issue(["selected_window"], "MANAGER_ALL_WINDOW_FORBIDDEN");
  if (coverage.length !== MANAGER_ALL_ENVIRONMENTS.length || coverage.some((entry, i) => entry.environment !== MANAGER_ALL_ENVIRONMENTS[i]))
    issue(["environment_coverage"], "MANAGER_ALL_COVERAGE_ORDER");

  let filtered = 0, returned = 0, unavailable = 0;
  coverage.forEach((entry, i) => {
    const at = ["environment_coverage", i];
    if (entry.availability === "INCLUDED") {
      if (entry.reason_code !== null || entry.snapshot_id === null || entry.as_of_ms === null || entry.recorded_through_ms === null ||
        entry.quality === null || entry.authorized_filtered_count === null || entry.returned_count === null)
        issue(at, "MANAGER_ALL_COVERAGE_INCONSISTENT");
      else {
        filtered += entry.authorized_filtered_count; returned += entry.returned_count;
        if (entry.returned_count > entry.authorized_filtered_count) issue([...at, "returned_count"], "MANAGER_ALL_COVERAGE_COUNT_INVALID");
      }
    } else {
      unavailable += 1;
      // A missing environment is typed: a reason, and nothing else (no clock, no count, no snapshot).
      if (entry.reason_code === null || entry.snapshot_id !== null || entry.as_of_ms !== null || entry.recorded_through_ms !== null ||
        entry.facts_through_ms !== null || entry.quality !== null || entry.authorized_filtered_count !== null || entry.returned_count !== null)
        issue(at, "MANAGER_ALL_COVERAGE_INCONSISTENT");
    }
  });
  // The page counts ROWS (never money): its totals are the per-environment counts, which is the only sum ALL makes.
  if (v.page.authorized_filtered_count !== filtered) issue(["page", "authorized_filtered_count"], "MANAGER_ALL_COUNT_MISMATCH");
  if (v.page.returned_count !== returned) issue(["page", "returned_count"], "MANAGER_ALL_COUNT_MISMATCH");
  // A body that lost an environment never reads as COMPLETE.
  if (unavailable > 0 && v.quality.completeness === "COMPLETE") issue(["quality", "completeness"], "MANAGER_ALL_UNAVAILABLE_READS_COMPLETE");

  const perEnvironment = new Map<string, number>();
  v.items.forEach((row, i) => {
    const environment = row.environment;
    if (environment === undefined) { issue(["items", i, "environment"], "MANAGER_ALL_ROW_ENVIRONMENT_REQUIRED"); return; }
    perEnvironment.set(environment, (perEnvironment.get(environment) ?? 0) + 1);
    if (row.row_key !== managerAllRowKey(environment, row)) issue(["items", i, "row_key"], "MANAGER_ALL_ROW_KEY_INVALID");
    // A row's figures live in its own environment's economic domain: no ACTUAL partition on a Paper row, and the reverse.
    if (row.economic_partitions.some(entry => entry.partition.economic_domain !== managerAllDomainOf(environment)))
      issue(["items", i, "economic_partitions"], "MANAGER_ALL_ROW_DOMAIN_MISMATCH");
  });
  coverage.forEach((entry, i) => {
    if ((perEnvironment.get(entry.environment) ?? 0) !== (entry.returned_count ?? 0))
      issue(["environment_coverage", i, "returned_count"], "MANAGER_ALL_COVERAGE_ROWS_MISMATCH");
  });
}

/** The stage words a row of an environment may carry (used by the stage validator for ALL). */
export const managerAllStagesOf = (environment: ManagerAllEnvironment): readonly string[] => STAGES[environment];
