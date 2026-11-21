# §51 — Multi-cycle Limit/OCO shared preview and consumer handoff

2026-10-08 · additive backend delivery, not P24/release/owner acceptance.

## What changed

The original 1-trial/1-cycle recipe and all its accepted receipts remain
immutable. New Alpha `av_delta_rsi_polynomial_alpha_1_0_13` and profile
`p10.delta-event-driven-limit-oco-search-1h.v1` support 2–400 real native
optimizer trials, default 100, seed 42, repeated causal 48-bar Limit/OCO
cycles (entry expiry 24 bars). Span admission is at most 365 days. Caller
pins/overrides remain unsupported; all eight declared numeric parameters
are searched by the pinned engine. Early stopping is optional, null in these
qualification runs. No hard-coded 1/1 population or fabricated lifecycle facts.

Real IS native optimizer scoring uses QuantBT 1.1.1 GenericEndpointEvaluator,
ReportMetricObjective and robust plateau selection; this is explicitly **not**
the scalar WFO Mode 4 algorithm. Every retained row has the engine trial ID,
actual parameters/objective/metrics/metadata. Source byte hash and P05 part
byte hashes are different custody layers, not conflated. Selected realization
replay is separate from the complete 100-row optimizer population.

The [immutable three-symbol qualification packet](../P10/LIMIT_OCO_MULTICYCLE_PRODUCT_QUALIFICATION_2026-10-08.md)
binds migration 126. Normal forward migrations 125/126 ran on the shared
Research preview. No candidate selector override, manual SQL mutation,
production/dev/main/release, protected engine/kernel edit, data deletion,
retention/compaction change or remote push.

## Real preview run for Bobby

**COMPLETED/READY**:
[`rrun_ee50cb82d6de9e495e10b32323b62f8c` · S08](https://research-portal.primusspark.com/research/quantbt/runs/rrun_ee50cb82d6de9e495e10b32323b62f8c/execute?workspace_id=ws_06GCVTHWC9WVPGEPR85AB15K82).
Workspace `ws_06GCVTHWC9WVPGEPR85AB15K82`.

- BTCUSDT, dataset `crypto-binance-1m`, 1h, 90-day declared range.
- IS June 1→August 3; OOS August 3→August 21; Holdout August 21→August 30,
  2026, explicit UTC/end-exclusive. 300 predecessor warmup bars.
- 100 requested/completed/retained trials, 98 distinct parameter sets.
- 21 actual parent/OCO cycles, 84 orders, 42 fills. The owned equivalent
  exhausts every journal page and proves 13 real fill+sibling-cancel pairs.
- Native Holdout remains unexecuted/typed NOT_PUBLISHED. No rows are invented.
- Normal installer/preflight/create; setup reports exact PRODUCT_RUN_QUALIFIED.
  Progress/Evidence/Split share the verified native optimizer source hash.

Private receipt (0600):
`/home/bobby/.local/state/portal-research-p23/20261008/shared-limit-oco-search/product.json`.
SHA at first completed readback:
`7fe46dc0d9eee1d0b0815e99d05140bdbb645a25615936c72bcc6bbdcdd3c164`.
The separate setup readback verifies the later seed/span presentation fix;
it does not rerun or rewrite the completed source/run.
`shared-limit-oco-search/final-setup.json` under the same private root has SHA
`e8998dabc81ad93734d22ed9672cd213d2c4dd159e11f172f75f2454eb63e54e`;
passed=true, seed policy LOCKED/42, span 365, allowed pins empty and session revoked.

## Served web and browser evidence

Shared web was rebuilt from Research HEAD containing Claude `1ab33e3f`.
Bundle `/assets/index-BU6GBRjT.js`, image
`sha256:13842b18362a4ae187665ee4bd390537c986bc2a2f7bcdbffbaa43018969184f`.
Existing old run was read without another engine run, then the new 100-trial
run was checked at 1280 and 660 px. Both show actual parent/OCO command
relationships plus activate/fill/cancel lifecycle, unexecuted Holdout caption,
zero console errors/warnings/API failures, no horizontal document overflow,
no product writes. Both browser sessions were logged out normally.

Runner `scripts/research-p23/shared-limit-oco-browser.mjs`.
Private final new-run browser receipt:
`shared-limit-oco-search/rrun_ee50cb82d6de9e495e10b32323b62f8c/browser.json` under
`/home/bobby/.local/state/portal-research-p23/20261008/`.
SHA `6f909376d15d77c9882c47ff8dcda625c82d289683f96ad38a0a6c8ac43b2957`.
This is affected S08 **functional/data acceptance**, not HiFi/component/visual
acceptance and **not** a fresh whole-product 73-cell matrix. Bobby reports
component/visual defects in the served S08; Claude owns their correction under
the [2026-10-08 component-integrity handoff](./S08_COMPONENT_INTEGRITY_CLAUDE_HANDOFF_2026-10-08.md).

## Exact public contract for Claude

- Setup: `research-run-setup.d.ts`, `RunSetupProfile.native_input.optimizer`
  = `PINNED_QUANTBT_NATIVE_IS_SHARPE_V1`, `recipe.family=NATIVE_OPTIMIZED`,
  trial_count 2..400/default 100, seed policy LOCKED/42. A presentation-only
  overlay derives seed/span from the immutable execution descriptor instead
  of the copied old fixed-native template; no historical identity is rewritten.
- Progress: generated `ProgressRead.native_execution.optimization`.
- Evidence: generated `EvidenceHub.core.native_execution.optimization`.
- Split: generated selection state `NATIVE_OPTIMIZATION_SEALED_SEPARATELY`
  and `native_optimization` with the same typed source summary.
- Actual BTC selected engine trial number 41, selected objective
  `"4.0101541621991"`, native optimizer source SHA
  `71f2241fd827388ea9f5adb5b1260184800fc8e012d0e74ac175920388f8dbb3`.
  Engine trial number is 0-based identity, not a presentation ordinal.
- Canonical small actual fact fixture:
  `packages/contracts/fixtures/research-native-optimization-result.valid.json`.
  No market tape, session, token or path input is public to the browser.

### Mandatory narrow frontend mapping follow-up — Claude owns implementation

Bobby's latest instruction assigns frontend/components back to Claude;
Codex does not land these frontend patches. This supersedes any earlier
conditional proposal for a Codex mechanical mapping patch.

At current accepted source, `dataDeclarationV2.ts:RecipePins.family` is a
hand-maintained union without NATIVE_OPTIMIZED. Extend it from generated
RecipePresentation rather than invent another backend type. Two `NewRun.tsx`
Parameters/Review `fixedNative` predicates currently check only whether
nativeInput exists. They must instead recognize the exact old optimizer
`NOT_APPLICABLE_FIXED_DELTA_INPUT_NOT_SCALAR_OPTIMIZER`; the new recipe is
native **and searched**, not “declared · not swept”. Preserve the existing
design/baselines; no layout, typography, colors or other screen changes.

The full native 100-trial population is sealed in P05, but the old scalar
Search/Freeze chain is not a native optimizer reader. Preserve its typed
NOT_APPLICABLE reasons. A dedicated native S06/S07/full native Report consumer
is **not** claimed delivered in this §51 slice. Progress/Evidence/Split's
bounded optimizer summary is available now; do not fake a scalar ledger,
sampler trace, freeze certificate or broker replay from it.

Prompt:

> Claude — read backend queue §51, this packet and its immutable P10
> qualification link. Use regenerated run-setup/progress/evidence/split types
> and the actual native optimizer fixture. Finish the exact RecipePins type
> and two fixedNative data-binding corrections as the frontend owner;
> Codex remains backend-only. Also follow the linked component-integrity
> handoff; the prior functional browser PASS is not visual acceptance.
> Consume native optimization facts where the existing native panel can
> display them without pretending it is scalar WFO. Take real API/browser
> receipts on the linked completed 100-trial run, never rerun the engine to
> refresh a stale web bundle. Keep all accepted UI design and historic fixed
> recipe behavior. Record typed unsupported Search/Freeze/Report lanes and
> actual pending consumer work instead of claiming P24/release completion.

## Tests, resource closeout and preservation

- Adapter/custody focused Python tests 7/7; native contract fixture 5/5.
- Grouped Control API admission/setup/Split/Progress focused tests 47/47;
  follow-up setup metadata regression suite 18/18 after finding the actual
  seed/span mismatch. Control API compiled images pass their builds.
- Contracts 319/319 pass after extending the exact append-only native-profile
  regression assertion. The networkless contract verifier stages the new frozen
  public qualification receipt explicitly; source receipt/hash checks stay enforced.
- The first complete Control API hook run found two stale assertions: an
  11-native-recipe count and treating every native binding as fixed. Keep the
  eleven historical fixed identities, separately validate the twelfth optimized
  binding/lane (including wrong-digest refusals), and exercise custody for all
  twelve. Both affected suites pass 30/30 locally; no engine rerun is needed.
- Shared normal migrator applies only 125/126; no migrations were rewritten.
- Protected strategy SHA and original frozen qualification bytes preserved.
- One disposable owned QA actor `p23-reader-95` disabled through AdminService;
  sessions=0, active children=0. Its password/cookies removed from private
  actor state. Original owner and 21 previously disabled QA identities untouched.
- Exact owned QA project stopped after collecting custody; volumes, artifacts,
  receipts and rollback images retained. Shared preview stays up for review.
- Capacity after builds/owned teardown: 98,193,133,568 free bytes versus
  99,916,795,904 initially; increase about 1.61 GiB, inside the named 5 GiB cap.
  NO_DESTRUCTIVE_CLEANUP_NEEDED. No broad Docker/cache prune or data deletion.
- Coherent source/contract/docs land via one ordinary mandatory commit hook
  and fast-forward only to the clean Research branch; no remote push.
