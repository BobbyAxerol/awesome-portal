# UDB-02 — Isolated Execution store and retained preview hydration

Status: **PASS — ISOLATED_STORE_HYDRATED_PREVIEW**; Bobby approval 2026-10-10,
`docs/research-loop-plan`, parent `4a79429a`.
No dev/stable/main/Edge/TS access change, remote push, UI edit or reader flag
activation. One normal final commit/hook; do not repeat unaffected engine,
frontend visual or UDB-01 cache soak gates.

## Gates

| Gate | Delivered proof |
|---|---|
| T01 PASS | Independent forward ledger/rerun; 10 tables in two bounded imports, exact count/hash parity, tamper negatives and restored parity |
| T02 PASS | Original Core custody preserved; one audited owner workspace, wrong workspace/account/profile and nonmember/anonymous negatives; 12/12 review sessions revoked |
| T03 PASS | Real independent pools/queue overload; private PG/network/runtime role, no identity table and no retained-fact UPDATE permission |
| T04 PASS | Final live HTTP 14 cases + restored actual BFF 13 cases; each DB restarted independently; actual rollback/reapply with volumes and Research preserved |
| C4 PASS | All owned disposable cells and temporary rollback worktree removed; current domain, source, backup/evidence and exact rollback aliases retained |

Focused real-PG tests **38/38**, config assertions **7**, Control API image build,
shell syntax and actual runtime gates PASS. One normal grouped commit hook,
not a repeated engine/browser/soak campaign. No new public DTO/UI contract.

See [phase report, real receipts and cleanup](./phase-report.md),
[ownership and import manifest](./storage-manifest.md),
[UDB-03 / Claude handoff](./handoff.md), [debt register](./debt-register.json).

