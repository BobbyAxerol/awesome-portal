/**
 * The one place a journey `target_key` becomes a path (P09 handoff, S00 §2).
 *
 * The descriptor's `target_key` is presentation data. It names *which screen a
 * card points at*, not *where that screen lives* — the browser owns routing, and
 * a server-supplied string that became a URL would be an open redirect wearing
 * a product feature's clothes.
 *
 * So resolution happens here and nowhere else. A key this map does not know
 * resolves to `null`, and the card renders as unreachable rather than guessing
 * a path that would 404 or, worse, land somewhere real and wrong.
 */

import { QUANTBT_ROOT } from "../features/quantbt/routes";

/**
 * Product routes this build actually serves, by descriptor key.
 *
 * The keys are the ones the published descriptor uses, not a guess at them.
 * A key is listed only when this build serves a working screen for it:
 *
 *  - `alpha_import` is mounted under QuantBT, not the still-COMMISSIONED
 *    `ALPHA_POOL`; FD-P09-02 was resolved in plan §13.
 *  - `preflight` is absent for a different reason: P08 publishes the panel but
 *    a preflight needs a requested spec, and the producer is P10's. Recorded
 *    as `FD-P09-03`.
 *
 * Both render as unreachable rather than as a guessed path.
 */
const SCREEN_ROUTES: Readonly<Record<string, string>> = {
  journey_map: `${QUANTBT_ROOT}/journey`,
  engine_atlas: `${QUANTBT_ROOT}/atlas`,
  /* `FD-P09-02` resolved in plan §13: Screen 14's canonical route is under
     QuantBT, not under the still-COMMISSIONED ALPHA_POOL feature. */
  alpha_import: `${QUANTBT_ROOT}/alpha-import`,
  new_run: `${QUANTBT_ROOT}/runs/new`,
  command_center: "/",
  run_library: `${QUANTBT_ROOT}/runs`,
  run_library_legacy: `${QUANTBT_ROOT}/runs/legacy`,
  alpha_imports_legacy: `${QUANTBT_ROOT}/imports`,
  new_run_legacy: `${QUANTBT_ROOT}/new`,
  portal_map: "/portal-map",
  portal_access: "/administration/profile-access",
};


/** Per-run destinations are resolved only with the run explicitly in scope. */
const RUN_SCREEN_SUFFIX: Readonly<Record<string, string>> = {
  run_progress: "progress",
  run_progress_legacy: "overview",
  evidence_hub: "evidence",
  split: "split",
  search_selection: "search",
  freeze: "freeze",
};
/**
 * Resolves a descriptor key to a path this build serves.
 *
 * Returns `null` for an unknown key — including one that looks like a path
 * already. A key containing a slash, a scheme or a protocol-relative prefix is
 * refused outright rather than looked up, because the failure mode being
 * prevented is exactly a descriptor value that *is* a URL.
 */
export function resolveJourneyCardRoute(targetKey: string, runId: string | null): string | null {
  if (/[/\\:]/.test(targetKey)) return null;
  const suffix = RUN_SCREEN_SUFFIX[targetKey];
  if (suffix === undefined) return resolveScreenRoute(targetKey);
  if (!runId || !/^[A-Za-z0-9_-]{1,128}$/.test(runId)) return null;
  return `${QUANTBT_ROOT}/runs/${encodeURIComponent(runId)}/${suffix}`;
}
export function resolveScreenRoute(targetKey: string): string | null {
  if (/[/\\:]/.test(targetKey)) return null;
  return SCREEN_ROUTES[targetKey] ?? null;
}

/** Every key this build can reach, for tests and for the journey composition. */
export const KNOWN_SCREEN_KEYS: readonly string[] = Object.keys(SCREEN_ROUTES);
