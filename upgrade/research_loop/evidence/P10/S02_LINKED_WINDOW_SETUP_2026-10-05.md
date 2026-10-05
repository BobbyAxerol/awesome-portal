# S02 linked-window setup — backend receipt and Claude handoff

Date: 2026-10-05. Owner: Bobby; backend: Codex; UI: Claude.
Baseline: `3ddf65f53455dd2b9c93e9bf4b011a059f913177`.
State: `BACKEND_CONTRACT_TESTED / FRONTEND_INTEGRATION_PENDING`.
One approved S02 refinement, not a new campaign or executor qualification.

## 1. Delivered backend surface

Canonical contract: `packages/contracts/openapi/research-run-setup.openapi.json`.
Generated client: `packages/contracts/generated/research-run-setup.d.ts`.
Regenerate with `npm run generate:research-run-setup` in `packages/contracts`;
the normal full generate also includes this target.

| Operation | Named same-origin path | Purpose |
|---|---|---|
| `researchRunSetupOptionsGetV1` | `GET /api/v1/research/runs/setup-options` | Actor/workspace + immutable AlphaVersion + dataset/symbol/timeframe-bound current executor facts. |
| `researchRunWindowSuggestionPostV1` | `POST /api/v1/research/runs/window-suggestions` | Explicit editable indexed-bar hint, not a job/preflight/admission grant. Same-origin + CSRF required. |
| Existing `researchDeclarationEstimatePostV1` | `POST /api/v1/research/datasets/declaration-estimates` | After applying/editing the hint: actual P08/engine fold geometry and typed configuration conditions. |

Use generated `components["schemas"]["SetupOptions"]`, `Profile`,
`SuggestionRequest`, `WindowSuggestion`; don't hand-parse messages or profile IDs.
The existing declaration client now publishes optional
`metadata.planned_folds.items`: ordinal + actual `train`/`outer_oos`
start/end UTC milliseconds and indexed bar counts. Missing geometry stays
missing; do not synthesize it from frequency/count or invent an independent
Advanced holdout. Existing response schemas/operations remain compatible.

Setup query requires `alpha_id`, `alpha_version_id`, `dataset_id`, `symbol`,
`timeframe`; `workspace_id` is optional but always explicit in the response.
Example context for this preview:

```json
{
  "workspace_id": "ws_06GCVTHWC9WVPGEPR85AB15K82",
  "alpha_id": "delta-rsi-polynomial-alpha",
  "alpha_version_id": "av_delta_rsi_polynomial_alpha_1_0_0",
  "dataset_id": "crypto-binance-1m",
  "symbol": "BTCUSDT",
  "timeframe": "1h"
}
```

POST that same context plus a selected **enabled** `profile_id` and the exact
`options_revision` from `SetupOptions.source_revision`. Omit both range bounds
for a bounded automatic suggestion, or supply both `start_utc_ms` and
`end_exclusive_utc_ms` to keep the chosen range unchanged. Never submit only
one edge. Advanced preferences: `frequency`, `window_mode`, optional
`initial_train_bars`; `train_window` is required only for rolling and forbidden
for expanding. Causal inner configuration is a separate required part of the
requested-spec v2; this hint does not fabricate inner-validation settings.

## 2. Authority, limits and compatibility

- Engine Atlas remains the engine catalogue, not the list of runnable Portal
  workloads. Setup options reuse the existing caller/version precheck,
  environment profiles and installed adapter binding. State/typed reason are
  specific to the chosen Alpha/dataset/timeframe; unknown/unsupported remains
  disabled. No profile/flag/engine/source capability is widened.
- Imported Alpha gets its own Three Window, requested-spec v1, one-trial,
  declared-pins recipe; Delta WFO stays disabled for that Alpha. Seed policy
  is REQUIRED/OPTIONAL according to its immutable declaration, not Delta's42.
  `allowed_pin_names` is typed; advanced Delta admits only the existing
  qualified `rvol`/`slpercent` axis pins. Fixed Delta admits no overrides.
- The estimator now uses that same bound setup view rather than selecting a
  global fixed Delta profile for imported pins. It reuses the imported
  executor's exact configuration predicate. It performs one version lookup,
  not two DB lookups. The metadata/catalogue calls remain read-only and
  bounded; the existing index/catalogue/estimate cache remains in use.
- V1 guard policy is **absent**; v2 may adopt the published release defaults
  explicitly. `ZERO_APPLIES_NO_TEMPORAL_GUARD` prevents a zero default from
  being presented as a protective purge/embargo. Never require v2 guards just
  because some other enabled profile supports v2. Do not upgrade a clone's
  requested-spec version silently.
- Fixed has a separate Holdout; Advanced has none. `independent_holdout`
  communicates that protocol fact, not whether a sealed holdout was evaluated.
- Profile, seed, trial/fold/range, inner constraints and requested-spec versions
  come from current Portal profiles, not the broader engine ceilings. Temporal
  admission copy now says engine-planned outer folds rather than incorrectly
  calling every v2 fold weekly/expanding.
- Both new reads return `private, no-store`. `source_revision` binds context,
  profile/caller state and catalogue revision. A changed snapshot returns409;
  the private reply is checked against dataset/symbol/timeframe, warmup,
  protocol, index revision, explicit range and Advanced preferences. A dataset's
  global timeframe listing does not enable a symbol lacking indexed coverage.
  Fresh final P08/P10 admission remains mandatory.

## 3. Suggestion semantics and bounded cost

Suggestions are `EDITABLE_HEURISTIC_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION`:
70/20/10 **observed bar rank** for Three Window, half initial IS for Advanced
unless `initial_train_bars` is explicitly given. Neither is claimed optimal.

- Three Window uses four edges A/B/C/D. B is both IS end/OOS start; C is both
  OOS end/Holdout start. All are half-open UTC millisecond boundaries.
- Automatic span: latest verified observed range, capped at60 days and any
  narrower executor cap; start must leave the declared indexed warmup.
  A manually chosen range is never silently changed/clamped; out-of-range,
  misaligned, insufficient-bar/warmup and >profile-span cases return typed
  NOT_PUBLISHED with no patch.
- Metadata index is source-pin/hash verified. Compressed-run rank/select is
  O(index runs), not O(all bars); the 100,000-bar planner budget remains.
  No HMD scan, frame/price load, child, optimizer, artifact write or DB mutation.
- VN unit proof uses actual observed source-local date labels/predecessors,
  not synthetic weekend/session bars. This does **not** qualify or enable the
  currently disabled VN execution profile or claim an exchange calendar.
- Advanced suggestions provide only a proposed range/first-OOS/preferences.
  Apply to a valid draft and call the existing declaration estimator to obtain
  actual fold items and conditions; a suggestion alone never proves2–16folds.

## 4. Tests and real-index proof

- Control API focused options/index/conditions/admission suites: **95/95 PASS**
  in six affected suites; positive controller hint, actor/workspace/CSRF,
  obsolete revision, symbol coverage and private response fences included.
- Python suggestion/declaration/observed-index suites: **79/79 PASS**, pinned
  QuantBT1.1.1 runtime image with readonly source and tmpfs test dependencies.
- Generated contract suites: **16/16 PASS**. Control API final TypeScript build:
  **PASS**. The affected Python fold-geometry test was retaken **7/7 PASS**,
  comparing every published edge/count to the existing P08 planner.
- Normal grouped commit verification includes the live route ledger/protected
  kernel, capability inventory and regenerated contract digest. No duplicate
  unchanged P23 load/DR or full product browser campaign in this backend slice.
- Build emits into owned temporary output because the lane's existing `dist`
  is not writable; no ownership/runtime/source change to work around it.
- Reproduction script:
  `scripts/research-loop-v11/s02-window-setup-proof.py`. It expects `/data`
  readonly, existing artifact index at `/artifacts/runs/durable-store/` and
  current source registry at `/portal-src/registry`.
- Actual proof used image
  `sha256:c8696d89ea998ddfc966d3e439aa5e6c809f3654793a2e18d021ef93f95aed6e`,
  existing index revision
  `f071401914c2734171308903cd6390422ac53a99a38dd3f89a8f52699a9a1374`,
  verified against the installed approved HMD reader's source manifest pin.
  Index as-of: `2026-10-01T23:04:54.892Z`, not relabelled as today's freshness.
- BTCUSDT1h automatic range: `2026-08-02T23:00:00Z` →
  `2026-10-01T23:00:00Z`, 1,440 indexed bars and300 preceding warmup bars.
  Three Window: IS1,008 / OOS288 / Holdout144; shared boundaries September13
  23:00 and September25 23:00 UTC.
- Advanced first OOS September1 23:00 UTC; the existing planner publishes
  **5 actual outer folds**, minimum train720 / OOS48 bars, full fold geometry.
  The combined hint/planner operation measured20.683ms in this isolated
  sample (not a production latency/SLO claim).
- This is **REAL_SOURCE_PINNED_INDEX_AND_PLANNER_PROOF**, not a new product run
  or product API/browser acceptance. No jobs, sessions, preflight tokens or
  source writes were created. Early proof setup attempts used a non-owner UID
  and incorrect index mount path; corrected without changing source permissions.

## 5. Claude task — same branch, preserve HiFi/design

Read Unified's S02 addendum, this packet, P08/P10 handoffs/addenda, spec02,
its HiFi HTML and current S02 consumer before editing. Work on the shared
Research branch/lane discipline, not dev/main; do not edit backend contracts,
profiles, flags, visual baselines or unrelated screens to make the form pass.

1. Consume setup options whenever Alpha/version/workspace/dataset/symbol/
   timeframe changes. Fence obsolete responses by exact context/revision;
   keep the engine catalogue visible separately but don't offer unsupported
   options as runnable. Typed disabled reasons stay available to explain why.
2. Three Window: one range/calendar + linked A/B/C/D, atomic B/C edits;
   preserve precise inputs and keyboard interaction. Suggest/Apply/Reset never
   overwrite edited/clone bounds silently. No generic envelope replacing HiFi.
3. Advanced: first-IS/OOS preference + expanding/rolling width; draw folds
   from `planned_folds.items`, not a JS calendar; handle missing geometry and
   engine refusal honestly. No independent holdout or invented causal inner plan.
4. Fix global guard requirement: a cloned v1 R-WFO-031 must remain valid without
   any v2 guard fields. On an explicit v2 choice show/adopt actual zero defaults
   with the published zero semantics; keep user-entered values and field units.
5. Stop whole-coverage auto-prefill from overriding the profile-aware suggestion.
   Keep existing450ms debounce/abort and request-signature fencing; don't call
   suggestions/preflight/run-create for every drag pixel. No preflight on mount.
6. Optionally use existing clone `?from=rrun_b5734ffe0782a3aceab1f9068c25a60e`
   for “last successful setup”; always invalidate/recreate the preflight token.

Exit gate: typed unit/fixture mappings; verify HIFI + actual product at1280/660,
keyboard/UTC/exclusive-boundary and context changes; inspect console/network,
bounded request counts, no implicit jobs. Three Window and Advanced edit/apply,
imported pins-only/disabled WFO, unsupported timeframe, missing/stale index and
v1 clone paths must render truthfully. Record product API/browser receipts after
an exact preview rebuild; fixture screenshots alone do not close this slice.

## 6. Deployment and cleanup

Backend source is prepared for landing on `docs/research-loop-plan`; no remote
push, dev/main merge, production changes or release manifest in this slice.
Existing preview remains on its previous image; **rebuild both Portal API and
Control API with the new source when Claude integrates the frontend**. Do not
hot-copy source into a release/runtime container or pretend new endpoints are
already deployed. No migration or new datastore/service is needed.

All test/proof containers used `--rm`, bounded CPU/RAM/tmpfs and readonly
mounts; dependency files die with tmpfs. Preserve existing images, volumes,
index, artifacts and evidence. Owned temporary TypeScript output is test-only;
no broad image/volume/cache prune. Resource verdict: `NO_RUNTIME_CLEANUP_NEEDED`.
