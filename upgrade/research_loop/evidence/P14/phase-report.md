# P14 phase report — Split, chronology and holdout truth

Date: 2026-09-21  
Base before P14: `bd1d70c5` (`docs/research-loop-plan`)  
Status: **BACKEND_AND_TYPED_CONTRACT_COMPLETE; feature-dark; no browser,
deployment, raw-holdout, seal/unlock or real-run claim.**

## 1. Scope actually delivered

P14 implements the current-source, non-generic chronology lane specified by
the Unified Plan and Screen-05 contract:

1. P10 records an exact current-P04 `research.p14.split-source.v1` receipt
   while it derives the bounded child tape: warmup/IS/OOS counts, half-open
   UTC windows, P08 holdout metadata and explicit limits.
2. P11 journals that document canonically before its terminal digest; the
   durable worker seals the retained sidecar and relay attaches it only to the
   matching terminal callback.
3. Control API validates the source/digest pair, binds it to the immutable
   producer manifest and worker attempt, then persists append-only bounded
   source/projection facts in PostgreSQL.
4. One feature-gated same-origin BFF reads a session/workspace-scoped
   projection with ETag/revision, transaction budgets and bounded admission.

No TSX/CSS/HiFi HTML/frontend fixture or product route was changed by Codex.
Claude's P12 frontend files were deliberately left unstaged and untouched.

## 2. Durable model and safety

| Layer | Implementation | Guard |
|---|---|---|
| confined source | P10 semantic tape counts → `split_source` | no row at/after OOS end enters the child tape; physical row-group I/O remains explicitly `NOT_ATTESTED` |
| recovery authority | `ResearchProgressJournal.split-source.json` | canonical SHA-256, 16 KiB cap, fsync, `0600`, atomic rename; incompatible replacement refused |
| ingress | P11 terminal callback + `split_digest` | terminal-only paired document/digest; malformed/nonterminal/oversize input rejected |
| persistence | `research.run_split_sources_v1`, `research.run_split_projections_v1` | producer-manifest/lease binding, foreign keys, INSERT/SELECT-only runtime role, immutable update/delete triggers |
| read | named Split BFF | session/workspace membership, repeatable read, 2 active/8 queued readers, finite DB budgets, immutable ETag |

## 3. Exact source matrix

The installed P04 adapter publishes one fixed-profile three-window execution.
P14 therefore never presents a generic fold plan, selected OOS model, source
seal, unlock actor, raw holdout or WFO trace.

- Warmup is either an exact copied non-scored range or a typed P08 absence.
- IS and OOS are exact source-derived ranges/counts. OOS is an observation
  after a fixed profile, not strict selection evidence.
- Holdout is only P08 metadata-bound and was not exposed to the child/result.
- Purge, embargo, inner folds, theta, gap scan, source seal and unlock remain
  individually typed `NOT_PUBLISHED` facts.

These are current-source boundaries, not hidden failures or reasons to access
an artifact, Parquet file, database or worker journal from a browser.

## 4. Test evidence

| Gate | Command | Result / relevant coverage |
|---|---|---|
| TypeScript production build | `npm --prefix apps/control-api run build` | pass |
| P14 contract/service/controller units | `npm --prefix apps/control-api test -- --no-cache test/research-split.contract.spec.ts test/research-split.service.spec.ts test/research-split.controller.spec.ts` | 6 passed; exact chronology, typed source limits, digest conflict, workspace/ETag behavior |
| Fresh P14 PostgreSQL proof | `bash scripts/research-loop-v11/test-p14-postgres.sh` | 1 focused P14 scenario passed in a new tmpfs PostgreSQL 16 container; producer-manifest binding, duplicate terminal idempotence, one immutable source/projection revision, no holdout authority, immutable-update refusal; container removed by trap |
| P14-affected Portal Python | `cd apps/portal/backend && PYTHONPATH=src:.. /home/bobby/pool_alpha/.venv/bin/python -m pytest -q -c pyproject.toml tests/test_research_progress.py tests/test_research_run_producer.py` | 19 passed; journal fsync/immutability, actual isolated P04 child, semantic child-tape exclusion, no raw row/path/lease leak and 16 KiB source cap |
| Generated contract | `bash packages/contracts/tooling/verify-generated.sh` | pass; 155 contract tests and all pinned generated outputs verified |
| Route ownership ledger | `npm --prefix apps/portal/frontend test -- --run src/execution/r2Ledger.test.ts` | 22 passed; P14 route has backend owner/evidence and typed-consumer classification |

The fresh DB proof covers backend portions of P14-T01/T04/T06/T10/T13. The
source proof covers actual P04 child receipt and P11 recovery boundary.
Advanced WFO/future-perturbation/strict-selection/seal/unlock assertions are
not falsely claimed because current P04 does not publish those facts. All
Screen-05 browser gates remain frontend-owned.

## 5. Resources, cleanup and rollback

One uniquely named `research-p14-postgres-*` PostgreSQL container with tmpfs
storage was created only for the integration proof. Its EXIT trap removes that
exact container on pass or failure. No broad Docker prune, volume/image/cache
cleanup, runtime restart, source-data change, deployment, signed release or
database migration outside the disposable cell occurred.

The deployed reader remains dark. Rollback is a signed
`FEATURE_RESEARCH_SPLIT=false` release; immutable facts remain retained.

## 6. In-scope closeout and handoff

**No known P14 backend workaround or technical debt remains.** Missing WFO,
seal and unlock facts are explicit source boundaries rather than a reason to
invent a broader endpoint. A future source revision must add a new versioned
contract and dedicated action phase; it must not reinterpret P14 receipts.

The required consumer work is in [frontend-handoff-claude.md](./frontend-handoff-claude.md).
Claude must return a direct browser/HiFi receipt and any genuine missing fact
as one focused `CG-P14-*` request; do not modify the P14 backend or map fields
by hand.

## RS-01 corrective amendment — 2026-09-22

The original receipt now has semantic range validation: non-positive,
inverted, overlapping or non-contiguous warmup/IS/OOS windows are rejected,
and the paired P13/P14 source transform digests must agree. This closes A03
without inferring a new fold, holdout or selection fact. P14's database reads
also inherit the scoped cancellable Research admission boundary. See
[RS-01](../RS-01/phase-report.md); full source-supported Screen-05 coverage
remains RS-02/RS-03 work.

## RS-02 delivery amendment — 2026-09-22

The admitted Advanced-WFO lane now retains its actual factual folds and serves
them through the named current-source Split DTO. This does not upgrade missing
warmup, purge, embargo, strict outer-OOS, physical holdout-I/O, seal or unlock
facts. They remain panel-local typed source gaps; no generic chronology or
holdout interpretation is introduced. See the
[RS-02 matrix](../RS-02/field-action-coverage-matrix.md).

## Screen-05 axis presentation ruling — 2026-09-23

`CG-P14-01` is resolved without creating a synthetic source tick relation.
The immutable timeline/windows remain the sole semantic chronology facts; a
consumer may choose bounded UTC tick labels from that coordinate for display
only. The complete prohibition on replacing/snap-rounding bounds, using local
calendar/current time, or serializing ticks into a request/export/cache is in
[the ruling](./axis-label-presentation-ruling.md). This is a consumer
presentation decision, not an OpenAPI, persistence or runtime change.
