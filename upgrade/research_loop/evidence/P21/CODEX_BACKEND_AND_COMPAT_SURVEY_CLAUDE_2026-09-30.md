# Codex backend status + FE/BE compatibility survey — 2026-09-30

Claude · read-only survey · nothing staged, built or tested. Every conflict count below comes from
`git merge-tree` / `git merge-file -p` dry runs against the merge base `d3d99f26`. No ref or worktree was changed.

## 0. Baselines

| Line | Ref | Note |
|---|---|---|
| origin `docs/research-loop-plan` | `d3d99f26` | merge base of every line below |
| Codex shared checkout `/home/bobby/portal-research` | **`2bfeb53e`** (not `57f9e02e`) | **123 commits ahead of origin, unpushed**. The staged work described in the brief is now committed: `fd282b24` (T07/T13 gap doc + Unified + P23 README) and `2bfeb53e` (P04 release-pin fix). The working tree is clean. |
| Codex `codex/research-ol-p22-p24` | `73af8d21` | ancestor of `2bfeb53e`, so it is fully contained in the shared checkout. Nothing extra to merge. |
| Claude `portal-research-w1-build` | `d7db1cb3` (+ uncommitted `AlphaImport.tsx`, gaps-status edit, G6 doc) | S14 `49256a2a`, G10 `6a4cb383`, G5 `d7db1cb3` |
| Claude agents | G3 ab5c…, G1 afd8…, G4/G7 a12f…, G8 a935…, G14 aece…; G2 `ed33db0d` | all based on `d3d99f26` |

Codex's 123 commits include **~9 frontend commits authored "Vuong"** (FG slices 1–2, 2026-09-28) and Codex's own FE bindings (`08fa8ee0`, `8ad39e83`, `3527bb3f`, `decb5f6c`). **44 frontend files changed on Codex's line**, including screens that Claude owns.

## 1. Codex backend since 2026-09-26: status

| Item | Status | Evidence / commit |
|---|---|---|
| P22 publication bridge (OL-03…OL-11, OL-13) | **BACKEND_REAL_PREVIEW_COMPLETE · PRODUCT_BROWSER_PENDING** | `5160083c`, `7acfeb3e`, `edae64bc`, `98e7857c`, `5f67805c`; mig 070–073; `P22/README.md`, `real-preview-receipt.json` |
| OL-01 imported/DRAFT exact-profile execution (E17) | ISOLATED BACKEND + CONSUMER ACCEPTED; Production rollout = Bobby/ops | `5a5c7949`, mig 074; `P10/E17_…RECEIPT_2026-09-27.md` |
| OL-02 P16 `source_artifact_bytes` verify | CLOSED on the owned runtime | `P23/RECOVERY_INTEGRITY_RUNTIME_CHECKPOINT_2026-09-27.md` |
| E11/E14 retained analytics (`summary_analytics`) | CLOSED backend; FE bound in EvidenceFlow | `202778b6`, `0ab62994`; `P13/E11_*` |
| E13 exact-input reproduction lineage | CLOSED backend (`REPRODUCTION_OF`) | `1ac1c628`; `P19/E13_*` |
| E15 progress input artifacts | CLOSED | `02041a02`; `P11/E15_*` |
| E16 bounded P04 `market_overview` + E16-R2 `engine_pin` | Backend CLOSED, feature dark | `3527bb3f`; `P17/E16_BOUNDED_P04_MARKET_OVERVIEW_CLOSEOUT_2026-09-27.md` |
| E12 journey descriptor v3 | CLOSED. **Deletes journey v2 descriptor + fixture** | `8d5dd579` |
| E6-BR-01 S14 signature/SBOM | Semantics closed: `import_attestation` with typed `NOT_PUBLISHED`. No signing infrastructure. | Unified §13 L4011 |
| CG-FG-D1-O1 `display_label` (S09/S11/S13) | **DELIVERED, backend + FE binding** | `08fa8ee0` (BE, 29/9), `8ad39e83` (FE); `FG/D1_O1_CLIENT_BINDING_2026-09-29.md` |
| OL-12 / P23 qualification | **IN_PROGRESS, in active work now.** Scoped PASS: T02, T03, T05 (Research scope), T08, T09, T11, T12 (eligible WFO), T15, W05, W06, W07, V11 subsets, F3 WFO 12/12, F5 S02/S14 write, auth-gate. OPEN: canonical F3 54/54, full F5 (typed 502, identity revocation), T07/T13, T10 full, legacy export security slice, non-reusable linked-audit child | `P23/README.md` top addenda; last commits `af18707a`, `51323644`, `8d1e7d70` |
| T07/T13 P04 installed-release pin | Source repaired (Codex edited ≤P21 P10 admission with Bobby's approval). Runtime T07/T13 **OPEN**: needs a separately pinned newer engine. | `fd282b24`, `2bfeb53e`; `P23/T07_T13_P04_RELEASE_PIN_GAP_2026-09-30.md` |
| Gateway upstream timeout | Fixed; bounded 504 | `94da8f8c` |
| OL-24 P23 browser-real / research-dev | Scoped real-browser receipts exist; full lane OPEN | `F3_*`, `T15_*` |
| P24 | **PLANNED / unassigned**. Not started; no `evidence/P24/` directory. | Unified §13 L3637 |

### Requests Claude/contributors filed: which Codex answered

| Request | Answered? | Where |
|---|---|---|
| E16-R2 engine pin S07 | **Yes**: `engine_pin`, consumed by DigestChain | Unified F14 |
| E6-BR-01 signature/SBOM | **Partly**: typed absence only | `import_attestation` |
| E5-O1 / E5-O2 (max_dd per candidate, K/pool id) | **No**. Still "Claude sends, engine answers". | Unified F8 |
| CG-FG-D1-O1 | **Yes** | above |
| CG-FG-P22-01, CG-FG-S02…S14 (37), CG-FG-R2-01 | **No**. All OPEN; Codex has left no comment. | `FG/FG-backend-requests.md`, Unified L3698–3712 |
| CG-P22-01…06/A/B/C (`P22/thanhvuong-backend-requests.md`) | Answered in fact (OL-03…13 CLOSED), but that file still says OPEN (ledger lag) | — |
| CG-P21-01…05 (`P21/thanhvuong-backend-requests.md`) | OPEN. P21 is ≤P21, so these are now **Claude-owned**. | — |
| S14-RW-BR-01/02/03 (500 on ACTIVE replay; FAIL on wrong field; 201 vs 200) | **Not seen by Codex**: they exist only on Claude's unpushed line. `registerImportedAlphaVersion` is P10 ≤P21, so **Claude owns them**. | `P10/S14_REAL_WRITE_RECEIPT_CLAUDE_2026-09-30.md` §8 |

## 2a. Merge conflicts (base `d3d99f26`, theirs = Codex `2bfeb53e`)

| Claude side | Files touched by both | Conflict hunks | Nature |
|---|---|---|---|
| w1-build `d7db1cb3` | `NewRun.tsx` | 2 | **G10 S02 field-less refusal duplicates FG-08 (`a1d7bf3f`, Vuong).** Take Codex's version (client copy, path, request id) and keep only G10's residue. |
| w1-build (uncommitted) | `AlphaImport.tsx` | 1 | Comment only (shadow-e1 token `602e8410`) |
| w1-build | mig `068`/`069` | rename, clean | Codex **renamed Claude's 068→075 and 069→076** (`9f627ed6`/`decb5f6c`). The merge takes the rename cleanly. |
| w1-build | journey v2 descriptor/fixture | removed by Codex, clean | Post-merge breakage, see §2c |
| G2 `ed33db0d` | `NewRun.tsx` | 0 | Merges cleanly. The new fixture is not in the explicit snapshot list, so no snapshot conflict. |
| G1 afd8… | `ExecuteCandleReplay.tsx` | 0 | clean |
| **G4/G7 a12f…** | `CompareDetail.tsx` | 5 | **G4 duplicates FG-04a (`b896d98d`, Vuong, "S13 ladder arrows stay between cards").** Two different CSS designs: grid+container query vs flex+clip. Pick one. |
| G4/G7 | `compareDetail.test.tsx` | 1 | same |
| **G3 ab5c…** | 9 control-api src, 7 tests, 7 FE, 3 OpenAPI, 3 `.d.ts`, 11 fixtures, `contracts-snapshot.json` | ~40 hunks (snapshot 4) | **G3 re-implements `08fa8ee0`+`8ad39e83`, which are already on Codex's line.** 7 test files merge "clean" but would add duplicate display_label cases. |
| G8 a935…, G14 aece… | — | 0 | none vs Codex. **G14 vs G3 both edit `TopBar.tsx`** (Claude-internal conflict). |

Migrations: Claude has no files ≥070, and Codex uses 070–077, so **no numbering collision now**. Trap: **075/076 are not idempotent** (`ADD CONSTRAINT`, `CREATE INDEX` without IF NOT EXISTS). A DB that already applied 068/069 (a Claude preview, or dev if 068/069 were ever deployed) will fail on 075/076. Such a DB needs a rename of its `pgmigrations` rows or a no-op. See memory "preview-migration-order". **Next free number: 078.**

Not touched by either side: `UNIFIED_IMPLEMENTATION_PLAN.md` (Codex only, 0 Claude edits), `apps/portal/registry/openapi/portal-api.openapi.json` and `bar02` snapshots (Codex only). N29/EDS-12 pins do not live in this research diff, so they are N/A.

## 2b. Contract drift

**Removed or renamed fields: none.** Every Codex schema change is additive or a union widening.

| Change (Codex) | FE impact on Claude's code |
|---|---|
| `display_label` on Report detail, RC **compose top-level**, RC pack, and Compare `Run` | G3 put the compose label on **`ComposeRun.display_label` (nested)** and reads `answer.run?.display_label`. On Codex's backend that is `undefined`, so the label is silently lost. Drop G3's schema and use Codex's. |
| Report ETag = sha256(canonical response) | G3's ETag = sha256({representation_version, representation}). Same `"p18r1_<64hex>"` shape but different values. Keep Codex's; no FE impact. |
| Union widening: `p17.imported-signal-notional.v1`, `IMPORTED_FIXED_PROFILE`, `IMPORTED_ALPHA_OBSERVED_AFTER_FIXED_PROFILE`, `IMPORTED_FIXED_QUALIFICATION`, `SOURCE_CODE_SHA256`, `P17_IMPORTED_FIXED_EQUITY_SAMPLE_V1` | G4's `SplitDetail.tsx:2020` compares against the literal `P04_OBSERVED_AFTER_FIXED_PROFILE`, so an imported run prints the weaker "was observed". |
| Freeze detail `engine_pin` is now **required** | Typed test fixtures built at `d3d99f26` (e.g. G4 `freezeDetail.test.tsx`) may fail `tsc` after the merge. Check. |
| Replay `market_overview` (≤12 buckets) beside Claude's `candle_overview` (≤48) | Two P04 overview fields; Codex keeps a compatibility alias (`evidence-candle-overview.contract.ts`). FE reads only `candle_overview`. Owner needs to pick one. |

**Published but not read by any frontend (merged tree):** `replay.market_overview`; `alpha-import.import_attestation`; freeze/search `imported_alpha` (`ImportedAlphaReadBinding`); run-create response `reproduction` and the `REPRODUCTION_OF` relation (FE sends only SIBLING_OF/CLONE_OF); portal-api `imported_entrypoint`/`imported_parameters`/`imported_source_digest`. Already read on Codex's line (so Claude gets them by merging, not by rebuilding): `summary_analytics` + behaviour + `in_sample_equity` (EvidenceFlow), `engine_pin` (DigestChain), alpha-version publication + assignee_pool/decision_outcomes/rc_superseded (S01/S02/S11), `display_label`.

## 2c. What Codex's P23 lane expects vs the frontend

| Finding | Detail |
|---|---|
| `stubs.ts` lacks `candle_overview` (the G7 note) | **Already fixed on Codex's line** (`0607e7a7`, Vuong). Stale only at `d3d99f26`. |
| **Deleted journey-v2 fixture is still referenced** | Codex HEAD `e2e/fixtures.ts:262`, `_probe-research-rf01.spec.ts:234` and `_probe-research-product.spec.ts:48` all read `research-foundation.journey-v2.valid.json`, which `8d5dd579` deleted. This is the cause of OL-24 "14 passed / 64 failed ENOENT". It breaks every fixture-lane e2e and the visual suite after the merge, including G4/G7's edited `_probe-research-product.spec.ts`. Claude owns the fix (FE e2e). |
| P23 runner reads journey v3 and covers the seven states | Codex-side; the FE `foundationRoutes.tsx` must read v3. Codex already changed it; Claude's line still reads v2, and the merge takes v3. |

## 3. Recommended integration order

1. **Nobody force-pushes. Codex pushes first**: `2bfeb53e` fast-forwards origin, since origin is its ancestor. Ask Codex to push once the current P23 step settles, rather than merging Codex's line locally, because Codex owns the ledger edits in Unified §13 and the P22/P23 READMEs.
2. Claude merges `origin` (after Codex's push) into `w1-build`. Resolve `NewRun.tsx` → Codex FG-08 + G10 residue, and the `AlphaImport.tsx` comment. **Do not touch** Unified, P22/P23 READMEs or Codex evidence. Add Claude notes as new files or append-only.
3. Same commit or next: fix the journey-v2 → v3 references in `e2e/fixtures.ts` and the two probes, then re-run the fixture lane and the visual suite (pinned image).
4. **G3: do not merge as-is.** Rebase onto Codex: keep only the delta (S05–S08 `useRunLabelRead`, TopBar crumb G13, `researchRunCrumb`, export-jobs fixture) and drop G3's backend/OpenAPI/`.d.ts`/fixture/snapshot edits. Switch compose to top-level `display_label`. Sequence G3 ↔ G14 on `TopBar.tsx`.
5. **G4:** choose between G4's grid design and FG-04a's flex design (Bobby/visual). G7's probe/axe parts are independent and can go in.
6. G2, G1, G8, G14: clean against Codex. Merge after step 2. Regenerate nothing by hand; run `contracts-test.sh` for G2's contract test.
7. Any preview DB that ran 068/069: repair `pgmigrations` (rename to 075/076) before deploying the merged tree.
8. Claude then answers its own ≤P21 backend debt: S14-RW-BR-01..03, CG-P21-01..05, and the imported-alpha wording in SplitDetail. Ledger rows go to Claude's own evidence files; Codex updates Unified.
