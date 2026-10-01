# BR-F6-01/02 — verified retained monthly returns and daily histogram

## Scope and source truth

Old current-source seals lack the OOS marker and correctly refuse their old
pre-OOS derived series. AN-29's immutable analytics row also cannot be replaced.
Migration **082** therefore adds a separate append-only distribution companion,
bound to workspace/run/artifact revision, the exact retained-import receipt and
source-row/derived SHA-256. Original P05 seal, AN-29 analytics, frozen Report,
Freeze/Replay and source byte digests are not rewritten.

The operator-only existing CLI accepts `--distributions` after `--dry-run` or
`--apply`. It verifies the sealed batch-receipt digest and contiguous bounded
FOLD/OBSERVATION rows, then uses pinned QuantBT 1.1.1's outer-test union. It does
not run a strategy/optimizer, fetch HMD or access Trading System. Runtime roles
only SELECT; an existing companion is an idempotent no-op, never overwritten.

Monthly returns use the first retained OOS close as the leading-month base and
the previous observed month close thereafter. First month is explicitly partial;
each point publishes basis, observation count and source UTC millisecond bounds.
Missing months are not zero-filled. An initial month with one close cannot
produce a return and is counted as omitted. More than 32 months retains an
explicit transport tail/count disclosure, not a rolling analytics input.

Histogram uses **all-time UTC daily source returns**, not per-bar or per-trade
returns. Twelve exact-decimal bins count against their published boundaries;
the last upper bound is inclusive. Counts sum to the daily population. Missing
or constant daily samples return typed NOT_APPLICABLE, not fabricated zeros.

## Named contracts and Claude handoff

Keep the existing `researchCurrentSourceEvidenceSeriesGetV1` reads for
`MONTHLY_RETURNS` / `RETURN_DISTRIBUTION`; no new browser route or source cursor.
Use generated `ResearchCurrentSourceEvidenceSeriesResponse`, `MonthlySample`,
`SeriesDerivation` and `ResearchAnalyticsV2Distributions`. MonthlySample's new
fields are optional for historical compatibility: `partial`, `observation_count`,
`basis`, `base_at_utc_ms`, `close_at_utc_ms`. `source_sample.derivation` discloses
PORTAL_DERIVED/OOS, definition, input digest, grain and OOS population. Histogram
count labels must use `source_sample.source_observation_count` (days), not OOS bars.

Evidence includes the companion under `summary_analytics_v2.distributions` when
the supplemented block fits its existing 16-KiB budget. Otherwise the immutable
original block stays intact and the same named chart reads remain available.
Hub and these two charts receive companion-bound revisions/ETags. Other source
reads and immutable reports are unchanged. No Codex frontend edit; Claude owns
visual/browser acceptance and should retain rich panel layout and absence states.

## Code verification / runtime gate

Focused Python: **34/34** (actual pinned QuantBT 1.1.1 installed), including
independent month arithmetic, omitted months, daily-vs-hourly counts, inclusive
boundaries, zero-variance, long-history disclosure, old sidecar and fixed passport
regression. Fixed passport still fits 24 KiB and retains its minimum truthful
candle overview. Focused TS checks companion shape/counts, existing v2
compatibility, import/hash binding and no source-row computation during GET.
Full mandatory commit hook and actual-image preview receipt are recorded below
after they run; neither is inferred from unit tests.

Runtime gate: migration 082 first, code/image from landed clean Research HEAD,
operator dry-run/apply, then real same-origin Hub/monthly/histogram reads. Prove
old/new WFO read parity, source/seal/Report immutability, idempotent retry, and the
leading July period of R-WFO-023. No optimizer rerun needed. Initial verdict:
**CODE_READY / PREVIEW_RECEIPT_PENDING**, not whole Research/P23/P24 completion.
