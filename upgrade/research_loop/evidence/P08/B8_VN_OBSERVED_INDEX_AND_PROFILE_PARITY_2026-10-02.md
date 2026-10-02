# Group 6 — profile transport parity and observed VN daily index

2026-10-02; base `01a13cb1`; BE lane `codex/be-gaps`.
Status **SCOPED_BACKEND_SOURCE_INDEX_QUALIFIED / VN_PRODUCT_NOT_ACTIVE**.

## Scope and delivered implementation

Read root/local AGENTS, Research A13, Unified six-group approval/continuations,
queue §20–29, P08 index/preflight and earlier source-only VN receipt. The
requested Vnstock onboarding page was visited; this work uses the already
installed HMD wheel, not a new Vnstock install/collector/source checkout.
Three agents own foundation transport, observed-date helper/tests and
independent source/custody review; root integrates and commits once.

1. Foundation admission publishes all **four** actual immutable runtime
   profiles, including `p10.delta-signal-notional-causal-inner.v1`. Maximum
   four, unknown/duplicate identity refused even with differing row contents;
   historical two/three-profile fixtures remain valid.
2. VN daily labels stay source-local midnight, previous-day **17:00 UTC**.
   Sequential <=31-local-date reads, <=100 chunks, existing row/run budgets.
   Descriptor, timestamp basis and accepted source revision are pinned per
   chunk; order/duplicate/source/time/revision substitution fail closed.
3. Warmup means the last N **observed predecessors**, not N calendar dates.
   Exact ordinal warmup start/earliest compatible bar are disclosed;
   insufficiency preserves measured counts with typed refusal.
4. Existing UTC V1 indexes retain original bytes/validation. Mixed custody
   uses internal `research.dataset-index.v2`, explicit clock basis/timezone
   and the same immutable revision store. Append preserves unrelated
   namespaces and source clock. Old-reader rollback restores retained V1
   current revision, never rewrites an old document.
5. Strict additive coverage union: expected exchange sessions, missing ratio/
   gaps and session-close timestamp remain null for VN; calendar remains
   `NOT_PUBLISHED / VN_SESSION_CALENDAR_NOT_PUBLISHED`. OpenAPI and Zod both
   bind observed coverage to exact VN namespace/timezone.
6. Signed client/controller use +07 edges and ordinal refusals; canonical
   naive local dates match P08, independent of Node host timezone. Zero
   fractions up to nanoseconds work; nonzero sub-ms daily boundaries refuse.
7. Source-only apply requires an explicit private root; existing current
   requires append; symlink/default-root clobber refuse. No actual shared
   index is modified here. VN declaration metadata does not authorize a fold
   plan/profile from the unqualified UTC planner.
8. Explicit `VnStockDailyObservedProvider` binds the verified immutable index
   revision and installed source manifest. It hydrates <=31-date chunks and
   compares every actual timestamp with the index; `load_with_warmup` takes
   exactly N observed predecessors. Constructor/catalog perform no source
   scan; the default app/provider remains unchanged. Raw source order and
   duplicate labels refuse **before** generic normalization can sort them.
   CLI sub-millisecond boundaries likewise refuse instead of truncating.

## Actual independent source proof

From the BE worktree:

```bash
PYTHONDONTWRITEBYTECODE=1 \
HISTORICAL_MARKET_DATA_ROOT=/srv/primus/historical-market-data/storage \
PYTHONPATH=apps/portal/backend/src:apps/portal \
/home/bobby/portal-research/apps/portal/.venv/bin/python \
scripts/research-p23/vn-observed-index-receipt.py
```

Private final-code receipt (0600):
`/home/bobby/.local/state/portal-research-group6-vn-20261002/observed-index-receipt.json`.
File-byte SHA-256
`f989606ff8885d8e48c6d1c9f3ebfa48b2b5475889059742143c1de63e3c2345`.

Installed HMD **0.1.0rc3**, QuantBT **1.1.1** (not executed). Accepted manifest
`f657851c3717835c460a8dbed28865cfaf5cc854f62a0e2570860c2e451a9d47`.
FPT/1d/local `[2024-01-01,2026-09-01)`: independent direct-loader pass
**32 bounded queries / 661 timestamps**, matching **139** compressed runs.
First/last: `2024-01-01T17:00Z` / `2026-08-27T17:00Z`.
Earliest 300-predecessor bar: `2025-03-19T17:00Z`.

- Exact 300: AVAILABLE, 361 requested bars, warmup start `1704128400000`.
- Prefix 299: typed refusal, 362 measured bars, warmup start null.
- Holiday `[2026-04-27,2026-05-05)`: **3 actual bars**, 300-bar warmup starts
  `2025-02-11T17:00Z`; no calendar-derived zero or missing-session claim.
- Left/right outside range: typed absence, no overlap disguised as full count.
- Timestamp-array SHA-256
  `aedfac9050523ede6ec0b1625124cd8022e78a66e7afdd1158a5c7f8e907132a`.
- Actual as-of `1790960131704`; index SHA-256
  `08d0244540dbb6d13b8dda9e78772578c89cfa3d5ec028cb00b5951223fbb7e8`;
  V2 document SHA-256
  `d6da696850d534b5988989c6e3ec6f6ac4c0069fe929980c18d85bd484da732e`.

The earlier agent oracle has another as-of/index hash but the identical
timestamp-array hash/count. This final-code proof includes chunk revision
hardening. No raw price/market rows are committed. It is an index/source
proof, **not a VN product or engine-run receipt**.

### Independent OHLCV hydration supplement

The completed adapter and last reject-only precision/order guards were then
checked against a separate direct-reader OHLCV pass. Original receipt above
is retained. New private receipt (0600):
`/home/bobby/.local/state/portal-research-group6-vn-20261002/observed-index-hydration-receipt.json`.
File-byte SHA-256
`731127335d46fc38a16d38eaff977135846ceb1f1bca7b2af1f4edf5e75ec25a`.
As-of `1790961856635`; index SHA-256
`62f7f9c169d3bf0e05926c36d570d190c0b108d53623014bfdecf6dd6f284819`;
document SHA-256
`5f32f5269c99b7dbb056ba9d68725433a64c5d9b966f799b74cca0578bcb3440`.

- Exact prefix: **661 hydrated rows = 300 warmup + 361 analysis**, 32 bounded
  source queries; warmup starts `1704128400000`. Content hash
  `4cd110ee703a161278751f6494a9cff4289f7623d37d7aa5920ac9489af39fba`.
- Holiday: **303 rows = 300 warmup + 3 analysis**, 15 bounded queries;
  warmup starts `1739293200000`. Content hash
  `1ea960a1ffa7357f4aadf97c688c3c6e55c91da828084f0c3b56727d5852e642`.
- Every timestamp and OHLCV value matches the independent direct-reader
  frame exactly, not a tolerance-only comparison. A 299-prefix hydration
  refuses; session/instrument authority and default activation stay absent.

This proves the bounded source adapter, not P08/P10/engine/profile activation.

## Tests / preserved failures

- Foundation + causal transport **17/17 PASS**; metadata contracts **11/11**.
- Control metadata/signing/source-time **20/20**, Control build PASS.
- Python helper/integration/legacy/VN lane **104 PASS / 1 external opt-in
  SKIP**. Three private-root negatives added later: integration **7/7 PASS**;
  combined unique count **107 PASS**, not two full reruns.
- Actual independent source receipt PASS as above.
- Final combined helper/index/qualification/observed-provider/crypto adapter
  regression: **156 PASS / 1 external opt-in SKIP** (1.77 s). This includes
  the last source-order and CLI precision refusal tests; it is not the full
  backend suite. The new real hydration receipt is separate from fixtures.
- Initial wrapper mistakenly selected the whole Python directory; interrupted
  (130), **not PASS**. Focused files subsequently ran with the pinned venv.
  Initial synthetic catalog test grafted VN coverage onto crypto; corrected
  its source binding, not loosened validation. No failed attempt is a gate.
- Fixtures are canonical synthetic type examples, not market evidence.
  Regeneration/snapshot/diff checks and one normal grouped mandatory hook
  gate the coherent commit; final log/counts recorded at delivery.
- The single mandatory grouped commit gate is captured at
  `/home/bobby/.local/state/portal-research-group6-vn-20261002/commit-hook.log`.
  A successful normal commit, not the planned command, establishes this gate.

## Claude handoff / next vertical step

Use regenerated `research-foundation.d.ts` immediately: causal profile is now
an explicit enum member, no schedule/inner cast needed. Runtime unchanged.

**VN product remains unavailable:** main provider is crypto-only, qualification
descriptor unavailable, no product catalog publishes VN symbols. Before VN
activation Claude must bind `clock_basis`, `source_timezone`, exact
`warmup_start_utc_ms`, nullable completeness and source-local fallback (current
FE fallback assumes UTC and drops those additive fields). No FE edit here;
keep rich composition and typed absence, no invented instrument/calendar.

Next within approved group 6: source-aware provider/symbol descriptors,
ordinal warmup hydration/P08 quality without weekend penalties, one immutable
VN fixed profile with exact TS/Python producer/read/replay pins, then actual
owned :8096 P08→P10→child→P05→Hub/Report/Replay proof. Inspect stored P04 AV
via named GET; code/offline receipt declare 1d/300 warmup, reuse only when
actual immutable tuple matches. Never update historical declarations/pointers.
Session calendar/close/instrument authority remains absent where unprovided.

The source adapter above is delivered, so the next integration must reuse it,
not reimplement a calendar-day warmup. Main-provider/P08/profile wiring and
the actual product receipt are still the remaining vertical gate.

Claude's §28 correction at `1bcee81a` withdraws **G-23**: the first create got
a capacity 503 requiring same-intent retry; the later causal run completed.
Preserve that receipt/correction. No autonomous recovery, profile workaround
or shared restart is needed. G-22's real browser proof does not replace the
remaining VN product vertical or separately scoped P23/P24 acceptance.

## C4 / cleanup

No stack/session/identity/image created; owned :8096 remains down. Volumes,
backups and source witnesses retained. Only code/contracts/tests and two
private sanitized source receipts written. Root **200 GiB free (32%)**, RAM
available **12 GiB**. **NO_ACTION_NEEDED**, no prune, remote push, dev/main,
shared :8095 or production action.
