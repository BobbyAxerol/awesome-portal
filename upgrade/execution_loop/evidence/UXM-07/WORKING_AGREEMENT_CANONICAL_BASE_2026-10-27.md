# Working agreement with Codex — start from canonical, reuse, no duplicate work (27 Oct 2026)

Bobby asked (27 Oct): check that the research-loop plan is merged with Codex's backend of the last days, work from it so nothing is wasted, and unify how we work. This is the result of that check.

## 1. What I found

- Canonical `docs/research-loop-plan` is at `21b03093c`. It already contains my lane up to `00e7f6cff` (Codex landed it ff-only on 26 Oct as part of the local consolidation, `LOCAL_CONSOLIDATION_2026-10-26.md`) plus about 142 later Codex commits (Core/Accounts CURRENT, native stream and accounts retakes, Research reader/source observation, health persistence, Paper venue calendar, scoped Manager sources).
- My old lane `claude/post-land-20261022` had 10 commits that canonical did not have (shell, approvals record, accounts/blotter, alpha/replay/compare, overview hygiene, status doc). The branch was NOT based on canonical, so continuing there would have meant a second integration later.
- Codex's local consolidation already took over three things from my agents' worktrees: the `points` clock rebase (WP-F2), the NAV window-independence / young-book / budget fixture semantics (`0ef0d6e0`, WP-P) and 60 historical PNGs. It also made the two reader repairs it had asked of me (ELP2-REV-20261026-01 alpha scoped reader, -02 live stage facts) in `12ffc4bf7`. I must not redo those.
- Codex marked as intentionally replaced (do not resurrect): my WP-K stage-entry fixtures (replaced by Codex `82947ceb2`) and my own digest sibling (replaced by the persisted visit digest).

## 2. What I did

- New lane branch `claude/post-canonical-20261027` = canonical `21b03093c` + my 9 commits rebased (3 trivial conflicts: comment-only differences and one already-applied constant fix; both histories kept). Old branch kept as `backup/post-land-20261022-aef79fbec`.
- Told WP-P (the one agent with unmerged world work) to rebase its 6 commits onto the new base by semantic union with Codex's versions.

## 3. Working rules we now share (from Codex's own packets, restated so both sides follow one method)

1. One base: canonical. Every new Claude commit starts from the current canonical tip (or from the current candidate Codex names). Re-check `git merge-base` before each hand-back.
2. One writer per area. Claude: readers, components, fixture doubles, screens, browser/visual evidence. Codex (primary): source commissioning, shared contracts and generated outputs, integration, heavy gate scheduling, ff-only landing. I do not push, merge canonical, install services, enable command/Live.
3. Never redo delivered work from a stale OPEN row; check `git log docs/research-loop-plan` and the sync file first. Same subject is not patch equivalence: check the diff.
4. Preserve both histories on conflict: semantic union, never whole-file ours/theirs, never weaken a test to get green.
5. Each hand-back names: SHA on top of canonical, tests actually run with counts, what was NOT run, per-ID ACCEPTED / CHANGES_REQUESTED, remaining real-source gap. Fixture success is not real-API acceptance; a producer test is not a browser receipt.
6. One heavy command at a time; no flock for light jobs; one full hook / visual / baseline run on the frozen candidate only.

## 4. Debts Codex left with me (LC-FE-01..04) and my reply

| ID | State | Plan |
|---|---|---|
| LC-FE-01 `ScoreCell.tsx:70` ternary `n/a` for an unpublished Score part | open | Fix with the accepted absence copy (words + gap code in a disclosure) and focused Score tests; no allowlist. Assigned to WP-F1. |
| LC-FE-02 `siblings.generated.ts` strict `source_request_sent === false` flagged by `failClosed.test.ts` | open | It is a closed-schema DENIED refinement; review the oracle semantics with K and fix the oracle or the generator, not by allowlisting. |
| LC-FE-03 official visual 474 PASS / 213 FAIL / 16 SKIP (Fleet query 400, fixture 501, quoted window, pixel deltas) | open | Triage by root cause after the world rebase; classify consumer / double / backend; no blanket re-record. Compare-only run first, baselines once at the frozen candidate. |
| LC-FE-04 other dirty fixture-world / approval / portfolio overlays in agent worktrees | in progress | These are the round-4 agent worktrees; I integrate them by cherry-pick onto the canonical-based lane (done for WP-D/E/F2/C/F1, WP-P pending). |

## 5. Next steps (unchanged goal, new base)

1. WP-P rebases and posts WORLD-V3 on the new base; I cherry-pick it.
2. Serial step: shared `blocks/notPublished.tsx` renderer (ticket ids out of rendered words).
3. Rebuild preview (`portal-web` + `portal-fixture-bff` only), capture 1440/1024/660, QA round 4 with new reviewers.
4. LC-FE-01/02/03, then frozen candidate: baselines once, full vitest, N29/EDS-12 re-pin from the gate table, debt ledger, cleanup, hand-back to Codex for the single gate and ff-only landing.
