# EST_S02 — Screen 02 binds the declaration-estimate route and the temporal Atlas profile

Base `eae8a7b5` (verified: `dataDeclarationV2.ts`, `newRun.qa02.test.tsx` present; `00bf0762` is an ancestor).
Contract read: `B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md` (Claude handoff), generated `DeclarationEstimate`,
`researchDeclarationEstimatePostV1`, Atlas profile additions, canonical fixtures
`research-declaration-estimate.v1.{available,partial}`, `research-foundation.portal-admission-temporal`.

## Items

| # | Item | Status | Where / tests |
|---|---|---|---|
| 1 | Types + client for `POST /api/v1/research/datasets/declaration-estimates` | DONE | `DeclarationEstimate` typed from the generated contract (`dataDeclarationV2.ts`); `postDeclarationEstimate` (`datasetClient.ts`): same-origin, `x-portal-csrf` from the cookie. Tests: `postDeclarationEstimate` block (7) |
| 1 | Debounce, abort, never before the minimum declaration | DONE | `useDeclarationEstimate.ts`, `estimateReady` / `estimateSignature` (`runDraft.ts`). Asks only with dataset, symbol, timeframe, release identity, mode+schedule and complete valid windows; keyed on the window/mode/schedule parts only (trials, seed do not re-ask). Tests: `useDeclarationEstimate` block (7) |
| 1 | Per-window bars + warmup from the estimate; bar-metadata kept as fallback | DONE | `readDeclarationEstimate` maps IS/OOS/HOLDOUT/SPAN to the form's windows; `NewRunRoute` enables `useWindowMetadata` only while the estimate is idle / absent / failed. Route tests: estimate path makes no bar-metadata GET; 404 route falls back and prints metadata bars |
| 1 | "≈ N folds · basis" from the served plan | DONE | `PlannedFolds`: count, served basis (readable, exact code in tooltip), min train / min OOS in tooltip; partial = "folds — not published · <code>" |
| 1 | Conditions checklist from the served conditions | DONE (existing `ConditionsChecklist` kept) | ✓ / ✗ / not published, observed vs required in the tooltip, served reason code; header tooltip says "preflight decides whether a run may be created" and carries `ready_for_preflight`. `run_admission` untouched: a ready estimate leaves Create disabled (test) |
| 2 | Typed 400 at the offending field | DONE | `EstimateFieldRefusal` under the window / analysis fields (`windows.<is|oos|holdout>`, `walk_forward`), control marked invalid, strip carries `estimate refused · CODE · path`, step pill marked via `stepForFieldPath`. Real 400 verified: `WINDOW_BOUND_NOT_ALIGNED`, `details.field_paths=[["walk_forward","start"]]`, gate `window_alignment` |
| 2 | 4xx / 5xx / network distinct with Retry | DONE | `EstimateStatusLine`: "request refused", "server unavailable", "no answer", each with Retry; never "not published". Server `message` is not printed (FG-08); code, status, request id are. Route test: 503 then Retry recovers |
| 3 | Profile choice by `requested_spec_versions` | DONE | `selectProfile(..., specVersion)`, `profileFamily`; v1 draft = `p10...wfo.v1`, v2 draft = `p10...wfo.v2`; no version = still ambiguous (null). `usesSpecV2` also true when the reader picked a value only the v2 profile admits (`walkForward.declaredV2`, additive draft field, round-trips from a copied v2 spec) |
| 3 | Frequency / window mode from `frequencies` / `window_modes` | DONE | `profileOptions`: not admitted by the selected profile = disabled with the profile as reason; admitted only by the family's v2 profile = selectable, marked `· v2`, tooltip names the profile; choosing it declares the draft v2. Pins no longer disable the select when a second profile exists |
| 3 | Temporal controls only when a profile admits them | DONE | rolling width, label horizon / purge / embargo shown when the selected profile, or the v2 profile a declaration of them would select, admits v2; absent when no profile does; with no profile served the release's options stand (nothing hidden on a guess) |
| 3 | `inner_validation` not admitted | DONE | per_fold_causal schedule option disabled with the served word + profile as its tooltip; if the draft already holds it the inner-folds block is a locked line "inner folds — not admitted · NOT_ADMITTED_GLOBAL_RETENTION_ONLY" |
| 4 | `seed_policy` | DONE | contract serves `LOCKED` (value = `random_seed`) or `FORBIDDEN`; `LOCKED` = read-only "pinned by <profile>", `FORBIDDEN` = empty field read-only "not admitted · <profile>", a value already there stays editable and is noted. No policy served = free (the old `random_seed: null` guess is gone). The earlier proposed object form `{state,value}` is still read |
| 4 | `trial_default` | DONE | `profileTrialDefault`: served `trial_default`, else the min=max pin, else nothing. Route fix: a default the form placed now follows the profile when the protocol / spec version changes (it stuck at 1 from the three-window profile, so the real estimate returned `trials FAIL PROFILE_TRIAL_COUNT_NOT_ADMITTED`); a typed value is never replaced |
| 4 | `early_stopping_policy` | DONE | `FORBIDDEN` = empty field read-only "not admitted"; a value present is noted; no policy = free. Only FORBIDDEN exists in the contract: "pin" has no served shape |
| 5 | Tests | DONE | `declarationEstimate.test.tsx` 48 tests: canonical available/partial/temporal fixtures, refusal codes, retry, profile by spec version, policies, route integration |
| 6 | Differences vs my proposed fixture | DONE | below |
| — | B1 inventory rows for S02 | SKIPPED | not in this batch; nothing from the "Fix" column applied here |
| — | Library `enriched_analysis_availability` | NOT TOUCHED | Run Library is outside this group |

## Differences: proposed `preflight_estimate` vs canonical `DeclarationEstimate`

| Topic | My proposal | Canonical |
|---|---|---|
| Delivery | block inside the preflight / dry-run answer | its own `POST .../datasets/declaration-estimates`, no token, no run authorization |
| Windows | object `{is,oos,holdout}` | array of `{window: IS|OOS|HOLDOUT|SPAN, availability, reason_code, start/end_exclusive_utc_ms, bars, first/last_bar, warmup_*}`; the advanced span is `SPAN` |
| Warmup | one top-level block `{bars_required, bars_available_before_is}` | per window `warmup_bars_required` / `warmup_bars_available_before_start`; the form takes the first window's |
| Folds | `{count, basis:"weekly expanding", min_bars_per_fold}` | `{availability, reason_code, count, basis: constant "P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1", min_train_bars, min_oos_bars}` |
| Conditions | free keys (`bars_sufficient`, ...) | same row shape; `required` is mandatory; real keys (19 on the preview: `fold_plan`, `trials`, `seed`, `warmup`, ...) |
| Extras | `origin`, `profiles[]` | `profile_id`, `ready_for_preflight`, `earliest_start_utc_ms/basis`, `requested_spec_digest`, `scope`; profiles stay in the Atlas |
| Seed / trials / early stop | `seed_policy {state,value}`, `trial_range.default` | `seed_policy` word `LOCKED|FORBIDDEN` + `random_seed`; `trial_default`; `early_stopping_policy` `FORBIDDEN` only |
| 400 | n/a | `details.field_paths` (array of paths) on the real answer; the generated type also allows `field_path` |

`readPreflightEstimate` (the proposed shape) is kept as a harmless reader; the canonical estimate wins in the merge and the proposed fixture reads as no estimate in `readDeclarationEstimate`.

## Real preview (claude-preview, BTCUSDT 1h, advanced, 2026-06-01 .. 2026-07-15, first OOS 2026-07-01)

- POST declaration-estimates answered 200: SPAN 1,056 bars (first 2026-06-01T00:00Z, last 2026-07-14T23:00Z), warmup 300 required / 300 available, folds 2 (min train 720, min OOS 168), 19 conditions, all PASS once trials = 3 (before the default fix: `trials FAIL PROFILE_TRIAL_COUNT_NOT_ADMITTED`).
- Unaligned start `2026-06-01T00:30`: 400 `WINDOW_BOUND_NOT_ALIGNED`, `field_paths [["walk_forward","start"]]`, request id echoed; the form shows the code under Analysis start.
- Atlas on the preview already serves `trial_default`, `seed_policy`, `early_stopping_policy`, `requested_spec_versions`, `frequencies`, `window_modes`, `inner_validation` for the three profiles.
- How: Vite dev server (untracked config, proxy adds the preview's public Origin header), session by the preview login, same-origin POST with the CSRF cookie. No run created.
- Screenshots (outside git): `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/est/s02shots/` `est-served-{1440,660}.png`, `est-refused-{1440,660}.png`, `est-optimization-{1440,660}.png`. No overlap and no horizontal overflow at either width (measured).

## Words

Added on screen only when the call is not idle or served: `estimating…`; `estimate refused · <code> · <path>`; `estimate — request refused / server unavailable / no answer` (+ status, code) with `Retry`; `· v2` on an option only the v2 profile admits; `inner folds — not admitted · <code>`; `not admitted · <profile>` hint on a forbidden seed / early stopping. The fold line loses the raw constant (`P08_PLANNER_ON_INDEXED_TIMESTAMPS_V1` becomes `p08 planner on indexed timestamps v1`, exact code in the tooltip). Everything else (conditions, tooltips) is served text.

## Backend requests / questions for Codex

1. **Spec version vs profile**: the form declares `requested-spec.v2` when the reader picks `monthly` / `quarterly` (only the v2 profile lists them) even with no other v2 field. Confirm the server picks the profile by `schema_version` and admits a v2 spec with only a monthly frequency. FE does this on the served lists, not on a rule it invented.
2. **Estimate input**: the form asks only once mode and schedule are declared (the request carries the full requested spec). If the route only needs data + windows, say so and the form will ask earlier (no FE change otherwise).
3. **Three-window**: verified on the real route only for the advanced SPAN. IS / OOS / HOLDOUT is covered by a fixture derived from the canonical one (one field changed), not by a real answer.
4. **`early_stopping_policy`** has a single value (`FORBIDDEN`); a way to publish a pinned or free value (`LOCKED`-style) would let the form pin it. FE reads only what is served.
5. `ready_for_preflight` is shown only in the Conditions tooltip; if it should gate anything visible, that is a product decision (the preflight's `run_admission` stays the authority).

## Shared files touched (additive)

None of the shared modules named in the rules. Touched in-group: `dataDeclarationV2.ts`, `datasetClient.ts`, `EstimateParts.tsx`, `NewRun.tsx`, `NewRunRoute.tsx`, `runDraft.ts` (`declaredV2`, `estimateReady`, `estimateSignature`). New: `useDeclarationEstimate.ts`, `EstimateStatus.tsx`, `declarationEstimate.test.tsx`. `useWindowMetadata.ts` and `PreflightPanel.tsx` unchanged.
