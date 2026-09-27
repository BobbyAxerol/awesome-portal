# E11/E14 — Source-time analytics and real API acceptance

Date: 2026-09-27. Branch: `docs/research-loop-plan`. Base: `5a5c79b7`.
Status: **BACKEND_REAL_API_ACCEPTED · E11_CONSUMER_PENDING**.

## Scope and correction of the earlier closeout

Read the Unified E11–E17 ledger, P13/E11 historical closeout, P14/E14
superseded draft, P18/E14 Claude receipt, E17 backend packet, and Research
working rules A13. The earlier E11 statement that hourly input cannot support
daily rolling Sharpe was wrong: QuantBT resamples the scoped returns itself.
The earlier closeout only delivered the Library slice, not the full E11 goal.
This addendum supersedes those statements without deleting historical evidence.

The producer now seals `research.retained-analytics.v1` from the already
computed QuantBT 1.1.1 result. The confined child does the work once. WFO
uses the engine's union of actual outer-test windows; FIXED uses immutable
P08 IS/OOS boundaries. GETs read PostgreSQL projections, never QuantBT/HMD
or artifact files. There is no new service, migration or production activation.

| Requirement | Source/authority | Named DTO and bound |
|---|---|---|
| Library OOS Sharpe/decay | selected retained candidate metrics | existing card stats, same retained revision |
| Library OOS trades | exact sum of every published fold count | explicit OOS scope/definition; not total child trades |
| Library sparkline | retained observation/P13 series | existing lazy read, at most 24 values; source lane stated |
| Total trades | `QuantBT.full_report(full).num_trades` | `summary_analytics.total_trade_count`, integer string, CHILD_TAPE |
| IS equity | actual FIXED result restricted to `[IS.start,OOS.start)` | `in_sample_equity`, at most 24 extrema-preserving points |
| WFO selected-candidate IS | not in the final-account result | NOT_PUBLISHED with exact source locator; no flat pre-OOS substitute |
| Rolling Sharpe | engine `rolling_sharpe(window=63,trading_days=365)` | at most 12 points; qualified long run AVAILABLE, short run typed |
| Six behaviour tiles | audited ledger or explicit source-derived bar facts | all six slots; availability/value/reason mutually consistent |
| Report net OOS | engine `full_report(scoped).total_return_pct / 100` | existing NET_RETURN headline, label Net OOS return, scope OOS |
| Whole-account return | unchanged original Hub/passport authority | separately retained metric, never renamed OOS |

Financial values are exact decimal strings; times are UTC milliseconds.
The block is bounded to 16 KiB and 2,000,000 source observations. IS excludes
warmup and OOS. Source input digest covers the reporting input and bounded
facts. Portal artifact provenance is retained on the writer file; the public
DTO excludes writer metadata. Old raw blocks and seals remain readable.

## Real product API receipt

Owned loopback cell: `portal-research-e17`, port 8098, separate PostgreSQL,
NATS and artifact volumes, readonly historical reader. No preview 8095,
stable, AWS-HK, account reset, remote push or Trading System change.

| Profile | Real run | Dataset and window | Observed result |
|---|---|---|---|
| WFO | `rrun_2f8f41dddf41129d5eef84d86903e3b0` | crypto-binance-1m, BTCUSDT/1h, 2026-06-01–09-01, first OOS June 15, weekly expanding, Mode 1 global, 3 trials, seed 42 | COMPLETED seq 44; 1,872 OOS observations; 77 daily returns; rolling AVAILABLE with 12 points |
| FIXED | `rrun_71d45ff4b86492bb5f526e272fcb5112` | same dataset/symbol/timeframe; IS June 1–8, OOS June 8–15, holdout June 15–17 excluded from child | COMPLETED seq 33; IS 168 observations/13 display points; OOS 168; short rolling NOT_APPLICABLE |

Both runs were admitted through P08/P10, executed by the confined worker,
retained through P05 and consumed via actual named Portal APIs. Library,
sparkline, Evidence, Split, Search and Report all returned 200. WFO stitch
is AVAILABLE with boundary MATCH and a Portal-plan digest; gap scan is
AVAILABLE with the QuantBT boundary-event basis. FIXED Search reports
DECLARED_NOT_EXECUTED. Report net OOS equals the sealed engine fact.
The real WFO seal has 12 stitched segments and 11/11 measured crossings.
Its selected global candidate drawdown is AVAILABLE with source
RETAINED_STITCHED_OOS_PATH. Feasible remains NOT_APPLICABLE /
`QUANTBT_WALK_FORWARD_STUDY_DECLARES_NO_CONSTRAINTS`, never an inferred count.

After restarting only Control API, both runs passed equality checks of the
analytics block, card stats, sparkline values and frozen Report core. No engine
was relaunched for receipt URL errors or restart proof. The new FIXED run was
necessary for the changed Report assembly; an old frozen report was not rewritten.

Private complete response receipts are mode 0600 under the owned state
directory. Sanitized hash references (no credentials, bars or business rows):

- WFO full E14 + restart receipt SHA-256:
  `020884e7677d1076ac974b879197ed69c49ce67d73f93ffa3aa88aeeea332880`.
- FIXED full E14 + restart receipt SHA-256:
  `720a7b2f5a692a2ec40f4fd6064d38be69a74f2b721f967d055b7d7a5c100435`.
- Post-patch Control API manifest:
  `sha256:a4b56471bffc2e342dd05537daf38a43d2e6f1b764ee8ca1dceeb7439e28357f`.
- Portal API/worker manifest:
  `sha256:06bdb8ddc4a38f19d2f2571f10acbe366fa6150a24891b0ee6fae1df941cdc59`.

These are dirty-worktree qualification images, not signed releases. The
source/provenance writer-format follow-up is additionally exercised by the
actual QuantBT/P05 adapter test; it does not change financial calculations.

## Truthful source absences

Both real signal-notional results have zero audited trade-ledger rows. Thus
win rate, payoff ratio, average hold and maximum consecutive losses are
NOT_PUBLISHED / `QUANTBT_ROUTE_PUBLISHES_NO_AUDITED_TRADE_LEDGER`, with
`QuantBT.result.trades` as locator. Trade count or bar returns must not fill
these slots. Turnover and exposure are AVAILABLE, labelled SOURCE_DERIVED;
exposure is the fraction of nonzero-position OOS bars, not an audited fill metric.

WFO selected-candidate IS is NOT_PUBLISHED /
`QUANTBT_WFO_HAS_NO_SELECTED_CANDIDATE_IS_ACCOUNT`. FIXED short rolling is
NOT_APPLICABLE / `P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW`. Older seals
without the analytics block state that they predate it; they are not backfilled.

## Tests and compatibility

- Independent actual engine/report oracle tests cover WFO union-of-windows,
  gap exclusion, FIXED IS/warmup/OOS separation, total trade authority,
  source-derived exposure, short/long rolling and deterministic input digest.
- Focused Python writer/adapter/producer/supervisor/provenance: 30 pass, 1 skip.
- Snapshot/provenance/freeze regression after regeneration: 39 pass.
- Control API five focused suites: 62 pass, including both new Report lanes.
- Evidence/Report contract package: 7 pass. Control API TypeScript build: PASS.
- Canonical JSON Schema, Zod, both published OpenAPIs and private ingress
  agree on scopes, exact values and AVAILABLE/null refusal. Private ingress
  also binds total trade count, OOS count and IS chronology to the receipt.
- The E17 private producer-envelope OpenAPI/type parity omission was repaired
  with the existing exporters; public legacy paths and run-request schemas
  did not change. No hand-written frontend code or baseline was edited.
- Mandatory pre-commit result is recorded in the commit/tool transcript;
  this packet does not infer that result from the focused counts above.
- First mandatory gate attempt: 1,292 Control API tests passed, two tests and
  one suite failed because new fixture readers ignored `PORTAL_CONTRACTS_DIR`
  inside the disposable Docker cell. The three readers now honor that existing
  mount contract; no expected value, assertion or test admission was weakened.
  The first attempt is not a PASS and is not replaced by the local counts.

## Claude consumer handoff — do not replace the rich composition

Generated types: `research-evidence.d.ts` → `EvidenceHub.summary_analytics`;
`research-current-source.d.ts` → `Evidence.summary_analytics`.

On S04 use the block's IS points, rolling points and six behaviour slots;
render their own state/reason/scope. If an old fixture omits the optional block,
keep the existing typed degraded panel. Do not call a WFO final-account prefix
selected-candidate IS. A child-tape count and summed fold-OOS count are separate
authorities and need their existing labels, not an inferred audited ledger.
S09 keeps the same NET_RETURN key and reads the server label/scope/value.
No frontend visual or real-browser acceptance is claimed by this backend packet.

## Cleanup and rollback

No active child remains; observed worker CPU 0%, RSS about 94 MiB. Control API
RSS about 73 MiB; host available RAM 22,136 MiB and root free 266 GiB (42%).
No global Docker prune or volume deletion was run. Named follow-up owner Codex:
stop the exact `portal-research-e17` cell after E13/E16 qualification, retain
its private receipts and required rollback/data volumes. Disposable test suites
tear down their own PostgreSQL resources through their existing traps.

Rollback the additive code/contract commit and restore the prior owned image.
Existing immutable seals/reports are not rewritten. Keep the qualified profile
flags confined to this test overlay; this is not permission to enable Research
or imported execution in production.
