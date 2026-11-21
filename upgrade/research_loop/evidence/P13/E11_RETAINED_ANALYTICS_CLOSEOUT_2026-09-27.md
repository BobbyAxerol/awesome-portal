# E11 retained analytics closeout — 2026-09-27

## Outcome

E11 is backend-complete. A sealed RS-02 current-source revision is now a
first-class, immutable authority for both Screen 01 cards and Screen 04's
named evidence response. No GET opens QuantBT, HMD, Parquet, or an artifact.

- Run Library maps the selected candidate's exact `mean_oos_sharpe` and
  `mean_decay`, and exact-sums every retained fold's `oos_trade_count` without
  IEEE-754 conversion.
- The card and lazy sparkline use one `p13r2_<retained_import_digest>` revision;
  an older P13 projection is never mixed with a newer retained seal.
- The lazy sparkline is read locally from the sealed observation relation,
  uses the bounded extrema sampler, and emits at most 24 display values.
- Screen 04 receives `research.current-source-analytics.v1`. Unsupported IS
  equity, rolling Sharpe and behaviour analytics are explicit typed absences;
  the server does not synthesize facts the current source did not publish.
- `AVAILABLE + null`, an absent value labelled available, and fake series
  links are rejected by the Zod/OpenAPI contract tests.

## Contract and source map

| Product fact | Immutable source | Published representation |
|---|---|---|
| OOS Sharpe | selected CANDIDATE `trial_facts.metrics.mean_oos_sharpe` | exact decimal + `research.metric.retained_wfo.v1.oos_sharpe` |
| Sharpe decay | selected CANDIDATE `trial_facts.metrics.mean_decay` | exact decimal + `research.metric.retained_wfo.v1.sharpe_decay` |
| Trade count | all retained FOLD `fold_facts.oos_score.oos_trade_count` | exact decimal sum; unavailable unless every fold publishes it |
| OOS equity sparkline | sealed OBSERVATION `equity` | bounded local extrema sample, revision-bound |
| IS equity / rolling Sharpe | not published by accepted source | typed `NOT_PUBLISHED`, `href: null` |
| beta/correlation/skew/kurtosis/win rate/holding/exposure/turnover | not published by accepted source | named metric with typed `NOT_PUBLISHED` |

## Verification

- Focused service/contract: 3 files, 23 tests passed.
- Contract package: 16 files, 191 tests passed.
- Control API TypeScript build: passed.
- Disposable PostgreSQL Run Library proof: 1 file, 11 tests passed.
  It appends and seals the real W3 candidate/fold fact block through the
  production custody repository, reads exact card values, reads the local
  sparkline, and pins `current_source_rows_v1_page_idx` with `EXPLAIN`.
- Frontend source was not changed. Its full `tsc -b` is currently blocked by
  the pre-existing P22 fixture missing `assignee_pool_availability`; E11's
  generated additive type introduced no identified frontend error.

## Claude handoff

Regenerate/consume `research-current-source.d.ts`. When
`evidence.analytics` is present, Screen 04 should render each metric/series by
its own availability. Older fixtures may omit the optional block and must stay
truthfully degraded; do not replace that absence with demo numbers. The Run
Library card needs no frontend calculation.

## Rollback

Revert the E11 implementation commit. There is no migration, runtime flag,
background service, or data mutation in this slice. Existing seals remain
immutable and readable through the pre-E11 named endpoints.
