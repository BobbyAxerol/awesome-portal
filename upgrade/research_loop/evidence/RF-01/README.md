# RF-01 — Foundation truth repair (P01–P05)

**Status:** `RF01_COMPLETE · PRODUCT_ROUTE_BROWSER_RECEIPT (fixture lane) · REAL_API_RECEIPT → RF-02`
**Date:** 2026-09-23
**Owner:** Claude (backend + frontend), assigned by Bobby 2026-09-23; Q1–Q7 approved the same day.
**Worktree / branch:** `/home/bobby/portal-research` / `docs/research-loop-plan` — pushed to `origin` and `primus-origin`; not merged into `dev`/`main`.
**Source:** [P01–P05 audit](../AUDIT_P01_P05_CLAUDE_2026-09-23.md) · [Unified §13 RF-01](../../../UNIFIED_IMPLEMENTATION_PLAN.md#rl-rf-01)

## Commits

| Step | Commit | What |
|---|---|---|
| approval | `a45b3852` | Q1–Q7 recorded, RF-01 opened |
| RF01-B1 | `a0d0004d` | public Python Atlas route retired; internal `/internal/research/engine-atlas` is the only Python source |
| RF01-B2 | `e5daa7e2` | live route gate (`test-route-inventory.sh`) in `verify-workspace.sh`; P01 baseline kept as history |
| RF01-B3 | `c0166746`, `9607844a` | `retained_artifacts` on the P11 progress read — the authority's six states, locator-free, bounded 128 |
| RF01-B4 | `c7cc1ceb` | codec `p02-cursor.v2`: `stage` admitted, every other value opaque; journey echoes `stage` + `codec` |
| RF01-B4/B5 docs | `dbe569e8` | `cursor-codec.md` v2; append-only `closure_notes` in P02–P05 debt registers |
| RF01-F1…F6 | `c9fcc7ba` | neutral denial, `recovery` slot, 401 → Frame 01D, shared refusal mapper, shared cursor codec, S03 retained tables via `ArtifactPanel` |
| RF01-F4 | `50aaf532` | S03 progress refusals join the shared mapper (sixth status-only copy) |
| closure docs | this packet | receipts, board, Thanhvuong addendum |

## What the exit gate asked, and where it is proven

| Exit-gate clause | Proof |
|---|---|
| `test-route-inventory.sh` green and inside the phase gate | `scripts/verify-workspace.sh` runs it; every RF-01 commit passed the hook |
| public Python Atlas route removed, runbook says so | P04-T08 rewrite (public 404, unsigned internal 401, signed 200); `deploy/nginx/portal.conf` + `.env.production.example` rollback notes |
| generated contract matches OpenAPI | `packages/contracts/tooling/snapshot.py --check` (198 files); contract tests for progress + foundation |
| one artifact vocabulary authority → contract → S03 | `ProgressRetainedArtifact` (OpenAPI) ← `research.artifacts`; P11 disposable-PG case `RF01-B3`; S03 `RetainedTables` → `ArtifactPanel`; browser receipt shows all six states |
| one cursor codec, backend and frontend | `p02-contract.mjs` + `foundation.contract.ts` (`p02-cursor.v2`); `inspectionCursor.ts` used by S00 and S04–S08; P09 disposable-PG round-trip; FE S00↔S04 round-trip test and browser receipt |
| one refusal mapper and one sign-in path for every Research screen | `researchRefusal.ts` serves S01, S03–S07 (six status-only copies removed, `c9fcc7ba` + `50aaf532`); the contract-code mappers of S00/S12, S02 and S14 keep their per-code tables (see boundary below) and share the same 401 path; `AuthGate` answers with Frame 01D `SESSION_EXPIRED` |
| browser receipt 1280/660 naming its lane | `e2e/_probe-research-rf01.spec.ts`, lane `PRODUCT_ROUTE_BROWSER_RECEIPT` over repository fixtures — see below |
| in-scope debt = 0 | [debt-register.json](./debt-register.json) |

### Boundary kept on purpose — contract-code mappers

S00/S12 (`toFoundationRefusal`), S02 (`toPreflightRefusal`, `toRunCreateRefusal`)
and S14 (`toRefusal`) are not status-only copies: each maps a closed code enum
its contract publishes to per-code presentation (`highlightsSelection`,
`requiresRefresh`, `invalidatesSource`, validator placement), and their P07/P09/P10
handoffs require the server's contract-declared sentence verbatim. Folding
them into the status mapper would lose those per-code facts. What they share
with it after RF-01 is the state vocabulary and the 401 sign-in path. If Bobby
wants one headline rule across all ten mappers, that is a new decision, not RF-01 debt.

## Browser receipt — `PRODUCT_ROUTE_BROWSER_RECEIPT` (fixture lane)

Lane: built bundle served by `vite preview` on `127.0.0.1:4317`, product
routes through the Portal shell, reads answered by `e2e/fixtures.ts` and
per-test overrides. **Not** a real-API receipt; RF-02 owns that.

| Test (1280 and 660 unless noted) | Result |
|---|---|
| S03 draws the six authority states through `ArtifactPanel`; exact `9007199254740993`; no link/button | PASS ×2 |
| S05 on `503 RESEARCH_SPLIT_UNAVAILABLE`: fixed copy, server text only in closed `details`, `reread split` in the recovery slot, click recovers the screen | PASS ×2 |
| S12 on `401`: Frame 01D `SESSION_EXPIRED`, server text absent; "Sign in again" returns to `/research/quantbt/atlas#tab=modes` | PASS ×2 |
| S04 on `403 RESEARCH_EVIDENCE_FORBIDDEN`: neutral copy, no workspace/owner in the sentence, no recovery offered | PASS ×2 |
| S04 hash with an unsupported key: notice names it; `study`/`pick` survive the mount (1280) | PASS |
| S00 → S04 through the same codec; refused `colour` named; link carries `stage/fold/study` (1280) | PASS |
| whole Research probe set (fixture + product + RF-01) | 87/87 PASS |

Screenshots were read, not just produced. Two defects the tests had passed
were found that way and fixed before commit: CORRUPT/MISSING were described
as "not sealed" (they are integrity verdicts), and the receipt fixture gave
unsealed tables non-zero totals the authority never writes.

## Not claimed

- No deploy, no runtime flag, no `dev-portal` change. RF-02 builds the isolated preview stack (Q6).
- No real-API receipt. RF-02-F4.
- Walk-forward controls on S02 and spec-12 completeness on S12 are RF-02.

## Found outside RF-01, recorded not fixed

`scripts/research-loop-v11/test-p02-python-pin.sh` fails on HEAD before and
after RF-01: it runs against `local/portal-portal-api:dev`, the dev stack's
image, which carries `quantbt-engine 1.0.8`, while
`upgrade/backend/bar05/environment-report.json` pins `1.1.1`. It is an image
provenance gap, not code; the RF-02 preview stack builds an image from this
branch and is the natural place to close it (`P02_PINNED_RUNTIME_IMAGE`).
