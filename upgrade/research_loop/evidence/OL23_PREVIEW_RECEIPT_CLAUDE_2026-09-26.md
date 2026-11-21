# OL-23 — preview rebuilt from HEAD, real-API receipt (Claude, 2026-09-26)

Unified §13.4.1 OL-23. Everything in the E packages (E1, E2a/b, E3, E5, E6, E7, E10) had been
tested with unit/spec tests, fixtures and a Vite proxy onto the **old** preview image. This is
the first run of the new frontend **and** the new backend together, on real reads.

## Preview identity

| Fact | Value |
|---|---|
| Git commit built | `9f0a9066` (merge E7 on top of E1…E10) |
| Images | control-api `b1da3e2d13a8`, portal-web `12655d03e8c9` — running image ID = built tag, checked per service |
| Migrations | head `1723680000066_research-run-lifecycle-status-v1` |
| Port | `127.0.0.1:8095` (loopback), project `portal-research-preview` |

**Migration order fix (preview only).** `up` first failed: node-pg-migrate refused
`063_research-release-candidate-publication-v1` (Codex, P22) because this preview had already
run 064/065 (Claude) before 063 existed on the branch. Fixed on this preview's database only:
063's SQL and its `pgmigrations` row were applied in one transaction, with `run_on` just before
064's, so the ledger order matches the file order; `up` then applied 066. No migration file and no
migrate CLI changed. Any other stack that ran 064 before 063 needs the same one-time step
(dev/stable never ran 064 — no action there).

## E10 convergence (real data)

The four runs E10 found stuck, read after the rebuild:

| Run | Before (old preview) | After |
|---|---|---|
| `rrun_0df059…` (WFO) | Library QUEUED / S03 FINISHING since 2026-09-24 | **COMPLETED** |
| `rrun_6f9ffea1…` (P04) | QUEUED / RUNNING, RETRY_WAIT overdue | **FAILED** `P06_RETRY_NOT_DISPATCHED` |
| `rrun_9c3f2081…` | QUEUED, RETRY_WAIT overdue | **FAILED** `P06_RETRY_NOT_DISPATCHED` |
| `rrun_9bd48dd9…` | QUEUED, RETRY_WAIT overdue | **FAILED** `P06_RETRY_NOT_DISPATCHED` |

Exactly the prediction in [`P11/E10_RUN_STATE_CLAUDE_2026-09-26.md`](P11/E10_RUN_STATE_CLAUDE_2026-09-26.md).

## Real-API lane (`playwright.research-preview.config.ts`, 1280 + 660)

| Run | Result | What was wrong |
|---|---|---|
| 1 | 38 / 48 | spec out of date, no product bug (below) |
| 2 | 46 / 48 | S13: `rrun_0df059…` now COMPLETED without a claim, so E7 folds it into a compact row |
| 3 | **48 / 48** | — |

Spec changes (each is a decided product change, not a loosened check):

- S06: the selected card is the HiFi `selCard` (S_IS, S̄_OOS, d̄ decay, max_dd — no J, read from
  the HiFi data block); the spec now checks its four rows and the served `selected_trial_id`.
- S07: the retained WFO lane draws its own θ\* table (`data-frozen-parameter`); the old preview
  never served that lane, so the spec only knew the P16 table.
- S10: the claim reads "not issued" + the source sentence (D8), not `NOT_ISSUED`.
- S13: no "sched" prefix (E7); attempts without a claim family are checked as the folded
  `data-unclaimed` count instead of as ladder cards (D10).

Receipts: 0 horizontal overflow on every screen at both widths; the only failed requests are the
intentional ones in the S11 DOUBLE scenario (409 on the stale draft; publication 404 before
publish).

Looked at (real data): S06 WFO Stage B — J terms, per-fold decay `fold_01 +7.44 / fold_02 +0.38`,
pool on S_IS × S̄_OOS, B3 cards with values, B4 journey; S13 — 12 claimed cards, 21 folded;
S01/S03/S04/S05/S07/S08/S09/S10/S11/S12 at 1280. One E1 leftover found and fixed in the same
commit: S13's meta line printed the full `p20r1_…` revision.

Screenshot SHA-256 (first 16 hex; images not committed):

```
S01-laptop 4f3f748edd86c5a5
S03-laptop 5302e7eb70b6fade
S04-laptop ba35179ba8839e74
S05-laptop 128b484278148d0c
S06-laptop 2e3fde58b3e8a445
S07-laptop decc736efa485807
S12-laptop 77990080a54e92f1
WFO-S03-laptop 50622deb3dc990e9
WFO-S04-laptop da2c37e9ca786541
WFO-S05-laptop a0f2c29ba78f9509
WFO-S06-laptop 7b5479bc5edbae83
WFO-S07-laptop a49e5e7088765f59
WFO-S08-laptop e52b17854a6d518e
WFO-S08-mobile 24bd487a56ec7652
W5c-S09-P04-laptop e428e87af6494860
W5c-S09-WFO-laptop 188c9b97d5e8c178
W5c-S10-laptop b9540586526008bf
W5c-S13-laptop a827896699e05b92
W5c-S13-mobile 168bd390f6898db1
W6b-S10-WFO-1440 629719943d0a8397
X1-S11-P04-laptop 1e6e48261d386135
X1-S11-WFO-laptop 7b68bdc6648f45f2
X1-S11-DOUBLE-P22-published-laptop 1898e0172d6faafc
```

## Not covered by this lane

- S00 Journey Map and S14 Alpha Import have no real-API test in this lane (S14 writes are
  stubbed in E6's fixture lane; S00 is E12).
- S08 on the P04 run is not in the lane (WFO S08 is).
- The 33-cell visual baseline (OL-22) was not run.

---

## Second round, 2026-09-27 — preview `c81e8dc2`, migration head 067

The first round above ran on `9f0a9066`. E11 (Run Library projection), E12 (journey descriptor
v3, migration 067), D1 (`display_label`) and E13 (lineage parent writer) landed after it, so the
preview was rebuilt and the lane re-run.

| Fact | Value |
|---|---|
| Git commit built | `c81e8dc2` |
| Migrations | head `1723680000067_research-journey-descriptor-v3` |
| Real-API lane | **48 / 48** at 1280 and 660, 0 overflow |

Confirmed on real reads, not on fixtures:

- **E11** — the WFO card `rrun_e1fa9e5c…` now serves `oos_sharpe -5.354970424211971`,
  `decay 3.911439612138451` and a sparkline, all `AVAILABLE`. Before the fix all three read
  "not published" while Screen 04 showed the same numbers.
- **E12** — Screen 00 opens S4 Execute Replay, Attempt Lineage, Compare, Release Candidate and
  Run Report ("pick a run"), and no built screen prints SOON. The Execution-side cards stay
  BLOCKED, which is correct.
- **D1** — `GET /api/v1/quantbt/runs` carries `display_label`: `R-WFO-016`, `R-P04-017`; the
  lineage read carries `R-P04-001…`. S01's card head printed the short id until this round —
  the read carried the label and the card had not been wired to it. Fixed; the head now reads
  `R-P04-017` and the full id is still what a click copies.
- **E13** — all 33 attempts still read ROOT, which is the truth: they predate the writer and
  nothing is backfilled. The writer itself is proved by `research-w5a-migration.spec.ts` in the
  pre-commit hook (it needs PostgreSQL, so it cannot run in a bare worktree — the run that wrote
  that spec pinned `slpercent` at 3.1, outside its declared 0.7–2.5, and never saw it fail).
