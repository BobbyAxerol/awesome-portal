# S02 §37 — Full current-engine support, staged backend plan

Status: **PLAN_READY_FOR_BOBBY_REVIEW — NO_RECIPE_OPENED**.
Owner direction: Bobby, 2026-10-05, “mở full, support full”. This supersedes
the earlier request to wait for a list of modes/timeframes, not the requirement
to qualify each recipe before offering it on the shared preview.

Canonical index: [Unified S02 full-support addendum](../UNIFIED_IMPLEMENTATION_PLAN.md#s02-full-support).
Request: [backend queue §37](./CODEX_BACKEND_GAPS_2026-09-30.md#37--open-full-quantbt-support-for-delta-rsi-bobby-2026-10-05--claude--codex).
Source baseline: shared `docs/research-loop-plan` at `0adff357`; own backend
lane `codex/be-gaps`. Claude's calendar, keyboard and 1280/660 receipts are
preserved; this plan does not claim to rerun or independently accept them.

## 1. Goal and protected boundaries

Serve every semantically valid combination the pinned QuantBT 1.1.1 engine,
actual indexed dataset and immutable Alpha declaration can execute. Do not
mistake a Portal adapter/reader gap for an engine/source gap. Deliver the
whole vertical path, not an enabled menu that fails at create, retention or
the next screen. Use the current engine; no engine upgrade prerequisite.

- Research only: no Trading System/Execution DB, broker, CLI or live mutation.
- No change to protected `apps/portal/strategy/main.py`, historical profile
  digests, old Alpha declarations, run specifications, artifacts or seals.
- No new service, database technology or generic browser execution endpoint.
  TS owns recipes/admission/BFF; Python remains the confined quant adapter.
- Browser gets named generated contracts and configuration facts only.
  P08 fresh preflight, P10 RBAC/workspace/CSRF, lease/fencing and P05 immutable
  custody remain authoritative. Setup never grants execution permission.
- Plans and implementation states are separate. No runtime flag, recipe,
  migration, run, remote push, dev/main merge or production rollout in this
  planning change. Future implementation follows the stages below.

## 2. What the inspection established

| Source at the baseline | Fact / consequence |
| --- | --- |
| `apps/portal/registry/research-engine-catalog.v1.json`, `modes[]` | Five modes and **eight valid Advanced mode × schedule pairs**, not a 5 × 3 Cartesian product. See the matrix below. |
| `run-admission.service.ts:deltaWfoUnsupportedReason`, `portal-admission.ts`, three Delta profile modules | Portal admits Mode 1/global and its separate Mode 1/causal-inner recipe at 1h. Route/timeframe/mode constraints are hard-coded in several authorities. |
| `advanced_walkforward_runner.py:_config_fields`, `AdvancedWalkForwardConfig.validate_schedule` | The Advanced runner passes actual mode/schedule/config to the public engine. Mode 2 needs `scoring_backend=proxy`; causal Mode 1 needs nested inner validation; mode/schedule-specific rules must survive the refactor. This is code inspection, not qualification of other modes. |
| `current_source_artifacts.py:CurrentSourceAdmission.validate`, `research_current_source_retention.py` | P05 export is still bound to Mode 1 global/causal pairs. Removing only admission literals would admit jobs that cannot seal. |
| `current-source-pool.ts:POOL_IS_CANDIDATE_LIST_MODES`, worker completion/progress and selection readers | Pool/study/selection semantics need mode-specific adapters. A run-global top-IS pool must not be invented for a mode that publishes a different selection population. |
| `domain/requests.py:ThreeWindowConfig`, `three_window_runner.py:_mode1_optimization_config` | The current Three Window implementation explicitly supports **Mode 1/global**. Its independent holdout is not an Advanced final OOS fold. Do not advertise the other seven Advanced pairs under Three Window without an actual matching engine/protocol path. |
| `run-setup.contract.ts` | `profiles` and `engine_options.*.profile_ids` are capped at **6**; expansion requires coordinated bounded schema/generator updates, not just registry rows. |
| `p04-delta.binding.ts:P04_DELTA_DECLARED_CONTRACT` | Existing Delta AV declares **1h/4h/1d**, warmup 300 bars. 5m/15m cannot be enabled by overwriting its immutable declaration. Publish a separately bound version when qualified; retain the old version. |
| `preflight.service.ts:create`, `repository.ts:storePreflightManifest`, `config.ts` | Active preflight manifests are bounded per actor (default 8) with a default 10-minute TTL. Repeated preflight exhaustion is not automatically worker saturation; identify the refusing boundary before changing quota. |
| migrations `062`, `084`, `089`, `090`, `094` | Producer/source-pair/digest SQL allowlists also contain explicit profiles. A new append-only migration is required; never edit an applied migration or remove its custody constraints. |
| `NewRunRoute.tsx:constraintsFrom`, Atlas route facts | S02 still gates route cards on Atlas admission. Routes beyond the current input contract need truthful Atlas + setup agreement; adding only an enabled setup row is insufficient. |

Claude's §37 actual setup probe is retained as its own receipt: 15m was
`DATASET_TIMEFRAME_NOT_AVAILABLE`; 4h was `TIMEFRAME_NOT_ADMITTED`. The former
needs an actual index/loader check, the latter is a Portal profile restriction.
This plan does not turn either into AVAILABLE or claim a new runtime probe.

### Exact Advanced target matrix

| Mode | Valid schedules to serve | Obligations before opening |
| --- | --- | --- |
| `mode_1_decay` | `global`, `per_fold_decay`, `per_fold_causal` | Preserve decay components and selection scope. `per_fold_decay` requires robust-decay selection; causal needs source-built inner folds and study-bound picks. |
| `mode_2_sbb` | `global` | Explicit proxy scoring, bounded bootstrap settings, retained path/replicate facts and actual selection semantics. No fake IS candidate pool. |
| `mode_3_flat_minima` | `global` | Retain source plateau/cluster/selection target; distinguish an actual trial from a centroid. A centroid must not receive an invented trial ID. |
| `mode_4_is_only_robust` | `global`, `per_fold_causal` | Retain IS subperiod/dispersion facts; causal outer studies keep own selection. Do not apply causal Mode 1's inner requirement blindly to Mode 4. |
| `mode_5_full_robust` | `global` | Retain source full-sample selection inputs and explicit OOS/full-sample-use disclosure; never relabel this as untouched causal selection. |

Mode `none` is a separate fixed-parameter engine execution semantic, not one
of these five optimizer modes. If exposed later, it needs its own no-search
recipe and truthful N/A states. Invalid schedules stay engine-refused, not
`PROFILE_NOT_OPENED` recipes awaiting a flag.

## 3. One recipe authority, not more duplicated switches

Use a versioned, source-controlled **data table** with a schema, proposed
`apps/portal/registry/research-execution-recipes.v1.json`. A DB mirror may enforce
exact IDs/digests/FKs; it is not a second mutable authoring authority. Use the
existing generation tooling to supply TS/Python consumers from the same bytes.

Each immutable descriptor contains:

- Recipe ID/digest, engine/native pin, named adapter and input/output versions.
- Alpha declaration requirements; protocol, route, mode, schedule, exact
  timeframe and source-clock requirements. The new qualification key includes
  dataset/source class and timeframe; a 1h pass never silently opens 5m/1d.
- Frequency/window/inner requirements, seed and override policy, trial default,
  per-study/total limits, warmup semantics, 100k-bar planning ceiling, observed
  range/fold bounds and fee/funding/cost-model requirements.
- Child CPU/wall/memory/scratch/IO budgets, scheduler cost class and retry/cancel
  policy; per-mode output requirements and named retention/reader adapter.

Qualification/activation records are **separate** from the descriptor digest:
`CANDIDATE → QUALIFIED → ENABLED`, with rollback to disabled. A receipt binds
exact descriptor/engine/adapter/source/schema/image revisions. Avoid a circular
digest in which attaching a receipt changes the recipe that receipt qualified.
Old IDs/digests and their exact compatibility readers remain supported.

The common resolver feeds Atlas admission, setup, Conditions, suggestion,
preflight, P10, scheduler/worker, P05 and current-source readers. Unknown,
ambiguous, unqualified, tampered or context-mismatched recipes fail closed with
precise paths. No mode/global literals remain in the **generic admission
policy**; mode-specific engine semantics belong in named adapters.

Bound the context-specific response (proposed max 256 recipes / 1 MiB), rather
than returning an unbounded matrix. Raise the current six-row schema caps
consistently in zod/OpenAPI/generated validators; do not paginate away enabled
choices and then have the browser incorrectly infer “not opened”.

## 4. Stages, done-when and effort

Effort is an initial **focused implementation estimate**, not a deadline or
an observed engine duration. It includes affected tests/receipts, excludes
unrelated repeated CI and depends on real constructor/output compatibility.
Every stage closes its assigned recipe/read path completely; no reader debt
is passed to a later stage merely to enable the menu.

<a id="full-01"></a>
### FULL-01 — Shared recipe table, compatibility and bounded budgets

Requests: BR-FULL-03, foundation of BR-FULL-05. Estimated **1–2 working days**.

1. Import existing descriptors without changing their canonical digest or
   historical behavior. Generate shared TS/Python views; remove duplicate
   decision switches while retaining exact legacy adapters.
2. Add qualification/activation binding, append-only DB constraints and
   bounded contract extensions. Coordinate shared OpenAPI/migration ownership
   with Claude before editing; choose the next unused migration at that time.
3. Centralize limits used by estimator, admission, child, progress and queue.
   Expose structured budget/quota facts in setup; preserve the distinct
   options-stale conflict and axis-specific Conditions from §36.
4. Diagnose repeated preflight 503s at their actual boundary. Safely reuse an
   identical still-valid manifest or retire only superseded **unbound** actor
   manifests; never delete bound history, raise quotas without bounds, or
   bypass create authorization. Keep genuine overload typed with retry info.

Tests / exit: schema/digest and TS/Python parity, all old recipe predicates,
historical Library/Freeze/Report reads, migration forward on new + old DB,
unknown/tampered recipe refusal, workspace/CSRF, quota concurrency/expiry,
bounded response and off-state parity. **No new recipe enabled in FULL-01.**
Reuse old real-run receipts only for unchanged exact descriptors; a changed
execution binding needs its own real qualification.

<a id="full-02"></a>
### FULL-02 — Finish Mode 1 schedules and optimized Three Window

Requests: first BR-FULL-01/04 delivery. Estimated **1–2 working days**.

- At already-indexed/declared 1h, keep global and causal-inner compatibility;
  add the missing `mode_1_decay × per_fold_decay` Advanced recipe.
- Add a separate **optimized** Three Window Mode 1/global recipe (trials >1,
  declared overrides, seed policy), not a broadening of the historic one-trial
  fixed P04 path. Keep shared A/B/C/D and untouched holdout semantics.
- Complete actual child events, study/local-trial mapping, P05 export,
  Search/Freeze/Replay/Report/final-audit/RC and current-source retention before
  enabling each new recipe. A per-fold study has no fake run-global theta/K.

Tests / exit: one real ordinary P08→P10→confined child→P05→named reads per new
recipe; actual multiple optimizer trials and several folds where applicable;
consistent selection/digests/coverage and terminal progress. Negative seed,
mode/schedule, source, lease/fencing, cursor and budget cases. S02 offers only
qualified recipes; old fixed/global/causal reads remain valid.

<a id="full-03"></a>
### FULL-03 — Indexed timeframes and observed source clocks

Requests: BR-FULL-02. Estimated **1–2 working days plus bounded recipe runs**.

- Discover actual loader/index-supported timeframes per dataset/symbol;
  qualify missing index entries from read-only HMD, never from a nominal menu
  or price data guessed by the browser. Prioritize **4h/1d**, then **5m/15m**
  where the actual reader/index supports them, then other published intervals.
- For Delta, add a new immutable AV/adapter binding for new declared
  timeframes; leave the old 1h/4h/1d AV and all existing runs untouched.
- Warmup remains Alpha-declared **bars**, not 300 hours/days. Source/index and
  actual planner validate coverage, closed bars, gaps and predecessor bars.
  Source-calendar/day grains retain their own clock rules.
- Derive range limits by observed bars/folds and measured cost. Do not carry
  1h's 92-day cap blindly into daily data, nor remove the 100k-bar ceiling.
  Engine-built fold boundaries remain the timeline authority.

Tests / exit: real run for each newly enabled exact timeframe recipe; adequate
  warmup/trading-date coverage, UTC half-open edges, no future/unclosed bar,
  symbol/source/timeframe isolation and exact P05→screen values. The target is
  **every observed/declared timeframe**, not a static five-item allowlist.
  Unindexed/uncovered data stays precisely refused until qualified.

<a id="full-04"></a>
### FULL-04 — Other optimizer modes, complete retained/read chain

Requests: remaining BR-FULL-01/04/05. Estimated **2–4 working days**.

Order at baseline 1h: Mode 3/global → Mode 2/global → Mode 4/global →
Mode 4/causal → Mode 5/global. This orders adapter/output work, not a claim
that a mode is statistically better or always faster. Extend each qualified
mode to FULL-03 timeframes with its own recipe receipt.

Implement the mode output matrix above in the **same vertical slice**:
child → source facts → immutable mode evidence → P05 → Progress/Hub/Split/
Search/Freeze/Replay/Report/final audit/RC. Reuse source-native facts and
centroid/per-study selection support; add named schemas where truly missing.
No Mode-1 population/ranking substituted for bootstrap/plateau/IS-only/full
sample semantics. Legitimate missing/not-applicable fields stay typed with a
reason and locator; missing Portal readers are implemented, not called gaps.

Proposed qualification budgets: start with short actual windows and the
minimum trials that exercise the mode's real selection branch. Standard
candidate ceilings start at existing 120 CPU / 240 wall seconds. Slow-mode
candidates may use an explicitly recorded isolated budget up to **900 CPU /
1200 wall seconds**, initially **one heavy job at a time**. These are proposed
safety ceilings, not measured durations or production promises; adjust the
recipe after measurement, never silently widen all jobs. Memory/scratch/IO,
bootstrap/subperiod/cluster work and total trials remain bounded. The existing
preview-only 400-trial/1800-CPU exception is **not inherited** by other modes.

Tests / exit: at least one real retained run per new mode/schedule recipe,
actual source selection branch and output hashes, all named screen reads,
budget timeout/cancel/retry/backpressure, no cross-study leakage, authoritative
causality/full-sample-use disclosures. Raise trial ceilings only with measured
cost evidence; a three-trial qualification is not a 400-trial throughput claim.

<a id="full-05"></a>
### FULL-05 — Imported Alpha WFO and compatible optimizer recipes

Request: BR-FULL-07. Estimated **1–3 working days**.

Extend the confined imported adapter to the same **qualified** research
recipes where its immutable declaration, entrypoint/output shape, parameter
space, timeframes and determinism allow them. Include declared ranges/steps,
categoricals and pins, not only the current pins-only fixed path. Preserve
DRAFT/ACTIVE permissions and the restricted AST/no-IO execution boundary.

Use Bobby's purpose-separated Delta/RSI sample as one **imported** qualification
input; its built-in Delta receipt is not an imported-source receipt. Prove a
real imported Advanced run and qualify each newly opened imported recipe
through its own worker/retention/read path. No permissive arbitrary module,
shell, import, mutable registry lookup or active-version substitution.

Tests / exit: source byte/digest and dependency binding, all declaration kinds,
unknown/out-of-step/undeclared overrides, seed/warmup/timeframe/route refusal,
restricted child negatives, idempotent intake and per-recipe real P05/named
read receipt. Incompatible strategy output stays `ALPHA_*`/typed input refusal,
not falsely enabled because Delta supports the same route.

<a id="full-06"></a>
### FULL-06 — Remaining route families, exact-input qualification

Request: BR-FULL-06. Effort: **1–2 days for pct-equity**, then **1–3 days per
compatible input family**; external/multi-asset inputs may change that estimate.
This is staged work inside §37, not permission to call live/broker APIs.

| Order | Routes | Required adapter/input/evidence |
| --- | --- | --- |
| 6a | `pct_equity` | Reuse existing scalar strategy + HMD adapter; bind actual percent-equity sizing, leverage, costs and accounting semantics, not notional aliases. |
| 6b | `intrabar_bracket`, `dca_ladder` | Typed price/intent/level or ladder data, source OHLC coverage, correct engine field mapping and ambiguity/cost evidence. Portal draft `level_mode` currently means something different from the engine enum; do not cast the old values to enable it. |
| 6c | `fill_replay` | Explicit immutable fill tape and fees; historical OHLCV does not supply fills. Accounting replay cannot acquire a strategy-quality claim. |
| 6d | `orders`, `native_event_lifecycle`, `event_driven`, `reactive` | Bounded typed order/event/callback interface and certified runtime reset/clock/isolation. No arbitrary browser Python callback or invented runtime alias. |
| 6e | `portfolio`, `basket`, `arbitrage` | Immutable multi-symbol input set/alignment, typed legs/sizing/costs and route-specific reports; retain `arbitrage` engine-partial boundaries. Single-symbol Delta is not a basket declaration. |
| 6f | `options`, `nautilus_dca_grid` | Actual option instruments/chain/packages or installed external adapter inputs; verify existing dependencies/source first, implement Portal adapters for what exists. Missing genuine input/dependency is an exact request, not a blanket engine-upgrade prerequisite. |

Each batch includes named requested-spec/input schemas, bounded source loader,
constructor allowlist, P08/admission/child/P05, route-native result/claim mapping
and reads through RC. Do not form an arbitrary 14-route × 8-mode matrix: replay,
event and multi-asset routes have their own meaningful protocol combinations.
Three Window modes beyond Mode 1 need demonstrated matching public protocol
support; Advanced capability alone does not grant them an untouched holdout.

Tests / exit: one real recipe run using actual admissible historical/tape/
instrument data, retained bytes and named screen reads; correct account/unit/
cost/claim semantics, input absence and malicious payload negatives. Open only
completed batches. Keep every remaining route in the ledger with its exact
Portal implementation or genuine input/dependency gap, not a generic “Soon”.

## 5. Common qualification, activation and rollback

Every **new exact recipe** has one receipt row with: recipe/descriptor digest,
Alpha AV/source/declaration digest, engine/native pin, dataset/index revision,
symbol/timeframe/windows/warmup, requested/effective/snapshot digests, source
SHA + lock/image/config identities, run ID, actual studies/folds/trials,
CPU/wall/RSS/scratch, P05 table/part hashes and named API/selection/claim results.
Do not reuse one timeframe/mode/strategy receipt to authorize a different key.

1. Build one candidate for a coherent batch. Run new recipes only in an
   isolated owner-allowlisted qualification cell; public/shared setup keeps
   them disabled. Exercise ordinary P08/P10/worker/P05 code, not a direct
   engine call counted as a product pass. No generic bypass to stable/preview.
2. Use minimal real runs that exercise the actual mode/route path, plus
   targeted schema/negative/custody/resource tests. Preserve failed attempts.
   Reuse unaffected accepted engine/load/DR/visual receipts at their old scope.
3. After PASS, bind the receipt and activate exactly that recipe in the
   Research preview through the helper/config workflow. Verify actual served
   setup → Conditions → may-create → retained reads, not just a flag.
4. Rollback disables new admission, never deletes runs/artifacts. Previously
   admitted jobs keep their immutable pinned descriptor; readers remain able
   to serve their historical recipe. No unsafe blanket image downgrade for
   in-flight work.
5. Revoke only own temporary test sessions; teardown exact cell scratch/test
   resources under C4, preserve evidence/runs/source, record capacity and owned
   resource counts. No broad prune or repeated full hook per recipe row.

## 6. Frontend and execution handoff

For new **mode/timeframe recipes using existing inputs**, S02 already reads
setup dynamically: no calendar redesign or new frontend campaign. Regenerate
types and retake the affected existing 1280/660 real-API checks, preserving
layout/baselines; ensure both setup and Atlas have truthful route admission.

Do not promise zero frontend work for a genuinely **new route input/output
shape**, added quota display, or new enum that the current consumer cannot
render. Supply one exact generated-contract/consumer handoff to Claude only
where that is demonstrated; backend capability expansion is not authority to
alter the approved design. Existing accepted S02 calendar/presets stay intact.

| Request | Owning stages | State now |
| --- | --- | --- |
| BR-FULL-01 | FULL-02 + FULL-04; meaningful protocol check in FULL-06 | PLANNED, not enabled |
| BR-FULL-02 | FULL-03 + per-mode extension in FULL-04 | PLANNED, not enabled |
| BR-FULL-03 | FULL-01 | PLANNED, no registry/migration created |
| BR-FULL-04 | Each vertical stage, especially FULL-02/04 | PLANNED, no reader widened |
| BR-FULL-05 | FULL-01 + measured per-mode FULL-04 | PLANNED, existing limits unchanged |
| BR-FULL-06 | FULL-06 batches 6a–6f | PLANNED, no route opened |
| BR-FULL-07 | FULL-05 + compatible FULL-06 inputs | PLANNED, imported fixed path unchanged |

Next proposed implementation: **FULL-01**, then FULL-02. This document is the
requested staged response, not a passing qualification or a Portal release.
