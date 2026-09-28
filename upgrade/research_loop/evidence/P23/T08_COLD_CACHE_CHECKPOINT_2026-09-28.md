# P23-T08 — exact-cell cold-cache measurement, warm Library SLO gap

2026-09-28 · Codex · `docs/research-loop-plan` · **T08 PARTIAL / P23 NOT_QUALIFIED**.
This is a real 20-principal GET-only measurement on the immutable P23 cell at
`http://127.0.0.1:8096/`, image identity source `19a8e81362e0e6aa3e09ad1a1c224db226c37455`.
It is not a final-HEAD or mixed HEAVY+queued W06 cold-cache claim.

## Boundary and method

- Before the drill, `research.jobs` had zero QUEUED/CLAIMED/RUNNING/RETRY_WAIT/
  CANCEL_REQUESTED rows. The existing 22 P23-only sessions were checked through
  real auth; the 20-reader private manifest was refreshed from the same IDs,
  not from new accounts or reset credentials. An initial request correctly
  refused stale manifest cookies. No Production/dev/shared-preview account changed.
- Stopped and restarted **only** the five named P23 web/API/worker/PostgreSQL
  containers. NATS and Roadmap stayed running. `docker ps` ID/name inventory
  hash before and after both cycles was
  `f5c980fb7d90c6be624e00862b9d2bc53a7cd5576240486ea578fc43b1fb1a1e`;
  all seven owned services recovered healthy/running, with zero active jobs.
- [The bounded helper](../../../../scripts/research-p23/evict-owned-page-cache.py)
  used for the two actual evictions was SHA-256
  `0b72d78acbf0112c4143bbe1d4479343f5f920de2a7e6381b2676d2d8faeecb8`.
  It checked exact Docker volume mountpoints and refused active PostgreSQL/API
  writers; the command sequence stopped all five named containers. The
  subsequent source-only guard tightening checks all five stopped containers
  and project labels (current helper SHA-256
  `f39e1dddb41774b45a2a891040418acec6dc6a0d3e59afd7cf3fe4b07fac65bc`);
  its live-container negative test refused eviction. The helper calls `posix_fadvise(DONTNEED)`
  with read-only descriptors on P23 PostgreSQL and P23 artifact files only.
  No HMD, Execution, dev/stable/preview volume, shared process, host
  `drop_caches`, artifact bytes or DB ledger was touched. Its running-writer
  negative test returned `P23_WRITERS_MUST_BE_STOPPED` without eviction.
- First measured cache cycle found 2,873 owned files, 138,783,146 file bytes,
  124,825,600 resident bytes and zero after eviction. The second cycle's raw
  private receipt found 11,669,504 resident bytes and zero after eviction.
  Cache warmed again only through the named reads; no claim is made about cold
  shared HMD or OS caches outside the two isolated volumes.

## Actual latency and resource results

The synchronized retake made six named GETs for each of **20 distinct real
principals**. All 120 responses were 200 with bounded JSON; no mutation or
implicit job was requested. Measured p95 includes same-origin auth, query and
complete body consumption:

| Route | Cold p95 | Cold target | Result |
|---|---:|---:|---|
| Library | 984 ms | 1,500 ms | PASS |
| Progress | 280 ms | 1,500 ms | PASS |
| Evidence | 449 ms | 1,500 ms | PASS |
| Search | 337 ms | 2,000 ms | PASS |
| Report | 134 ms | 1,500 ms | PASS |
| Replay | 388 ms | 2,000 ms | PASS |

The simultaneous exact seven-service cgroup series had eight bounded samples,
one sampled during the read interval, and a 423,473,152-byte peak under the
5,000,000,000-byte aggregate cap. The first cold cycle independently returned
six 200/SLO passes (Library 843 ms), but its resource series overlapped only
part of the read; the synchronized retake above is the primary receipt.

**Do not hide the warm failure.** The 20-principal warm preflight before cache
eviction measured Library p95 **709 ms**, and the warm follow-up after the
retake measured **815 ms**, both above the 500-ms Guide §16.3 target. The
other five routes passed. The earlier clean W06 receipt at `b2e8b868` measured
490 ms with ~67-KiB Library response; this cell now has 40 runs and the same
route returns ~68 KiB. Current evidence does not isolate query, admission,
auth or host contention as the cause. No threshold was relaxed and no ≤P21
source/accepted UI changed to manufacture a PASS.

A bounded GET-only isolation probe followed: one reader made five sequential
Library requests in **179/60/58/45/56 ms**; twenty distinct readers asking only
Library measured p50 **324 ms**, p95 **521 ms**, all 200, same 67,798-byte
response ceiling. This points to concurrency/admission/tail latency rather than
a consistently slow single read, but does **not** establish the exact cause.
The 521-ms burst is also above the 500-ms target. Its private 0600 receipt is
`t08-library-isolation.json`, SHA-256
`34ff34dd70ff4597e174f5f689735e71d5ffba2c5a426ecd2fc8e8c6b3bf873d`.

## Private exact bytes (0600, not Git)

All locators are under
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`.

| File | SHA-256 | Meaning |
|---|---|---|
| `t08-cache-eviction.json` | `f1963ce28b8fd80fee7198cf3c22b7a355f12bd37dbd125d59b12c5a0b8e7bfa` | Exact stopped-writer cache eviction, 11,669,504→0 resident bytes |
| `t08-read-cold-retake.json` | `a3b2fbed82534a365e6481c0045c43cb5a633d0c6a6a35a7d0b04761da851845` | 20 principals × 6 GET, cold SLO |
| `t08-resource-cold-retake.json` | `167203d8badef80842d6ab06cb033fb38102fe6d4406fc607c345c7575caf850` | Exact seven-service capped series and overlapping sample |
| `t08-warm-preflight.json` | `7f8b5878afe469c9b44dea3f5697d32c1b0ae6f33104834d848d94665dee5fff` | First Library warm p95 709-ms failure |
| `t08-warm-retake.json` | `99c08fa8f1715b672e47c6d4fc79fbde70a4bdc3cdec697bdd2cb93c99667695` | Second Library warm p95 815-ms failure |

Focused helper gates: Python syntax PASS; `--evict` with live writers refuses;
the Node-owned P23 helper suite **49/49 PASS**, and the P23 verifier suite on
its declared Vitest runner **14/14 PASS**. An initial `node --test` wildcard
included `qualify.test.mjs` (a Vitest file) and failed solely because that is
the wrong runner; the two correct runner commands above both exited zero.

## Disposition

The **isolated cold-reader and no-shared-cache-interference subgate passes**.
T08 stays **PARTIAL** until the Library warm regression is explained/removed,
and a final candidate W06 cold/read measurement overlaps one active HEAVY plus
four queued intents as required by Guide §16.3. The Library implementation is
≤P21 shared source: Codex will profile its query/admission and hand an exact
repair to Claude rather than change her current code without coordination.
P23/P24 and the eight-group goal remain active; this is no release/Production
activation. The exact test cell, volumes and 22 TTL identities remain owned by
P23 qualification and are not pruned while still needed.
