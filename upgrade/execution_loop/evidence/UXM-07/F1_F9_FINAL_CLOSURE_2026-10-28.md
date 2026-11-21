# F1–F9 — final closure table with verified evidence (28 Oct 2026)

Frozen candidate `9054bd410` (hook-verified) on canonical `1a6c2012d`; lane `claude/step-b-integrate`. Supersedes `BE-CLAUDE-2026-10-20/F1_F9_CLOSURE_2026-10-21.md` as the single table; the 21 Oct commits below were re-verified on 28 Oct with `git merge-base --is-ancestor <sha> docs/research-loop-plan` (all in canonical).

| # | Item | State | Evidence (verified) | What is not Claude's to close |
|---|---|---|---|---|
| F1 | B1 FE-042 many-to-many incident links, FE-043 `status_counts` in one snapshot | **DELIVERED, landed** | BE `afc5864e` (+ index `cb8ca689`), FE `a8d29672`, all in canonical; incident children read consumed (`/operations/incidents/{id}/children`, world `incidentChildrenBody`), reader guard reads it on every served incident; handoff `UXM-07/b1-handoff.md` | the backend part was written by Claude under the delegated scope (2026-09-02, 2026-10-18 split) and reviewed by Codex at landing; Codex ACCEPT of BE-P20/P21/P22 is in `F1_F9_CLOSURE_2026-10-21.md` |
| F2 | B2 FE-040 one line in the Dockerfile | **DELIVERED, landed** | `c2ac97da` (in canonical): `ARG EXECUTION_V2_SCREENS=` (default empty keeps every screen on V1) → `VITE_EXECUTION_V2_SCREENS` in `deploy/images/portal-web.Dockerfile`, `compose.yaml`; the preview was rebuilt with it six times this campaign (bundle `index-Db43NrL1.js` last) | — |
| F3 | S1e Access, the published data | **DELIVERED, landed** | `7e2ca4ff` (in canonical), registry rev 8 `PROFILE_ACCESS_SELF` + N29 re-pin `6d87825b`; consumer receipts `consumer-receipt-self-access`, `-self-navigation`; reader guard W118/W122 reads the access reads on every run | unpublished access data waits on BE-P5/Edge |
| F4 | R2 milestone S0+S1: full hook, image baselines, DEBT-001/003, landing after C1 | **hook, baselines, DEBTs DONE; landing is Codex's** | full hook PASSED on `9054bd410` (3 earlier attempts failed on test-infrastructure causes, repaired at the root); 65/65 V2 baselines, two consecutive compares green; DEBT-001/003 closed (`a067682e`, `d4bab3b2`); N29 → EDS-12 re-pinned; the earlier R2 hook/landing at `d58361ea`/`218b94280` is in canonical | ff-only landing of this tip: Codex (final gate, R2, visual) as it stated; LC-FE-03 official legacy/Research visual compare: Codex |
| F5 | Fixture L1–L3 (state matrix, scale, negative) and reader conformance | **DELIVERED** | catalogue L0–L3 `7f493c42`, `conformance-matrix-2026-10-19.md`; now also `src/fixtureBff/readerConformance.test.ts`: every screen's own closed reader over every served body (2,251 reads, 23 groups, 173-link crawl) and 104 cross-page world ties; both run in the full vitest (771 files, 87,661 tests, 0 failed) | real-source qualification (Edge/Core) |
| F6, F7 | Remaining screens on the sparse fixture: Overview, Portfolios, Alpha 360, Account, Compare, Blotter, Admin, Users, Trade replay | **DELIVERED on the positive fixture; browser-reviewed 10 rounds** | independent browser reviews QA1–QA10 (53 routes × 1440/1024/660): BLOCKER 24 → 16 → 8 → 1 → 3 → 1 from QA5 to QA10; fixes after QA10 were checked by ties and the reader guard, not by a reviewer; browser journey on the frozen tip: 10 screens, 0 overflow, 0 bad API, 0 console errors, 121 ties 0 mismatches (`F8_CODEX_CONTRACT_REVIEW_RECEIPT_2026-10-28.md` §5); remaining MAJOR/MINOR are owned debts in `FROZEN_CANDIDATE_HANDBACK_2_2026-10-28.md` §3 | contract- and design-dependent items (listed there) |
| F8 | Review of the contracts Codex delivered | **DELIVERED with receipt** | `F8_CODEX_CONTRACT_REVIEW_RECEIPT_2026-10-28.md`: six packages, blotter scope, FE-069 (own receipt), research-stage fix, test-cell repairs, discovery V2 and STATUS/custody read; six requests back to Codex | Codex ACCEPT of the requests |
| F9 | UXM-08/09/10 after C3–C7 | **not started, as instructed** (fixture-only slices were done on 21 Oct with Bobby's permission: UXM-08 `91eaf71a`, `bd753eba`, UXM-09 `7f493c42`, UXM-10 `2c0dcdbb`) | — | waits for connected C3–C7 |

## Decisions (Bobby, 29 Oct 2026)

1. **Users and Admin Actions rail entries: owner only.** The current gating stays; Claude records it in the rules and tests it (no change to the product).
2. **One shared number formatter for returns/prices (R2-21): after Codex lands this tip**, as its own serial slice with a receipt, so the wording of many screens does not change on the tree waiting for the final gate. Until then the score-rounding difference (28.07 vs 28.08) stays a listed debt.

## Resolved from the approved spec: the P/R/B names

`upgrade/execution_loop/SCORE_REGIME_SPECIFICATION_v1.1_FINAL_VI.md` (approved by the system owner; row at line 83) defines the component points: **P = Performance** (net excess TWR + Sharpe), **R = Risk** (MDD + ADD), **B = Robustness** (consistency + cost stress); "`P` is not the PortfolioScore, `B` is not confidence". The score cell prints "component P/R/B" until the screens use these names. This is not an open decision for Bobby: Claude applies the names in the same serial slice as the shared number formatter, after Codex lands this tip (so the frozen tree and its baselines stay unchanged).

## Still open for Bobby

Nothing from the F1–F9 list. Landing (Codex), connected READ/STREAM, financial and STATUS acceptance (Codex/Edge) are not Bobby's decisions.
