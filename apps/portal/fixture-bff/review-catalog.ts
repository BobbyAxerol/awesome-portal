import { DEFAULT_SCENARIO, FIXTURE_SCENARIOS } from "./scenario";

/** Server/test-only review index. It never changes app navigation or authorizes a real read. */
export const REVIEW_PROFILES = ["sparse-realistic", "populated", "layout-stress"] as const;
export type ReviewProfile = typeof REVIEW_PROFILES[number];
export const isReviewProfile = (value: string): value is ReviewProfile =>
  (REVIEW_PROFILES as readonly string[]).includes(value);

export const REVIEW_SCREENS = [
  ["overview", "/execution", '[data-screen="overview-v2"]'],
  ["fleet", "/deployments/alphas", ".exec-fleet-v2"],
  ["portfolios", "/deployments/portfolios", '[data-screen="portfolios-v2"]'],
  ["portfolio", "/deployments/portfolios/pf_TEST_ONLY_core", '[data-screen="portfolio-360-v2"]'],
  ["portfolio-accounts", "/deployments/portfolios/pf_TEST_ONLY_core?tab=accounts", '[data-screen="portfolio-360-v2"]'],
  ["compare", "/deployments/compare?in=pf_TEST_ONLY_satellite,pf_scale_006", '[data-screen="compare-v2"]'],
  ["alpha", "/deployments/alphas/alpha_btc_trend", '[data-screen="alpha-360-v2"]'],
  ["alpha-orders", "/deployments/alphas/alpha_btc_trend?tab=orders", '[data-screen="alpha-360-v2"]'],
  ["replay", "/deployments/alphas/alpha_btc_trend?tab=replay&focus=order:ord_007", '[data-screen="alpha-360-v2"]'],
  ["accounts", "/deployments/accounts", ".exec-acct-v2"],
  ["account", "/deployments/accounts/acc_bnc_core", ".exec-acct-v2"],
  ["blotter", "/deployments/blotter", '[data-screen="blotter-v2"]'],
  ["operations", "/execution/operations", ".exec-ops"],
  ["incident", "/execution/operations/incidents/inc_fixture_44", ".exec-ops"],
  ["inbox", "/governance/approvals", ".exec-ck"],
  ["r1", "/governance/approvals/AP-201/r1", ".exec-ck"],
  ["request", "/governance/approvals/new", '[data-screen="new-request-v2"]'],
  ["paper", "/deployments/paper/dep_paper_01", '[data-screen="workbench-v2"]'],
  ["paper-fills", "/deployments/paper/dep_paper_01?tab=fills", '[data-screen="workbench-v2"]'],
  ["sandbox", "/deployments/sandbox/dep_sandbox_01?workspace_id=ws_TEST_SCOPED_V2", '[data-screen="sandbox-v2"]'],
  ["canary", "/deployments/live/dep_canary_01/canary?workspace_id=ws_TEST_SCOPED_V2", '[data-screen="canary-v2"]'],
  ["live", "/deployments/live/dep_live_01?workspace_id=ws_TEST_SCOPED_V2", '[data-screen="live-v2"]'],
  ["users", "/administration/users", '[data-screen="users-v2"]'],
  ["access", "/administration/profile-access?workspace_id=ws_TEST_GRANTS", ".exec-acc-kpi"],
  ["admin", "/administration/actions", '[data-screen="admin-actions-v2"]'],
] as const;

export function reviewCatalog(profile: ReviewProfile, scale: string, scenario: string = DEFAULT_SCENARIO) {
  return {
    schema_version: "fixture.review-catalog.v1",
    lane: "FIXTURE_LAB",
    not_acceptance: true,
    production_config: false,
    profile,
    scale,
    scenario,
    scenarios: FIXTURE_SCENARIOS,
    real_api_fallback: false,
    persistence: "NONE",
    commands: "NO_UPSTREAM_SIDE_EFFECTS",
    profiles: REVIEW_PROFILES,
    viewports: [{ width: 1280, height: 900 }, { width: 660, height: 900 }],
    screens: REVIEW_SCREENS.map(([id, href, root]) => ({ id, href, root })),
    states: [
      { id: "access-empty", href: "/administration/profile-access?workspace_id=ws_TEST_EMPTY", expect: "AVAILABLE_EMPTY_GRANTS" },
      { id: "access-denied", href: "/administration/profile-access?workspace_id=ws_TEST_DENIED", expect: "DENIED" },
      { id: "access-unavailable", href: "/administration/profile-access?workspace_id=ws_TEST_UNAVAILABLE", expect: "UNAVAILABLE" },
      { id: "series-empty", workspace_id: "ws_TEST_SERIES_EMPTY", expect: "EMPTY" },
      { id: "series-unavailable", workspace_id: "ws_TEST_SERIES_UNAVAILABLE", expect: "UNAVAILABLE" },
      { id: "series-mixed-currency", workspace_id: "ws_TEST_SERIES_CURRENCY_MIXED", expect: "INCOMPARABLE" },
    ],
    limits: [
      "Fixture approval/write answers are not persisted decisions.",
      "Score calibration, missing contract fields and hard-coded UI gaps are not filled by a fixture.",
      "Known account-link aliases resolve navigation only; separate fixture books are not an economic tie-out. Unmatched IDs remain explicit refusals.",
      "Sparse/negative cases retain null, absence and typed refusal; no automatic real-to-fixture fallback.",
    ],
    remove: "Unset FIXTURE_REVIEW_PROFILE (sparse-realistic default); fixture off removes the existing preview overlay. No data migration.",
  };
}

const escape = (value: string): string => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);

/** Plain review index, NOT a replacement for any accepted Execution component. No script, forms, secret or external URL. */
export function reviewHtml(profile: ReviewProfile, scale: string, scenario: string = DEFAULT_SCENARIO): string {
  const links = REVIEW_SCREENS.map(([id, href]) => `<li><a href="${escape(href)}">${escape(id)}</a></li>`).join("");
  // WP-P: a no-script scenario chooser. Each entry is a plain link; the active one is marked. In-memory, lane-internal.
  const chooser = FIXTURE_SCENARIOS.map((id) => id === scenario ? `<strong>${escape(id)} (active)</strong>` : `<a href="/__fixture/scenario?set=${escape(id)}">${escape(id)}</a>`).join(" · ");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Execution fixture review</title></head><body><main><h1>Execution fixture review</h1><p>Scenario: ${chooser}. Selecting one answers JSON; come back and reload the screen. Default is positive.</p><p>FIXTURE DATA · ${escape(profile)} · ${escape(scale)}. Synthetic design review only, not real Edge data or acceptance evidence.</p><p>Use a separate fixture origin. The real API is never a fallback. Writes do not persist and cannot reach upstream.</p><p><a href="/__fixture/review">Machine-readable cases and limits</a></p><ul>${links}</ul><p>Check 1280px and 660px: panel bounds, long labels, exact decimals, null versus zero, drawers, tables, charts, keyboard and back/reload. Do not re-record accepted visual baselines automatically.</p></main></body></html>`;
}
