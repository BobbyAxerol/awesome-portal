# Native S06 / S07 / S09 — Claude consumer receipt (§55)

2026-10-09 · frontend only; no engine rerun, migration, manual SQL or remote push. Backend: Codex `748e241b` / `d093b503` (already on the shared preview). Consumer commit: see the Unified addendum.

## What was wired (existing generated operations, no new route)

| Screen | Field | Component |
|---|---|---|
| S06 Search | `SearchDetail.native_search` | `NativeSearchPanel` (+ `NativeOptimizationSummary`), `useNativeSearchPages` — selection (engine trial number and display ordinal are two facts), retained plateau metadata, the full trial ledger with paging, typed absences for plateau members and the sampler trace; the scalar stages are not drawn beside it |
| S07 Freeze | `FreezeDetail.native_freeze`, `FreezeVerification.native_freeze` | `NativeFreezePanel` — selected parameters and digest, sealed artifact and source parts, preparation proof labelled historic (`current_bytes_rechecked=false`), the byte receipt, the explicit **Verify bytes** action, a typed refusal when it cannot run, scalar certificate `NOT_APPLICABLE`, chronology `NOT_PUBLISHED` |
| S09 Report | `frozen_core.native_report` | `NativeReportBlock` in the sheet's own `rr-block` grammar — kind, execution facts (fees/funding labelled full child tape), optimization, frozen selection, population (links to S06), IS / OOS / Holdout analyses with the shared metric labels and units |

Protocol decisions: a native run is one study with no fold and the server answers **400 to any `fold`** on Search and Freeze (verified: `fold=0` and `fold=1`), so `useRunNative` reads the run's own Progress (`native_execution`) first and the screens wait for it instead of sending a request the server refuses; a Progress read that fails answers "scalar", leaving every scalar run exactly as before. The ledger pages on `native_cursor` with the same `native_limit` (200). `useFreeze`'s state no longer counts the empty scalar checks of a native run (it drew "No rows in this scope").

## Real API / browser evidence (shared preview, run `rrun_ee50cb82…`, 1280 and 660 px)

- Search: 100 trial rows, θ* = trial 41 / ordinal 42 of 100, selection metadata exact, plateau members and sampler trace typed `not published`; 0 console messages, 0 responses ≥ 400, no horizontal overflow (the trial table scrolls inside its own region at 660; numbers never break inside a value).
- Freeze: frozen selection, 1 source part (100 rows, 17,267 bytes), preparation proof "no — historic proof, not a fresh check"; **Verify bytes** (a real POST, once): a new receipt `rabv_2e950219…` at 13:19Z, 6 parts · 3 documents, bytes `MATCH`, verification result `PARTIAL_MATCH` (the response's own word; the retained-digest-binding qualifier stays).
- Report: the block (execution, optimization, frozen selection, population, windows) is inside the sheet; IS 1,512 / OOS 432 observations, Holdout `NOT_PUBLISHED / FIXED_NATIVE_PROFILE_DID_NOT_EXECUTE_HOLDOUT`.
- Exports: JSON 62,301 bytes (`frozen_core.native_report.kind = NATIVE_OPTIMIZED`) and CSV 12,920 bytes (contains trial 41, the parameters and the Holdout row); the SHA-256 of each downloaded body **equals the job's published `sha256`** (`f26bb3a0…`, `529bb9d7…`); jobs are the existing durable ones (a repeat click returns the same job).
- Fixed native Reports (Limit/OCO `rrun_7c6aff8d…`, Bracket v4 `rrun_c2329924…`, Reactive v3 `rrun_fbf968c1…`): `NATIVE_FIXED`, no optimization / freeze / population blocks (said as "no optimizer ran", never zero), windows and Holdout absence as served; 0 console messages at both widths.

## Defects found by running it for real (fixed in this slice)

1. Freeze showed "No rows in this scope" for a native run (state derived from the scalar integrity checks).
2. A refused **Verify** (HTTP 403 from my harness's missing `Origin`) was silent in the native panel; it now says the server refused and claims nothing about the bytes.
3. The painter used two raw hex literals (the boundary test `uses palette tokens rather than raw hex` caught it).
4. Native trial table repeated the objective in a `sharpe` column and wrapped numbers mid-value at 660 px.

## Not verified / open (named, not claimed)

- Paging: **exercised in the browser at 1280 and 660 px** with the server's own cursors by rewriting the UI's `native_limit` to 40 (the cursor binds the limit, so every request carried 40): 40 → 80 → 100 rows, 100 unique trials, caption `100 of 100 loaded`, the θ* row loaded on the last page (a hint says where it is until then), the "more" control gone at the end, no `fold` on any request, 0 console messages. Not exercised: a real run with more than 200 trials (the preview has only this 100-trial native run) — the 200-row page itself is the contract's bound.
- Neighbour trial identities and the sampler trace were not retained by the native source (typed absences); a native S06 "cinema" is not drawn.
- ~~The scalar claim strip at the top of S06 repeated the same absence for ten fields~~ — **done** (owner asked, same day): for a native search the strip (mode, schedule, validation, chronology, OOS use, scoring, selector, profile, strict outer OOS, "what this mode reads") is one line, `CLAIM · No Walk-forward claim fields apply to a native search. · n/a here · readiness partial`, the server's one reason in its tooltip (`NativeClaimNote`). A scalar run keeps its strip untouched. Real API at 1280 / 660: native → 1 note, 0 claim rows, the reason code printed 0 times; WFO `rrun_cf5ed033…` → 0 notes, 1 claim row; 0 console messages. Tests in `searchDetail.test.tsx` (native and scalar). The matrix S06 cells run on non-native runs and are unaffected; the matrix was not re-run for this change.
- Matrix: 73 cells · 682 checks = 613 PASS / 0 FAIL / 69 NA on the bundle with these consumers (see the matrix note); the served image was built from the uncommitted tree of the same source (stamped dirty). P24 and release are not claimed here.
