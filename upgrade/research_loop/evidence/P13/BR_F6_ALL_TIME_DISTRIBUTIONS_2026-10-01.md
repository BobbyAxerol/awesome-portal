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

## Actual-image preview acceptance — supersedes the pending gate above

Code **`cf8dc871`** is landed on `docs/research-loop-plan`, after retaining
Claude's `7e98a18d` and `31a61da6`. The queue conflict kept both Claude's complete
B6 `enrich_analysis` request and this receipt; no frontend implementation was
edited or discarded. Required full hook passed: **Control API 1,411 pass / 1 skip;
contracts 206/206**. Forward migration 082, immutable UPDATE/DELETE and runtime
SELECT-only were covered by the real PostgreSQL RS-02 **9/9** gate.

Only the two backend images were built from the clean landed checkout, then
the owned :8095 preview was refreshed and nginx re-resolved. QuantBT remains
**1.1.1**, no WFO/optimizer rerun. Exact identity:

- Control API: `sha256:96d9dc6141afa2124a4f4696123a3e9b1bbc71c1dff2a8e06e2d658904da879d`
- Python API/worker: `sha256:e94e9bc72bb58a9c71ebbf663109a6ef26393604aa2e984e4d806aeaccfe662c`
- Web unchanged: `sha256:6883c4175e3e0f77d863b51b4cba2050eba5aca0c2704b81237f6fbb5fad93d0`

The census contained **12 eligible WFO seals: ten old + two newer** (not twelve
old seals). Dry-run/apply created twelve separate distribution companions;
retry was ALREADY_BACKFILLED with the same digest for every run. All twelve
real same-origin Hub/monthly/histogram reads passed. No source fetch/job was
created; all original seal-summary/import and existing AN-29 checksums, frozen
Report core, Freeze and Replay source content matched the captured before-read.
Only TTL cursors are normalized in the Replay comparison.

| Run(s) | Monthly points | Daily returns | Result |
|---|---:|---:|---|
| R-WFO-009…017 (nine seals) | 1/run, partial disclosed | 13/run | Both series AVAILABLE |
| R-WFO-020 | 2 | 59 | Both series AVAILABLE; old AN-29 unchanged |
| R-WFO-022, R-WFO-023 | 2/run | 61/run | July + August, leading July explicitly partial |

The independent operator receipt reread sealed OOS boundaries/observations,
checked each UTC monthly close/base ratio and population, derived daily closes
with QuantBT's declared UTC daily/forward-fill policy, and checked every
histogram bin/count. R-WFO-023: **1,488 OOS bars → 62 daily closes → 61 returns**;
histogram counts sum to 61. Partial does not claim a fabricated prior-month close.

Private receipts (0600 under an owned 0700 directory; no credentials committed):
`/home/bobby/.local/state/portal-research-be-gaps/2026-10-01-f6/`.

- Before API: SHA-256 `94c288fa5437d462c80a7f86559145c3ac879b7f5477270452a97be0889447ec`
- Dry/apply/retry: SHA-256 `ae64ebec22466e486cad66dd1ca040452618d9405bc2aa37a825995d46292671`
- After API + independent oracle: SHA-256 `b2e94776d6c4ad0faa721ff07a9c06718f5b5da8e20b1e0d52acfb4d3c570e62`

Verdict: **BR-F6-01/02 PREVIEW_ACCEPTED for this twelve-seal WFO set**. Claude
can consume these named series now; browser/design acceptance remains theirs.
This is the reusable distribution foundation of B6/ER-03/04, **not ER-01…10
completion**. `enriched_analysis`, Library all-time, P04 first-month read binding,
episodes and supplemental Report still follow the newly preserved B6 spec.
Metadata index, executor v2, audit/exposure writer and aggregate P23/P24 are not
closed by this receipt. Original datasets, seals, profiles and production unchanged.

C4: disposable hook cells cleaned by their owner script; no blanket prune or
volume deletion. Root 224 GiB free, RAM 16 GiB available. Active preview retained
for Claude review. No remote push, dev/main merge or production deployment.
