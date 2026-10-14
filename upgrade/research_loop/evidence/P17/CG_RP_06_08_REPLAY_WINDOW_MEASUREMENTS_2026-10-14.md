# §59 — Measured Replay windows and whole-fold reads

2026-10-14 · Codex · CG-RP-06/07/08 · source baseline `ac715e6a`.
Backend lane `codex/be-gaps`; land by clean fast-forward on
`docs/research-loop-plan`. Delivery is the normal-hook commit containing this
packet. **No shared-preview rebuild, frontend design edit, source activation,
new engine run, production/dev/main change, push or release.**

## Decision and implementation

The 200-bar client window and 600-bar trail were not measured server limits.
The current-source Replay request ceiling is now **8,192 bars**, raised from
400. The independent logical JSON response ceiling stays **1,048,576 bytes**.
This is a request ceiling, not a promise of 8,192 returned rows. Every retained
bar remains accessible; nothing is downsampled, pruned or replaced with an
aggregate to fit the window.

`GET /api/v1/quantbt/runs/{runId}/current-source/replay` retains its existing
session/workspace authorization, immutable source pins, exact decimal strings,
UTC milliseconds and signed run/revision/direction/requested-limit cursors.
Other Search, transition and execution-journal readers retain their own caps.
The historical sampled `/execute/replay` is not relabelled this per-bar reader.

Two read-side optimizations, no new cache or storage:

1. **Greedy byte packing.** The old fallback repeatedly halved the page.
   The new code serializes exact rows until the envelope fills, then re-mints
   returned edges and checks the final byte length. It maps/mints only the
   rows it can return plus one candidate, not the entire requested 8,192.
   Backwards reads pack the suffix nearest the cursor, returned ascending.
   The selected `at` row remains present. Oversized metadata/single-row cases
   still fail closed through the existing typed 503 guard.
2. **Proven SQL prefetch bound.** A row must contain its keys and signed
   playhead. Empty strings/zero/null plus an ordinal-zero cursor establish a
   strict *lower* byte bound, never an average-size guess. Rows alone cannot
   exceed `floor(1MiB / minimumRowBytes)` in one response. SQL therefore reads
   the smaller of that upper row bound and the requested limit. Metadata and
   actual decimal/candle bytes only reduce the transport count further.
   Cursor fingerprints still bind the **original requested limit**, not this
   physical fetch bound. There is no second DB scan to fill a page.

This avoids reading thousands of mathematically unreturnable rows while
keeping the large admitted limit. No SLO was relaxed to justify the increase.

## Source and measurement boundaries

Read chain: root AGENTS; Research A13 and Unified §13/P17; P17 packet and
prior §58 delivery/handoff; W5b real-HMD tests, current-source repository /
reader / controller / schemas; queue §59 and Bobby's explicit measurement
approval. Prior §58 semantics, protected engine/strategy and accepted Claude
charts remain unchanged.

Two live **retained preview** runs, queried with PostgreSQL
`default_transaction_read_only=on`, 5s statement timeout and the production
repository's scoped RLS/admission, never a migration or writer:

| Run | Observations | Source / identity |
| --- | ---: | --- |
| `rrun_a0314cb849a692712035fcca836eb233` | 58,848 | `full03.delta-signal-notional-wfo-temporal-1h.v2`, artifact revision1, 15 served folds of 2,160/2,184/2,208 bars; unassigned preparation prefix is preserved, not invented as a fold |
| `rrun_70d7d8d1f444fd8e3028f035b5f52361` | 11,832 | `full06.delta-pct-equity-three-window-optimized-1h.v2`, artifact revision1, 400 retained trials |

Manifest pins respectively
`4b08e3b59ef5b1751e265554f8fcac6ec2174dc5e5d7a68f7e91ef24d4e224d9`
and `801bfee24c83b90c8c22ff2062ad9dd88220853c88c344891b45d115fa979fdb`.
Import digests and workspace are retained in the private JSON receipts.

The separate **1,056-observation real-HMD fixture** is the existing complete
QuantBT1.1.1 Delta BTCUSDT1h WFO, 2026-06-01…07-15, 2fold/3trial/seed42,
not synthetic bars or a newly run engine. It was ingested/sealed into a
disposable PostgreSQL database and read through the real authenticated
Fastify controller. Its two 168-bar folds each read completely in one seek.

The live numbers below are **SQL + full reader (including completed-window
navigation) + JSON**, not public HTTP/WAN or chart/render time. The fixture
numbers include authenticated Fastify inject/JSON, not network latency.
Each matrix cell has 24 measured reads; warmups are excluded. Timings are
observations under actual host load, not a confidence claim about all users.

## Measurements

Full matrix before the final SQL-overfetch optimization (still valid evidence
of byte/cardinality limits; final large-read timings supersede it below):

| Requested | 58,848-run p50/p95 ms | Returned / bytes max | Byte-limited | Fixture p50/p95 ms | Returned / bytes max |
| ---: | --- | --- | --- | --- | --- |
| 100 | 106 / 133 | 100 / 163,654 | 0/24 | 62 / 86 | 100 / 158,645 |
| 200 | 100 / 127 | 200 / 280,502 | 0/24 | 97 / 170 | 200 / 273,264 |
| 400 | 120 / 154 | 400 / 514,217 | 0/24 | 123 / 162 | 400 / 502,534 |
| 800 | 152 / 197 | 800 / 982,327 | 0/24 | 175 / 256 | 800 / 966,467 |
| 1,056 | 155 / 192 | 856 / 1,047,788 | 24/24 | 180 / 223 | 867 / 1,047,715 |
| 1,600 | 158 / 212 | 856 / 1,047,788 | 24/24 | 180 / 223 | 867 / 1,047,715 |
| 3,200 | 169 / 210 | 856 / 1,047,788 | 24/24 | 145 / 173 | 867 / 1,047,715 |
| 6,400 | 209 / 261 | 856 / 1,047,788 | 24/24 | not separately measured | — |
| 8,192 | 229 / 263 | 856 / 1,047,788 | 24/24 | 141 / 180 | 867 / 1,047,715 |

The actual long-run fold sizes2,160/2,184/2,208 were also measured, p95
190/252/233ms; all shortened at the same byte budget. **Bytes, not a 400-bar
or eight-thousand-bar row ceiling, bind these windows.** On the other live
run1,056 rows fit (928,410B), whereas a larger request packs1,195 rows
(1,047,810B). Actual row/metadata sizes differ by route/run/ordinal.

Final optimized retake, same sources and same one-MiB envelope:

| Lane | 58,848-run p50/p95 ms | 11,832-run p50/p95 ms |
| --- | --- | --- |
| request1,600 | 170 / 198 | 126 / 146 |
| request8,192 | 159 / 218 | 147 / 186 |
| complete forward chain, request8,192 | 158 / 209 | 137 / 175 |
| two simultaneous readers, 24 requests | 216 / **307** | 193 / **280** |

Before the SQL bound, two simultaneous large reads reached **520ms p95**
(max569ms). This is retained as a failed efficiency finding, not hidden as
PASS. The optimized retake is below500ms without shrinking the requested
limit, response completeness or precision. This is **two readers**, not a
new full mixed20-user P23 qualification or a production latency guarantee.

## Continuity, bytes and regression evidence

- Full live chains: **58,848/58,848** dense ordinals in73responses and
  **11,832/11,832** in11responses; each response≤1MiB. All ordinals checked,
  no gap/duplicate; no complete history was downloaded into a browser.
- Respective full-chain non-cursor row hashes:
  `882726e94e7df2fe53ba26f5f0726fb863e15668d2dcf24d840e4fdbbacf6e8a`
  and `31e65e8ac294eece1c5d1170092988d2b2efbca7c2aa1679c2a8a69a1493183c`.
  They match before/after the overfetch fix. These are projection hashes,
  **not** substitutes for the immutable source manifest/import digests.
- Full fixture relation1,056/1,056 in2responses; two whole168-bar folds;
  backwards edge and complete SQL/controller matrix PASS. Focused proof:
  1 selected test PASS, 6 non-selected tests not executed by that focused
  command; the normal hook remains responsible for the full suite.
- Service/schema regressions38PASS before final SQL bound; affected
  Replay/continuity31PASS after it. New assertions also enforce a physical
  fetch below8,192, exact requested-limit rejection, dense forward chunks,
  backwards/resume, full-fold seek and >99% byte-envelope utilization.
- Contract tests4PASS; OpenAPI/generated `ReplayPage` / `ReplayLimit`, Zod,
  canonical synthetic fixture and snapshot regenerated. Synthetic fixture
  coverage is not relabelled a real-source measurement.
- Frontend `tsc -b` PASS without frontend edits. Final normal-hook
  build/tests/restore, generated checks and C4 outcome use the completion
  record below. A preliminary
  build found a too-narrow temporary `signal_target` annotation; the reader
  now uses its schema-derived row type, preserving legitimate nulls.

## Claude handoff — no redesign

1. Regenerate `generate:research-current-source`. Read `page.max_bars` from
   the actual API; do not hard-code8,192 or force that limit against an older
   preview still advertising400. This change is not deployed by this packet.
2. For a known fold, request `at=segment.start_cursor` and
   `limit=min(segment.bars,page.max_bars)`. A fold is complete in one request
   **only if both row and byte bounds fit**. The real168-bar folds pass;
   these2,160+bar folds do not fit1MiB and correctly need chunks.
3. Keep one requested limit for a cursor chain. Use `cursor`/`before` and
   returned edges; never count `rows.length===limit` as completion. A chunk
   can cross a fold. In single-fold mode clip to the server's fold span;
   don't start a next-fold reader/preload while cross-fold playback is off.
   Backwards chunk sizes can differ because row bytes differ; adjacency, not
   identical page partition sizes, is the invariant.
4. `byte_limited:true` is ordinary successful paging, not missing source
   bars. Large history must remain on-demand; do not fetch the entire73-page
   run on mount. Single-fold/full-set navigation use the same sealed facts.
5. **600-bar trail remains unqualified client behavior.** Claude owns the
   lightweight-charts render/marker/memory measurements and resultant trail
   size, plus affected1280/660 browser/visual receipt. Backend timings do not
   authorize unbounded chart memory or claim frontend smoothness.
6. No compact DTO added: removing exact fields/cursors would break existing
   consumers/seek. A future optional compact representation needs its own
   explicit contract. The byte-packing/prefetch fix already increases useful
   rows without source loss or another protocol.

## Reproduction, evidence and cleanup

Opt-in script: `scripts/research-loop-v11/replay-window-benchmark.spec.ts`
with its dedicated Vitest config. Requires an explicit owner-approved preview
DB URL, approval flag and private output; refuses normal/implicit execution.
Enforces connection-level read-only, no credentials in output. The optional
full-chain lane records hashes/counts; focused `REPLAY_BENCH_LIMITS` avoids
repeating unaffected cells after a scoped optimization. Fixture measurement
is in `research-w5b-replay-db.spec.ts`, opt-in private output with24samples.

Private receipts retained under `/home/bobby/.local/state/`:

| Filename | SHA-256 |
| --- | --- |
| `portal-research-replay-window-baseline-20261014.json` | `c6a76213fb4f16016482e83d34c1e350f8ec57c0001801c5973cba518cc0ea8e` |
| `portal-research-replay-window-final-20261014.json` | `204c1e79a1f40dc74fbfd99b1a05c5d27faa1cf35507fa8cd7957ce3c8cd2539` |
| `portal-research-replay-window-fixture-20261014.json` | `9506cdd862edcf25ef33c1aa426ab893f3e3e4eb6de27069ee9af8fec9f13855` |
| `portal-research-replay-window-bounded-final-20261014.json` | `6577fb68dedc6776f736edd30f1743093510576904f7ec78d0b79e8271c25185` |

Final measured NodeRSS263,180,288B (~251MiB), heap used83,577,392B; this is
the benchmark process including Vitest, not a whole-stack or client-memory
claim. No browser/session was created against preview. The authenticated
fixture owner and DB exist only inside the disposable test cell; its EXIT
trap removed the exact container. Actual preview writer/identity/DB/volumes,
engine, flags, upstream and all retained source bytes were not modified.

### Completion gate

The delivery commit must pass its ordinary pre-commit hook before it can
exist; no hook bypass, second docs-only full test campaign or remote push.
Exact gate output, resulting commit, final C4 snapshot and clean FF landing
are recorded after completion in the private operator receipt
`/home/bobby/.local/state/portal-research-replay-window-closeout-20261014.md`.
Until that receipt records success, full-suite/landing acceptance is pending.
No frontend visual acceptance or runtime activation is included.

Measured final production-source file identities (not just the pre-change
`ac715e6a` Git label in the raw measurement):

- `current-source.service.ts` SHA-256:
  `5cbc260e6b9b2887998571f120042113ca634c4ce509777f7dd761ba36f82f0d`.
- `replay-continuity.contract.ts` SHA-256:
  `9c23696f97df5acb5157f088e962fa50f89ee3bd07fcd7dafb633e82ef60a43d`.

Pre-hook C4: root filesystem 665,811,062,784 B total /
171,900,162,048 B available (25.8%); RAM available 8,389 MiB.
The exact temporary `research-replay-59-pg-*` cell was removed by its trap;
no such container remained. Shared preview containers and all source volumes,
private receipts, rollback images and unrelated caches are retained. The
ordinary hook owns teardown of its own disposable verification cell; final
capacity/remaining-container checks are required in the operator receipt.
