# Core C2 recovery — terminal coherence, 2026-11-05

**Disposition: SOURCE_ONLY; A2 and V2 recovery remain NOT_READY.** No runtime,
schema, source grant or real source acknowledgment was changed.

## Change and test

An exact-original lookup previously accepted a terminal lease without checking
that local event history contained exactly one matching terminal. A conflicting
append while the source request was in flight could also escape the final
snapshot check. The candidate now rejects mismatched or duplicate terminal
events both before the request and in the final repeatable-read snapshot.
For a rollback before ENTER, the one matching unentered rollback event remains
associated with the original attempt without rewriting the retired lease.

- Current-human source SHA256: `6c13c4db557982220aac96874924818c4f9920c326378c26a42a24e1a0c87d8f`.
- Recovery orchestrator SHA256: `f86ca1cca0fd741a213a97d189e86a49bc27a5be9ddd45f6933bf21bd2d4669d`.
- PG test SHA256: `08f54c94be75928f48445e2c2fba4e1b2e311d5b96f85a5c60ae6a07e4bc9dc4`.
- `bash scripts/test-elp2-restore-inventory-rls.sh restore-original`:
  **4/4 PASS, exit 0**, disposable PostgreSQL and synthetic mTLS/source. Test
  covers entered, unentered UNKNOWN, unentered rollback, lost response/restart,
  conflicting event inserted while the source response is in flight, and
  exact lookup beyond 128. Runner SHA256
  `6cb3572193a1675a2632b0d2a4c0cdabbfb1a1dab4db0ae4366d086e897e65cf`;
  aggregate container limit 2 CPU / 1536 MiB. The runner cleaned its own cell.
- `git diff --check`: pass. This is not the normal hook or full typecheck.

## What this does not prove

The candidate event table is append-only for update/delete, but production
INSERT ACL and source-provenance qualification remain open. Matching rows are
not proof of an authenticated source receipt. The test peer and ACK are
synthetic; the source ACK does not prove recipient ISSUE delivery. A check in a
single snapshot cannot fence writers after that snapshot, fence the old DB or
process, or supply complete terminal/ACK history after a backup. Independent
authority checkpoint, write/response fencing and source reconciliation remain
required before any restore or cutover; the existing V2 refusal remains.

No UI changes, secrets in this receipt, commit, Git push, listener activation,
signed B2 or connected acceptance were performed.
