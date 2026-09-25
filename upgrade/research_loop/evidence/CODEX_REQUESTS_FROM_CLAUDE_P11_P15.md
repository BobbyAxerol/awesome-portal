# Requests to Codex — P11→P15 backend gaps (RF-05), 2026-09-24

From Claude's browser audit
([AUDIT_P11_P15_CLAUDE_2026-09-24.md](./AUDIT_P11_P15_CLAUDE_2026-09-24.md))
and Unified §13 **RF-05**. Screens 03, 01, 04, 05, 06. Items already filed in
[CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md](./CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md)
(`CG-P10-02`, `CG-P05-01`, `CG-P11-03`, `CG-P06-02`, `CG-P10-04`, `CG-P08-06`,
`CG-P02-02`) are not repeated; they remain the biggest blockers for these
screens because every live run is the fixed profile with no retained source.

## Prompt for Codex (Bobby pastes this)

```text
Codex — RF-05, Research Loop backend repair P11–P15 (after or alongside RF-03).

Read, in this order:
1. upgrade/UNIFIED_IMPLEMENTATION_PLAN.md §13: rows RF-05 and RF-06, then the
   "RF-05" section.
2. upgrade/research_loop/evidence/AUDIT_P11_P15_CLAUDE_2026-09-24.md §1, §4, §5.
3. This file (request list). Each item: gap with file:line, evidence, blocked
   HiFi element, done-when.
4. The Astra checkpoint (UNIFIED §13 "P13–P17 cross-review checkpoint") and
   upgrade/research_loop/P13_P17_ASTRA_AUDIT_AND_REMEDIATION_PLAN.md — several
   items here are its reopened A02/A03/A04/A06/A09/A11/A12.
5. Packets evidence/P11…P15, RS-01…RS-03, RF-03 before touching each phase.

Then:
- Bugs first: CG-P15-02, CG-P12-08, CG-P13-11, CG-P11-06, CG-P12-05, CG-P12-07,
  CG-P11-04, CG-P14-04, CG-P13-06.
- Contracts: change OpenAPI/zod/schema, regenerate packages/contracts/generated,
  fixtures + contract tests; declare each id in this file as DELIVERED <commit>
  with the generated type and one example. A fact the source cannot supply is a
  typed NOT_PUBLISHED / NOT_APPLICABLE with a reason — never a sample value.
- DQ-13 (stream shape) is Bobby's; do CG-P11-08 only after his answer.
- The shared checkout is also Claude's: commit only your paths (git commit -- <paths>),
  never stage or edit apps/portal/frontend/**; if a contract change breaks a
  frontend fixture, list it here and Claude updates it.
- Branch docs/research-loop-plan only; push origin + primus-origin; update the
  RF-05 row with commits and DELIVERED ids.
```

## Status legend

`OPEN` · `DQ` (Bobby) · `DELIVERED <commit>` · `CONSUMED <commit>` (Claude rendered it).

## P11 — progress (Screen 03)

| Id | Gap → need | Evidence | Blocks | Status |
|---|---|---|---|---|
| `CG-P11-04` | Budget is the literal `{used:"0",cap:null,pct:0}`; no producer emits `budget_tick`; P06 enforces a cap that is never published; `run_completed.usage.cpu_seconds=7` is not reflected | `research_progress.py:660,834-842`; live progress | S03 budget bar (shows 0 for an 8-s run) | DELIVERED `5bc77b9b` |
| `CG-P11-05` | Preview never enables `FEATURE_RESEARCH_RETAINED_ARTIFACTS`, so the P05 `run_receipt` (`d820d5ce`) never reaches S03; say whether the preview may enable it | `scripts/research-preview/preview.sh:73-81`; `deploy/compose.research-progress.yaml:13,56` | S03 retained tables | DELIVERED `dba47502` — preview enables RETAINED_ARTIFACTS |
| `CG-P11-06` | Run cancelled before source keeps `terminal_materialization: PENDING` forever (enum has `NOT_REQUIRED`); attempt `LOST_LEASE` ends ~18 min after claim; `retry_not_before` set on a cancelled run — confirm semantics | `progress.service.ts:50`; live cancelled progress | S03 cancelled state | DELIVERED `7e3e7ee9` (W2; sweep cadence unchanged, now visible) |
| `CG-P11-07` | `retry_reason: P12_OWNED_NO_P11_RETRY_ROUTE` names an owner with no route; spec 03 wants "new run with same draft (?from={id})" → needs a requested-spec read for clone | `progress.service.ts:56,298`; spec 03 §184 | S03 failed-state action | DELIVERED `7e3e7ee9`, `8df45ab6`, Screen 02 `?from=` `d957b087` |
| `CG-P11-08` | Stream shape: snapshot only on heartbeat/terminal frames and the read-level `current`/`availability` never re-sent. Attach a snapshot (or read delta) to each event | live SSE trace (23 frames) | S03 live rail/%/artifacts/status | DELIVERED `7e3e7ee9`, `8df45ab6` (DQ-13 applied) |
| `CG-P11-09` | `run_completed.payload` carries `evidence_digest`, `split_digest` not declared in `ProgressCompletedPayload`; `usage.peak_rss_bytes=0`, `fd_peak=0` are unmeasured values reported as 0 (should be null / typed) | live SSE; `research-progress.openapi.json` | contract truth | DELIVERED `7e3e7ee9`, `9d5c7ac3` |

## P12 — run library (Screen 01)

| Id | Gap → need | Evidence | Blocks | Status |
|---|---|---|---|---|
| `CG-P12-02` | COMPLETED stats (`OOS sharpe · Δ decay · trades`) hard-coded null though the P13 projection has `TRADE_COUNT`; join it (Sharpe/decay after `CG-P13-03`) | `run-library.service.ts:544-555` | S01 card stats | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |
| `CG-P12-03` | Sparkline hard-coded NOT_PUBLISHED though P13 `EQUITY_OOS` (25 pts) exists; P12 to-do asks ≤ 24 points | `run-library.service.ts:251,380-385` | S01 sparkline | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |
| `CG-P12-04` | Mode chip built as `mode · protocol`; spec 01 says `mode · schedule`; `filter_catalog.modes` lists the protocol key as a mode | `run-library.service.ts:429-435`; `run-library.repository.ts:300`; spec 01 §76 | S01 mode chip/filter | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |
| `CG-P12-05` | `claim_ledger.pending_source` counts cancelled-before-source and legacy rows; cancelled rows get `P11_PROGRESS_SNAPSHOT_NOT_PUBLISHED` instead of `CANCELLED_BEFORE_SOURCE` | `run-library.repository.ts:243-245` | S01 ledger strip, cancelled card | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |
| `CG-P12-06` | `rc` hard-coded null though P21 relations exist (migration `…055`) | `run-library.service.ts:357` | S01 rc chip (disabled until S11) | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |
| `CG-P12-07` | Legacy row: `binding: null` with `binding_availability: AVAILABLE` → shown as scratch; should be `LEGACY_METADATA_ONLY`; legacy row still QUEUED (stale 1.0.8 record) while its progress read is 404 | live library | S01 legacy row | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |
| `CG-P12-08` | `before` cursor off by one: from page 3 "← newer" repeats a boundary row and skips one | live, `limit=4` paging | S01 paging | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |
| `CG-P12-09` | Claim for the same COMPLETED run: library `text=null, NOT_PUBLISHED/SOURCE_CLAIM_NOT_ISSUED`; hub `NOT_ISSUED` with the server sentence — carry the same claim | live library vs hub | S01 vs S04 contradiction | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |
| `CG-P12-10` | `q=` does not match mode (`three_window` finds only the legacy row); `Delta-RSI` matches the unbound legacy row | live library | S01 search | DELIVERED `7b80ae07` (Claude) · CONSUMED RF-06 wave C |

## P13 — evidence hub (Screen 04)

| Id | Gap → need | Evidence | Blocks | Status |
|---|---|---|---|---|
| `CG-P13-03` | Metric registry has 8 keys; no OOS Sharpe/Sortino/CAGR/profit factor/hit rate/decay though the engine computes them (Astra A09) | `evidence-metric-registry.ts:15`; `quantbt/portfolio.py:534-546` | S04 tiles, verdict header; S01 stats | DELIVERED `b1f76bd3` (Claude) · CONSUMED RF-06 wave C |
| `CG-P13-04` | Only `ROLLING_RETURNS_20`; spec wants rolling Sharpe(63) and beta vs BTC (A09) | spec 04 §68 | S04 rolling row | DELIVERED `b1f76bd3` (Claude) · CONSUMED RF-06 wave C |
| `CG-P13-05` | Chart caps 32/16/32/12 (live 25 of 744 equity points, 15 of 724 rolling); A02 wanted full resolution retained in P05 — confirm the intended envelope | `research_child.py:48-51`; RS-01 report | S04 equity/underwater | DELIVERED `b621c5af` (W3) |
| `CG-P13-06` | `MONTHLY_RETURNS` `AVAILABLE`/`FULL` with 0 values for a one-month OOS; give a typed reason or a month-boundary base | `research_child.py:195-232` | S04 monthly heat | DELIVERED `b1f76bd3` (Claude) · CONSUMED RF-06 wave C |
| `CG-P13-07` | Claim-strip facts (`validation_claim`, `chronological_claim`, `oos_used_for_selection`, execution contract, runtime authority); `route.contract` NOT_PUBLISHED | spec 04 §31-41 | S04 claim strip | DELIVERED `b621c5af` (W3) |
| `CG-P13-08` | Per-fold verdict facts (S_OOS, decay, trades, maxDD, contrib, worst moment, verdict) — engine `fold_metrics` has most | `research-current-source.d.ts:191-198`; `walkforward.py:2104-2120` | S04 per-fold table | DELIVERED `b621c5af`, `29c607c8` (W3) |
| `CG-P13-09` | One refusal code for PENDING_RETENTION / NOT_RETAINED_LEGACY / not retainable (fixed profile); state only in message text. Give a typed state, and a non-409 typed answer for a run whose profile can never be retained (the 409 also logs a console error every visit) | `current-source.service.ts:438-453` | S04/S05/S06 retained panels | DELIVERED `c0021ba5` (Claude) · CONSUMED RF-06 wave C |
| `CG-P13-10` | Hub `run_identity.status` READY vs COMPLETED elsewhere, no published mapping | `evidence.contract.ts:122` | S04 status pill | DELIVERED `b1f76bd3` (Claude) · CONSUMED RF-06 wave C |
| `CG-P13-11` | Hub `revision` identical for two runs with different manifest/effective-spec digests — `seriesMatchesHub()` cannot catch a wrong-run series (Astra A04) | live hubs `rrun_80d3…`, `rrun_3111…`; `evidence.service.ts buildWrite` | S04 integrity | DELIVERED `b1f76bd3` (Claude) · CONSUMED RF-06 wave C |
| `CG-P13-12` | No terminal flag: CANCELLED/legacy runs return `NOT_READY` like in-progress ones | live hub | S04 "watch progress" on a cancelled run | DELIVERED `b1f76bd3` (Claude) · CONSUMED RF-06 wave C |
| `CG-P13-13` | ETag strong/weak varies by gzip; weak `If-None-Match` returns 200; no `Cache-Control` on hub, series, split, search | live headers | revalidation | DELIVERED `b1f76bd3 + c0021ba5` (Claude) · CONSUMED RF-06 wave C |

## P14 — split (Screen 05)

| Id | Gap → need | Evidence | Blocks | Status |
|---|---|---|---|---|
| `CG-P14-02` | RS-02 `Fold` lacks warmup / label horizon / purge / embargo / inner folds though the engine fold payload has them | `research-current-source.d.ts:191-198,275-280`; `walkforward.py:173,224,240-250` | S05 fold anatomy, S04 split tab | DELIVERED `b621c5af` (W3) |
| `CG-P14-03` | Three-window run labels purge/embargo/inner folds NOT_PUBLISHED; the request cannot carry them, so NOT_APPLICABLE is the true state; `holdout.bars: null` without a reason | live split | S05 protocol/holdout | DELIVERED `c0021ba5` (Claude) · CONSUMED RF-06 wave C |
| `CG-P14-04` | `as_of_utc_ms` is read time (changes between GETs under one ETag); make it projection time or rename | live split (two GETs 1.5 s apart) | S05/S06 as-of | DELIVERED `c0021ba5` (Claude) · CONSUMED RF-06 wave C |
| `CG-P14-05` | No timeframe / bar interval fact on the split DTO | spec 05 §14 | S05 "span · 1h bars" | DELIVERED `c0021ba5` (Claude) · CONSUMED RF-06 wave C |
| `CG-P14-06` | `source_absences` duplicates `protocol.*` one-for-one; say which is authoritative | live split | S05 duplicate absences | DELIVERED `c0021ba5` (Claude) · CONSUMED RF-06 wave C |

## P15 — search (Screen 06)

| Id | Gap → need | Evidence | Blocks | Status |
|---|---|---|---|---|
| `CG-P15-02` | Search ETag ignores `fold`: `?fold=3` with fold 1's ETag → 304 while bodies differ in `requested_fold` (Astra A06 residual) | live, curl | S06 fold inspection | DELIVERED `c0021ba5` (Claude) · CONSUMED RF-06 wave C |
| `CG-P15-03` | RS-02 search lacks trial→fold/stage link, typed `Trial.state`, per-trial metrics/constraints/feasible, raw best vs selected vs centroid, fold filter/jump | `research-current-source.d.ts:199-224,619-625` | S06 Stage A/B, funnel, ledger | DELIVERED `b621c5af` (W3; constraints/feasible typed NOT_PUBLISHED — source drops per-fold rows) |
| `CG-P15-04` | objective components / prune reasons / importance labelled NOT_PUBLISHED without a capability probe though `OptimizationResult` carries state, metrics, constraints, selection metadata | `optimization/result.py:49-80`; RS-02 debt register | S06 diagnostics | DELIVERED `b621c5af` (W3) |
| `CG-P15-05` | Claim-row facts for a declared-not-executed request (validation, chronological, OOS column state, scoring backend) — typed absence if N/A | spec 06 §2 | S06 claim row | DELIVERED `c0021ba5` (Claude) · CONSUMED RF-06 wave C |

## Hygiene

- Debt registers P13, P14, P15, RS-02, RS-03 declare `in_scope_backend_debt: []`
  while the board says `AUDIT_REOPENED` (Astra A12).
- Board rows P13–P15 still read "AUDIT_REOPENED / 2026-09-22" without the RS-01 delivery.

## Ownership split — agreed by Bobby and Codex, 2026-09-24

| Owner | Ids | Files |
|---|---|---|
| **Claude** (backend + frontend) | `CG-P12-02…10` | `apps/control-api/src/research/run-library.*`, `research-run-library.openapi.json` |
| **Claude** | `CG-P13-03`, `-04`, `-06`, `-10`, `-11`, `-12`, `-13` (evidence) | `evidence.*`, `evidence-metric-registry.ts`, `research-evidence.openapi.json`, new `portal_api/services/research_evidence_metrics.py` (+ one additive call in `workers/research_child.py`, announced to Codex) |
| **Claude** | `CG-P13-09`, `CG-P14-03…06`, `CG-P15-02`, `-05`, `CG-P13-13` (split/search) | `current-source.service/error`, `split.*`, `search.*`, their OpenAPI files |
| **Codex** | `CG-P11-03…09`, `CG-P13-05`, `-07`, `-08`, `CG-P14-02`, `CG-P15-03`, `-04` | progress, producer/worker/supervisor, retention, admission, RS-02 |

Migration numbers reserved for Claude's RF-05 work: `1723680000060`–`1723680000069`.
Claude's backend goes through Codex review as in RF-01/RF-02. Test bar as in
CODEX_REQUESTS_FROM_CLAUDE_P01_P10.md "Round 2": real receipts on the preview
stack with QuantBT 1.1.1 and historical data.

## RF-05 Claude delivery notes for Codex (2026-09-24, after review fix-up)

**Deploy order.** (1) apply migrations `1723680000060` (run-library search
document v2) and `1723680000061` (evidence series kinds `ROLLING_SHARPE_63`,
`ROLLING_BETA_63`) → (2) deploy control-api → (3) only then deploy the
portal-api worker/child. `progress.contract.ts` `ResearchEvidenceSourceSchema`
is `.strict()`: an old control-api refuses a receipt that carries the new
`oos_analytics` block, and a refused terminal ingest blocks the run's terminal
lifecycle (`progress.service.ts` ingests evidence first). The reverse order is
safe: the new control-api accepts receipts without the block.

**Migration ordering risk.** Claude used `060`/`061` (from the reserved
`060…069`). If Codex's next migrations are numbered `058`/`059` and land after
`060`/`061` have run anywhere (preview, dev, stable), node-pg-migrate's order
check refuses to start. Please number new Codex migrations `≥ 1723680000070`
(or `≥ 062` if the reservation is released), or confirm none are pending below
`060`.

**Two edits outside the agreed split** (both additive, four lines each):
- `progress.contract.ts`: `oos_analytics: ResearchEvidenceOosAnalyticsSourceSchema.optional()`
  in `ResearchEvidenceSourceSchema`. This makes the progress ingress contract
  import `evidence.contract.ts`, so a change to the analytics block schema is
  now a change to the terminal-event ingress contract (and vice versa for
  strictness). Coordinate before either side tightens it.
- `http-error.filter.ts`: forwards `ResearchCurrentSourceError.details`
  (`lane_state`, `effective_status`) on a 409, the same way it already does for
  `CurrentSourceProxyError`. Any change to the filter's `details` handling
  affects the current-source refusal body.

**Current-source NOT_APPLICABLE lane.** `current-source.service.ts`
`notApplicable()` answers a typed 200 only for runs whose P10 adapter-contract
digest equals `P04_DELTA_ADAPTER_CONTRACT_DIGEST`, and hardcodes
`lane.retainable_profile_id = "rs02.delta-wfo-global.v1"` (the contract's
`ProvenanceSchema` also pins that profile id and the
`rs02.quantbt-advanced-wfo.v1` adapter id). Codex's uncommitted
`current_source_artifacts.py` adds `rs02.delta-signal-notional-wfo.v1` /
`rs02.quantbt-signal-notional-wfo.v1`. Question: do signal-notional WFO runs
get a different P10 adapter-contract digest? If yes, they are correctly
treated as retainable (409 pending states, never NOT_APPLICABLE), but the
hardcoded `retainable_profile_id` and the provenance literals must widen to
the installed profile set before those seals are readable.

**Split-read concurrency slot.** On the no-seal path, `notApplicable()` reads
the run's adapter digest through `ResearchSplitRepository.hub()`, which takes
one of the split repository's `MAXIMUM_CONCURRENT_SPLIT_READS = 2` admission
slots (queue 8). A burst of current-source reads for unsealed runs therefore
competes with Screen-05 split reads and can return a 503 "admission
saturated". Not changed in this fix-up: avoiding the slot simply would need
`CurrentSourceRepository.runState()` to also return
`research.run_producers.adapter_contract_digest` (one join, inside the
current-source repository's own scoped read), which is outside the files in
Claude's split. Suggested follow-up for whoever owns
`current-source.repository.ts`; `notApplicable()` would then take the digest
from `runState` and the `splitRows` dependency can be dropped.
