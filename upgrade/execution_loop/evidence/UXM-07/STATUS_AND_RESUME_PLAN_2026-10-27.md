# Status and resume plan — 27 Oct 2026 (Claude, lane `claude/post-land-20261022`)

Written for Bobby to approve before work resumes. Nothing here is merged, pushed, deployed to Live, or has command/Live enabled.

## 1. Where the lane is

- Lane tip: `00e7f6cff` in `/home/bobby/portal-research-fe2`, clean tree. Not merged to canonical, not pushed.
- Integrated and reviewed: Codex packages 1–6 (linked fixtures, Fleet timing, visit digest, Accounts figures, Contributors paging, scoped portfolio names) at code + fixture level; WP-A…F3, WP-D, WP-E, WP-K and WP-P work through QA rounds 1–3 plus the round-4 commits of WP-A, WP-B, WP-F3.
- Typecheck clean at the last full run; focused suites green at every integration (counts in each hand-back). The full vitest suite, visual baselines, N29/EDS-12 re-pin and the full hook have NOT been run on the final candidate.
- Preview `research-portal` (127.0.0.1:8095) still serves the round-3 build (bundle `index-D5Ygt3qG.js`, positive scenario). It does not contain the round-4 commits. `portal-research-preview-control-api` was not touched by me; it shows "Up 21 hours", which means Codex or someone else restarted it after my last look.

## 2. Browser review result so far

Five fresh independent reviewers per round, all three widths (1440/1024/660), real screenshots:

| Round | BLOCKER | Nature |
|---|---|---|
| QA1 | many | missing data, overflow, fonts |
| QA2 | 13 | one fact with several values across screens, dead links, `undefined` titles |
| QA3 (canonical world) | 27 (stricter) | second-layer contradictions: orders/exposure/marks, canary identity, wall-clock leaks, ticket ids in copy |

Layout is clean at all three widths; dead links to `ACCOUNT_NOT_FOUND` and `undefined` titles are mostly gone. The honest verdict is: NOT yet acceptable to demo as "complete and consistent". Reports: `QA3_REVIEW_R1..R5_2026-10-24.md`.

## 3. Work stopped by the API weekly limit (saved, uncommitted, not integrated)

The weekly limit hit on 24 Oct (reset announced for 27 Oct 15:00 UTC). These agents stopped mid-round-4; their edits are on disk in their worktrees under `/home/bobby/portal/.claude/worktrees/agent-<id>`:

| Agent | Scope | Worktree state |
|---|---|---|
| WP-P `a5d9d960…` | world core: portfolio facts, clock leaks, marks/orders, canary identity, DOM guards | 1 commit `0ef0d6e0f` + 1 dirty file |
| WP-E `a540a08e…` | approval record, wall-clock stamps, people | 19 dirty files |
| WP-C `a41bebe5…` | Alpha 360 / replay / Compare, ticket ids | 23 dirty files |
| WP-D `ab6c0896…` | Cmd K by name, shell copy | 12 dirty files |
| WP-F2 `ae27f31f…` | Accounts / Blotter | 13 dirty files |
| WP-F1 `a9eacf3e…` | Overview / Portfolios | 9 dirty files |

Already integrated from round 4: WP-A `938666e1e`, WP-F3 `e2629c373`, WP-B `00e7f6cff`.

## 4. Remaining work by class (from QA3)

1. World facts (WP-P): Core NAV/state/allocated/alphas across register, 360 and Compare; one score/return per alpha across Overview, Alpha 360 and Compare; one order book and one mark per symbol; Exposure 0.00 on a running deployment; canary id `dep_b3` vs `dep_canary_01` and its stage history; dead links (`pf_TEST_ONLY_canary`, dark variants); every instant on the world clock (Approvals "Queue read" and Profile "Read" still use the wall clock); Fleet counts 41/72/69.
2. Ticket ids (`FE-nnn`) in user copy: shared renderer `blocks/notPublished.tsx` plus 87 test files (436 assertion lines). Proposed as one serial step after integration: words in the UI, request id in a data attribute.
3. Presentation items left in E, C, D, F1, F2 worktrees (see their LOG lines).
4. Contract-blocked and typed-absence items that stay honest: duration limit, three-series return chart, live drawdown pane, Paper band, Archived list, window/basis chips on screens that do not take them.

## 5. Decisions I need from Bobby

1. Approve resuming the six stopped agents from their saved worktrees (no restart from scratch), then one more integration + preview rebuild + QA round 4.
2. Ticket-id purge: OK to change the shared renderer and the 87 test files in one serial step? (Recommended: yes.)
3. Score/return per alpha: one producer in the fixture world (windowed 30D) for Overview, Alpha 360 and Compare? (Recommended: yes; needs your word on the definition.)
4. Window/environment chips on screens that do not take them (Fleet, Alpha 360, deployment pages): keep the typed "Not applied" chip (current) or show a read-only segment? Design decision.
5. Whether the next preview rebuild should also switch the preview compose default to the populated + positive scenario (already set in the compose file; the host env already says populated).

## 6. After resume, in order

1. Resume agents (max 3–4 heavy at a time): WP-P first (world), then E, C, D, F1, F2 on their saved work; integrate by cherry-pick, keep both sides on conflicts.
2. Serial: ticket-id renderer change.
3. Rebuild preview (`preview.sh build/up portal-web portal-fixture-bff` only; never control-api), capture 1440/1024/660, QA round 4 with new reviewers; stop when no BLOCKER remains.
4. Then, once: record visual baselines (heavy lock), full vitest at the frozen candidate, re-pin N29 then EDS-12, update debt ledger and register, cleanup (worktrees, dist, processes, docker dangling only), handback with per-ID ACCEPTED / CHANGE / DELIVERED / VERIFIED levels and exact Edge inputs.
5. Codex lands (reviews, runs one final gate, ff-only). I do not merge or push.
