# S02 native truth repair — BR-S02-14…17

Scope: Bobby requested implementation, not another read-only handoff. Backend
repair on `codex/be-gaps`, landing on `docs/research-loop-plan`; no remote push,
dev/main, production operation, profile opening or immutable seal rewrite.
Claude's Parameters/Review fix `6b3f6a2d` is already in the base and preview.
Delivery commit: the commit containing this receipt (`git log -1 -- this path`).

## Delivered contracts and behavior

| ID | Delivered behavior | Generated type / real example |
|---|---|---|
| BR-S02-13 | Already delivered by version-options + Profile.recipe, consumed by Claude. Not implemented twice. | Existing `VersionOptions`, `RecipePresentation`; retained commits `bf31b377`, `6b3f6a2d`. |
| BR-S02-14 | Public Atlas routes disclose current ENABLED recipe IDs from the same admission table. Original pinned engine axes/bytes are unchanged and explicitly labelled as catalogue, not runtime admission. Presentation revision v3 invalidates old ETags. Exact actor/Alpha/dataset setup and fresh preflight remain authoritative. | `research-foundation.d.ts` → `components.schemas.AtlasRoute`: `recipes_enabled`, `axes_scope: PINNED_ENGINE_CATALOGUE_NOT_RUNTIME_ADMISSION`. Real Atlas GET 200 and revalidation 304. |
| BR-S02-15 | Both TS admission and Python native validator interpret absent timezone as UTC and offsets as equivalent UTC instants. Preserve input bytes/digests. Enforce hourly alignment, contiguous half-open IS/OOS/Holdout and the existing 92-day cap. Reject non-zero fractions before Date/datetime truncate sub-millisecond/microsecond precision. | Existing requested-spec contract, no new profile or executor. Tests cover Z, absent zone, +00:00, equivalent offset, sub-hour/fractional edges and gaps. The browser already sends Z. This is validator regression evidence, not a new product-run claim. |
| BR-S02-16 | Progress includes optional exact `native_execution` from the persisted source sidecar. Existing scoped REPEATABLE READ transaction joins workspace, run, current worker, source sequence and source digest; no engine/HMD/extra unbounded query. Wrong route/clock yields typed conflict; before source publication the property remains absent. | `research-progress.d.ts` → `components.schemas.ProgressRead.native_execution`. On all three real runs it equals `EvidenceHub.core.native_execution` exactly. |
| BR-S02-17 | Native TRADE_COUNT retains the engine integer but is labelled **Position regimes (engine)**, with `count_semantics: POSITION_REGIMES_INCLUDING_INITIAL_STATE_NOT_EXECUTIONS` and definition `research.metric.v1.native_position_regime_count`. Fills/orders/costs retain their own native journal facts and CHILD_TAPE scope; no subtraction or fill/round-trip equivalence. Non-native labels and source/seal/report bytes are unchanged. | `research-evidence.d.ts` → `components.schemas.Metric.count_semantics`; real Bracket: counter `"1"`, fills `0`, orders `null`, fees `"0"`. The S04 product tile renders the server's new label at 1280/660 without a frontend source edit. |

QuantBT 1.1.1 `quantbt/metrics/performance.py:_array_number_of_trades` counts one
initial position regime per column, then position changes. Thus an all-zero
tape yields 1; Reactive/Event-driven here yield counter 23 for 22 fills. The
former UI label was misleading; the engine's receipt is not repaired/replaced
with a manufactured zero. Existing immutable Reports retain their old facts;
this change is a current public Hub representation, not a historical reseal.

## Targeted gates and real preview receipt

- Control API focused: **52/52** across Atlas, native admission, Progress
  repository/public projection and Evidence semantics.
- Contract focused: **21/21**, including Progress/Hub native schema parity,
  exact zero versus missing cost, wrong clock/protocol and legacy fixtures.
- Python native chronology: **4/4** parametrized test cases; equivalence,
  invalid precision/gaps and no input rewrite.
- Production Control API compilation and preview image builds: PASS.
- Do not confuse the source build with `npm run typecheck` over every old test
  fixture: that exploratory command reports errors in test fixtures outside
  this additive repair and is **not** recorded as PASS. A comparison on the
  unchanged clean base `6b3f6a2d` is retained separately in the private log;
  this repair does not silently amend unrelated test fixtures or UI contracts.
- Existing generator `--check`, regenerated types/snapshot, diff check and
  protected strategy hash: PASS. One normal grouped commit hook is required;
  no `--no-verify` and no repeated independent full suites/load/DR/engine run.
- Real preview: three existing COMPLETED native runs, S03/S04 at 1280 and
  660 (**12 browser views**), no page/console errors, failed API responses or
  product write requests. Native facts match the two BFFs. Atlas revalidates.
  This is not the full 73-cell visual/product release matrix.

| Real run | Route | Engine regimes | Fills | Orders | Fees, exact string |
|---|---|---:|---:|---:|---|
| `rrun_ea0e06b9d56e08757c40d54746982098` | intrabar_bracket | `"1"` | 0 | not published | `"0"` |
| `rrun_a7c3c23ff88df9f133061d0586c550d9` | reactive | `"23"` | 22 | not published | `"22.338955495865164"` |
| `rrun_e21e324c6ba49393ce82c3603ddc139a` | event_driven | `"23"` | 22 | 22 | `"22.338955495865164"` |

Private evidence root:
`/home/bobby/.local/state/portal-research-p23/s02-native-truth-20261007-XmPAKR/`.
Final actual responses/screenshots and `receipt.json` are under `verified/`.
Receipt SHA-256:
`ede3e5b6962991b71c59db9797cc2b80ad4108c1c640ceb46c532a563b0ba911`.
Runtime source-hash manifest SHA-256:
`21b01fd3ba92460492e106655a2147458867b3034f0fcb94d857432a1dee1642`.
Reusable GET-only harness: `scripts/research-preview/s02-native-truth.mjs`.

Preview images built once from base `6b3f6a2d` plus this recorded runtime delta,
**dirty-source preview evidence**, not a signed/clean release candidate:

| Service | Actual image ID |
|---|---|
| Control API | `sha256:0e1380d6e36c65429a4c731f10cafc5c8cb50beba62727fed964ac00b61f9ea6` |
| Portal API / worker | `sha256:94cb3637cec343de5f50fd90f145c9c028196a80b924b030ec842afb918123ee` |
| Portal web | `sha256:75d6aee2f59c56ed425342c75fb1323f2d4fdf814686b1cb9e13f36819062ce7` |

### Shared preview custody and failed probe attempts

Before replacement, twice verified no active child; the one documented
undispatched historical fixture retained its exact row hashes/zero attempts.
Probe mistakes (DB registration READY versus product COMPLETED; successful
login POST 201 versus 200) were fixed in the harness, not hidden as product
failure or fixed by weakening auth. A global snapshot assertion also detected
concurrent preview growth: **75→84 jobs, 46→55 report manifests**. New job
creation began before this probe's login and before the rollout. No job was
created, cancelled or deleted by this GET-only harness.

Final assertion compares every originally captured job/report row hash while
separately recording global growth; it excludes only jobs created after the
snapshot timestamp and reports belonging to those new jobs. Original custody
remains **75 jobs, 46 reports, 22 current-source seals, 4 RC packs, 2
publications**, all hashes identical; selections stay zero. No claim of
"unchanged global row count" is made, and failed attempt logs are retained.
No further restart was performed once shared preview activity was observed.

### C4 resource closeout

Quiet-window inventory found no runner worker/build/backup/restore. Only unused
BuildKit cache older than 168 hours was pruned: Docker reported **1.31 GB**
reclaimed, recoverable by rebuild. No image/container/volume/business data,
artifact, backup, receipt or source was removed. Disk free before cleanup was
110.15 GB, after cleanup 111.08 GB, after this bounded build 108.46 GB. The
recorded capacity decision allowed one cached build with an 8 GiB incremental
budget and a 100 GB floor; no further pruning during evidence/shared activity.
Existing dependencies/HMD wheel reused. Browser contexts closed; preview stays
up for Bobby. No temporary account, new test volume or borrowed production
credential was created. Hook-owned disposable cells retain normal trap cleanup.
Named existing capacity follow-up: C4_ROOT_FREE_BELOW_20_PERCENT — owner Bobby,
inventory-backed quiet TTL maintenance only, not broad image/volume deletion.

## Claude handoff and P24 boundary

Backend fixes are implemented; Claude is not being asked to repair them.
Regenerate/consume the additive generated fields; use enabled recipe summaries
as discoverability, never dataset-bound permission. Progress now has the
optional native fact; do not infer it before source receipt. Preserve exact
cost absence and use engine position-regime semantics, not a fake zero trade.
Keep the accepted native Parameters fix and all layout/tokens/baselines.

T07's restored-browser receipt and approved **exact-three historical-test
manifest exception** already exist; strict remains 83/86, not 86/86. T12 has
24 scoped dispositions, not a requirement to create 24 more engine runs;
only dispositions touched by the FULL/profile expansion need reconciliation.
Candidate-final T02/T14, the changed 73-cell matrix, S02 visual baselines and
Bobby product/release decision remain explicit final acceptance. This repair
does not mark P23_QUALIFIED, OWNER_ACCEPTED or release GO.
