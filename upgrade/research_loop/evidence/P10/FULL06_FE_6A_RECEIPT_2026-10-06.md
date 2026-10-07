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

## Expansion consumer (Codex `f33a0887`) — frontend, 2026-10-07

Read: `FULL_06_APPROVED_EXPANSION_2026-10-06.md` (frontend handoff), `EXPANDED_TRIAL_PRODUCT_QUALIFICATION`, `NATIVE_ROUTE_PRODUCT_QUALIFICATION`. Verified on the preview API (backend images as activated by Codex, web = frontend lane via Vite).

- **Trials 2–400 are the recipe's own range** (Mode 3 from 5, native fixed 1). The recipe card says it; `trialBudgetProblem` checks the count against the range and, for per-fold schedules, count × engine-planned folds against `max_total_trials` before any preflight ("400 trials × 17 folds = 6800; this recipe admits 6400 in total"). Caps are shown as admitted caps, not an estimate.
- **Run types (route-aware version choice).** One Alpha now carries 12 ACTIVE versions: notional (1.0.1, legacy 1.0.0), percent equity (1.0.2), native bracket / reactive / event-driven (1.0.9 / 1.0.10 / 1.0.11) and six candidate editions with nothing enabled. The registry does not name them and "the newest ACTIVE" is a native edition, so the start is the version declaring the most timeframes (earliest: the notional edition) and the Walk-forward step reads each ACTIVE sibling's setup for the same dataset/symbol/timeframe (one cached GET each, ~350 KB, only while that step is open) to offer a **Run type** row: Notional · 1.0.1, Notional · 1.0.0, Percent equity, Bracket, Reactive, Event-driven. A version with nothing to run for this context is not offered. Picking one switches the version and restarts mode/schedule/trials.
- **Native recipes.** `native_input` is server-owned: the card and the Walk-forward/Review panels say "stop 1.3% · take-profit 2.6%", the clock in words ("known close, executes next bar intrabar" / "at the next bar close"), the fixed 2,000 notional, capital/leverage/fee/funding and "fixed Delta input, one execution — not a scalar optimizer". No browser-supplied tape or Python fields.
- **Two real defects found by sending native preflights:** (1) the Atlas catalogue still says a native route is not baseline-admitted, which blocked the exact qualified recipe on screen; a route the setup serves an ENABLED recipe for is no longer blocked by the catalogue; (2) the native fixed windows refuse a zone-less instant ("requires closed UTC 1h edges"): what is sent (preflight, estimate, create) now says `…T00:00:00Z`; the draft keeps its typed form.
- **Preflight (no run created):** Delta 1.0.9 / 1.0.10 / 1.0.11 native recipes and every sampled 1.0.1 / 1.0.2 recipe return `may_create_run: true` through the UI.
- **Run screens (agent-built, unit-tested):** S04 "Native execution" panel (route, clock, authority, position unit, fees/funding as typed facts, counts, replay authority; nothing for non-native runs), S08 wording "OOS equity sample from the engine — not a broker lifecycle replay", S06 null-objective/pruned trials never drawn as numbers, sampled-chart caption names the served point limit. **Not verified on a real native run:** the S08 route-id trigger and the live hub field — a native run on the shared preview is needed.
- **Open for the backend (§41):** a per-version route/edition summary on the registry row would replace the 11 sibling GETs; Atlas should publish native routes as admitted-by-recipe so the catalogue and setup agree; S03 Progress carries no native fact.

## BR-S02-06/09 consumed — frontend, 2026-10-07

Read: `S02_VERSION_RECIPE_REFINEMENT_2026-10-07.md`, `research-run-version-options.scalar.valid.json`, `research-run-setup-options.presented.valid.json`, generated `research-run-setup.d.ts` (OpenAPI 1.1.0).

- **BR-S02-06 `version-options`** (`getVersionOptions`, `useVersionOptions`): read as soon as an Alpha is chosen, before any dataset: one small GET per ACTIVE version (workspace + Alpha + version only), cached 60 s, aborted on context change. The version list names what each version binds ("Notional", "Bracket", "no open route"); Run type chips are built from the COMPATIBLE routes for the chosen timeframe. This replaces the 11 sibling `setup-options` GETs (~350 KB each). An older server without the route (404/405/501) is remembered absent and the previous per-version setup probe runs instead. "COMPATIBLE" never enables Run: dataset-bound setup and a fresh preflight stay the authority.
- **BR-S02-09 `Profile.recipe`**: key / family / label / `recommended_rank` mapped to `ProfilePins.recipe`. Recipe cards use the served label and display order when every enabled profile carries one, and the served key as the group key; two served labels that read alike (same mode and schedule under Three Window and Walk-forward) are told apart by the protocol. No recipe field (old server) = the previous derived label/order. Rank is display order, never optimality.
- Tests: `versionOptions.full06.test.tsx` (37 with the shared S02 fixtures), FG-05 tests now separate the publication lookup from the binding read; `src/research` 3840/3840, tsc clean.
- **Not yet verified on the running preview**: it still serves `5e85493` (no `version-options` route), where the browser logs a 404 per page load and the e2e console check fails by design. A coordinated rebuild is the next step.

## Real native runs on the preview — 2026-10-07 (Bobby approved: "Bạn làm ngay nhé")

Preview rebuilt from `bf31b377` (running image IDs = built tags for control-api, portal-api, portal-web; `version-options` answers 401 unauthenticated, not 404). S02 e2e on real API **20/20** (the imported-alpha case now picks the served "· Walk-forward" label). Three runs created through the UI (Run type → native recipe → preflight → Create), BTCUSDT 1h crypto-binance-1m, windows from Suggest (IS 2026-08-03 → OOS 2026-09-14 → holdout 2026-09-26 → 2026-10-01):

| Route | Run | Status | fills / orders / fees (hub `native_execution`) |
|---|---|---|---|
| Bracket · av 1.0.9 | `rrun_ea0e06b9d56e08757c40d54746982098` | COMPLETED | 0 / null / "0" |
| Reactive · av 1.0.10 | `rrun_a7c3c23ff88df9f133061d0586c550d9` | COMPLETED | 22 / null / "22.338955495865164" |
| Event-driven · av 1.0.11 | `rrun_e21e324c6ba49393ce82c3603ddc139a` | COMPLETED | 22 / 22 / "22.338955495865164" |

- S03–S09, S11 opened for each run: **no console error, no failed request**. S04 shows the "Native execution" panel with the served values exactly (a served `"0"` is printed as 0; `orders_count: null` says "not published"); S08 states route, "retrospective equity only", "OOS equity sample from the engine — not a broker lifecycle replay" and the sampling caption (17 of 288 points, extrema kept); the clock reads "next bar intrabar" for Bracket and "next-bar close" for Reactive / Event-driven.
- **Defect found and fixed in the frontend:** the Parameters step and the Review row still said "8 swept" for a native fixed recipe. They now say "declared · not swept", the table is read-only (`inert`) with a one-line note; the server refuses overrides on native fixed requests, so editing could only produce a refusal.
- **Backend finding (BR-S02-17):** the Bracket run has `fills_count 0`, fees "0" and a flat 20,000 equity sample, yet S04's trade count says 1 (child tape). A trade with no fill is a contradiction between two served facts; the UI prints both as served. Reactive / Event-driven are consistent (22 fills).
- Not checked: S06 pruned/6400 paging (a native run has 1 trial), visual baselines (not recorded in this change), the P24 15-screen matrix on the new bundle.
