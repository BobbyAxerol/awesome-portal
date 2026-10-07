# §44 / WEX backend acceptance — 2026-10-07

**BACKEND_REAL_PREVIEW_ACCEPTED; FRONTEND_CONSUMER_HANDOFF_READY**.
Not frontend visual acceptance, owner review, P24 or stable release.
No frontend, protected kernel, historical seal/report or source data edit.

## Delivery

| ID | Implementation |
|---|---|
| WEX-01 | OHLC-bearing Arrow schema no longer depends on a separate fee ledger; full bar observations survive P05 Parquet. |
| WEX-02 | Writer-time ALL TIME analytics per executed window:25 typed descriptive facts, equity/DD curves, monthly returns, distributions and episodes. WFO IS is per-fold diagnostic, never stitched overlapping training. |
| WEX-03 | Four named authenticated same-origin reads; explicit window/fold Compare; exact shared UTC-ms correlation, no sampled curves/forward fill. Completed Three Holdout allowed, pending protected. |
| WEX-04 | Actual order/fill/trade/command/order-report/lifecycle custody; decimal price/quantity/fee, source clocks/status/SL/TP/Limit/parent-child/OCO fields, individual typed absence. No Portal matcher, fabricated broker history or IDs. |
| WEX-05 | Generated OpenAPI/types, fixture, focused tests, additive migrations116–118, real product receipts and [Claude handoff/prompt](./COMPLETE_WINDOW_EXECUTION_CLAUDE_HANDOFF_2026-10-07.md). |

Contract:`research-window-execution.openapi.json` / generated
`research-window-execution.d.ts`. Types:`WindowAnalytics`, `WindowDescriptor`,
`WindowExecutionPage`, `NativeExecutionRecord`, `WindowCompare`.
Operations:`researchWindowAnalyticsGetV1`, `researchWindowObservationsGetV1`,
`researchNativeExecutionRecordsGetV1`, `researchWindowCompareGetV1`.

## Real product receipts

Ordinary authenticated P08 → P10 → confined QuantBT1.1.1 child → immutable
P05 → named product GETs. HMD read-only:`crypto-binance-1m / BTCUSDT / 1h`.
Direct engine tests or fixture values are not product proof.

| Case | Run | Actual source population |
|---|---|---|
| Three A | `rrun_729c36043209ed38a4a966b90f85568a` | IS504 / OOS168 / Holdout168, all AVAILABLE |
| Three B | `rrun_1aeb8159b2ed7560d4df1a58651f61e7` | IS504 / OOS168 / Holdout168, all AVAILABLE |
| WFO global | `rrun_6f7e63ce32cbbe57698e5f4c883201f8` | OOS504; IS fold0/1/2:792/960/1128; Holdout N/A |
| Bracket V4 | `rrun_c2329924a32a26e8d9d5bf9d5c1f809a` | IS168 / OOS168; two actual OOS fills |
| Reactive V3 | `rrun_fbf968c1075a2b020a03bd04fd7a8024` | IS168 / OOS168; one OOS fill, three journal rows |
| Event V3 | `rrun_9f127033d7ed4ccd4692d0be1f6aec53` | IS168 / OOS168; one OOS fill, six journal rows |

Three boundaries2026-06-01→06-22→06-29→07-06; WFO2026-07-01→08-24,
first OOS08-03, weekly expanding, three real global trials, seed42.
Native06-01→06-08→06-15; declared Holdout ends06-17 but fixed child does not
execute it:NOT_PUBLISHED / FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT.
Private root:`/home/bobby/.local/state/portal-research-p23/window-execution-20261007/`.
Accepted packets:`three-a-final`, `three-b`, `compare`, `wfo-accepted`,
`bracket-qualified`, `reactive`, `event_driven`, `final-readback`.

Final readback:30 authenticated GET assertions + anonymous401; generated
OpenAPI validation of real pages/journals/Compare; foreign-workspace404 and
changed-limit cursor400. Compare IS/OOS/Holdout all match requested scope;
constant return correlation is typed N/A, never bogus zero.
At2026-10-07T14:21:17.594Z; SHA-256 of private final `receipt.json`:
`91dac644f8b0d1e5a8f1f00ab7b0433d6f57e2013dca15fa4a24fcb73d865dbe`.
Live inspected OCI IDs, not stale preview-script stamps:

- Control:`sha256:01c0c67595257bfbfa3b29ee290aa04ba0e17854938da1fe26486ca46950a340`.
- API/worker:`sha256:202d40f6e29c20f2bcc998f436c87a8d2e2ae3aaedfe75db30698afddeecdd09`.
- Web unchanged:`sha256:9b77042029dd711ca5788cc516437c6f9cb37bcc69beafc93ec088d4dfe049b4`.
- Candidate qualification override removed; final Bracket uses normal qualified intake.

## Bugs caught and fixed

Bar-schema loss; READY metadata mistaken for incomplete canonical run;
training padding mislabeled OOS; global empty params_by_fold incorrectly
treated as missing selection; scoring-frame/warmup mismatch in diagnostic
replay; Bracket V3 zero execution from wrong sizing; unnormalized fill aliases.
Global uses actual global selection; local folds require their own map, never
the last-fold deployment selection. Diagnostic strategy receives the exact
scoring frame and its closure supplies300 observed predecessors.
Failed/sparse WFO packets:`wfo`, `wfo-final`, `wfo-qualified`; preserved,
not accepted or overwritten. Successful older runs were read back, not rerun.
Additive Bracket V4 preserves original adapter/V1–V3 descriptors/Alpha identities.

## Safety, tests and resource closeout

- TS focused schema/cursor/feature/navigation/recipe:18 PASS.
- Published contracts suite:308/308 PASS. Foundation admission includes the
  additive Bracket V4 identity while preserving the original five, FULL-02–06
  ordering and nine previous native identities; generator/check + snapshot agree.
- New completed-window contract regressions:4/4 PASS; isolated CI input/cleanup
  regressions:5/5 PASS. The networkless verifier receives only the explicit
  public Zod source and hash-bound Bracket V4 receipt, never private runtime data.
- Python window/native:17 distinct cases PASS, including actual pinned engine
  synthetic-tape regressions; not mislabeled as product receipts.
- Disposable PostgreSQL migration116–118/repeat, finalization, immutable
  custody and FORCE-RLS tenant isolation:PASS; tmpfs test container removed.
- Pages≤200 rows/1MiB; opaque cursor bound to actor/workspace/run/operation/
  window/fold/filter/limit/revision. Local admission2/18, timeout/abort,
  private/no-store. No full history calculation on GET.
- Writer live lease/fencing + exact P05 manifest/part/request/effective/
  dataset/profile digests, contiguous counts and full canonical hash.
- Before/after preserves all30 prior source seals, users/session versions,
  password-change status, Alpha versions/pointers, HMD index and web image.
  Protected kernel SHA matches PROTECTED_SHA256:
  `34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d`.
- C4:NO_ACTION_NEEDED for test runtime. Test DB removed; own review sessions
  logged out; no qualification override/background test job. Retain named
  evidence/preview/rollback images. Root97GiB free/621GiB; bounded-build
  capacity decision in §44. No broad prune, source/business volume deletion,
  production/stable/dev/main/remote action.
- Grouped normal commit hook passed: contracts312/312, Control API2388 PASS /
  3 pre-existing SKIP, build + PostgreSQL restore drill + monorepo verification
  PASS. The two isolated test-harness failures (contract-mount path and historical
  native recipe count) were fixed and retested; no engine run was repeated.
  Concurrent Claude §44 BR-S02-18 is preserved; this delivery is its WEX addendum.

## Precise remaining source/consumer boundaries

WFO IS is post-selection frozen-parameter training diagnostic, not original
optimizer equity or untouched evaluation. Independent WFO Holdout does not
exist. Fixed native Holdout has not executed. Intrabar supplies actual fills,
exit reasons and active levels, not complete order/OCO relationships:ORDER
read is NOT_PUBLISHED with matching count null. DTO support is not real
Limit/OCO Alpha browser acceptance. Old seals without companion remain
HISTORICAL_WINDOW_EXECUTION_CUSTODY_NOT_RECORDED; no silent historical backfill
or seal overwrite. Supplemental window analytics do not change a sealed
Report's revision/pin/RC. UI selectors, body-adjacent fill markers and product
visual acceptance remain Claude's task, not claimed by backend API evidence.
