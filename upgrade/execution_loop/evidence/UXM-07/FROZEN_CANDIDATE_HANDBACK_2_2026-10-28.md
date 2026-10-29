# Frozen candidate hand-back 2 — Claude → Codex (28 Oct 2026)

Supersedes `FROZEN_CANDIDATE_HANDBACK_2026-10-28.md` (first freeze, `b9d37516b`). Lane `claude/step-b-integrate` in `/home/bobby/portal-research-fe2`, on canonical `docs/research-loop-plan` @`1a6c2012d`, fast-forwardable. Claude did not merge, push, deploy or enable command/Live. Frozen SHA: `9054bd410` (hook-verified); anything after it is this result line only.

## 1. What changed since hand-back 1

Step B (structural fix): the fixture doubles are computed from one world (`e2e/bffWorld.ts` plus `bffWorldStage/Orders/Books/Governance/Generated.ts`), not hand-written per screen. 104 cross-page ties (`scripts/fixture-ties.mjs runWorldTies`, `src/fixtureBff/worldTies.test.ts`, `WORLD_TIE_CATALOGUE_2026-10-28.md`) all hold; `OPEN_TIES` is empty. New guard `src/fixtureBff/readerConformance.test.ts` runs every screen's own closed reader over every served fixture body (about 2,250 reads in 23 groups, link crawl, `undefined`/`null` scan). It found seven defects no browser round saw (register unreadable, Operations variant targets, Cmd K duplicate hit ids, pending-recall schema, scoped-lane alpha resource and `_dark` 500s, dead `alpha_e` link); all fixed.

Backend-side items built (fixture and consumer, no invented real facts): server-side blotter scope (`executionFullBlotterV1` stage/deployment/account/alpha; N22 refusal), FE-069 alpha-catalogue consumer with workspace and revoke fences (`FE069_CONSUMER_RECEIPT_2026-10-28.md`: reader, cursor traversal, fixture route, 55 conformance tests).

Adopted from Codex without redoing: `0c3441a5f` (research alpha stage, `researchAlphaStage.test.ts`, V2 approval cockpit walker) and `aea2501be` (selected approval evidence reads); `alpha_e` keeps its Research stage under that rule.

## 2. Gates actually run on the frozen tree

| Gate | Result |
|---|---|
| `tsc --noEmit` (apps/portal/frontend) | exit 0 |
| Full `vitest run` | 771 files passed, 87,661 tests passed, 0 failed, 5 expected-fail, 8 skipped |
| Browser review rounds (5 independent reviewers each, then 3, 2, 1) on the preview | BLOCKER 24 → 16 → 8 → 1 → 3 → 1 (QA5 to QA10); Fixed after QA10 on the fixture/FE side: closed-request quorum at close, the 500 on the Overview stage link, the replay candle window (the plot's scaling was not re-viewed), closed-request wording. No full browser round was run after those last fixes: they are covered by ties W150, W160, W161 and the reader guard, not by a reviewer |
| V2 pixel baselines, pinned image | 65/65 recorded, two consecutive compares 65/65; 37 re-recorded, 28 kept (21 identical, 7 under 0.05 percent) |
| N29 then EDS-12 re-pin | both `runtime_effect: NONE` |
| Full pre-commit hook (`verify-workspace.sh`) | **PASSED** on `9054bd410` ("Portal monorepo verification passed": contracts container 112 files / 1,898 tests, control-api test cell, N29 and EDS-12, D1-D4, N15-N29, tracking reconciliation). Three earlier attempts failed on test-infrastructure causes, each repaired at its root: contracts container copy list (world modules missing), Contributors paging timeout on a load-sensitive large-scale test, control-api test cell copy list (`stageFactViews.ts`, Codex's own repair) |

Not run: legacy `e2e/visual.spec.ts` and the Research Loop spec (LC-FE-03: Codex's official compare), real-API / Edge acceptance, Playwright journeys beyond the layout audit and the reviewers' read-only probes.

## 3. Debt ledger (owned; none hidden by a baseline)

| Item | State | Owner / needs |
|---|---|---|
| Approval row subject type | inbox rows carry `subject_id` only as text (no type: alpha vs deployment), so no link | Codex: publish a subject type on the approval row |
| Variant identity (`dep_live_01_mismatch`, `_gap`, `_dark`, canary variants) | views of the base deployment; incident header and Operations rows name the base id | Codex: a "view-of / variant-of" member on room, incident and queue-row identity |
| Evidence banner blocker summary | banner follows `evidence_complete` but cannot show the queue row's `blocker_summary` | Claude after a published place for it |
| Fleet: Research-only 5 cannot be opened; `alpha_e` unreachable from board, map, search | design | Bobby/Claude design; a Fleet filter that opens research-only alphas |
| Grid D equity series panel "could not be read" (503 by design for sandbox alphas) | typed absence | contract (three-series / equity projection `GET /deployments/{id}/equity-projection` has no producer) |
| Positions not explained by orders on Live/Canary | typed warning `POSITIONS_OPENED_BEFORE_THE_RETAINED_ORDER_WINDOW` on the V1 exposure tab only | Claude: show on V2 live/canary panels when their readers carry warning codes |
| Forward / Cost bars, 7D/30D/90D chips on Alpha 360; Live room HIGH/LOW markers, drawdown strip, leverage and ack-latency columns; exit-gate criterion rows and approved band | typed absence (contract carries null) | sibling reads exist (`cost-events`, `order-detail`, `account-profile`, `alpha-readiness`): FE wiring slice |
| Fleet row selection, Compare selected, Export | disabled with reason | design |
| Carry A replay plot empty | double serves venue candles for BTCUSDT only; other symbols are the contract's typed absence | another double (new fixture symbols) |
| Portfolio Score components P/R/B names | open | Bobby |
| R2-21 one number formatter (score rounds 28.07 vs 28.08 between screens) | decided 29 Oct: after Codex lands this tip, own slice with receipt | Claude |
| Users/Admin Actions rail gating | decided 29 Oct: owner only (no change) | closed |
| Sidebar 10 px labels and badges | shared token | Codex/Bobby (protected) |
| DEBT-053 load-sensitive flakes | none failed in the last two full vitest runs; the contracts container spec `execution-contributors-linked-fixture` (large-scale paging) takes 8-30 s depending on machine load, over the 20 s default on canonical itself (measured on a canonical worktree: 30 s for the ALL test under load 15, 21 s on this lane with Codex's memoisation); its group limit is widened to 120 s, assertions unchanged | Claude; Codex may prefer a lighter scale |
| control-api test cell copy list | `scripts/control-api-test.sh` lacked `v2/readers/stageFactViews.ts` (Workbench now imports it): the same one-line repair Codex made on its candidate, applied; `paper-history-depth`/`-http` pass 37/37 in the cell | done |
| LC-FE-03 official visual compare (legacy and Research specs) | not run by Claude | Codex |
| FE-069 | consumer delivered; negative fixture for the alpha catalogue contract not published; landing of backend `feafe56a` in the running image | Codex |
| F9 UXM-08/09/10 | not started, waiting for C3–C7 | — |

## 4. Per-item levels

F1 FE-042/043, F2 FE-040, F3 Access, F5 fixture L1–L3 and reader conformance (now also over every served body), F6/F7 screens on the positive fixture: DELIVERED and fixture-verified in the browser and by ties. Not browser-qualified against a real source. Codex lands after one final gate, ff-only; the integration candidate Codex built earlier (`chore/elp2-integrate-20261028`) is superseded by this tip, which contains its three commits.

## 5. Workbench request-order case (Codex integration packet, one failure in a broad retake)

Test: `src/execution/v2/screens/workbench/workbench.requests.test.tsx` (DEBT-UXM07-044). Product facts read: the eligibility read is started by `useStageActionEligibility`'s `useEffect` when the exit control mounts; the root's `data-state="ready"` is rendered in the same commit as the body, so "ready implies the eligibility read was made" depends on the passive effect having run when the test observes `ready`. Assertion kept as is (not relaxed).
Reproduction attempts on this tip, machine load 15-18 from other workloads: the file alone 20/20 passed; the whole `src/execution/v2/screens` tree on two workers (Codex's condition) three times, 183 files and 10,069 tests each time, all passed. **Not reproduced; cause not established; not proven a scheduling flake.** If it recurs, the full failure output (assertion, `calls` array) must be kept; a React effect-flush race (passive effect after the commit that renders `ready`) is the candidate to test first.
