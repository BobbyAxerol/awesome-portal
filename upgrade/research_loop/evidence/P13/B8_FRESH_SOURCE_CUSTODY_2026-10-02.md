# B8 continuation — fresh source custody and actual named-API receipt

Continues the six Bobby-approved groups and `8bd781ed`, not a new campaign.
Backend lane `codex/be-gaps`; landing `docs/research-loop-plan`. No frontend,
protected strategy, source market store, shared :8095 or production mutation.
**Scoped backend delivery, not P23/P24 or full frontend acceptance.**

## Implemented

1. Fresh fixed/imported capture publishes optional `enriched_analysis.by_window.is`
   with its own IS scope, digest, engine/derived facts, benchmark and histogram.
   OOS is unchanged; WFO and old sampled seals do not acquire invented IS facts.
   Holdout bounds remain metadata; no holdout observations reach the child.
2. P11 orchestration timestamps are bound to the exact retained attempt,
   source/artifact/profile/request identities. Search/Freeze publish them as
   **orchestration**, not engine freeze or first-OOS-read clocks. An unpublished
   engine pool clock is null with a typed source reason, not S4 completion.
3. Migration **087** and a fenced, append-only companion retain all **available**
   child lifecycle records before scratch retirement. Existing five-table P05
   and 64-row audit witnesses stay unchanged. Full raw-file, contract and
   normalized-row digests differ explicitly; source drops remain visible.
4. Fresh fixed/imported OOS OHLCV, equity, returns, drawdown and native positions
   are captured into bounded Parquet (20,000 rows / 2 MiB). Its fresh P05 table
   is sealed into the exact manifest; migration **088** retains a matching
   immutable named replay companion. Byte proof covers the exact manifest and
   receipt, worker lease, source files, profile, declared OOS and no holdout.
5. Public reads require session/workspace membership, forced tenant RLS and
   opaque actor/run/revision/filter-bound paging, <=200 rows and <=1 MiB.
   Historical custody is `NOT_RECORDED`/`LEGACY_SAMPLE`, never reconstructed.
   WFO cannot masquerade as fixed replay. Raw child file and rewritten P05 part
   hashes are separate; none is described as another hash domain.
6. Native QuantBT `Close_DEFAULT` / `Position_DEFAULT` are preserved. The
   authenticated immutable market symbol is separately `BTCUSDT`; native
   `DEFAULT` is not silently relabelled. Actual source close parity is checked.
7. Runtime and generated Library/Lineage/Compare contracts reject AVAILABLE/null
   metrics. Actual testing found cancelled Library rows with this contradiction:
   they now expose the genuine last-observed progress; absent non-completed
   analytics stay NOT_PUBLISHED. No lifecycle is changed to RUNNING or COMPLETED.
8. Independent review found retention `to_thread` cancellation racing scratch
   cleanup. Fixed, WFO and what-if retention now fence cancellation and shield/
   join bounded custody work before terminal transition/cleanup, including
   repeated cancellation. Heartbeat remains until the thread settles.
9. RC links point to the actual Alpha lineage and declaration surface. Actor-
   local sealed drafts read locked and refuse PATCH, while identical seal retry
   returns the same immutable pack. No P22 publication occurs in this receipt.

P04 budgets remain 24-KiB core, 28-KiB journal, 64-KiB enrichment,
98,304-byte result and 73,728-byte JSONB. Retained sampling is explicit.

## Final owned runtime proof

Cell `portal-research-p23-ol12`, loopback **8096**, workspace
`ws_06GE6XY0SKNPFS7TP8WCE938Z5`. Owner anchor only; no password reset or
reactivation of the 21 retired test users. Pinned QuantBT **1.1.1** and
checksum-verified HMD **0.1.0rc3**, read-only historical input.

Final diagnostic image IDs (not signed release/clean P23 candidate):

- Control: `sha256:ba767b7f6f63d547224194559e122e5338d8f5e605d21c4c9163c1c476c31c11`.
- Python API/worker: `sha256:e236f7e9a8a2198809966ab5f7f6855bf64f38f73e98096f274b92187a70660b`.

| Actual fresh producer run | Evidence |
| --- | --- |
| Fixed `rrun_b5c63e9f4aabdf59f5a158e245c0ae29` | Real P08/P10 create -> isolated child -> fresh P05 -> named BFF. BTCUSDT 1h, IS June 1–8: 168 rows; OOS June 8–15: 168 rows; 300-bar warmup; June 15–17 holdout excluded. Separate IS benchmark AVAILABLE. All 168 replay observations read in **5 pages**, exact ordinal re-read. Full-OOS first/last return and UTC-daily Type-7 signed-loss statistics agree with independent raw replay oracle within **1e-12**. |
| WFO `rrun_49142d25954abd176d3c2bd0f44b51e2` | June 1–July 15; first OOS July 1; weekly global, 3 actual optimizer trials, seed 42. **336 OOS observations / 2 folds**. All **12 available audit records**, zero source drops, read in **3 pages** and exact ordinal re-read. Hub and supplemental Report share enrichment. Orchestration clocks published; engine pool clock remains absent. No fabricated WFO IS payload. |

IS capture here is actual source-time/runtime proof, **not** a separately retained
raw-IS oracle. The independent numerical oracle above is full **OOS** only.
The earlier pre-join proof is retained separately, not erased or relabelled.

Actual additional receipts:

- **13 metadata cases**: seven positive/refused range oracles plus six negative
  cases. Exact owned BTC1h index has **2,952 bars**, May 1–September 1, zero
  gaps. First-day insufficient warmup, 299/300 boundary, exactly 300, both
  outside edges, misalignment, unknown symbol, oversized warmup and foreign
  workspace behave faithfully. VN daily is still NOT_QUALIFIED.
- **11 companion cases**: unauthenticated 401, foreign workspace 404, over-limit
  and malformed/changed-query cursors 400, and WFO fixed-replay NOT_APPLICABLE.
- RC `rrun_0d7891d8904d2a753d87771a59ffcdde`: actual draft PATCH -> local seal
  `rc_06GFS352FW3Q4X0NV0W7C3MFX2` -> locked GET -> same seal retry -> PATCH
  **409** -> unchanged pack. Delivery stays NOT_DELIVERED / NOT_APPROVED.
- Existing real FAILED `rrun_26c7490c49549f89e1b665a9b83b7037` and CANCELLED
  `rrun_c3fbd622a5498da697a01035d0451cb5`: progress, console and terminal
  Split return 200, typed no-seal absence; FAILED console has four source lines.
  These are read receipts of existing actual terminal runs, not newly induced
  child faults. CANCELLED-before-source correctly has zero console lines.
- Formerly failing CANCELLED Library now returns **200 / 50 cards**; rows with
  genuine journal display last-observed metrics without AVAILABLE/null.

## Tests and provenance

Focused tests recorded during integration: fixed replay/P05 **43/43**;
retention/source HTTP/IS **21/21**; private companion ingress **7/7**;
Library/null regression **39/39**; worker cancellation/worker **14/14**;
receipt scripts **3 files PASS**. Other disjoint owner test counts remain in
the agent integration notes; they are not added together as a new full gate.
The first restricted-sandbox async worker test stalled without a verdict; its
exact process was stopped, then the same focused tests passed with local
event-loop permissions. That interrupted attempt is not PASS.

Contracts/types regenerated centrally; snapshot and diff check pass. The
mandatory combined hook is enforced on the integrated commit, without bypass;
its complete output is preserved privately as `b8-fresh-commit-hook.log`.
Do not infer frontend/build/browser PASS from backend generation.

The first hook attempt stopped at the live route ledger: the six intentionally
added companion routes had not been recorded. The approved ledger generator
now records exactly those six additions (249 -> 255 routes), with no removed
route or protected-kernel change. That interrupted hook is not full PASS; its
output is preserved as `b8-fresh-commit-hook-route-ledger-failure.log`.

The subsequent isolated Control gate passed 1,632 tests (one opt-in skip) but
one OpenAPI test suite failed to import the contracts generator: that test was
incorrectly placed in the Control-only test cell. The OpenAPI/fixture checks
now belong in `packages/contracts/test/research-fixed-replay-companion.spec.ts`;
runtime Zod/custody checks stay in the Control suite. No schema or assertion
was disabled to pass the gate. The failed full log is retained separately as
`b8-fresh-commit-hook-test-lane-failure.log`; it is not full PASS.

Private receipts (0600), under
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/`:

| File | Exact file-byte SHA-256 |
| --- | --- |
| `b8-fresh-source-receipt.json` | `a539a41f5a577e0e34b0f093b5445e649233096b585b8207ea8ea3f7dbfe092c` |
| `b8-source-remediation-receipt.json` | `8dde0bee27c0b521a863c715b4331a23417924f655aa5e0b94a38fa402d1e4b6` |
| `b8-rc-terminal-receipt.json` | `b4812882676f4325dbde32c6a112bf8560244c48db59f79aa2c732e545fc3eec` |
| `b8-companion-negative-receipt.json` | `75251a1b1bfced3bb7fd9ceed1f05b6674e7960b460a9206be45e05bb9705a62` |
| `b8-cancelled-library-fixed-receipt.json` | `d85e441113f8d35bf2b9e7d9d3a187c857c405ae9cf698b6c9b4568e86690a08` |

## Claude handoff and remaining work

- Regenerate consumers. Fresh fixed IS lives in optional `by_window.is`, **not**
  the OOS-only v2 Fact. Omitted historical/WFO IS is not zero or AVAILABLE.
- Fixed S08 uses generated `researchFixedReplayObservationsGetV1`,
  `/api/v1/quantbt/runs/:runId/replay/observations`; preserve native position
  keys and separate `manifest.market_symbol`. This is observation replay, not
  an orders/fills execution ledger. Keep layout/colors/typography/baselines.
- Full available lifecycle paging uses generated
  `researchChildAuditCompanionGetV1`,
  `/api/v1/quantbt/runs/:runId/current-source/child-audit-companion`.
  Render custody/counts/drops and the closed contexts faithfully; a legacy
  witness cannot stand in for full rows or authoritative generations.
- Search/Freeze `stage_events` is explicitly orchestration; an engine clock
  is displayed only when that source fact is actually published.
- S11 reads sealed actor-local action flags and actual links; retry is exact,
  not a new pack or authority to publish. Terminal Split must be discriminated
  before dereferencing windows/folds.
- Answer to Claude §22: `drawdown_episodes.values` is source-producer sorted by
  ascending signed depth, then start time, retaining the ten deepest episodes.
  Thus index zero is deepest; negative depth is a loss. Compare passes the same
  source-bound list, not a new browser ranking. Empty/absent lists stay absent.

**Still open inside the approved groups:** Claude's shared-preview G-20 immutable
chart amendments and G-21 exact pairs/browser receipts; source facts QuantBT
did not emit/retain (generation clocks/trade execution ledger); genuine VN/
other calendar, instrument, warmup and executable-profile qualification.
No shared :8095 mutation is authorized by this owned-cell receipt.
Prior P23 single-clean-candidate/load/engine-2/DR and P24/release gates remain
separate; functional scoped proof does not waive them. Rolling stays excluded.

Cleanup: **0 active jobs / 0 active test sessions** before teardown; owner
anchor ACTIVE, **21 users DISABLED**. Exact owned cell stopped without `-v`;
volumes, source seals, backups, private receipts and rollback images retained.
No pruning, remote push, dev/main/shared-preview or production action.
