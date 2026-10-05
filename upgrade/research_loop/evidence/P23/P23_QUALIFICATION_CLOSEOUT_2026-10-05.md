# P23 — qualification ledger and positive sampler product closeout

2026-10-05 · Codex · **QUALIFICATION_LEDGER_RECONCILED / READY_FOR_BOBBY_REVIEW**.
This closes Bobby's two assigned obligations: reconcile T01–T15 against the
latest scoped receipts/owner decisions, and prove one new product run displays
the actual sampler capture on S06. It does not approve a release manifest,
promote dev/main, publish signed Portal 2.0.0 or deploy production.

## 1. Current T01–T15 disposition

This is the current index, superseding stale `NOT_RUN`/`OPEN` labels in the
initial P23 scaffold and earlier receipt summaries **only for the scopes below**.
Original measurements, failed attempts, raw hashes and source/image identities
remain in their linked receipts. `SCOPED_PASS_REUSED` means evidence reuse, not
a fresh measurement on today's image. Different campaigns/images are not
relabeled as one clean-candidate run. No unchanged load/fault/DR gate was rerun.

| Test | Current disposition | Latest evidence and explicit boundary |
|---|---|---|
| P23-T01 | SCOPED_PASS_REUSED | [Clean mixed load](./MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md): 20 identities, real heavy + 4 queued, 120/120 GET, Library/Progress p95 **499/403 ms**, 738,488,320-B peak, original 500-ms/5-GB bounds. Library has only 1-ms measured headroom, not a soak/capacity claim. Later affected [Report/RC retake](./EXACT_JSON_READ_COST_REPAIR_2026-10-03.md) passes **377/487 ms**, preserving its own image scope. |
| P23-T02 | SCOPED_PASS_REUSED | [Three-round plateau](./T02_T12_SOURCE_CLOSEOUT_2026-09-30.md): 9 real complete/fail/cancel terminals; scratch 482 files / 13,792,158 bytes unchanged, FD 7→7, PSS within 64-MiB allowance. This supersedes the earlier scratch-growth failure, not an unlimited-job guarantee. |
| P23-T03 | SCOPED_PASS_REUSED | [Clean disk-pressure acceptance](./T03_CLEAN_COMMIT_ACCEPTANCE_2026-09-29.md): bounded `FAILED/READY · RESOURCE_EXCEEDED`, followed by a new `COMPLETED/READY` after removing only owned pressure. Earlier raw ENOSPC/zero-free failures remain historical. |
| P23-T04 | SCOPED_PASS_REUSED | [Clean PG/NATS/worker outage](./T04_CLEAN_FAULT_CHECKPOINT_2026-09-27.md) and [recovery checkpoint](./RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md): bounded DB refusal, same-intent durable recovery without duplicate job, original source/auth/image boundaries preserved. |
| P23-T05 | SCOPED_PASS_REUSED | [Research auth/cache/export matrix](./T03_T05_RUNTIME_RETAKE_2026-09-29.md), [file/object classification](./T05_FILE_OBJECT_LEGACY_CLASSIFICATION_2026-09-29.md), then [legacy export repair](./LEGACY_EXPORT_SECURITY_AND_REMAINING_HANDOFF_2026-10-01.md). The old mutating GET is not grandfathered: explicit authorized prepare precedes read-only download. [P24 actual export/reference checks](../P24/P24_SCENARIO_CLOSEOUT_2026-10-04.md) retain their bounded preview scope, not production certification. |
| P23-T06 | OWNER_SCOPED_EXCEPTION_ACCEPTED | [Actual restore/hash accounting](./MIXED_LOAD_AND_HISTORICAL_MANIFEST_EXCEPTION_2026-10-03.md), [fresh proof restore](./NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md) and [Bobby's exact-three disposition](./SECOND_ENGINE_UPGRADE_AND_HISTORICAL_SCOPE_2026-10-04.md). Strict historical population remains **83/86**, `full_store_integrity=false`; no original missing bytes were recreated. Exception applies only to the three listed old disposable test runs, not another missing/corrupt artifact or published dependency. |
| P23-T07 | SCOPED_PASS_REUSED | [Actual Portal 1.1.0→1.1.1 transition](../P24/P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md): 3 admitted/retained runs, old in-flight pin, new default, old-input reproduction and rollback, 9 independently verified files. Supersedes the earlier direct-wheel-only `OPEN`. Qualified **fixed Delta/HMD in an isolated local cell** only; production remains 1.1.1, no blanket multi-version/WFO certification. |
| P23-T08 | SCOPED_PASS_REUSED | [Latest cold-cache mixed retake](./T08_COLD_CACHE_CHECKPOINT_2026-09-28.md): 20 readers, 120/120 GET, running WFO + 4 queued, Library/Evidence **414/404 ms**, 617,881,600-B peak. Eviction limited to owned P23 volume; no shared-host `drop_caches` or Execution restart. |
| P23-T09 | SCOPED_PASS_REUSED | [Clean Execution isolation retake](./T09_EXECUTION_ISOLATION_CHECKPOINT_2026-09-28.md): real HEAVY/4 queued, unchanged Execution/health signatures, Library/Evidence **392/494 ms**, 605,261,824-B peak. Same-host boundary proof, not a new AWS/live business qualification. |
| P23-T10 | REGRESSION_RECEIPTS_RECONCILED | [Full Python baseline](./T10_PYTHON_BASELINE_RETAKE_2026-09-29.md), [latest scoped source/FE/contract gates](../P24/P24_CANONICAL_SAMPLE_SAMPLER_CLOSEOUT_2026-10-05.md) and [FE input/qualified engine/scenario records](../P24/P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md). Each keeps its actual source/runtime and intentional skip scope. This docs-only closeout adds no manual full-suite repeat and does not turn old regression results into an all-suites/single-image release certificate. Normal grouped commit hook is recorded separately below. |
| P23-T11 | SCOPED_PASS_REUSED | [Far-seek/inspection](./T11_FAR_SEEK_CHECKPOINT_2026-09-27.md): 20 distinct readers / 140 GET, signed Library depth13/replay depth17, ordinal1650/2208 readback, no implicit jobs, 429,371,392-B peak. No fabricated client-local cursor/selection. |
| P23-T12 | SCOPED_PASS_REUSED | [Shared utility quotas/overlap](./T02_T12_SOURCE_CLOSEOUT_2026-09-30.md): workspace4/actor2, fifth typed503, replay202 and drain recovery; real primary/diagnostic/verify/export overlap. Later [genuine non-reusable linked child](./NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md) and [GUI nine-fold audit](../P24/P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md) close the old linked-audit gap; expired first intent remains recorded. No claim that reuse-only tests executed a child. |
| P23-T13 | SCOPED_PASS_REUSED | [Actual two-version Portal pin/default/reproduce rollback](../P24/P24_PORTAL_ENGINE_TRANSITION_2026-10-04.md), [unsupported-route negative](./T13_CURRENT_ROUTE_NEGATIVE_CHECKPOINT_2026-09-28.md) and [SC21 disposition](../P24/P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md). New route descriptors stay informational/refused without a mapper; old semantics are not silently upgraded. Same narrow fixed-profile qualification as T07. |
| P23-T14 | SCOPED_PASS_REUSED | [Approval/reference graph restore](./APPROVAL_GRAPH_RESTORE_CHECKPOINT_2026-09-27.md), [temporal/exposure writer](../P10/B7_B8_TEMPORAL_EXECUTOR_2026-10-02.md), [original pinned-child/fresh restore](./NONREUSABLE_ORIGINAL_AUDIT_AND_READ_COST_2026-10-03.md) and [SC24 reference disposition](../P24/P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md). Preserves refs/null-trial/selection/target pins. Does not claim a new collector mutation or a restore performed after the later test RC. |
| P23-T15 | SCOPED_PASS_REUSED | [Actual cold browser/WFO overlap](./T15_COLD_BROWSER_OVERLAP_2026-09-30.md), [restored S09/S11 workspace + linked audit 4/4](./WORKSPACE_AND_LINKED_AUDIT_CONSUMER_2026-10-04.md) and [later scenario dispositions](../P24/P24_REMAINING_SCENARIO_ACCEPTANCE_2026-10-04.md). Latest sampler positive browser is §2 below. These are named real subsets, not Bobby's whole-product visual acceptance. |

All **15 dispositions are explicit**; the engine-two and linked-audit items
are no longer backend `OPEN`, and manifest loss has an approved bounded
disposition rather than unresolved owner input. T06 is **not strict PASS**.
The strict `qualify.mjs` requirement for fifteen same-candidate `PASS` envelopes
is not forged/bypassed by this ledger: no `P23_QUALIFIED` JSON or signed-release
certificate is issued. Final product/visual and release acceptance remain with
Bobby/P24, not another backend implementation request in this assigned slice.

## 2. New product run: child → P05 → BFF → S06

**PRODUCT_SAMPLER_BROWSER_PASS**, 2026-10-05, completed/retained at
01:44:43.917837 UTC. This replaces the positive-product-receipt gap in the
earlier [source-only sampler proof](../P24/P24_CANONICAL_SAMPLE_SAMPLER_CLOSEOUT_2026-10-05.md)
and private `sample-sampler/preview-closeout.md`, not their original scope.

- Review run **R-WFO-031** / `rrun_b5734ffe0782a3aceab1f9068c25a60e`.
- [Actual S06 — Search & Selection](https://research-portal.primusspark.com/research/quantbt/runs/rrun_b5734ffe0782a3aceab1f9068c25a60e/search?workspace_id=ws_06GCVTHWC9WVPGEPR85AB15K82).
  Choose Cinema step **2 · POOL**; the sampler strip shows
  `TPESampler · 3 observed trials · 36 sampler calls · 3 retained trace examples`.
  Hash/scope and exact returned parameters are in the existing tooltips.
- Ordinary preview auto-login/session, existing qualified Delta binding;
  no role reset, alternate actor, DB row injection or direct-engine substitute.
  Authenticated P08 preflight **201 / may_create_run**, P10 create **202**,
  actual confined child and Progress **COMPLETED / READY**, named Search **200**.
- Read-only HMD `crypto-binance-1m`, BTCUSDT/1h; UTC interval
  `[2026-06-01, 2026-07-15)`, first OOS 2026-07-01, weekly expanding;
  global `mode_1_decay`, seed42, **3 actual optimizer trials / 2 folds**.
  These are global retrospective calibration semantics, not causal per-fold
  search; the existing screen labels them honestly.
- P05: **1,056 observations**, 2 folds, 3 trials, 1 candidate, 1 selection.
  Artifact `rart_81eb8941420626e017ecc0c67315c07fa4b5a617`, revision1;
  manifest SHA-256
  `b738f0a1a4dd67aa9a7d50f8e74353928f5e76fff4d12b51df6ff6606f61995d`.
- Independent read-only rehash validates **10 Parquet parts + 12 documents**,
  path confinement, bytes, run/workspace and all three P08/P10 input digests.
  Sampler document **2,617 bytes**, SHA-256
  `38cf5e4dcf0422df3236d629e08e63343c1552a101fc70183ea6c98e96a748eb`:
  P05 manifest/document, retained summary, named BFF and both S06 DOM tooltips
  match. All three actual proposal/outcome samples match, not just a status chip.
- QuantBT **1.1.1**, Optuna **4.8.0**, TPESampler / DuplicatePruner;
  capture complete, zero omitted trials. Scope remains
  `OPTUNA_PUBLIC_SAMPLER_INVOCATIONS_NOT_TPE_DENSITY`. Private TPE density,
  ranking and constructor settings are not guessed or marked AVAILABLE.
- Actual Chromium **1280/660 px** checks and screenshots: no page error,
  console warning, horizontal overflow or implicit API write. Historical
  R-WFO-022 sampler facts hash before/after is unchanged. Exactly **one** new
  product job; no import/activation/publication/command. Session logout **201**.

The initial optional custody probe assumed the transient `.p10-wfo-source`
copy still existed after terminal cleanup; it failed that filesystem lookup
after verifying retained files. Corrected proof uses the actual immutable P05
document, explicitly records `source_scratch_state=NOT_PRESENT_AFTER_TERMINAL`,
and does not invent a second surviving source copy. No product code change,
new run or reseal was needed. The confined child's exact run-ID capture is
retained in the P05 document; the verified product receipt is not the older
synthetic-identity HMD oracle. No repeated load/DR campaign.

## 3. Exact runtime and immutable receipt locators

Existing preview source **`dec919350eb08d2edee491557723da48d82c0425`**;
`portal-research-preview` / loopback8095 / public Research review origin.
Migration094 and existing users/volumes/flags unchanged; **no rebuild/restart**.

| Service | Actual runnable image |
|---|---|
| portal-api / quant-worker-py | `sha256:c8696d89ea998ddfc966d3e439aa5e6c809f3654793a2e18d021ef93f95aed6e` |
| control-api | `sha256:19176dd253f352682e53a9d034f88a9eaeacbd6eeb543b1563115fdd0054cd80` |
| portal-web | `sha256:3b965d5f0e12a96f29aa2d0d3fc35f408ac539b7a26a83a6feacbb04de48af8e` |

Web bundle `index-CSqDo1e1.js`, SHA-256
`1f739f063fec54554b37234957f359020c28e20fd664d4dfeb1f3e856cc2f8be`.
Today's documentation commit does not change/relabel that built source.

Private evidence root (0600 JSON, no credentials committed):
`/home/bobby/.local/state/portal-research-p23/20261005/sample-sampler/`.

| Raw receipt | SHA-256 |
|---|---|
| `preview-product-sampler-r01.json` | `5a14ba2008338f45016487a35daa6cf99d2ced919d396f4db0eebae8077b9afa` |
| `preview-product-sampler-custody-r01.json` | `bed7c854e812560dfb53846dcd5dd5f9799c5dc7f7e70b4b0baf09fc7f0b39c1` |
| `product-sampler-r01-1280.png` | `ac2829019990001cff6392bfa0ed5253109913af935be6cb165e4166285ad1fe` |
| `product-sampler-r01-660.png` | `98f3f644bd5ae7db5ad54a383dc0bf431730fe343d6fadc99bf217f8353ecede` |

Exact requests/responses, UTC trial observations, terminal Progress and Library
readback stay alongside those receipts. The ordinary test session is logged
out; no new QA identity/container/volume was created. The completed run and
artifacts are intentionally retained for Bobby's review. No broad prune,
source-data removal, password/token reset or production action.

## 4. Handoff and stopping point

- Bobby reviews the existing Research preview and R-WFO-031 before deciding
  release/manifest/deployment. No need for Claude to rebuild composition or
  substitute a fixture; the current consumer already displays the typed trace.
- Only the current ledger/pointers change in Git. Preserve Claude's commits,
  frontend layout, baselines and contracts. One grouped normal commit hook,
  not manual repeats of unchanged full suites.
- No release manifest edit, remote push, dev/main merge, signed publication or
  production rollout is included. The exact-three integrity exception remains
  disclosed in any later candidate; it cannot become `86/86` strict integrity.

Documentation checks: exactly 15 unique ordered T rows, all relative receipt
links resolve, raw positive browser/custody JSON hashes match this packet and
both files are0600. `git diff --check` passes; no source/frontend/contract diff.
Normal grouped commit hook log (success/failure is authoritative):
`/home/bobby/.local/state/portal-research-p23/20261005/sample-sampler/qualification-ledger-hook.log`.
No manual full suite is added alongside that mandatory hook.
