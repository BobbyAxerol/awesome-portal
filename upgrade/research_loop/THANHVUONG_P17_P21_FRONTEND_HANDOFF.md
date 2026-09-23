# Thanhvuong frontend handoff — Research P17–P21

## Assignment frozen by Bobby

This is one isolated frontend campaign. It starts from the published
`docs/research-loop-plan` baseline, not from `dev`, and it never modifies or
deploys the running Portal.

| Item | Required value |
|---|---|
| Contributor branch | `feat/thanhvuong/research-p17-p21` |
| Upstream remote | `primus-origin` only |
| Exact base | the `docs/research-loop-plan` commit recorded in `.portal-contributor-workspace` when Bobby provisions the workspace |
| Return path | one PR from the assigned feature branch to `docs/research-loop-plan` |
| Explicitly excluded | direct `docs/research-loop-plan`/`dev`/`main` writes, P22, backend contract changes, migrations, deployment, runtime flags, Execution Loop |

The contributor must not create a replacement branch, rebase this branch, or
change the PR base. If the baseline moves while the campaign is in review,
report both SHAs to Bobby; Bobby decides the integration path.

## Owned presentation scope

| Phase | Product screen | Mandatory handoff |
|---|---|---|
| P17 | S08 — Route-aware replay and state-at-cursor | [P17 handoff](./evidence/P17/frontend-handoff-claude.md) |
| P18 | S09 — Report, print and reproducible export | [P18 handoff](./evidence/P18/frontend-handoff-claude.md) |
| P19 | S10 — Attempt lineage, semantic diffs and exposure | [P19 handoff](./evidence/P19/frontend-handoff-claude.md) |
| P20 | S13 — Compare modes and derived correlation | [P20 handoff](./evidence/P20/frontend-handoff-claude.md) |
| P21 | S11 — Release Candidate composer and immutable evidence pack | [P21 handoff](./evidence/P21/frontend-handoff-claude.md) |

P16 has already been delivered by Claude. Treat its components, contracts,
routes and visual decisions as read-only integration context; do not redesign
or regress them while implementing P17–P21.

## Required method

1. Read `CLAUDE-FOR-thanhvuong.md`, Unified Plan P17–P21, each linked phase
   guide/spec/HiFi HTML, all listed frontend handoffs, and addenda before
   editing the owning screen.
2. Verify the provisioned user/workspace/remote/branch and prove the assigned
   branch descends from `primus-origin/docs/research-loop-plan`.
3. Consume generated typed same-origin clients only. Preserve typed
   loading/empty/partial/stale/denied/unavailable states and exact decimal/UTC
   values. Do not invent engine, execution, approval or source facts.
4. Keep HiFi-rich composition on product routes; do not replace a whole screen
   with an envelope because one panel is unavailable. Missing facts remain in
   the owning panel with the published typed state/reason.
5. Before each phase handoff, inspect the actual product route at desktop and
   compact viewports, compare it with its HiFi HTML, run the prescribed
   type/unit/browser checks, and distinguish real from fixture evidence.
6. Commit coherent phase-scoped changes. At P21, run the campaign acceptance
   set and provide one complete PR packet: branch/base/head SHAs, files,
   tests, browser receipts, HiFi comparison, source blockers, and no known
   in-scope workaround/debt.

## Boundary for Codex/Bobby

Any missing named DTO, state discriminator, server refusal, BFF operation,
generated client, source fact, or backend defect is a `CG-Pxx-*` request with
locator, actual/expected behavior, smallest safe proposal, and test needed.
Do not modify backend contracts or runtime to make a screen green. Bobby/Codex
will return an explicit contract amendment or mark the fact truthfully absent.
