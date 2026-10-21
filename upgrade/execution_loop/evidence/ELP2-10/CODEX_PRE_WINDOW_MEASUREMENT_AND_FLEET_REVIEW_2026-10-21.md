# Pre-window measurement and Fleet review — 21 October 2026

**CHANGES_REQUESTED / SOURCE_REVIEW_ONLY.** Immediate handoff to Claude;
not an installed change, a connected acceptance, an external delivery or an
ELP2-10 closeout. No test, build, DB, credential or source activation was run
by this review. Keep original receipts immutable.

## 1. Pins and one-writer ownership

- Canonical baseline: `7f3204026be1946d60af36c898c00b5a6e282f92`.
- Claude source reviewed: `776cf9be`, with documentation-only successor
  `413674701b5bdab38ac70840a5700419f98e86e4`, clean at readback.
- Qualified normal landing: `218b9428`, frozen non-Markdown source
  `432da03d`. The later changes below are not silently covered by that gate.
- **Claude owns** Fleet cancellation, measurement tooling, financial reducer
  and the previously ACKed optional observer slice. Codex reviews/integrates.
- **Codex separately owns the named successor-writer slice** under Bobby's
  latest priority: see [reservation](CORE009_SUCCESSOR_WRITER_IMPLEMENTATION_RETURN_2026-10-21.md)
  and the newest entry in [SYNC](../../FRONTEND_BACKEND_SYNC.md#0-nhật-ký-pin--lần-đọc-gần-nhất).
  Keep `access.service.ts`, `current-human-mutations.ts`, the new
  `manager-domain-successor.ts`, native-successor CLI and successor tests free
  of concurrent writers. That assignment does not activate a source.

Do not rerun the completed `432da03d` normal gate or the full M-1 campaign for
these narrow changes. Return focused evidence as one implementation batch;
the integrator schedules a later changed-code freeze once.

## 2. Fleet cancellation — accept propagation, fix the shared-flight race

**ACCEPT** the direction of `776cf9be`: AbortSignal propagation, cancellation
on scope change/unmount/stop, a shared physical refresh and additional focused
tests. These are fixture/component results, not a real source-revocation proof.

**CHANGE FLEET-1.** At
`apps/portal/frontend/src/execution/v2/screens/fleet/useFleetDataset.ts:225–277`,
the last waiter can abort the controller (`:270–275`) while the aborted flight
remains joinable until its promise settles (`:231–234,264–277`). A new caller,
including the independent READ check after stream revocation, can join that
already-aborted promise and receive null instead of performing its required
read. The denied result that should clear rows is then never obtained.
Also, returning the same shared promise to every caller (`:277`) lets a
cancelled caller receive a value when another waiter keeps the request alive.

Required behavior, preserving one physical read at a time:

1. An aborted flight is not an eligible answer for a new live caller.
2. Wait for the previous physical request to settle; then perform one fresh
   physical read for the new caller. Do not start a second physical request
   merely because the first caller aborted.
3. Cancellation is per waiter: that caller resolves null even when another
   waiter survives and receives the shared successful result.
4. The independent post-revoke READ must actually run; a denied response
   clears rows and leaves the screen in the existing denied state.

Focused regressions, using deferred promises rather than wall-clock delays:

- last waiter aborts -> new caller arrives **before settlement** -> previous
  request settles -> exactly one new physical read;
- two waiters -> one cancels -> cancelled waiter gets null, survivor gets the
  valid result, no extra physical read;
- revoke -> independent read returns denied -> rows/head/cursor cleared.

Keep the existing signal/unmount/query-change tests and approved UI design.
No live provider or new grant is needed for these regressions.

## 3. Measurement tooling — fix before opening M-5/M-7

### MEASURE-1 — tab authority checked after requests have already run

`scripts/measure/lib/stage.mjs:40` awaits `runReplay()` before checking the
workload against `window.max_tabs` at `:41–42`. A workload above the granted
tab bound can already have sent its requests before `TABS_EXCEED_WINDOW`.
Both M-5 and M-7 use this path.

Move workload validation and the tab-bound check **before** replay or header
use/network I/O. Make the workload's tab census explicit for multiple entries;
do not silently interpret the maximum entry count as the total authorized
population. Preserve the approved workload rather than shrinking it to pass.

Add a focused test asserting an over-bound stage refuses with **zero**
requests/fetch calls. Test the valid boundary and a multi-entry stage as well.
This is a local guard defect, not a request for new numeric production bounds.

### MEASURE-2 — G2 ingestion lacks run/population binding

`scripts/measure/m7-g2-window.mjs:52–65` hashes the input then calls
`scripts/measure/lib/g2.mjs:13–29`. The latter validates per-row threshold
numbers but does not require apparatus/gate/source pins or timestamps,
integer sample counts, unique expected feed/venue/kind identities, or
`p95_ms <= max_ms`. The existing `scripts/measure/measure.test.mjs:98–105`
accepts metadata-free input and uses an impossible p95/max pair in a negative
example. Thus the current driver cannot establish the exact pinned P184
run/window/population from that input alone.

Before genuine ingestion, bind the owner-returned apparatus reference, gate
revision, source pin, start/end and expected population to the selected run
and window; reject missing/changed pins, invalid or out-of-run times,
duplicate/missing population identities, non-integer/nonpositive samples and
inconsistent percentile/max pairs. Use the genuine Edge census/adapter;
do not invent a producer mapping or a feed list in Portal.

Keep original P184 comparisons: per-feed p95 <=500 ms, trade max <1500 ms,
quote/mark max <1000 ms. Keep G2 separate from optional mainnet canary and
from the B0/B1/B2 coexistence receipt. Add pure invalid-input regressions;
no apparatus or load rerun is requested by this source review.

### Existing quiet/receipt review remains actionable

At the reviewed source, both quiet loops still return normally on an unmet
deadline: `e2e/measureLane.ts:153–157` and
`e2e/execution-v2-coexistence.spec.ts:139–143`, under `apps/portal/frontend/`.
Apply the pending [quiet/immutable-receipt review](CODEX_MEASUREMENT_QUIET_AND_RECEIPT_REVIEW_2026-10-21.md):
typed invalid measurement on timeout, focused pending/activity/quiet tests,
restore original published M-1 bytes and put interpretation in an additive
sidecar. No full M-1 rerun; unreproduced failures remain CAUSE_UNKNOWN.

## 4. P21 financial reducer — two fixes still pending, no new source mapping

The three P21 source/test paths at `776cf9be` are unchanged from `f0b56371`.
Apply the existing [P21/P22 review](CODEX_BE_P21_P22_REVIEW_AND_ONE_WRITER_RETURN_2026-10-21.md):

- **P21-1:** valid 128-character amounts can sum beyond the output bound;
  `manager-economic-source-reducer.ts:172–173` -> output `.parse():96`
  throws. Return a typed bounded refusal/null, never round/truncate or widen
  the shared decimal contract silently. Test accepted-input overflow.
- **P21-2:** `:167–168` hashes only `census_ref`, not expected source identities.
  The same ref/rows can therefore share a digest across COMPLETE and PARTIAL
  populations. Hash the canonical expected census; test population change
  and census-order invariance.

Retain the dark, strict, exact-decimal architecture. Original producer-row
provenance, source-ID lifetime, economic leaves/census, full cost coverage,
valuation/window and correction mapping still need the selected PM/Edge
return described in [C5](C5_FINANCIAL_PRODUCER_REVIEW_AND_CLAUDE_HANDOFF_2026-10-21.md).
`cost_layers.missing=[]` alone is not proof of complete costs. No runtime
wiring, source qualification or producer field names are invented here.

Integrator's latest PM source read pins **`0956eaa`**, with **37 SOURCE_ONLY
cases** reported by PM. That is real source progress, not financial mapping,
issuer delivery or connected runtime qualification. This review did not
rerun or independently execute those PM cases. Do not promote that count
into any Portal financial/G2 acceptance.

## 5. What is approved, what can proceed, what cannot yet run

Budget proposal **section9** already records Bobby's D1–D4 approval, D5 scan
1/2/4/8/16 tabs, D6 permission to **request** exclusive windows, and D7 Codex
as independent calibration reviewer. Do not ask those generic questions again.
They do not approve a production user target, arbitrary numeric bounds,
RPO/RTO/retention, a source window or calibration anchors.

**Now:** Claude fixes the source/tooling cases above and returns focused
results. Correct the current window-request handoff with actual pins and send
partial owner requests; status is not SENT until delivery occurs. Whole-Fleet
snapshot/STREAM operations already exist in
`execution-alpha-fleet-realtime.openapi.json` (BE-P17); missing authority,
eligible publication/notices and connected proof must not be called a missing
API. The old recovery-only window and native READ grant do not authorize load
or whole-Fleet STREAM.

**Before M-2c/M-5/M-7:** obtain source-authorized target/config/workload/window,
exact session/scope mapping, source-call counters, scalar budget catalogue
and approval pins, plus the G2 apparatus/census. Repin root/user leases,
competing jobs, source/image/config immediately before the finite slot.
Preserve separate READ/STREAM grants and original custody/UNKNOWN fences.
The 2CPU/1536MiB candidate correctness cap is not a load pilot approval.

**Before calibration fit:** freeze a comparable independent population and
fit/evaluation split. The existing four identical overlapping 14-day tapes
with unpublished currency/basis remain useful evidence of missing inputs,
not a fitting population. Repeating their unchanged census adds no proof.
Keep the chosen formula/weights/bands; no fixture anchors or inferred costs.

## 6. Focused validation and receipt reuse

After implementation, from Claude's source lane:

```bash
cd /home/bobby/portal-research-fe/apps/control-api
npx vitest run test/manager-economic-source-reducer.spec.ts --maxWorkers=1
```

```bash
cd /home/bobby/portal-research-fe
node --test scripts/measure/measure.test.mjs
```

Run only the affected Fleet regression file(s) and new controlled-time quiet
tests using the existing frontend runner. These are requested tests, **NOT_RUN
by this review**, not a new aggregate PASS count.

- Reuse unchanged `432da03d` normal/source evidence for its actual scope;
  post-freeze code needs its own focused results and later combined gate.
- Preserve M-4 coalescing/digest/fencing and M-6 lease/restore binary receipts
  where dependencies are unchanged. Their noisy timing or tiny fixture data
  never supplied production capacity/RTO.
- M-2 fixture counts do not prove source-call amplification; M-5 driver
  selftest does not prove coexistence; no genuine M-7 receipt yet exists.
- Old M-1 measured numbers stay pinned to their original build. Quiet fixes
  or explanatory docs do not justify rewriting historical bytes or rerunning
  all unrelated routes. Retake only affected observations when needed.

Return source SHA, changed paths, actual focused test outcomes, immutable
receipt/addendum hashes and remaining owner inputs. Root updates Unified/SYNC
and performs the eventual landing. No push, installed READY, external
delivery, budget/calibration approval or full ELP2-10 PASS is claimed here.
# Review delta17:18UTC — Claude0201df80/2c1b8717/a0b885b6

Additive disposition; earlier findings/history below remain preserved.

- **ACCEPT P21-1/P21-2** in0201df80: exact bounded overflow is typed
  REFUSED/ECONOMIC_SUM_OVERFLOW/null, no widened decimal; economic set digest
  binds sorted census identities. Independent source review agrees; this is
  dark reducer correctness, not a financial producer mapping/runtime proof.
- **ACCEPT immutable M1 restoration** in a0b885b6. Original JSON SHA256
  `af161572e140fe8b172acc198978dcb49016118677e41c23504a31bead8aa2e3`;
  additive interpretation SHA256
  `2e6509614a34ad5de32c6d33648515b2c30dfba1f73faa5102402229707be258`.
  DEBT045 remains UNREPRODUCED/CAUSE_UNKNOWN, not product exoneration.
- **CHANGE QUIET-DELAYED-WAKE**, narrow remaining case in2c1b8717:
  `apps/portal/frontend/e2e/quietGate.mjs:41–42` evaluates success before the
  deadline. With call at0, cap15000, quiet400, last activity14900 and wake15500,
  it returns PASS although quiet could only start satisfying at15300. Enforce
  the stated deadline/quiet-achievement policy and add one controlled-clock
  delayed-wake regression; no M1 rerun. Keep exact-cap semantics explicit.
- The M1 addendum's line46 still points to non-ancestor4b0d78e4. Append the
  reachable implementation locator2c1b8717; do not rewrite original receipt.
- Source contains five controlled unit cases and three browser probes.
  BE-P19 packet line30 claims checked but has no new result-log/hash/count
  locator. Please return that actual focused receipt; independent review did
  not execute them and does not call them PASS. No blanket hook requested.

Claude keeps these paths. Existing Fleet-flight, stage pre-I/O cap and G2
source/apparatus/population binding requests remain open until their own
fix/receipts. No source authority/calibration values or acceptance is inferred.

## Independent executable repro —21Oct17:51UTC

This addendum supersedes only the earlier statement that the following two
findings were source-review-only. Root imported the actual functions from
Claude's source58c782ede5c0b006c458dc5dcb78b828ee83ec59 (current89f561c4 adds
Markdown only) and exercised controlled inputs. No fetch, provider, browser,
DB, source/fixture edit, heavy lock or load measurement was used.

| Guard | Controlled input | Actual result | Disposition |
| --- | --- | --- | --- |
| `e2e/quietGate.mjs` | start0; cap15000ms; quiet400ms; activity14900ms; delayed wake15500ms; earliest possible quiet15300ms | `RETURNED_PASS`, waited15500ms | **CHANGE**: deadline already passed before quiet could be achieved; add delayed-wake regression and make exact-cap semantics explicit. |
| `scripts/measure/lib/g2.mjs` | one synthetic row, `samples:1.25,p95_ms:10,max_ms:1`; no apparatus/source/window/census | `ORIGINAL_GATE_MET_FOR_SUPPLIED_POPULATION` | **CHANGE**: reject invalid counts/percentiles and missing exact-run/population authority before a genuine G2 ingestion. |

Captured result, retained privately without credentials:
`/home/bobby/.local/state/portal-execution-elp210/20261021/successor-frozen-ErfjOY/claude-guard-source-repro.json`.
SHA256 `eef6c8509b28a91ef66fb698a176a28fa9720dfedbcbb234e02d19b9a55fbae0`.
The synthetic row is explicitly TEST_ONLY, not an Edge census or a financial
source value. These are two reproduced guard defects, **not** two new product
measurements, a failed P184 source run, or permission to change its thresholds.

Claude remains the writer for both fixes, Fleet cancellation and pre-I/O tab
validation. Return their focused regressions together; no full M1 rerun.

### BE-P22 actual PG return / independent disposition

Claude89f561c4 records **11 files /328 PASS /EXIT0** for the owned PG lane
30108061488512459. Its stripped log SHA256 is
`313eed52c6fb444860f777fcb7694386f372378252868359cc156465c9216a6d`;
the source/command/cleanup locator is Claude's source checkout
`/home/bobby/portal-research-fe/upgrade/execution_loop/evidence/BE-CLAUDE-2026-10-20/BE-P22-native-cache-observation.md`
at89f561c4 (last section; not yet landed into canonical).
That job completed before Root's fresh normal gate began17:37:56UTC.
Root accepts the source fixes and this bounded test receipt; it did not rerun
those328 tests or count them as connected HIT/egress/CLI proof. Observer stays
OFF, no source or identity is activated by this disposition.

**Verification: R0.** This addendum changes only Markdown. Code/normal gates
remain with their frozen source; historical measurement receipts are unchanged.

