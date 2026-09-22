# P13 phase report — Evidence Flow Hub and metric projections

Date: 2026-09-21  
Base before P13: `00b5114b` (`docs/research-loop-plan`)  
Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE; feature-dark; no browser,
deployment or real-run claim.**

## 1. Scope actually delivered

P13 adds the narrowly bounded server-side evidence lane described by the
Unified Plan and Screen-04 specification:

1. The confined P04 child calculates direct and derived values while it holds
   the true result, turns them into exact decimal strings and emits a bounded
   `research.p13.evidence-source.v1` receipt.
2. The durable worker fsyncs one immutable receipt before it emits the P11
   terminal digest. The relay attaches that exact document only to the terminal
   callback and only after digest verification.
3. Control API validates the paired source document/digest, materializes
   immutable source/projection/series rows transactionally, and serves a
   compact Hub plus one named lazy series at a time.
4. The consumer contract carries availability, readiness, source absences,
   UTC milliseconds, exact decimals, metric registry version and a revision
   ETag. It contains no artifact address, raw candle, worker/lease identity,
   source path, private relation, internal cursor, credential or command.

No TSX/CSS/HiFi HTML/front-end fixture or product route was changed by Codex.
Claude's separate P12 uncommitted files remain deliberately unstaged.

## 2. Durable model and safety

| Layer | Implementation | Guard |
|---|---|---|
| confined source | `research_child.py` P04 result → bounded receipt | source metrics use full in-memory OOS vector; chart sample does not become a metric input |
| recovery authority | `ResearchProgressJournal.evidence-source.json` | canonical JSON, SHA-256, fsync, `0600`, atomic rename; a partial staging file is disposable but a sealed receipt is never replaced |
| ingress | P11 terminal callback + `evidence_digest` | exact digest pairing; nonterminal or oversized/malformed receipts rejected |
| persistence | three `research.run_evidence_*_v1` relations | foreign keys, 32 KiB JSON ceilings, INSERT/SELECT-only runtime role, immutable update/delete triggers |
| read | Hub and named lazy-series BFF | session/workspace scope, repeatable snapshot, 2/8 admission, finite database budgets, ETag/revision consistency |

## 3. Exact source matrix

`FINAL_EQUITY`, `TRADE_COUNT` and `BARS_PROCESSED` are direct P04/P06 facts.
`INITIAL_EQUITY`, `NET_RETURN_FRACTION`, `MAX_DRAWDOWN_FRACTION`, monthly
returns, rolling-20 returns and distribution are source-derived from the
actual P04 result before its full vector is discarded. The display projection
does not calculate a replacement result. Benchmark, funding, audited fills and
per-fold metrics remain typed `NOT_PUBLISHED`; zero/NaN/placeholders are not
allowed as substitute facts.

`RETURN_DISTRIBUTION` and `ROLLING_RETURNS_20` can be `NOT_APPLICABLE` with a
specific code. This differs from an unavailable source and must remain visible
as such. P13 makes no claim about folds, holdout, replay, artifacts, selection
or report fields owned by later phases.

## 4. Test evidence

| Gate | Command | Result / relevant coverage |
|---|---|---|
| TypeScript build | `npm --prefix apps/control-api run build` | pass |
| P13/config units | `npm --prefix apps/control-api test -- --run test/config.spec.ts test/research-evidence.contract.spec.ts test/research-evidence.service.spec.ts test/research-evidence.controller.spec.ts` | 18 passed; source pairing, homogeneous lazy series, no hand-picked scope, typed error/ETag boundary and dark default |
| Fresh P11→P13 PostgreSQL proof | `bash scripts/research-loop-v11/test-p13-postgres.sh` | 4 passed in a new PostgreSQL 16 tmpfs container; terminal source receipt, duplicate callback, one immutable revision/four series rows, Hub/series parity and update rejection; exact container removed by trap |
| P13 affected Portal Python | CI-pinned `python:3.12.14-slim` targeted `test_research_progress.py test_research_run_producer.py` | pass; fsync/staging recovery, immutable replacement refusal, real P04 P08-bound child receipt, no raw row/path/lease leakage and 28 KiB bound |
| Generated contract | `npm --prefix packages/contracts run generate && npm --prefix packages/contracts test && bash packages/contracts/tooling/verify-generated.sh` | generation/verification pass; 152 contract tests passed |
| Route ownership ledger | `npm --prefix apps/portal/frontend test -- --run src/execution/r2Ledger.test.ts` | 22 passed; both P13 routes have controller/owner/evidence records |

The fresh database proof covers backend portions of P13-T01/T03/T05/T09/T13.
The source worker proof covers actual P04-source direct/derived values and
bounded source persistence. P13-T02/T04/T06–T12 and all V11 browser gates are
not falsely claimed: their screen/fold/holdout/search/replay/report portions
belong to later phases or Screen-04 frontend ownership.

## 5. Resources, cleanup and rollback

The only test infrastructure was one uniquely named `research-p13-postgres-*`
PostgreSQL container with tmpfs storage. Its shell trap removes exactly that
container on both pass and failure. No broad Docker prune, volume/image/cache
cleanup, runtime restart, source-data change, deployment, signed release or
database migration outside the disposable cell occurred.

The deployed reader remains dark. Future rollback is `FEATURE_RESEARCH_EVIDENCE=false`
through the signed workflow only; evidence stays append-only.

## 6. In-scope closeout and next handoff

**No known P13 backend workaround or technical debt remains.** The missing
facts listed above are explicit source/later-phase boundaries, not a reason to
read an unauthorized artifact or fabricate a display value. The required
consumer sequence is in [frontend-handoff-claude.md](./frontend-handoff-claude.md).
Claude must return a browser/HiFi receipt and any missing fact as one focused
`CG-P13-*` request; do not change P13 backend directly.

## RS-01 corrective amendment — 2026-09-22

The original P13 narrow-slice closeout is superseded for correctness by
[RS-01](../RS-01/phase-report.md). R1 rows remain readable unchanged; R2 now
binds source receipt digest, transform revision, metric registry revision and
every series digest/count/sampling. Monthly values use prior calendar-month
close, ratios are exact decimals, histogram closure is explicit, and receipt
bytes are capped before journal persistence. Hub/series/replay use a single
repeatable-read bundle and reject mismatched stored series bytes/identity.
This closes A01/A02/A04/A05 in the repair slice only; rich S04 coverage and
remaining current-source facts still belong to RS-02/RS-03.

## RS-02 delivery amendment — 2026-09-22

For the admitted Advanced-WFO source only, S04 now has a separate additive
current-source reader: direct retained observations/returns/model positions
and seal-time monthly, rolling-20 and distribution facts are published through
the named RS-02 evidence/series DTOs. The source facts retain their own
revision/availability/sampling disclosure and are not backfilled into R1/R2.
Benchmark, audited fills and route-ledger facts remain exact typed gaps. See
[RS-02 matrix](../RS-02/field-action-coverage-matrix.md); browser integration
belongs to RS-03.

## Screen-04 identity/fold contract amendment — 2026-09-22

`CG-P13-01` and `CG-P13-02` are closed by the additive
[Hub-owned run identity and fold navigation amendment](./contract-amendment-run-identity-fold-navigation.md).
The Hub reads durable `research.runs`/producer/alpha/preflight/P11 snapshot
facts inside its existing repeatable-read boundary; it does not fan out to the
Run Library or current-source split BFF. It publishes a fact-shaped identity
header plus a strictly ascending **observed** fold set, never an invented full
fold plan. P02 still does not publish a route-contract fact, so that precise
slot remains typed `NOT_PUBLISHED`.

Because the Hub also contains current identity/progress facts while lazy
series remain immutable at `p13r1_*`, its HTTP validator is now a weak
semantic `W/"p13h1_*"` ETag over the full response (excluding observation
timestamp). `revision` continues to be the only series-binding field. The
fresh P11/P13 PostgreSQL proof now covers the new real joins and corrected a
stale harness constructor so the P18 report sidecar cannot consume the config
argument unnoticed.
