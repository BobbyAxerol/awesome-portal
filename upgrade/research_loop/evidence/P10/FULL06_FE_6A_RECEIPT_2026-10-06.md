# FULL-06 6a — frontend receipt (percent-equity), 2026-10-06

Owner Bobby; UI Claude; backend `ee3663d2` (Codex). State: `READY_FOR_BOBBY_REVIEW`, not `OWNER_ACCEPTED`. Nothing pushed.

## What the screen does now

- Delta **1.0.1** serves 9 notional recipes, **1.0.2** serves 9 percent-equity recipes (never mixed). A new run starts on the newest ACTIVE version; the draft follows the
  version to its route (the recipe pick switches `execution_route`; the route step already admits `pct_equity`).
- The recipe card and the Walk-forward/Review panels say what the account is, exactly as `profile.account` serves it: **10% of live equity on each signal change · leverage 3× ·
  starting capital 20,000 · fee 0.05% per side · slippage 0 · funding off** — a fraction of equity, never currency units; a profile with no account prints nothing.
- Replay (S08): cost chart draws no zero-height "no fee" columns when no bar carries a fee (typed line `per-bar fee not published for this route`); a missing signal phase / fill policy
  prints "not published" instead of assuming "bar close" / "close". The percent-equity run itself reads `model observations only — no orders, fills or candles` with the source tokens
  `contract unknown · signal unspecified · fill unspecified`, unchanged.

## Real preview evidence (shared preview, backend-enabled by Codex)

- Setup 1.0.2 @1h: 9 enabled percent-equity profiles; UI offers 9 cards; all of them reach preflight (`may_create_run: true`, sampled Three-Window-optimized and Mode 3).
- **Two runs were created on the shared preview, with Bobby's approval (disclosed writes):**
  `rrun_b7dd32b0074447a7094941189d3bb84c` — pct_equity WFO temporal, 1 year of 1h bars, monthly folds, 3 trials, COMPLETED in ≈20 s;
  `rrun_8ef6450699569d251993e1a22d2118f8` — notional WFO (1.0.0), 92 days, weekly folds, **100 trials**, COMPLETED in ≈24 s.
  S03–S09 and S11 of both render with no page error; the only non-2xx are the typed `final-audit` 409 and the percent-equity `replay/transitions` 503.
- Trial range finding: every FULL-02…06 recipe is fixed at 3 trials (Mode 3: 5); only the older 1.0.0 WFO allows 2–400. Requested of Codex in §39.

## Not done / open

- Browser baselines for the percent-equity cards are not recorded (cells use the fixture lane, which has no percent-equity setup).
- 6b–6f routes are not delivered; S02 will render them from the served profiles when they land (inputs beyond sizing — ladders, tapes, legs — need their own form blocks).

## New Run UX audit (all eight steps, 1280 and 660, real preview API) — 2026-10-06

Walked Context → Review for Delta 1.0.2 and 1.0.1 and fixed what was unclear or wrong:

- **Suggestion lost on first entry (real defect):** the first suggestion was aborted when the Walk-forward step mounted and never asked again (windows stayed empty, Review said "IS start is required"
  ×6). A cancelled ask now asks again.
- **One control, not three:** with recipes on offer the Three-Window/Advanced toggle is gone and mode × schedule sit in a folded "Customize mode and schedule · mode × schedule" line; the recipe card is the choice.
- **Route follows the version, and says so:** "This version runs the pct equity route only: picking a recipe sets it" (the Route step precedes Market data, where the setup is first readable).
- **Reasons in words:** "this version cannot run it — pick a newer version", "not opened yet", "timeframe not admitted yet", … with the typed code in the tooltip.
- **Several trial ranges for one recipe** (Codex's in-progress 2–400 rows beside the 3-trial qualification): one card, the widest range; profile selection prefers the widest.
- **Labels:** no more "Decay robustness · Decay robustness"; colliding names end in the schedule ("· global", "· per-fold decay").
- Three Window no longer prints "≈ 1 fold" (it has no outer folds); the "recommended" tag no longer wraps at 660.
- Imported alphas are offered their own recipes (FULL-05); the old "Advanced is not runnable" expectation was retired.

Open: version → route is only discoverable after Market data (setup needs dataset, symbol, timeframe); an early `setup-options` for the version's declared defaults would let the Route step say it sooner.
