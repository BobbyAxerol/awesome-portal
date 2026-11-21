# FULL-03 — Indexed timeframes and observed source clocks

Status: **BACKEND_DELIVERED / 28_EXACT_RECIPES_PRODUCT_RUN_QUALIFIED /
RESEARCH_PREVIEW_ENABLED**. Bobby approved FULL-03 on 2026-10-06.
Base: `ebfe3c55929450ffc0b620494016f46cc12f435a`; branch `codex/be-gaps`,
local landing `docs/research-loop-plan`. No remote push, production or UI redesign.

## Scope and implementation lanes

- Root: shared recipe table, immutable Delta AV/binding, exact admission/setup,
  generated contracts, append-only migrations, real product qualification and
  preview activation/rollback/cleanup.
- Source lane: actual installed reader aliases and resolution-bound metadata
  index; observed closed source clocks, predecessor warmup and bounded queries.
- Child lane: pinned recipe/AV/timeframe dispatch through QuantBT 1.1.1 and the
  protected strategy; immutable child receipt, not direct engine smoke evidence.
- Retention/read lane: P05 and named current-source readers use exact descriptor
  identities; preserve all historical 1h recipes and seals.

## Required exit evidence

1. Discover actual mounted dataset/symbol/timeframe capabilities and index
   coverage. Normalize aliases by resolution without rewriting old index bytes.
2. New Delta AV extends the declaration; old AV and strategy bytes stay unchanged.
3. For each enabled exact recipe: ordinary P08/P10 product run, 300 target-bar
   predecessors, UTC half-open/closed edges, bound source/symbol/interval,
   engine-built folds, bounded child budget, retained facts and named reads.
4. Keep unqualified recipes disabled outside the exact isolated candidate lane.
   Activate only proven recipes; flag-off rollback retains historical reads.
5. Reuse unchanged FULL-02 evidence, targeted new tests, one grouped normal hook.
   Revoke owned test identities; teardown only the owned cell; preserve proof
   volumes and old index/seal bytes. Record C4 capacity and cleanup decision.

The required backend gates below are complete. Browser/visual acceptance is
separate; no production or signed-release acceptance is claimed.
Detailed implementation source:
[FULL-03](../../S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-03).

## Delivered source and immutable identities

- Actual rc3 loader normalization, read-only source queries and the existing
  timestamp index prove BTCUSDT / `crypto-binance-1m` at **1m, 5m, 15m, 30m,
  1h, 4h and 1d**. Native aliases normalize by duration at the boundary.
  [Discovery, exact coverage, real query fingerprints and source gates](FULL_03_SOURCE_CLOCK_DISCOVERY_2026-10-06.md).
  Spot/quarterly and other symbols are not silently borrowed from this proof.
- New immutable `av_delta_rsi_polynomial_alpha_1_0_1`, adapter
  `full03.delta-rsi.v1`, contract digest
  `23dc1d78b6c8787147951ff284ffd0d6e2aec8e3f1203a75b74a124125a6d83b`.
  Old AV1.0.0, active pointers and protected strategy are unchanged. The engine
  is still pinned **QuantBT1.1.1**; these Alpha versions are not Portal releases.
- All four existing Mode1 method semantics have exact recipes per resolution:
  Advanced global, causal-inner, per-fold-decay and separate optimized
  Three Window/global. The registry contains 36 recipes (8 historical + 28 new),
  generated revision `ef26a469e4e3b2a9f33c38c232a70f4cbff709aa3d4002d529e770c34c2a76f4`.
  Historical recipe descriptors and qualification references remain identical.
- Warmup is 300 **target bars**, supplied before the first IS observation and
  excluded from scored windows. No 300-hour substitution, future coverage or
  final-OOS-as-Holdout fiction. Crypto uses fixed UTC/open-time, observed
  closed-as-of coverage; VN retains its source-local observed-date clock.
  Arrow microsecond indices are normalized to ns before UTC-ms membership.
- The actual planner remains bounded at 100,000 input bars. Span ceilings:
  1m66d / 5m333d / 15m1000d / 30m2000d / 1h,4h,1d3650d; coverage, fold count
  and runtime budgets can further refuse a request. These ceilings do not
  certify arbitrary long/costly runs. Each qualified study uses 3 real trials,
  2–16 Advanced folds, <=48 total trials, CPU120s/wall240s, 4GiB memory,
  128MiB scratch, 512MiB I/O, 16MiB per file and 128 FDs. No long-preview
  override widens the new recipes.

## Ordinary product proof and bugs repaired

[Immutable 28-row product qualification](FULL_03_PRODUCT_QUALIFICATION_2026-10-06.md)
lists every run, requested window, source/index binding, byte hash and exact
proof image. Packet SHA-256:
`d0724038ec678a2b076331a2aeb697ee602edfe54a14ac3d1b07f4a7f9f9d324`.

Each run followed authenticated P08 → P10 → isolated QuantBT child → P05 →
eight ordinary named GETs, **224 HTTP200 reads**, five core current-source
responses AVAILABLE, retained custody and Stage4 params/bundle MATCH, RC
missing0. All 28 invalid-cursor probes returned400 and all 28 valid-identity
foreign-workspace probes returned404. Native/unit fixtures are not this proof.

Three failures were retained, diagnosed and not rewritten as passes:

1. The compiled new AV shares protected kernel bytes with old P04. Migration099
   permits only that exact immutable declaration/identity beside P04; generic
   imported duplicate-code uniqueness and immutable guards still reject.
2. Dense 1m retention exceeded the existing 128-part envelope with 200-row
   storage chunks. FULL03-only storage uses2048 rows/part, while transport
   import/page limits stay **200 rows / 1MiB**. All original observations and
   Three Window replay rows remain retained; historical part layouts stay200.
3. The dense Three Window display exceeded the64KiB summary core. Only its
   display series/OHLC representation is sampled within the existing budget,
   retaining endpoints and equity/return/drawdown extrema. Optional typed
   `window_series_metadata` declares source/emitted counts and
   `MULTI_SERIES_EXTREMA_V1`; metrics, selected parameters, windows, holdout
   authority and raw retained bytes are not dropped or relabelled as full.

The final 1m Three run is `rrun_214d74b55f8f0e27098518840bd2f9ee`.
Report materialization initially returned typed503 and subsequently sealed;
the bounded probe retried only that GET, never recreated an already successful
child. Refusal responses remain in the private receipt.

Append-only migrations098(candidate identities),099(exact new AV) and
100(product proof) leave old096/097 byte-identical. Migration100 preserves
all28 candidate-history rows and adds immutable product-receipt rows.

## Gates, activation and rollback

- Source lane:198 passed /14 explicit external opt-in skips, then157 affected
  crypto/VN/preflight regressions passed. Real seven-interval query discovery
  is independent evidence, not those fixtures.
- Control API initial full isolated suite:2129 passed /2 skips; one new test
  used a repository path absent in the CI cell. Its fixture was fixed and the
  affected58/58 retaken, without rerunning unrelated gates. Final admission +
  display-contract tests62/62; exact PostgreSQL upgrade/immutability11/11.
- Child/retention final affected suite105 passed on pinned QuantBT1.1.1.
  Existing source/native opt-in skips are not counted as passes. Compiler
  predicates, generated recipe/SQL/hash checks and protected-strategy checks pass.
- Contracts final full292/292 and affected contract/foundation/preflight29/29
  pass. The isolated CI staging initially omitted the new public qualification
  packet; `scripts/contracts-test.sh` now copies that exact non-secret input
  and its three ownership/teardown tests pass. No hash guard is weakened.
  Control API image build and
  frontend `tsc --noEmit` pass. No frontend source or baseline was changed.
- Only the two Research backend images were rebuilt. Final Control image:
  `sha256:810875e7824d5c1597f6724b3589f2c55216d0b4797f08ee6b3ab55a5c70bb76`;
  API/worker:
  `sha256:6ec80522685be731e958ce0d63c9991a8dfb5c278de26930c1b7cfc295e5fdc9`.
- Research8095 final flags: both FULL03=true, normal qualification selector
  unset. Atlas28 and all seven timeframe setup calls expose four exact
  ENABLED/PRODUCT_RUN_QUALIFIED profiles. Enabled receipt SHA:
  `b694f46bc8b90878defa67d6dd447d47617bc0bd18403ae20815152f99f2d734`.
- Preview flag-off gives Atlas0/new-enabled0; disabled receipt SHA:
  `0b0e237e0c8ab416c3ae5096352175e7630ea1e550f512479c56e587e077b0c3`.
  On the owned proof cell, **56 retained Search/Freeze GETs** remain AVAILABLE/
  MATCH with the original manifest; fresh create returns409
  `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE`. Rollback receipt SHA:
  `5602788b382f3bffad2d260f8f80c69ce39daf1dda8008c7f87b7362e233e803`.
- Preview before/after:20 original seals, account/status/session-version digest,
  old AV, active pointers and index identical. After receipt SHA:
  `8b6586da4eff60d356d6a6ac371ade33f2f14ed10038248dcdf643487be24071`.
  Claude independently rebuilt frontend at05:22UTC from `portal-research-fe`,
  before FULL03 activation. Its image
  `sha256:1d4531dc216acc88d67114279402898cbd2d0451344b592a15743b810f1709a7`
  is deliberately preserved, not falsely reported identical to the earlier
  04:59 image. The receipt verifies exact image/owner worktree/creation time;
  no DB or source guard was relaxed. Claude commit `a3b4eabd` is retained at landing.

## C4 cleanup and resource decision

Private responses and credentials live only under
`/home/bobby/.local/state/portal-research-p23/20261006/full03` (0700/0600).
Twenty readers + the test approver are disabled; owner sessions revoked through
normal APIs, no credential reset. Cleanup receipt SHA:
`a66875c3d5640f1917d9088b8871e190570b3e73b9fe9546bd7c4a0f87041bd0`.
Compose down removed only the owned `portal-research-p23-ol12` containers/network,
with **zero** remaining phase containers. Four explicitly named
`portal-research-full03-20261006-{artifacts,postgres,nats,roadmap}` proof volumes
and final image tags remain for custody/reproduction; older proof volumes
and unrelated images/services are not removed.

At05:40UTC: root153GiB free /621GiB (76% used), RAM12527MiB available;
Docker images57.6GB, volumes109.4GB, build-cache156.9GB (51.4GB reclaimable).
System service inventory reports no running `actions.runner*` unit. No broad
prune or shared-cache deletion. Decision: **NO_ACTION_NEEDED** for phase-owned
runtime; capacity remains above the20%-free build threshold. Retained proof
volumes are deliberate evidence, not leaked running workers.

## Claude handoff / next approved stage

1. Consume the new immutable AV via existing typed Registry/setup; do not
   rewrite old AV declarations or clone values. Seven indexed resolutions and
   four Mode1 methods are dynamic server-owned options, not a browser allowlist.
2. Preserve entered trials/seed/PINs. Old fixed Three Window is1/no-seed;
   optimized FULL03 Three is3/seed42. Suggest/default must select exact setup
   policy, not the first protocol/mode match.
3. Generated `FixedUtcProvenance` in research-preflight/dataset-index exposes
   index/as-of/warmup clocks. Generated `ProtocolDisclosure` in current-source/
   report adds optional display metadata. Render sampled coverage honestly;
   absence on old seals does not authorize fabricated metadata or backfill.
4. Backend qualification is complete; Claude owns the S02 browser/visual
   consumer receipt on the preserved rich UI. FULL04–06 remain separately
   planned, not silently enabled. FULL04 is the next backend recommendation;
   no work starts until Bobby names it.

Commit locator: the normal-hook commit containing this packet, followed by
fast-forward landing on `docs/research-loop-plan` after preserving Claude's
concurrent commit. No remote push, dev/main, Execution or production mutation.
