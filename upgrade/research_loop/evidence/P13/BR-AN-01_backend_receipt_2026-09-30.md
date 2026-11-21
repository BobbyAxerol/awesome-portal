# BR-AN-01 — backend receipt (2026-09-30)

Status: backend implementation and focused gates passed in `codex/be-gaps`; no preview deployment, production activation, frontend edit, or remote push in this receipt. The Research Loop product gate remains separate.

## Source and authority

- The source-time Python worker computes `research.retained-analytics.v2` from the admitted QuantBT 1.1.1 result and the HMD close frame already loaded for that run. WFO uses the union of outer-test windows; fixed uses the sealed P08 OOS boundary. The worker does not open another HMD connection or reconstruct PnL, fills, objectives, or a selected-candidate IS account.
- The v2 block retains exact decimal strings, per-fact scope, origin, source locator, input digest, benchmark locator, UTC milliseconds, typed absence, a 16-KiB bound, and ≤24 points per curve. The v1 artifact and API remain readable.
- The immutable WFO artifact and fixed child receipt carry the additive v2 block. The importer persists it into the current-source seal; the Evidence Hub reads the same block. New fixed and WFO S09 reports seal its all-time metrics once; the old fold mean remains separately labelled. Old reports are not rewritten.
- S01 receives a separate `last_30d` card block (the only trailing-window exception). S13 derives common-window Sharpe from exact matched UTC-day closing equity, sample standard deviation and 365-day annualisation, with zero-variance/insufficient-data absence and exact right-minus-left delta.
- P04's single-window per-fold facts are `NOT_APPLICABLE`, not an alleged source failure. The v2 benchmark fact displaces the stale P04/WFO benchmark absence only when that fact is present.

## Contract/consumer handoff to Claude

- Regenerate/consume `ResearchRetainedAnalyticsV2` from `research-evidence.d.ts` and `research-current-source.d.ts`; `summary_analytics_v2` is additive. For S04 use `metrics`/`behaviour`, all-time curves, `benchmark_locator`, and each fact's state/reason. Label episodes as *not audited trades*. Do not request rolling Sharpe/beta/20-observation panels on the v2 lane.
- S01 `RunLibraryItem.last_30d` contains `availability`, `input_digest`, and `data` with points/return/Sharpe. Show `last 30D`; old seals return `PORTAL_ANALYTICS_V2_NOT_COMPUTED_FOR_SEAL`. Keep the existing full-scope sparkline only for v1 compatibility, not as a v2 30D substitute.
- S09 `FrozenCoreV2.metrics[]` now includes `research.metric.v2.portal_*` facts with `PORTAL_DERIVED`/`ENGINE_DIRECT` origin; the new all-time Sharpe and episode win rate feed headline. Fold mean stays a separate metric. S13 common-window `OOS_SHARPE` uses `research.compare.metric.v2.common-window-utc-daily-sharpe-365` and can be typed absent; do not infer trade win rate from it.

## Focused gates

- Pinned QuantBT Python: `test_research_portal_analytics.py`, `test_research_evidence_metrics.py`, `test_current_source_artifacts.py`, `test_advanced_walkforward.py` passed (two opt-in external HMD cases skipped).
- Control API TypeScript build passed. Focused S01/S09/analytics/compare tests passed: 47/47; WFO report regression passed: 23/23, including old-seal and v2 mapping. Contract v2 schema/generated test passed: 2/2; canonical OpenAPI component check passed.
- S13 SQL ran against a bounded disposable PostgreSQL 16 cell: compare migration 5/5 and service 13/13 passed. The four-day 1%/2%/3% versus 2%/4%/6% equity fixture proves identical daily Sharpe and 365 annualisation. That exact disposable container was stopped and removed; no existing volume or runtime was changed.
- `git diff --check` clean.

## Explicit limits

- `AN-25` selected-candidate WFO IS equity and `AN-27` per-candidate max drawdown/pool membership remain QuantBT facts, not Portal-computable under D-AN-01. They stay typed absent. `AN-29` old-seal backfill needs Bobby's decision; this slice defaults to typed absence and does not reseal history.
- This is a backend/contract receipt, not a real-API browser or Product GO receipt. Claude owns the frontend binding and visual acceptance after the contract lands on `docs/research-loop-plan`.
