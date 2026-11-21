# Research Loop work: where it lives (read-only inventory, 2026-09-30)

All checkouts share one object DB (`/home/bobby/portal/.git`, 41 worktrees). `/home/bobby/portal-stable-v1.0.1` (runtime secrets dir, root-owned; not read) and `/home/bobby/portal-wip` are **not** git repos. `portal-wip` holds `e16r1-p04-candle-overview-2026-09-27.patch`; it reverse-applies cleanly on d7db1cb3, so it is ALREADY-IN.

**The main lines moved during the audit:**
- **C (Codex)** `docs/research-loop-plan` is now **c2ec1443**. That is 2bfeb53e plus 3 P23 F5 commits: a9e8e826, 38f3ab5e, c2ec1443. It is 126 ahead of origin (d3d99f26), and d3d99f26 is an ancestor of C.
- **W (Claude)** is d7db1cb3, which is d3d99f26 plus 49256a2a (S14), 6a4cb383 (G10) and d7db1cb3 (G5). Their merge-base is d3d99f26.
- W's 3 commits against C: 49256a2a and d7db1cb3 apply cleanly. 6a4cb383 fails a strict apply on `NewRun.tsx` because Vuong's a1d7bf3f "S02 refusals print client copy" (09-28) is in C.

**KEY FINDING: every G-worktree today was cut from d3d99f26, so none of them sees C's work from 09-27 to 09-30. Some of that work already covers the same features:**
- **G3 (D1-O1 run label on deep links)** is covered by Codex **08fa8ee0** "publish canonical deep-link run labels", **8ad39e83** "bind deep-link run labels from named reads" and **74abadd4** (cold real-API receipt), dated 09-29. They add `display_label` to the same report, RC and compare reads and the same client files. G3 is a separate implementation: 60–90% of its added lines are not in C.
- **G4 (S13 ladder arrows)** is covered by **b896d98d** (Vuong/Claude, 09-28), "S13 ladder arrows stay between cards" (FG-04a). The G7 half (probe harness, axe fixes) is new.
- G5 (d7db1cb3) may partly overlap **e4b9447e** (S09 Letter/A4 print fixture probe). G10 (6a4cb383) overlaps a1d7bf3f on S02 refusal copy. Check both during the merge.

## Table

| location | kind | head | unique commits vs C∪W | patch already upstream? | uncommitted research files | rec |
|---|---|---|---|---|---|---|
| /home/bobby/portal-research | worktree (C) | c2ec1443 docs/research-loop-plan | — (main line) | — | 0 | TARGET |
| /home/bobby/portal-research-w1-build | worktree (W), detached | d7db1cb3 | 3 vs C: 49256a2a S14, 6a4cb383 G10, d7db1cb3 G5 | no (not in C) | 7 (none in C or W): TopBar.tsx, shell.css, new topBarRunCrumbCollapse.test.tsx (G14 option A), AlphaImport.tsx, FRONTEND_GAPS_STATUS…md, new P21/CODEX_BACKEND_AND_COMPAT_SURVEY…md, new P21/G6_VISUAL_DIFF_DIAGNOSIS…md | **MERGE** (commit dirty first; strict apply on C conflicts on AlphaImport.tsx and FRONTEND_GAPS_STATUS) |
| agent-afd8dfc9e6b74d586 **TODAY** G1/D7 | worktree, feat/g1-d7-play-across-folds | d3d99f26 | 0 | play-across-folds not in C | 6: ExecuteCandleReplay.tsx, replayTransport.ts, w5bFoldScale.fixture.ts, new usePlayAcrossFolds.ts, new executePlayAcrossFolds.test.tsx, P17/G1…md | **CHERRY-PICK** (commit it; applies cleanly on C and on W) |
| agent-aa93eebaab7e9637b **TODAY** G2/D4 | worktree, feat/research-g2-d4-s02-prefill | ed33db0d | 1: ed33db0d S02 coverage prefill | no (C has no prefill) | 0 | **CHERRY-PICK** (clean on W; conflicts with C's NewRun.tsx from a1d7bf3f/f0f7cc3d; also touches the same file as G10) |
| agent-ab5c79763ddadbbd8 **TODAY** G3/D1-O1 | worktree, g3-d1o1-cold-deeplink-label | d3d99f26 | 0 | **FEATURE ALREADY IN C** as 08fa8ee0 + 8ad39e83 + 74abadd4, but written differently | 56 (BE compare, report and RC contract/repo/service with tests, contracts openapi/d.ts/fixtures, FE clients, runLabels, TopBar, researchRunCrumb, new useRunLabelRead.ts, P19/G3…md); 33 files fail a strict apply on C | **ASK → likely DISCARD-superseded**. At most salvage the S05–S08 "Stages 1-4" label follow-up, if C does not cover it |
| agent-a12f335d67f8f4878 **TODAY** G4/G7 | worktree, feat/rl-g4-g7-ladder-probe | d3d99f26 | 0 | G4 ladder is covered by b896d98d; G7 is not in C | 13: CompareDetail.tsx and compareDetail.test.tsx (G4, conflicts with C); FreezeDetail h3→h2, SplitDetail contrast/tabIndex with tests (G7); _probe-research-product/rf04-a11y specs, playwright.research-probe.config.ts, new _probe-research-g4-ladder.spec.ts, new axeReceipt.ts, P20/G4_G7 md + axe json | **CHERRY-PICK the G7 part only**; drop the G4 CompareDetail hunks (superseded by b896d98d) |
| agent-a935bf724edb4488c **TODAY** G8 (locked) | worktree, feat/g8-s06-fold-glyph-strip | d3d99f26 | 0 | not in C | 6, **staged**: SearchDetail.tsx, SearchRoute.tsx, new SearchFoldStrip.tsx, g8RealP04.fixture.json, searchFoldStrip.g8.test.tsx, P15/G8…md | **CHERRY-PICK** (applies cleanly on C and W; the worktree is locked) |
| agent-aece84b9d5b8d943d **TODAY** G14 | worktree, detached | d3d99f26 | 0 | — | 4: TopBar.tsx, shell.css, TopBar.test.tsx, P21/G14…md | **DISCARD-superseded** (replaced by option A in w1-build) |
| agent-a35c8ff11c5171994 **TODAY** G5 | worktree, claude/g5-s09-real-data-verification | e6406f21 | 1: e6406f21 | **yes**: reverse-applies on W (= d7db1cb3) | 0 | ALREADY-IN (W) |
| agent-a2a98c19593fd9111 | worktree + branch feat/e10-o3-convergence-reach | 1960e54b | 2: 473ac849 E10-O3, 1960e54b doc | **yes**: via merge 46e138c3; migration renumbered 069→076; doc byte-identical | 0 | ALREADY-IN |
| agent-a39c534ecc6dd85d0 | worktree + branch feat/research-loop-e14-s05-s09 | 3fa4c801 | 1: 3fa4c801 E14 backend | **yes**: every file is equal to or a subset of d3d99f26 (via 00206d48) | 7 dirty, all added lines present in W | ALREADY-IN |
| agent-a3c4f7920fd322ea5 | worktree feat/research-d1-e13-run-label-lineage | 1dec9d33 | 0 | — | 60 dirty (09-26); all added lines in W except 1 line of w5a-migration spec | ALREADY-IN (stale) |
| agent-aa8f9930603238f14 | worktree feat/research-loop-e4-e11-e12-e15 | 9e205179 | 0 | — | 28 dirty (09-26); all in W except contracts-snapshot hashes | ALREADY-IN (stale) |
| agent-a3923235c11975020 | worktree feat/e16r1-p04-candle-overview | 05f0d6a0 | 0 | — | 26 dirty; the whole diff reverse-applies on W | ALREADY-IN |
| agent-a3aebbf8a0fed5e6b, agent-a4bbe45666d3be714 | worktrees rf04/s12-density, feat/research-e2c-e16-s07-s08 | 56439458, f74f143c | 0 | — | 1 untracked each, identical to W | ALREADY-IN |
| 18 clean agent worktrees (a05ec49, a2a960f, a315ac8, a378d72, a424bd5, a5146525, a6257d4, a6ddb6a, a918a61, aa85d28, ab00382, abb134f, ac3b238, ac51fc0, aca7d7b, acec053, ad20e6e, af165ba) | worktrees | various | 0 | — | 0 (3 have only an untracked `apps/portal/.venv`) | ALREADY-IN, removable |
| /home/bobby/portal-research-ol-p22-p24 | worktree codex/research-ol-p22-p24 | 73af8d21 | 0; **verified ancestor of C** | — | 0 | ALREADY-IN |
| /home/bobby/portal-research-integ | worktree, detached | 177df754 | 0 | — | 0 | ALREADY-IN |
| /home/bobby/.worktrees/portal-research-tv-integration | worktree feat/research-tv-p17-p20-integration | 4f1aaaad | 0 | — | 0 | ALREADY-IN |
| /home/bobby/portal | worktree fix/stan-context-password-change-origin | 87d9d98c | 0 | — | 0 research (untracked .agents, .claude, dist-preview, execution-journeys snapshots, one execution-loop D4 doc) | n/a (not research) |
| primus-origin/feat/thanhvuong/research-p17-p21 | remote | 25f4d031 | 20 (Vuong P21 S11, P22 publication saga, P23 runner); git cherry: 18 not upstream, 2 upstream | selectively integrated by fddea8e5 and 50494c9c; §13 "Selective Thanhvuong P22/P23 integration" records the rest as REJECTED_INCOMPATIBLE | — | DISCARD (already decided; keep the remote) |
| codex/p22-wip-2026-09-24 (+origin) | branch | 442e9f6a | 1: Claude-preserved Codex P22 WIP | every real file exists in C in a later form; only .orig/.rej leftovers are absent | — | DISCARD-superseded (Codex to confirm) |
| docs/consolidation-closeout-20260919 (+origin), portal-integration worktree | branch | c43ee031 | 2 docs (09-19 execution consolidation handoff) | no | 0 | n/a (not research) |
| integrate/dev-20260829-unified, backup/r5-…, verify/codex-preview, origin/feat/execution-*, dependabot/* | branches | — | 1–5 each | — | — | n/a (not research) |
| stash@{0} 7f28e2cf "wip-e16-r1-before-origin-reconcile-2026-09-27" | stash | — | research: progress.contract.ts (CandleOverview schema), research_child.py | E16-R1 landed differently (a00df203, `candle_overview` in current-source.*); research_child.py 87/89 lines in C | — | DISCARD-superseded (ASK Codex; do not drop until consolidated) |
| stash@{1}, stash@{2} (09-11, execution-loop-next) | stash | — | execution/N29/EDS only | — | — | n/a (not research) |

## Ordered consolidation checklist

1. **Freeze.** Confirm with Codex that `docs/research-loop-plan` is quiet. It moved 2bfeb53e → c2ec1443 during this audit. Pick C (the Codex branch) as the single target, since it holds 126 commits and W holds 3.
2. **Commit w1-build dirty work** (7 files: G14 option A, AlphaImport, gap-status doc, 2 new evidence docs) on top of d7db1cb3, on a named branch such as `claude/rl-w1-consolidate`.
3. **Commit each of today's worktrees as its own commit** (committing does not change their contents):
   - G1 (afd8dfc)
   - G8 (a935bf, already staged; the worktree is locked)
   - G7-only files from a12f335
   - G2 already is ed33db0d
4. **Decide G3 (ab5c797) before merging anything.** Codex shipped D1-O1 in 08fa8ee0 and 8ad39e83. Recommend discarding G3's backend, contract and client work. Diff only its "Stages 1-4 (S05–S08)" label follow-up against C and salvage that if C lacks it.
5. **Decide G4 hunks in a12f335.** b896d98d already fixed the S13 ladder, so keep G7 only.
6. **Merge C into the Claude branch, or Claude branch into C** (one merge commit). Expected conflicts:
   - NewRun.tsx: G10 6a4cb383 and G2 ed33db0d against a1d7bf3f and f0f7cc3d
   - AlphaImport.tsx and FRONTEND_GAPS_STATUS doc
   - CompareDetail/compareDetail.test if any G4 remains
   - TopBar.tsx: C's useRunLabel against G14 option A
   
   Re-check G5 d7db1cb3 against e4b9447e (S09 print probe).
7. **Cherry-pick onto the merged line:** ed33db0d (G2), G1, G8, G7. G1 and G8 apply cleanly on C.
8. **Regenerate contracts** (contracts-snapshot, d.ts) through the repo script. Never hand-edit them. Then run the pre-commit gate once.
9. **Only after the merged SHA is pushed:**
   - Remove aece84b (G14), a35c8ff (G5), a2a98c1, a39c534 and the stale 09-26 dirty worktrees (a3c4f79, aa8f99, a39232, a3aebbf, a4bbe45, whose content is already in W).
   - Remove the 18 clean agent worktrees.
   - Delete branch codex/p22-wip-2026-09-24 and stash@{0}, with Codex's OK.
   - Leave the Thanhvuong remote alone.
10. Leave non-research items alone: stash@{1}/{2}, consolidation-closeout, integrate/dev-20260829, /home/bobby/portal untracked files.
