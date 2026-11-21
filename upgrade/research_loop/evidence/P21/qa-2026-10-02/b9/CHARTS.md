# B9 CHARTS group (S04 Evidence hub + S09 Report), handoff item 4

Bound (optional fields; absent = existing UI unchanged):
- return_distribution.mean/median/var_95/cvar_95 + statistics_policy: guard all-or-none; histogram markers
  (ECharts markLine on S04, SVG lines on S09) + text line with Fact title (policy, locator, digest).
  VaR/CVaR labelled "VaR/CVaR 95% loss" (signed loss fraction, loss = -return, negative allowed);
  drawn at return = -loss. Non-AVAILABLE Fact = "not published . <served reason>", no marker.
  Legacy body keeps "mean . median . VaR - not published".
- drawdown_episodes[].label / .regime: served label shown; regime = typed absence with the served reason code once per card.
- windows.{is,oos,holdout}.start_ms/end_ms/source_locator/bounds_semantics: guard all-or-none, half-open;
  S09 SVG bands (role tokens) + legend; S04 markArea on the strategy-vs-benchmark chart. NOT_APPLICABLE
  windows skipped; non-AVAILABLE window title says no payload is claimed. No IS/holdout data drawn.
- Hub hero: the amendment-aware supplement is the same `enriched_analysis` field the hero already reads; no separate field exists in the generated types.
Not touched: rolling charts, analyticsV2.tsx, ReportDetail.tsx (no change needed).
Test: src/research/enrichedCharts.b9.test.tsx (typed builder on canonical healthy fixture).
Pre-existing/other-group failure: compareDetail.test.tsx S13-U31 (Compare fixture), untouched here.
