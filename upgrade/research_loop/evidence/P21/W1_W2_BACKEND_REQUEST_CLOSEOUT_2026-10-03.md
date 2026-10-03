# Claude W1/W2 backend request closeout before P23

Date: 2026-10-03 (Asia/Saigon). Baseline `b2098a81`, implementation in
`codex/be-gaps`, landing target `docs/research-loop-plan`. No remote push,
dev/main, frontend code/layout, production, new QuantBT run, Report seal,
RC seal/publish or shared :8095 change. This packet is scoped backend proof,
not a P23/P24 or full-product verdict.

## Read and scope

Read root/Portal rules, Research A13, backend architecture, Unified
continuation and queue §30/§32; Claude `FRONTEND_FIX_PLAN_W1_W5_2026-10-02.md`
§9 and final `SPEC_W1.md` §8; P09/P12/P13/P14/P15/P16/P18/P21 packets and
consumer handoffs. Earlier G-20/G-22 closures, G-23 withdrawal and six-group
proof remain accepted. The duplicate historical queue §30 stays untouched.

Three agents owned Library, Journey and RC independently. Root owned
current-source presentation, Hub failure mapping, shared generator/snapshot,
actual reads, docs and grouped commit hook. An independent read-only review
caught evaluation-ID/native-Optuna-ID conflation before final qualification;
the distinct-identity regression now binds the exact retained row.

## Delivered source and contract

| Item | Exact change | Negative/legacy boundary |
| --- | --- | --- |
| G-25 | Migration 091 adds the canonical same-workspace/PRIMARY/profile-family label to the safe indexed Library search document, backfills once and preserves the 4096-byte UTF-8 limit, GIN search, counts and keyset paging. | Children/unknown/legacy do not acquire invented labels; no tenant leak, raw params, GET writer or full refresh. Migration 093 protects delayed/concurrent producer insertions on the write side; see its focused receipt below. |
| G-26 | Immutable Journey v5, revision 5, hash `7e408074d63ee35cf3074de84a70d98d5481472df31d38c8a6c3ab91da01c9be`, registered by additive migration 092. Removes visible "shipped" copy and points four older redirect cards at accepted canonical route keys. | v3/v4 files, hashes, IDs, 28 cards, availability, scope, maturity, inspection/auth and Execution boundaries remain unchanged. Historical registry rows retained; reader rollback is flag/release, never deleting history. |
| W2-RC-01 | RC uses the shared canonical `currentSourceReadRevision` and verified enrichment/analytics/distribution companions from the same scoped repeatable-read snapshot. | No Report writer/seal overwrite. Wrong-run/hash/revision/timestamp/unsealed facts remain refused. A truly stale immutable Report stays MISSING; code does not relabel it fresh. |
| W1 B-1/B-3 | Additive compose `run_status`, `report_sealed`, and already-sealed-aware gate copy. | Status comes from producer/worker head/terminal checkpoint, not Report presence. `report_sealed=true` is custody, not a metrics revision pass or release approval. Original frozen RC bytes and P04 golden stay intact. |
| W1 B-2 | `EvidenceHub.lifecycle.failed_at` uses Progress's exact shared persisted-snapshot rule, under FAILED lifecycle and matching run identity only. | Null if no stopped-stage fact, foreign snapshot, or non-failed run. No stage-failure inference from a RUNNING label, engine wall-clock or certification claim. |
| W1 B-4/B-5 | Search/Freeze selection and causal Split fold selection expose server-owned `selected_trial_ordinal`, `selected_trial_ordinal_scope`, `selected_trial_ordinal_reason_code`; RC selected-params rail uses the same helper. | Global numeric source ID + 1 only for admitted global profiles. Causal ordinal is original local Optuna number + 1 with STUDY_LOCAL and an exact retained row/study mapping, not parsed qualified evaluation ID. Fixed/unknown/opaque/missing facts stay nullable with reason. |

The public `DisplayCausalSelection` is additive. Private importer payload,
retained summary, batch/seal hashes and engine selection are unchanged;
display fields are not identity/hash inputs. Split/Search/Freeze read
presentation revision changes invalidate their validators without changing
Evidence/Report source revisions. Hub's semantic weak ETag covers failed_at.
All generators are idempotent, official generated types and snapshot updated.

## Tests and real named reads

- Full disposable P12: **17/17**; Library/display unit tests: 47/47.
  Two existing P12 test fixtures were corrected to strict current preflight
  topology and an exact sealed-FOLD OOS oracle (11 eligible of 25 captured
  rows), not relaxed production filtering or a hardcoded expected number.
- Journey Control: 17/17; Foundation contracts: 16/16.
- Root selected-trial/current-source/causal/Hub focus: 74/74.
- RC focused: 52/52; RC contract: 4/4; presentation contracts: 3/3.
- Control build, schema generation, snapshot (268 files) and diff checks pass.
  One normal grouped commit hook gates landing; no bypass, per-agent hook or
  unrelated frontend rebuild. Its actual output is retained privately in the
  owned runtime home. A failed hook prevents this slice from landing.

The first grouped hook caught test-only integration defects: two new RC
fixture helpers did not honor the disposable Docker `PORTAL_CONTRACTS_DIR`,
and older lifecycle exact-object assertions needed the new nullable
`failed_at`. Those tests now use the existing environment override and assert
null for absent snapshots. The W7 PostgreSQL fixture now pairs its worker
attempt with lease_epoch 1 under the existing producer fencing check.
An unrelated Execution history test's supposed
hot row at 2026-09-03 had aged past its real 30-day window on 2026-10-03;
only that fixture is now one day old relative to the test clock. Cold-history,
lineage, dedup and hot-window assertions are unchanged. No runtime source,
retention, authority or frontend is weakened to make these tests pass. Keep
the first hook log and use distinct retry logs; no API/engine rerun is
needed for test/doc-only corrections. The next hook reached 1779 passing
Control tests with one remaining assertion: W7's exact retention pins still
expected the former Search/Split read revision. Only those two expected
read refs now include `W1_SELECTED_TRIAL_ORDINAL_V1`; immutable seal, import,
Report and source-digest assertions stay unchanged. A focused disposable
PostgreSQL run reports **1/1 PASS**, verifying the complete compose/seal/pin
flow in 683 ms (Vitest duration 10.16 s). The wrapper's numeric exit capture
was lost by orchestration after the test completed; it is not asserted here.
Its exact disposable containers/network are absent. The normal grouped
hook's actual exit remains the landing gate; earlier failures and cleanup
records remain preserved.

Actual isolated proof `w1-w2-read-20261003-attempt1.json` is private/0600
under the established owned runtime home. **15/15 named GETs passed** on
Control image `sha256:151af9c50c464a41aef20db6ad393d45ebb5cb91e628af9e7780e8f75f8258b1`.
Receipt object hash: `de6c4655bb12685991bb2176e02785342c8b98dae821aee090aaab1929a942ad`.
This actual proof uses existing accepted global/causal retained runs, not
Claude's newly created shared-preview runs or a stub:

- global `rrun_49142d25954abd176d3c2bd0f44b51e2`, label R-WFO-204;
- causal `rrun_becde1e160a2770d49246f7f665208ce`, label R-WFO-205;
- failed `rrun_26c7490c49549f89e1b665a9b83b7037`.

Journey returns v5/hash; Search/Freeze ordinal agree; causal Split is
STUDY_LOCAL; both RC responses have source-backed COMPLETED/report-sealed
and non-MISSING METRICS_SEMANTICS; exact-label Library search finds the same
run IDs; failed Hub matches Progress. Digests of all workspace immutable
Report/RC/retained rows before and after are identical; the one fresh QA
login was logged out. No engine execution or seal retry was needed.

### Final consistency and API proof

Migration 093 was applied additively after 091/092 in the owned cell. Its
BEFORE INSERT transaction lock is scoped to workspace/profile family,
before any search-document row lock. Its VOLATILE AFTER step refreshes only
affected newer PRIMARY documents, with a hard 256-document bound; the 257th
causes atomic SQLSTATE 23514, preserving all source/projection rows. No GET
writes, global refresh, business rewrite or cross-family lock is introduced.

The full disposable P12 test took 34.24 seconds, **17/17 PASS**, including
historical/tied timestamps, actual advisory-lock wait with reverse commit
order, unrelated VN/foreign document byte custody and exact 256/257 bound.
The named tmpfs container `research-p12-postgres-g25-consistency-20261003`
was removed; it created no volume.

Final immutable `w1-w2-read-20261003-final.json`, **08:50:19–08:50:22
Asia/Saigon**, records **16 expected JSON GET outcomes** (15 successful,
one foreign-workspace 404) plus a conditional Journey **304 with empty body**.
It repeats only named reads on the final compiled candidate, not engine work.
Control image: `sha256:0cd42405a9312cd9dc362f186ca72ae1457e6ad2efe0df794c261cc4892da259`.
Receipt object hash: `fb94d73673cc844ee7f77c5ddb65fab39a5b7a6803c295c17c37a1d404e1198a`.
Workspace Report/RC/retained custody digest before and after:
`885fe32cc292297d424edf228136f5a02e41076664ac5196faf96b4f48268222`.
QA session was logged out. The earlier attempt is preserved, not overwritten.

**SCOPED_BACKEND_REQUESTS_ACCEPTED** for G-25/G-26, W2-RC-01 and W1
B-1…B-5. These are backend/API outcomes, not frontend/browser acceptance or
P23/P24 completion. The owned runs above prove the same profile classes;
they are not Claude's separate shared-preview R-WFO-024/026/027 identities.

## Claude consumer handoff

Use the generated `research-foundation.d.ts`, `research-evidence.d.ts`,
`research-current-source.d.ts`, `research-release-candidate.d.ts`; no local
DTO or string parsing. G-25 sends existing `q=R-…` and navigates by run_id,
not the display label. Journey v5 is the new canonical fixture; older ones
are historical compatibility fixtures, not to be re-recorded.

S04 can render `lifecycle.failed_at.stage/fold/basis` directly. S11 can use
compose.run_status/report_sealed without a second Library lookup and retain
typed MISSING if Report is genuinely stale. S05/S06/S07 consume nullable
selection ordinals from the same read, respect RUN_GLOBAL vs STUDY_LOCAL,
and keep qualified evaluation IDs distinct from original Optuna IDs. S11
uses the server rail text. Do not add 1 in the browser, invent a trial for
fixed/no-selection, or turn custody/sealed into promotion permission.

Backend fields are available for consumer binding. Browser/HiFi acceptance
is still Claude-owned; this slice edits no frontend and does not claim it.
Next is the existing genuine P23 queue, then P24 only after its gates.

## C4

Owned :8096 containers and network were stopped/removed with `cell.mjs down`,
**without `-v`**. Before teardown: 0 nonterminal Research jobs, 0 ACTIVE QA
sessions, 21 test identities DISABLED, one retained owner anchor. Afterward:
0 owned-cell and 0 named disposable P12 containers. DB/HMD/artifacts/manifests,
private evidence, identities, backups and rollback images remain retained.
No new worker or QuantBT run was started; both owned VN opt-ins remain false.
Root available space: 204,255,592,448 bytes, 70% used.
**NO_ACTION_NEEDED** beyond completed exact teardown. No broad prune,
source/volume deletion or shared/production runtime change.

## Landing reconciliation

The normal hook completed with **1780 Control tests PASS / 1 existing skip**,
**251 contracts PASS**, PostgreSQL restore drill and monorepo verification
PASS. Its exit is 0; private log:
`w1w2-grouped-commit-hook-complete-20261003.log` in the owned runtime home.
While it ran, Claude landed W4 `e92f74ca` on the common branch. Rebase keeps
that commit and every frontend/evidence byte; the only conflict was the
same clock-aged Execution test fixture. Keep Claude's complete relative-date
fixture, including the recent foreign-account row, and both frontend queue
journals. No backend runtime/generated contract changed during reconciliation;
reuse the completed backend/API proofs, not another engine/build/full gate.
