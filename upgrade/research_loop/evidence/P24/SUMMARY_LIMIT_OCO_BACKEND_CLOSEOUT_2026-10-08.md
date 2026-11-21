# BR-S02-22 → BR-S02-21 — backend delivery and Claude handoff

Bobby approved summary/admission repair first, Limit/OCO qualification next.
Storage compaction/repacking remains **DISCUSSION_ONLY / NOT_IMPLEMENTED**.
No frontend design, protected strategy, Execution runtime, shared preview,
production, dev/main or remote branch was changed by this slice.

## 1. Summary/admission: real 16-fold × 400-trial product proof

Run `rrun_3062d7a0899fa42ddf3faf0e8a723aa3` completed through normal authenticated
P08 → P10 → isolated QuantBT 1.1.1 child → P05 retention → named API readers.
Recipe `p10.delta-per-fold-decay-1h.v2`, protected Delta 1.0.1, dataset
`crypto-binance-1m`, BTCUSDT/1h, seed 42, default declared parameter space.
UTC `[2026-01-05,2026-09-28)`, first OOS 2026-06-08, weekly expanding, 400
trials/study: **16 folds / 6,400 distinct retained and readable trials**.

| Measured fact | Result |
|---|---|
| Terminal | authoritative `SUCCEEDED / COMPLETED / READY`; 16 reported/done folds |
| Named product reads | 8 PASS, including Evidence, Split, Search, Freeze, Replay, Report and RC |
| TRIAL paging | 32 pages × 200, 6,400 unique IDs, no missing/duplicate rows |
| CANDIDATE paging | 13 pages, all 620 unique source candidates |
| Largest Search trial page | **1,000,181 bytes**, below 1,048,576 bytes |
| Sealed database core summary | **63,492 bytes**, below unchanged 65,536-byte limit |
| Enrichment | **26,076 bytes**, below unchanged 73,728-byte limit |
| Retained table census | TRIAL 6,400; FOLD 16; CANDIDATE 620; OBSERVATION 6,384; SELECTION 1 |
| Freeze | integrity MATCH; Stage 4 params/bundle both MATCH |
| Cursor separation | TRIAL cursor used as CANDIDATE cursor → 400 |

The only duplicate authority removed from the core summary is a large
candidate-ID list already present in the retained CANDIDATE table. Its typed
reference has count 620 and SHA-256
`21c464b4a67501547bd6cfd67b278aafa36b05410f0376ce2e7e54fea3c4fb79`.
Both the seal validator and reader resolve/check the full source population;
wrong count/hash/missing candidates fail closed, never become an empty pool.
Small/historical inline summaries retain their old interpretation.

**Admission bounds are preserved**, not reduced to hide the problem: 2–16
folds, 2–400 trials/study, max 6,400 total. The upper admitted row combination
now has a real end-to-end receipt. Unexpected over-budget metadata remains
the typed terminal `RESEARCH_CURRENT_SOURCE_METADATA_TOO_LARGE`, not generic
`ENGINE_ERROR`. This proof is for the exact recipe/range above, not every
possible Alpha, source revision or unlimited metadata payload.

Private `summary-6400.json` SHA-256:
`5544c74ca7a60a18ef0dba73e46e6732612d43c106189ca9493991b08f12e2fc`.
Execution worker image:
`sha256:293abd5d7f26505b68fb565e82a6d1052b3a1da9308fda88d889a86c88129f09`.
Read Control image:
`sha256:cd74ac64d3c19bf8ecb06e919bb8ed0bfb6b28370a7c33c5a14ae0a7503f3a01`.
Full private receipts are under
`/home/bobby/.local/state/portal-research-p23/20261008/expanded/`.

## 2. Additional upper-bound bugs fixed from actual failures

- Window-seal batch lookups were scanning the entire 82,001-row window
  population for each 200-row batch. Additive index 123 binds workspace,
  run, revision, batch and source ordinal. Exact query measured **41.096 ms /
  7,787 shared blocks → 0.450 ms / 26 shared blocks** (8,456 KiB index).
  No source payload, digest or window was rewritten.
- Large retained Progress catch-up synchronously replayed thousands of
  missed callbacks and starved the lease/heartbeat. It now emits the actual
  last retained trial of each remaining study, with retained provenance;
  the dense P05 TRIAL table still contains every individual trial. Small
  catch-ups stay unchanged. No fictitious live rate/event was introduced.
- Search validates each bounded source trial once per request; it no longer
  reparses all 6,400 rows for every study. Full pool census uses independent
  50-row CANDIDATE paging for populations >200; smaller pools stay whole.
- Search chart transport on >400-trial ledgers has a combined 320-point cap,
  using the existing typed stride policy and preserving selected/best points.
  Statistics/distributions still use all rows; ledger paging is not sampled.
- Report's six retained projections execute sequentially inside the existing
  two-slot admission instead of timing out their own fan-out queue. Authority,
  API, workspace, source-revision and all finite bounds stay enforced.
- Checked-out PostgreSQL connection loss (25P03), not OOM, could crash Control
  before COMMIT rejected. Pool clients now have sanitized, rate-limited error
  handling; queries still reject and broken clients are destroyed. No idle
  transaction timeout was relaxed or source error silently swallowed.

Preserved history: the shared original failed run `rrun_bd5906ac…`, isolated
first failed import `rrun_c555d355…` and second lease-expired attempt
`rrun_d69d1543…` are **not repaired/relabelled**. The second attempt was
cancelled through the normal actor API; no manual business-row mutation.
Only a new third completed run is the positive 6,400-row proof. Its child
was not rerun when subsequent read/harness fixes were verified.

Read-only shared-preview NATS check: `QUANT_JOBS` exists with `quant.run.requested.>`.
There is no terminal-notification JetStream subject in this preview, explaining
`NoStreamResponseError` warnings. Durable DB/source journal is authoritative;
the request stream is not absent. No new notification-stream/SSE campaign
was silently added or notification replay claimed.

## 3. Limit/OCO product qualification

[Frozen exact recipe/run/hash packet](../P10/LIMIT_OCO_PRODUCT_QUALIFICATION_2026-10-08.md)
proves BTC, ETH and SOL via ordinary admission and the confined child.
All three completed; each has actual 3 orders, 2 fills, 8 lifecycle events,
parent-full-fill SL/TP activation, TP fill and SL sibling cancellation.

New immutable profile `p10.delta-event-driven-limit-oco-fixed-1h.v1` and
Alpha `av_delta_rsi_polynomial_alpha_1_0_12`. Existing editions and engine pin
stay untouched. Recipe registration → exact identity → product qualification
is additive (migrations 119/120/121/123/124; **122 was never issued**).

Public generated native result contracts accept
`DELTA_CLOSE_LIMIT_OCO_COMMANDS_V1` on Evidence and Progress. The small actual
BTC fact fixture is `research-native-limit-oco-result.valid.json`; the full
journal/admission/retention receipts stay private, not synthetic qualification.

## 4. Claude consumer handoff — do these after landing/rebuild

1. Regenerate/read `research-current-source.d.ts`. Large S06 candidate pools
   now publish `candidates.returned_rows` and `candidates.page`; follow
   `candidate_cursor` independently of `ledger.page`. Never reuse a trial
   cursor for the candidate pool or infer the whole pool from page 1.
   The real test is 32 trial pages / 13 candidate pages on the run above.
2. Keep S06 chart sampling caption/count from the server. The 320-point
   transport limit is not a 320-trial source population. Selection/best and
   the full 6,400-row ledger remain readable. Preserve pruned/null policy.
3. For S08 Limit/OCO, consume `NativeExecutionRecord` already published:
   prices from `result.orders`, relationships/activation from actual
   `metadata.command_report` or `metadata.order_report`, timing/status from
   `metadata.lifecycle_event_report_v1`, actual fills from `result.fills`.
   Join only explicit source IDs; do not parse suffixes, infer OCO from row
   adjacency or move missing fields onto the bare OrderIntent.
4. Fixed native Holdout is `NOT_PUBLISHED` with its exact reason, not broker
   lifecycle replay. IS/OOS may legitimately have zero journal rows. Fees,
   funding and published zeroes must stay distinct from typed absence.
5. These run IDs live in the **owned 8096 cell**, not the shared 8095 DB.
   After the normal shared-preview backend rebuild, create a fresh run or use
   an explicitly arranged retained-data receipt; do not claim the owner can
   already open these IDs on research-portal. No DB copying is implied.
6. Keep layout/typography/colour/HiFi unchanged unless Bobby approves a
   frontend refinement. Retake only affected S06 paging/S08 journal/real-API
   gates, then the already-assigned matrix. No P24/product release GO here.

Suggested Claude prompt: **Read queue §49 and this packet; consume the new
candidate-page boundary and qualified Limit/OCO native fact protocol on S06/S08.
Rebuild the shared preview normally, prove all rows/actual parent–OCO events on
real API, preserve design and typed absence, then update your consumer/matrix
receipt. Do not treat backend product qualification as browser acceptance.**

## 5. Gates and resource closeout

Focused serializer/native tests, typed terminal reason, bounded progress
catch-up, population digest/tamper/parity, service paging, chart statistics,
Report and DB error recovery passed. The new actual native fact fixture also
passes both generated boundaries. Compiled qualification-without-selector
and exact identity/stack teardown are recorded below. Source landing requires
the normal grouped commit hook to succeed; a commit is not accepted otherwise.
No repeated unaffected engine run is needed.

Capacity: the explicit ≤5-GiB added-footprint decision was followed; no
frontend build, broad prune, source/retention deletion or Parquet compaction.
Own ephemeral identities are revoked, then only the named 8096 project is
stopped without volume removal. Evidence, source rows and rollback images
remain recoverable. Shared preview/production services are not restarted.

**Actual compiled/cleanup results:** final Control image
`sha256:0cc18bee34595cd19f09a2fd81a38dfffcedbba343f74d57dfa94780efd4ff9a`,
API/worker image
`sha256:8d829eaa38c39971391064d98fa61768aab3f5888c51dfb5736b853e2d20442b`.
`limit-oco-qualified-intake.json` SHA-256
`de3350db979414fa96b90b409df4ac96f40c5ecdbf22508a8908005e23177ef4`:
selectors empty, three symbol setups `ENABLED / PRODUCT_RUN_QUALIFIED`, fresh
preflight `may_create_run:true`, preserved run/fact parity, **zero new children**.

Consolidated contracts had 317 unaffected passes and one obsolete assertion
expecting 10 rather than 11 additive native profiles. Only its file was
retaken: 18/18 PASS; all **318 distinct tests** are now passing. Source and
Control focused gates and final backend builds also passed. The mandatory
normal grouped commit hook is enforced for source landing, without bypass.
Its first pass found an omitted public receipt in the isolated contract
workspace's copy list; `scripts/contracts-test.sh` now copies the exact new
Limit/OCO packet as well. This is harness custody, not missing engine evidence.
The fixed replay custody test's old 10-profile census was also updated to 11,
preserving the first ten identities and asserting the new exact edition;
its full file passed 10/10 before the final source gate. An in-progress gate
was stopped early to include that test correction, not bypassed or marked PASS.

Cleanup completed: disabled 21 non-owner principals, revoked all 22 sessions,
kept owner anchor and all business/source/receipt data, removed only the
consumed activation credential file. Zero containers remain for the exact
owned project; all four volumes preserved. Root available **101,579,800,576
bytes** after teardown; **NO_ACTION_NEEDED** for destructive cleanup.

## 6. Shared-source landing and concurrent Claude review

The ordinary grouped commit hook passed: contracts **318/318**, Control API
**2,424 PASS / 3 SKIP** across 262 passing files and two skipped files,
PostgreSQL dump/restore and the remaining workspace gates PASS. No hook bypass.

During that gate, Claude landed `b56d6ad9`, `a8992e63` and `05b11981` on the
shared Research branch. Source integration preserves all three commits,
both §48 addenda and the complete capacity report. In particular, the earlier
small observed WFO seal was **3 folds × 3 trials**, not 3 × 400.

Reviewed `05b11981`: moving whole-window digest verification into a tenant-bound
read-only repeatable-read snapshot leaves the final authority check and seal
insertion in a short write transaction. Append-only custody plus the batch-set
recheck preserve integrity across the two transactions. Its seal-specific
30-second timeout does not increase the bounded retry count or append timeout.
These changes complement the measured batch index, not replace it. After
combining sources, the affected repository tests pass **11/11** and Python
seal-timeout regressions pass **3/3**; the unrelated full suite/engine is not
run again solely for this landing.

The 16 × 400 and Limit/OCO receipts keep their original exact image/source
pins. They do not claim a new run on the post-integration shared image or
browser acceptance. Claude's failed 8-fold run remains failed, with its sealed
custody retained; it is not repaired, deleted or relabelled. Source landing is
ff-only into `docs/research-loop-plan`, with no remote push or runtime change.
