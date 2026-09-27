# E16-R1 · a bounded OHLC overview retained on a P04 run, and Screen 08's price strip (Claude, 2026-09-27)

**Branch:** `feat/e16r1-p04-candle-overview` (worktree `.claude/worktrees/agent-a3923235c11975020`).
**Base:** `05f0d6a0` on `origin/docs/research-loop-plan`. **Not pushed.**
**Answers:** the E16-R1 source request written in
[`E2C_E16_S07_S08_CLAUDE_2026-09-26.md` §6.4](E2C_E16_S07_S08_CLAUDE_2026-09-26.md),
and with it HiFi audit row **8.6**.
**Migration:** `068` (`1723680000068_research-evidence-candle-overview-v1.sql`).

---

## 1. The short version

Yesterday's answer to 8.6 was *"cannot be served"*, and it was correct for the runs that
existed: the P10 producer deletes the derived tape before the artifact bundle is written, so
nothing in a finished P04 run's artifacts holds a bar. The request E16-R1 asked for the only
move that could change that — summarise the bars **inside the child, while it still holds
them** — and the owner approved it.

| Piece | Where |
|---|---|
| **Retained** | `research_child._candle_overview`, called from `_p13_evidence_source` while `market` is still in memory. At most 48 buckets, each bucket's high/low the **true extreme** of its bars. |
| **Stored** | verbatim in the existing `research.run_evidence_projections_v1.projection` jsonb under `candle_overview`. No new table, no new series kind. Migration 068 adds the row bound and corrects the table's description. |
| **Served** | `research.replay.v1` gains `candle_overview`, in the retained WFO lane's own field names, with a typed absence for every run that predates the change. |
| **Drawn** | Screen 08's P04 lane, by the same component the retained lane uses (`CandleOverviewStrip`), captioned as a downsample with its bucket size. |
| **Not changed** | the per-bar candle ledger. `route_capabilities.candle_windows` still reads `NOT_PUBLISHED / P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS`, because that is still true. |
| **Not done** | any backfill. A run sealed before this change has no bars anywhere and reads as a typed absence, with its own reason code, for ever. |

---

## 2. Where the overview is retained, and why it can only be there

`apps/portal/backend/src/portal_api/workers/research_child.py`

* `_candle_overview(market, index, *, receipt_bytes, byte_budget)` — the entry point. It slices
  `market` to exactly `oos.index`, so the window it summarises is exactly the OOS window the
  P17 replay replays; a bucket ordinal and an OOS observation ordinal count the same bars.
* `_candle_overview_buckets(frame, *, bucket_bars, has_volume)` — the arithmetic. A bucket's
  `high` is `max(high)` and its `low` is `min(low)` over the bars it covers; `open` is the first
  bar's open and `close` the last bar's close. Nothing is averaged and nothing is interpolated,
  so the run envelope (`max_high` / `min_low`) is by construction the true extreme of the whole
  window, not of a sample of it.
* `_candle_overview_absence(reason_code)` — the one absent shape, so a failure is a typed state
  rather than a failed child run. The bucket loop refuses a tape whose own bar breaks OHLC
  (`high < max(open, close)` or `low > min(open, close)`) for a specific reason: such a bucket
  would be refused by the ingress contract, and that refusal would reject the **whole** evidence
  receipt, equity series and all. Failing inside the overview turns one bad tape into one typed
  absence instead.
* Call site: `_p13_evidence_source`, **after** `oos_analytics`, so the block measures itself
  against the finished receipt and can never push an existing series out of the budget.

**Why it cannot live anywhere later.** `research_run_producer._execute_sync` builds the tape at
`is_oos_only.parquet`, runs the child, and then, in its `finally`, deletes the job directory
before the artifact bundle is created. The bundle itself is two JSON documents. So the child is
the last place in the system where this run's OHLC exists. This is a summary of it, never a copy:
no bar, no tick and no path is retained.

### 2.1 The bound, and what it costs per run

The retained WFO lane's bound is 160 buckets in a 64 KiB seal row. The P13 receipt is a **24 KiB**
channel that already carries four series plus RF-05's analytics, so the P04 bound is **48**, and
the producer additionally shrinks it — 48 → 24 → 12 → 8 — until the whole receipt fits, publishing
`P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET` below the floor. A longer run therefore makes
the overview **coarser**, never the row bigger.

Measured on the committed real receipts (QuantBT 1.1.1, P04 fixed profile, BTCUSDT 1h
`crypto-binance-1m`):

| Run | Bars | Buckets | Receipt before | Receipt after | Overview | Per bucket |
|---|---|---|---|---|---|---|
| `four_month_oos` (OOS 2026-04-01 → 2026-07-31) | 2,928 | 48 × 61 bars | 11,561 B | **21,856 B** of 24,576 | **+10,295 B** | 214 B |
| `one_month_oos` (OOS 2026-07-01 → 2026-07-31) | 744 | 47 × 16 bars | 9,860 B | **19,896 B** of 24,576 | **+10,036 B** | 213 B |

In storage the same block is written twice — once in
`run_evidence_sources_v1.source_payload` (the immutable receipt) and once in
`run_evidence_projections_v1.projection`. PostgreSQL's jsonb text form is slightly longer than the
compact encoding: **11,259 B** for the four-month block. The whole projection row stays well
inside its pre-existing 32 KiB CHECK; the DB spec asserts both the per-run overview size and that
bound.

**So: about 10–11 KiB per run, in two immutable rows, for a 48-bucket whole-window price summary.**

---

## 3. The contract change

### 3.1 Ingress (child → Control API)

`progress.contract.ts` · `ResearchEvidenceSourceSchema.candle_overview` — optional, so every
sealed receipt stays valid. Shape and invariants live in
`evidence.contract.ts` · `ResearchEvidenceCandleOverviewSourceSchema`:

| Invariant | Refuses |
|---|---|
| `high ≥ max(open, close)` and `low ≤ min(open, close)` per bucket | an interpolated or averaged bucket |
| `envelope.max_high = max(values.high)`, `envelope.min_low = min(values.low)` | an envelope wider or narrower than the buckets it claims |
| `values[0].first_ordinal = 0`, `values[-1].last_ordinal = source_bar_count − 1`, each `first_ordinal = previous.last_ordinal + 1`, strictly increasing timestamps | a gap that would let an unsummarised stretch read as covered |
| `sampling = FULL ⟺ bucket_bars = 1` | a downsample that calls itself complete |
| AVAILABLE ⟺ buckets, envelope, bucket size, sampling and bar count all present ⟺ `reason_code = null` | a half-filled absence |
| `source_bar_count = source.oos_observation_count`, and the first/last bucket timestamps equal the receipt's own OOS equity endpoints | a summary of some other window |
| `emitted_bucket_count ≤ 48` | a P04 producer over its byte-budget cap |

### 3.2 Storage

`evidence.service.ts` keeps the block verbatim in `StoredProjection.candle_overview`. It is read
back **loosely** on purpose (`z.unknown()` in `StoredProjectionSchema`) and re-validated against
its own schema in `bundle()`, so an additive block can never 503 the Hub read that Screens 04 and
08 both depend on; a stored block this reader cannot validate degrades to one typed absence
(`P13_RETAINED_CANDLE_OVERVIEW_IS_INCOMPATIBLE`).

`bundle()` now returns a third value, `candleOverview`, behind the same repeatable-read revision
fence as the Hub and the equity series.

### 3.3 Read (`research.replay.v1`)

`replay.contract.ts` adds `candle_overview` — required, with the same field names as the retained
lane's `execution.candle_overview` (`source_bar_count`, `emitted_bucket_count`, `bucket_bars`,
`sampling`, `envelope.{max_high,max_high_at_utc_ms,min_low,min_low_at_utc_ms}`, and per-bucket
`first_ordinal / last_ordinal / open_utc_ms / close_utc_ms / open / high / low / close / volume /
transitions`) wrapped in this contract's standard typed-absence envelope
(`state / reason_code / availability`), plus `scope: "OOS_EQUITY_WINDOW"`.

`transitions` is **always null** here. P04 publishes no execution ledger through this adapter, so a
per-bucket transition count would be invented; the key stays in the shared shape and carries an
explicit null rather than a zero. The contract refuses a number.

OpenAPI: `packages/contracts/openapi/research-replay.openapi.json` gains `CandleBucket` and
`CandleOverview`; `packages/contracts/generated/research-replay.d.ts` regenerated with
`openapi-typescript` (never hand-edited); `contracts-snapshot.json` re-pinned (216 tracked files).

### 3.4 Migration 068

`1723680000068_research-evidence-candle-overview-v1.sql` adds
`run_evidence_projections_v1_candle_overview_bound_check` (≤ 48 buckets when the key is present),
its comment, and an amended table comment. It touches no historical row. The reason it exists at
all: migration 046's table comment says the P13 store is *"not an artifact index, a worker
filesystem mirror, or a raw OHLCV/ledger store"*. That is still true, and the migration is where
that is made to stay true — the bound is what makes the block a summary rather than the beginning
of a price store.

### 3.5 Reason codes, all distinct

| Code | Means |
|---|---|
| `P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW` | the run was sealed before the producer retained one. Permanent: its tape is gone. |
| `P13_RETAINED_CANDLE_OVERVIEW_IS_INCOMPATIBLE` | a stored block this reader can no longer validate. |
| `P13_EVIDENCE_NOT_READABLE_FOR_RETAINED_CANDLE_OVERVIEW` | the run's evidence is not readable right now. Passing. |
| `P13_CANDLE_OVERVIEW_EXCEEDS_RECEIPT_BYTE_BUDGET` | even the 8-bucket floor did not fit the receipt. |
| `P13_CANDLE_OVERVIEW_SOURCE_BARS_ARE_UNREADABLE` | the producer could not read the bars when it summarised. |
| `P04_TAPE_DID_NOT_PUBLISH_OHLC_COLUMNS` | the tape had no OHLC columns. |
| `P04_OOS_WINDOW_HAS_NO_PRICED_BAR` | the OOS window holds no priced bar. |
| `P17_REPLAY_READ_PREDATES_RETAINED_CANDLE_OVERVIEW` | **frontend only**: the replay responder has not rolled forward and publishes no such field. |

Each has its own sentence in `researchRefusal.ts`; an S08 test renders five of them and asserts
they produce five *different* sentences, because a shared sentence is how two different facts
quietly become one.

---

## 4. What Screen 08 draws

`ExecuteCandleReplay.tsx`'s `OverviewStrip` was split: the drawing is now the exported
`CandleOverviewStrip`, and the retained lane's version is a thin wrapper that passes its fold
segments and causal-reveal cut. `ExecuteDetail.tsx`'s new `HubCandleOverview` renders the same
component on the P04 lane with no segments — this lane has no folds on this read.

Position: directly under the `run windows` IS/OOS/HOLDOUT band and above the equity chart, so the
price context sits immediately over the equity it explains.

Caption, verbatim from the real fixture at 1440:

> `out-of-sample window · 2,928 bars in 48 candles of 61 bars — each high/low is the true extreme of its bars · range 57758.6 – 82828.7`

It always names the downsample and its bucket size. Under `sampling: FULL` it reads
`· every bar` instead, and only then.

**The per-bar candle chart is unchanged.** Nothing on this lane is drawn bar by bar, the
`candle windows` chip still carries `P04_SOURCE_DID_NOT_PUBLISH_REPLAY_CANDLE_WINDOWS`, and its
sentence was rewritten so it is true in both worlds: *"This run's adapter published no per-bar
candle ledger, so nothing here is drawn bar by bar. A whole-window price overview is shown above
when the run retained one."*

---

## 5. What a pre-change run shows

Three separate proofs, because this is the part that must not quietly become a backfill.

1. **Canonical fixture.** `research-replay.p04-real.predates-candle-overview.valid.json` is the
   same real run as `first-window`, served from the same real receipt with `candle_overview`
   removed — exactly what every run sealed before today carries. It reads
   `state: NOT_PUBLISHED`, `reason_code: P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW`, every
   payload field `null`, `values: []`, and its `equity_replay` is untouched and `AVAILABLE`.
2. **On PostgreSQL.** `research-e16r1-candle-overview-db.spec.ts` ingests the real one-month
   receipt with the block deleted and asserts the served absence *and* that
   `projection ? 'candle_overview'` is false — nothing was written for it.
3. **In the browser, against the real read-only preview** (`localhost:8095`, running `c81e8dc2`,
   which predates this change): Screen 08 on the seeded P04 run prints
   `PRICE OVERVIEW  not published  This deployment's replay read does not publish a price
   overview yet, so none is drawn for any run here.  P17_REPLAY_READ_PREDATES_RETAINED_CANDLE_OVERVIEW`.

---

## 6. Tests

All counts are from real runs in this worktree.

| Lane | Command | Result |
|---|---|---|
| Producer (Python) | `pytest apps/portal/backend/tests/test_research_evidence_r2.py` | **16 passed** (8 pre-existing + **8 new**) |
| Control API, replay contract | `vitest run test/research-replay.contract.spec.ts` | **3 passed** (+1 new) |
| Control API, replay service | `vitest run test/research-replay.service.spec.ts` | **11 passed** (+3 new) |
| Control API, canonical fixtures | `vitest run test/research-x2-replay-fixtures.spec.ts` | **3 passed** (+1 new) |
| Control API, **PostgreSQL** | `vitest run test/research-e16r1-candle-overview-db.spec.ts` with `TEST_DATABASE_URL` | **4 passed** (new file) |
| Control API, whole suite | `vitest run --maxWorkers=1 --no-file-parallelism`, `TEST_DATABASE_URL` set | see below |
| Frontend, S08 | `vitest run src/research/executeReplay.test.tsx src/research/executeCandleReplay.test.tsx` | **73 passed** (53 + 20; **+5 new** in `executeReplay`) |
| Frontend, whole suite | `vitest run` | see below |
| Types | `tsc -p apps/control-api/tsconfig.build.json --noEmit`; `tsc -p apps/portal/frontend/tsconfig.json --noEmit` | clean, no output |
| Contracts, suite | `vitest run` in `packages/contracts` | **191 passed** across 16 files |
| Contracts, snapshot | `python3 packages/contracts/tooling/snapshot.py --check` | matches all 216 tracked files |

### 6.1 The PostgreSQL lane

`apps/control-api/test/research-e16r1-candle-overview-db.spec.ts`, on a disposable database
created from the full migration history, asserts:

1. migration 068's constraint exists, names `jsonb_array_length` and `48`, carries its comment,
   the table comment now names the bounded overview, and the runtime role still cannot UPDATE;
2. a projection with 48 buckets inserts and one with 49 is refused by the database, not by the
   application;
3. the **real** four-month receipt ingested through the real `ResearchEvidenceService` into real
   jsonb comes back through `ResearchReplayService.detail` with `values` and `envelope`
   **deep-equal to the receipt's own** — no decimal re-rendered by PostgreSQL — the envelope is
   the true extreme of the served buckets, `source_bar_count` equals
   `equity_replay.source_observation_count`, `candle_windows` is still `NOT_PUBLISHED`, and the
   stored `candle_overview` measures 8–12 KiB inside a projection under its 32 KiB CHECK;
4. the pre-change run's typed absence, with nothing written into its row.

Every parameter it pins is inside its declared range: `lease_epoch = 1` (`> 0`), `ordinal = 1`
(`> 0`), `job.state = 'SUCCEEDED'` and `worker_attempts.state = 'SUCCEEDED'` (both in their CHECK
lists), `logical_work_key` non-empty (1–256), `source_event_sequence = 9` (`> 0`), and every
digest a 64-character lowercase hex string.

### 6.2 Whole-suite results

* **Control API** — before the last two spec edits: `1252 passed, 4 failed, 1 skipped` across 160
  files. One failure was mine (`research-replay.contract.spec.ts` had a hand-built response with
  no `candle_overview`) and is fixed; the spec now passes. The other three are
  `eds08-source-continuity.spec.ts`, which reads packs mounted at `/services/...` **only inside
  the Docker test cell** — `ENOENT` on a bare host, unrelated to this change, and green under
  `scripts/control-api-test.sh`.
* **Frontend** — see §6.3.

### 6.3 Frontend whole-suite

`vitest run` in `apps/portal/frontend`: **3838 passed, 1 failed, 3 skipped** across 197 files.

The one failure is `src/styles/tokens.test.ts > keeps every raw color literal inside the declared
token files`, and all six offenders it lists are in `src/research/AlphaImport.tsx` — a file this
branch does not touch (it is absent from `git status`, so it is byte-identical to `05f0d6a0`).
Four of the six are a doc comment enumerating the token hexes and two are
`box-shadow: … rgba(28,37,50,.05)`. Pre-existing on the base commit, unrelated to E16-R1, and not
fixed here: it belongs to whoever owns the U02 token gate.

---

## 7. Screenshots

Chromium via Playwright against a scratch Vite (`port 5221`, root = this worktree) proxying
`/api` to the read-only preview at `localhost:8095`. **The preview was never written to.**

| Shot | Kind | What it shows | SHA-256 |
|---|---|---|---|
| `s08-p04-real-1440.png` | **real** (preview backend `c81e8dc2`, predates this change) | the typed absence row, full page, 1440 | `b6b20acad5c7392d6f027b9f4895db731b279b274859ba32b6bc30d664a8ccee` |
| `s08-p04-real-660.png` | **real** | the same at 660 | `360e4516953f1f63311719885db22ca89889d64a66bb3f64f1ade1c35284a848` |
| `s08-p04-overview-absent-crop.png` | **real**, 3× crop | the absence row read close up | `33753ea2a6774d379ddc8ee08f8efab73a650854a2121d68b49468a9112c8076` |
| `s08-p04-fixture-1440.png` | **fixture** — only `candle_overview` replaced, from the canonical `research-replay.p04-real.first-window.valid.json`; every other read on the page is the real one | the 48-bucket strip, full page, 1440 | `4de86fc3da78b1c39ceac9d9bea7bc063068ece737af473cb52bab5f77a91f60` |
| `s08-p04-fixture-660.png` | **fixture** | the same at 660 | `f0b6bba1f4fbd4abba92c89c6a03d105c25d4b76f516b1eddb86bcb36843c97a` |
| `s08-p04-overview-crop.png` | **fixture**, 3× crop | the strip and caption read close up | `a163d6237d2c9adb1f99c393fd902175158d7718a8b0adf59ed32f5156a5da6b` |

Shots live under the session scratchpad (`scratchpad/e16r1/shots/`) and are not committed.

**Overflow and console**, measured in the same pass:

| Viewport | `scrollWidth` / `clientWidth` | Page errors | 4xx/5xx on `/api` |
|---|---|---|---|
| 1440, fixture | 1440 / 1440 | none | none |
| 660, fixture | 660 / 660 | none | none |
| 1440, real | 1440 / 1440 | none | none |
| 660, real | 660 / 660 | none | none |

Looked at, not just measured: the strip draws 48 vertical high/low bars, green where
`close ≥ open` and red otherwise, tracing a rise into 2026-05 and a fall through 2026-07 — the
real BTCUSDT path over that window. At 660 the caption wraps to two lines and nothing scrolls
sideways.

---

## 8. Decisions

| # | Decision | Why |
|---|---|---|
| **D-E16R1-1** | The overview covers the **OOS window**, not the full child tape | it is the population `equity_replay` samples, so one ordinal axis means one thing. The full tape (warmup + IS + OOS) is reported separately as `direct.bars / FULL_CHILD_TAPE` and is not what a replay replays. |
| **D-E16R1-2** | Bound **48**, not the retained lane's 160 | the receipt is a 24 KiB channel with four series already in it. 160 buckets of real data is ~34 KiB. The dynamic ladder handles pathological decimals; the static cap keeps the row honest. |
| **D-E16R1-3** | Stored in `projection` jsonb, not as a seventh `series_kind` | a seventh kind would change `ResearchEvidenceSeriesKindSchema` and the Hub's `series` array length, which Screen 04 reads. The overview is one bounded block with its own envelope, not a chart series. |
| **D-E16R1-4** | `transitions: null`, keeping the key | dropping the key would give Screen 08 a second vocabulary; a `0` would be a fabricated execution fact. The contract refuses a number. |
| **D-E16R1-5** | The stored block is re-validated in `bundle()`, not in `parseProjection` | an additive block must never be able to 503 the Hub read Screens 04 and 08 share. |
| **D-E16R1-6** | The frontend treats a missing `candle_overview` as its own typed absence | the frontend and Control API deploy separately; this is the same rolling-deploy rule `run_identity` and `fold_navigation` already follow. |
| **D-E16R1-7** | The real receipt fixtures were regenerated with a **real** overview, read from the same BTCUSDT 1h `crypto-binance-1m` bars over each receipt's own OOS window, by the shipping producer | a synthetic overview would have proved the plumbing and not the arithmetic. The fixture provenance names it. |

---

## 9. What is left open

| # | Item | Owner |
|---|---|---|
| 1 | **Only new runs gain an overview.** Every existing P04 run reads `P13_SOURCE_PREDATES_RETAINED_CANDLE_OVERVIEW` for ever. A backfill would have to re-read the P08 snapshot (`snapshot_id` + `snapshot_content_hash` are retained), which is deliberately outside the artifact bundle and is a separate, heavier design. | Bobby to scope if ever wanted |
| 2 | **No deployed stack was changed.** The preview at `localhost:8095` is read-only and still runs `c81e8dc2`. Nothing here has been seen on a rolled-forward server; the AVAILABLE shots are fixture shots. | whoever deploys `docs/research-loop-plan` next |
| 3 | The retained WFO lane still bounds at 160 while P04 bounds at 48, so the two lanes' strips have different resolutions on the same screen. Honest (each caption names its own bucket size) but not uniform. | design decision |
| 4 | Visual baseline (OL-22) not re-run for Screen 08; the P04 lane grew one row. | Claude, with OL-22 |
| 5 | **E16-R2** — the engine pin on the P04 freeze read — is still open from §6.4 of the 2026-09-26 record. Not touched here. | Claude, a following slice |
| 6 | `bucket_bars` is uniform across the window, so the final bucket may be ragged (47 × 16 over 744 bars covers 752 slots; the last bucket holds 8). The contract allows a short final bucket and forbids an over-long one; the caption says "candles of 61 bars", which is the bucket size, not a claim that every bucket has 61. | note only |

Not claimed: any deployed stack, any visual baseline, and any run that finished before this
branch.
