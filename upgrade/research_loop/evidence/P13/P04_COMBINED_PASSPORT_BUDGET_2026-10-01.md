# P04 combined evidence passport — 2026-10-01

## Real failure and bounded correction

Regression run `rrun_3955ea932446580929253b86ec5e7317`, admitted through the real preview P08/P10 path on `83201af3`, failed in the fixed child at S4: `P13 evidence receipt exceeds the child byte budget`. Private failed-receipt SHA-256 `43279fb5be9f7aa991c61729444d33f5ad89ce17dc03e7b0fc06fe46a058fe5a`. This is an adapter transport-envelope error, not evidence that QuantBT cannot run the Alpha. No false PASS, retry of the same immutable failed run, budget increase or replacement sample values.

The additive v2 block and V1 compatibility block were bounded individually, not together with the original display series. The correction fits only the already declared equity/rolling display samples to the combined envelope, preserving chronological endpoints and extrema, source counts, direct/derived metrics, all analytics facts and digests. Emitted-count/sampling metadata changes with the sample. It reserves truthful optional-analytics and candle absence envelopes before fitting; optional analytics cannot consume their final-envelope space. The existing 24-KiB P13 and 16-KiB v2 limits remain unchanged. If mandatory facts still cannot fit, the child fails closed rather than deleting a metric.

## Tests and acceptance status

Pinned QuantBT 1.1.1 focused Python: 32 pass / 1 optional HMD skip. The skipped HMD test was then explicitly enabled with the installed reader and read-only canonical store and passed (two real BTCUSDT ranges), checking engine OOS metrics and finished receipt size. Independent pressure test checks envelope size, immutable metrics/digests, source counts and sampled extrema/endpoints; an irreducible envelope still fails.

Status: `CODE_TESTED / PREVIEW_FIXED_RUN_PENDING`. A new fixed-profile create/child/seal/Hub/Library/Report receipt is required after the corrected image lands; the direct helper test does not substitute for that product receipt. No frontend, public contract shape, production flag, source data or remote is changed. Old source receipts/reports remain immutable.

## Frontend handoff

BR-F4-09 already has the named optional `EvidenceHub.summary_analytics_v2` contract; missing older P04 receipts must not be relabeled. Claude keeps all-time analytics for S04/S09 and last-30D only for S01. This correction lets new fixed runs publish the existing v2 block without failing the child; it does not backfill old P04 seals. S09 source-file digest is distinct from chart point sampling or input digest.
