# P04 combined evidence passport — 2026-10-01

## Real failure and bounded correction

Regression run `rrun_3955ea932446580929253b86ec5e7317`, admitted through the real preview P08/P10 path on `83201af3`, failed in the fixed child at S4: `P13 evidence receipt exceeds the child byte budget`. Private failed-receipt SHA-256 `43279fb5be9f7aa991c61729444d33f5ad89ce17dc03e7b0fc06fe46a058fe5a`. This is an adapter transport-envelope error, not evidence that QuantBT cannot run the Alpha. No false PASS, retry of the same immutable failed run, budget increase or replacement sample values.

The additive v2 block and V1 compatibility block were bounded individually, not together with the original display series. The correction fits only the already declared equity/rolling display samples to the combined envelope, preserving chronological endpoints and extrema, source counts, direct/derived metrics, all analytics facts and digests. Emitted-count/sampling metadata changes with the sample. It reserves truthful optional-analytics and candle absence envelopes before fitting; optional analytics cannot consume their final-envelope space. The existing 24-KiB P13 and 16-KiB v2 limits remain unchanged. If mandatory facts still cannot fit, the child fails closed rather than deleting a metric.

## Tests and acceptance status

Pinned QuantBT 1.1.1 focused Python: 32 pass / 1 optional HMD skip. The skipped HMD test was then explicitly enabled with the installed reader and read-only canonical store and passed (two real BTCUSDT ranges), checking engine OOS metrics and finished receipt size. Independent pressure test checks envelope size, immutable metrics/digests, source counts and sampled extrema/endpoints; an irreducible envelope still fails.

Status: `CODE_TESTED / PREVIEW_FIXED_RUN_PENDING`. A new fixed-profile create/child/seal/Hub/Library/Report receipt is required after the corrected image lands; the direct helper test does not substitute for that product receipt. No frontend, public contract shape, production flag, source data or remote is changed. Old source receipts/reports remain immutable.

## Frontend handoff

BR-F4-09 already has the named optional `EvidenceHub.summary_analytics_v2` contract; missing older P04 receipts must not be relabeled. Claude keeps all-time analytics for S04/S09 and last-30D only for S01. This correction lets new fixed runs publish the existing v2 block without failing the child; it does not backfill old P04 seals. S09 source-file digest is distinct from chart point sampling or input digest.

## Corrected-image product receipt — PASS

Supersedes `PREVIEW_FIXED_RUN_PENDING` for this exact new run. Commit `f71f7438` passed the full hook (Control API 1,408 pass / 1 skip; contracts 205/205) and landed fast-forward on `docs/research-loop-plan`. Only the Python image was rebuilt for this correction; unchanged Control API and Claude frontend were retained.

**R-P04-021** `rrun_ece579eb6e0538ab5508f154fd3deb23` ran through authenticated same-origin P08 preflight → P10 admission → confined fixed child → P05 seal → actual Hub/Library/Report reads. HMD read-only `crypto-binance-1m`, BTCUSDT/1h; IS 2026-06-01..07-01, OOS 2026-07-01..08-01, holdout 2026-08-01..09-01 (not supplied to the child), one fixed qualification, no optimizer or seed. Terminal `COMPLETED`, source sequence 33. This is a new run, not a mutation/retry of the failed run.

Hub returns `research.retained-analytics.v2`: 744 OOS observations, all 14 metric facts and eight behaviour facts AVAILABLE, input SHA-256 `eaaf184e500478fb5b137c47340fbcdcc20f370d72a4ea9d860bc477b5c874c0`. Library last-30D is AVAILABLE with 19 points. Frozen Report revision `p18r1_07638ca914eeeb8b96cce1be2bf58a71a90d3e2b87490a24247f3628f54d67e6`; final-audit kind `REUSED_ORIGINAL`. Largest captured API response 88,911 bytes (<1 MiB); the child completed with its unchanged 24-KiB passport guard. P04 publishes no running optimizer rate, so no false zero/rate is asserted.

Exact running Python API/worker image `sha256:265578fd25c3aacf48adb42f16994611ccff03843e5bc488118e789a758ee53a`; Control API `sha256:9ce39caca76183e8b2510bd78bc910dd277ede2a44b201d8624c226e18ce4b88`; web `sha256:6883c4175e3e0f77d863b51b4cba2050eba5aca0c2704b81237f6fbb5fad93d0` unchanged. Complete private receipt SHA-256 `f8acd2ad0e51155f2379e4e776f910d0ed57d1c008fd67772dc02f33660e4180`, owner-state directory 0700 / JSON 0600. The failed receipt/log remain separately retained.

BR-F4-09 is **PREVIEW_ACCEPTED_NEW_FIXED_RUN**, not a retrofit of R-P04-018 or every old fixed seal. BR-F4-01 canonical `1d` also passed an actual catalog GET on the corrected runtime (private receipt `42a39c547342638ce49e23cfd7d64ac459c7e98014a157f28c7f591e565ec1f1`). No claim that the entire historical catalog or every parameter/profile is accepted. P04's older frozen digest absence, exact preflight catalog bounds, requested-spec v2 executor and P23/P24 remain separate queue items.

C4: root 228 GiB free (~36%), RAM 15 GiB available. The owned preview remains for Claude/Bobby review; the hook cleans its disposable cells. Another agent's active test cells are explicitly preserved. `NO_ACTION_NEEDED` for destructive cleanup; no prune, data/volume deletion, production change or remote push.
