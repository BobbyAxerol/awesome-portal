# Frozen candidate hand-back — Claude → Codex (28 Oct 2026)

Lane `claude/post-canonical-20261027` in `/home/bobby/portal-research-fe2`, on canonical `docs/research-loop-plan` @`0c3b49dc9` (fast-forwardable; Claude does not merge, push, deploy or enable command/Live). Frozen SHA: `b9d37516b` (hook-verified). Anything after it is this document's result line only.

## 1. Gates actually run on the candidate

| Gate | Result |
|---|---|
| `tsc --noEmit` (apps/portal/frontend) | exit 0, after the last spec edit |
| Full `vitest run` (apps/portal/frontend, `--maxWorkers=3`) | 87,348 passed, 1 failed, 5 expected-fail, 8 skipped (754 files). The one failure, `fleet/index.test.tsx › Health filters by the published word`, passes alone (1/1) — load-sensitive, same class as DEBT-053 |
| Visual compare-only, pinned image, before any recording | 472 passed, 215 failed, 16 skipped (canonical had 213 failed). Root causes classified: V2 spec left three reads unanswered (visit digest, alpha lifecycle, approval evidence → 501), two stale cells (replay root `trade-replay-v2`; incident id and the incident page replacing the dock), plus the world now being populated (every screenshot differs) |
| V2 baseline recording, chromium-v2, pinned image | 65/65 recorded; two consecutive compares 65/65 green. All 65 differ from the old baselines by more than noise (none restored); before/after contact sheet of Overview, Fleet, Blotter, Account 360, Alpha 360, Incident reviewed |
| N29 then EDS-12 re-pin from each gate's own refresh | both `runtime_effect: NONE` (39 and 42 inputs) |
| Contracts container suite (`scripts/contracts-test.sh`) | first hook attempt failed: 5 files could not import `bffApprovalWorld`, `roster-names`, `domain`, `command-center/contracts` (not in the container's explicit copy list); list fixed, 112 files / 1,898 tests pass |
| Full pre-commit hook (`verify-workspace.sh`) | PASSED on `b9d37516b` ("Portal monorepo verification passed": control-api vitest, N29 and EDS-12 gates, D1–D4, N15–N29, tracking reconciliation) |

Not run: legacy `e2e/visual.spec.ts` and the Research Loop spec (not touched by this lane; Codex's official run owns LC-FE-03), real-API/Edge acceptance (fixture success is not real-API acceptance).

## 2. Spec changes made for the recording (fixture gaps, not baseline updates)

`e2e/execution-v2-visual.spec.ts` answers only reads the shared double leaves at 501: visit digest, alpha lifecycle, approval evidence from the canonical published fixtures bound to the id and workspace asked; the incident children read from the world (`incidentChildrenBody`). Every other body stays the double's. Two cells were repointed (replay root, incident page).

## 3. Debt ledger (owned)

| ID | State | Owner |
|---|---|---|
| DEBT-001 / DEBT-003 | closed earlier (`BE-CLAUDE-2026-10-20/F1_F9_CLOSURE_2026-10-21.md`); baselines now recorded | — |
| DEBT-053 (load-sensitive flakes: admin filter, `pendingPreviewMount`, fleet Health filter) | open; each passes alone | Claude (serialise or harden the wait) |
| LC-FE-03 official visual 474/213/16 | triaged for the V2 spec above; legacy and Research specs unchanged | Codex runs the official compare; Claude on request |
| QA5 fixture-world contradictions (24 BLOCKERs) | open, listed in `QA_ROUNDS_SUMMARY_AND_FREEZE_PROPOSAL_2026-10-27.md` | Claude, step B: derive stage, blotter, replay, approval and account doubles only from `bffWorld` with cross-page tie tests. The V2 baselines freeze today's contradictions and will be re-recorded once after step B |
| Portfolio Score components P/R/B names; R2-21 one number formatter; Users/Admin Actions rail gating | open, need a decision | Bobby / Codex |
| F9 UXM-08/09/10 | not started, waiting for C3–C7 | — |

## 4. Per-item levels

F1 FE-042/043, F2 FE-040, F3 Access, F5 fixture L1–L3 and conformance, F6/F7 screens on the sparse and positive fixture: DELIVERED and fixture-verified in the browser (1440/1024/660 on 53 routes, five independent review rounds). Not browser-qualified against a real source. Codex lands after one final gate, ff-only.
