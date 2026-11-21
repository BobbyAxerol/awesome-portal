# C2 drain accounts for retained delivery — 2026-11-05

**SOURCE CANDIDATE ONLY; NO RESTORE/CUTOVER AUTHORIZATION.** Worktree changes
on `docs/research-loop-plan` at committed HEAD `2faa8968f` are uncommitted.
No runtime, protected database, Edge source, credentials or UI was changed.

## Finding and change

`CurrentHumanCandidate.drainState` counted only the legacy/native obligations
view. The separate P7 delivery table can retain a `RESERVED`, `SENDING` or
`UNKNOWN` original after `beginDrain` retires the corresponding unused lease.
Thus the old code could report `DRAIN_READY` and allow `endDrain` despite an
unresolved delivery. `RestoreC2OriginalRecovery` separately computed the same
incomplete census.

The shared census now counts every retained delivery as pending and unknown,
alongside the legacy/native obligations, in both paths. Candidate delivery
has no proven completion/deletion operation; expiry or local `finish` does
not clear it. The check fails closed for a partially installed delivery schema,
an unreadable/malformed table, RLS on either source table or delivery table,
and a non-table delivery relation. A genuinely absent candidate schema keeps
the legacy-only path. Counts are obligation counts, not unique run counts.

## Focused validation

- `test/current-human-drain-counts.spec.ts`: **11/11 PASS**, including absent
  schema, additional retained originals, permission errors, RLS, malformed
  census and partial schema.
- `scripts/test-elp2-restore-inventory-rls.sh c2-drain-delivery`: **1 PASS,
  19 skipped** on disposable PG. A synthetic issued original receives a
  retained delivery; after `beginDrain` retires its lease, drain remains
  `DRAIN_UNKNOWN`, `endDrain` is refused, and this remains true after the
  delivery becomes `UNKNOWN`. RLS and a schema missing its obligations table
  also fail closed. The test is not a production authority or ACK proof.
- `scripts/test-elp2-restore-inventory-rls.sh c2-regression`: **8 PASS,
  102 skipped**; focused legacy revoke, original terminal and recovery cases.
- `scripts/test-elp2-restore-inventory-rls.sh restore-original`: **8/8 PASS**
  across two files, including the original recovery orchestrator on disposable
  PG. Focused strict TypeScript check of the new census passed; full
  typecheck and normal hook were not run. `git diff --check` passed.
- The runner cleaned the isolated test containers and networks. No unrelated
  workload or data was removed.

| File | SHA-256 |
| --- | --- |
| `current-human-drain-counts.ts` | `c9bdecb203d45eef9c778ada58f08fde46d4e3387f855f7e49323b22cdef0c39` |
| `current-human-candidate.ts` | `a82c705c7f3a2bc0998a1ad4234feaa9263ad62c6b93373cc9b850ea74567617` |
| `restore-c2-original-recovery.ts` | `c4253e8f02b2ae1fbd6223543ddec9bffec7a07dbe5a0ff84462ff239d691ef3` |
| `current-human-drain-counts.spec.ts` | `f7403f518de3dcdb94841c5f3649910d8f6f6087fe08c840623bf779578e13f1` |
| `c2-owner-issuer-pg.spec.ts` | `c9394294a69cb8906af91aa4349b47e57534a89475a70935209e47e97dbc2638` |
| `test-elp2-restore-inventory-rls.sh` | `abf518a20c71c76ef3ca9b76c484a813c2048946a452283613647bc375e1efa0` |

## Remaining boundaries

An entirely absent schema is still indistinguishable from one that was
previously installed and then removed: production needs an independent
installation marker, ordered migration/ACL review and durable custody before
this optional-candidate behavior can authorize anything. Source view/schema
provenance, old-holder/network fences, authenticated original terminal and ACK
census, migration/restore rehearsal and connected acceptance remain open.
No delivery row is released here. V2 restore and issuer remain fail-closed;
no frontend request or contract change is made.
