# STATUS live and restored custody binding — 2026-11-06

**SOURCE/TEST WIP, UNMOUNTED.** No genuine Edge ACK, complete external
census, independently qualified authority, V2 restore permission or phase
PASS is asserted. Checkout `docs/research-loop-plan` at committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; worktree was already dirty.
This follow-through supersedes the earlier source/test hashes in
[preparation-to-chain receipt](CORE_STATUS_PREPARATION_CHAIN_BINDING_20261106.md)
for these inputs; that receipt remains historical evidence for its earlier run.

## Finding and repair

The restored path rechecked chain/preparation metadata and lineage under the
same singleton lock as ISSUE. A still-live context used only the simpler ACK
existence check. In a disposable PostgreSQL counterexample, a chain with a
nonce different from its preparation and a matching synthetic terminal/ACK
was wrongly consumed without the restored flag. This proves a local
corruption/restore-consistency gap, not a demonstrated production exploit.

Both live and restored consumption now validate preparation call/binding and
run the same chain census under that lock, followed by the exact metadata
comparison. A restored context must have at least one link; a live context
with no issued lease may still complete its legitimate no-issue read. Gaps,
cross-context metadata, requester mismatches, missing lease/ACK and nonterminal
rows remain refused. No public API, UI, migration or runtime configuration was
changed. A consistent local history still cannot prove that an entire link or
ACK was not lost before the snapshot or that a source response was genuine.

## Verification

- Before the source change `bash scripts/test-elp2-restore-checkpoint-pg.sh
  census`: **8 PASS / 1 FAIL**, exit 1; the new live-context negative resolved
  where it should have rejected. The failing assertion was the metadata case;
  the later lineage assertion did not execute in that run.
- After the fix the same isolated PostgreSQL file: **9/9 PASS**. Its new test
  covers incorrect live metadata, an acknowledged but non-contiguous chain,
  a valid linked chain, and a valid no-issue read. These are assertions inside
  one test, not separate test counts.
- `bash scripts/test-elp2-restore-inventory-rls.sh status-recovery`:
  **3 PASS / 5 skipped**. It exercises actual Core migrations, AuthService,
  stores and PostgreSQL with TEST_ONLY source proofs and loopback mTLS:
  competing preparations, fresh OS-process restart, and UNKNOWN followed by
  same-original signed recovery and separate completion. The selector was
  expanded from two cases to include the UNKNOWN path. Synthetic ACKs are not
  Edge acceptance.
- Focused strict TypeScript test/import check, `bash -n` runner, and tracked
  `git diff --check`: exit 0. No normal hook or full candidate build was run.
- Each disposable cell used bounded Docker resources (at most 2 CPU / 1.5 GiB)
  and its own network/tmpfs; actual peaks not measured. Exit traps removed
  owned cells. One separately named `control-api-test-postgres-*` container was
  observed afterwards and left untouched.

| WIP input | SHA-256 |
| --- | --- |
| `command-status-preparations.ts` | `c2a92312230a621317cd12b83c28d0f638ad7873be4a146bae3d44d927bcdac2` |
| `command-status-ack-census.ts` | `9b02b785cee29fd5a406517441ee4bde8ef5b47eebdb50daeee9a9701befbaff` |
| `command-status-ack-census-pg.spec.ts` | `38dea0a38ce79b19e70e7814b207cc323b95d8a4ef0e3dd45e7fafd83c425d08` |
| `command-source-assertion-pg.spec.ts` | `d0b03ae718a9aa319fbbaadfe57bfb55ec450774afd9711f430bf6ced5108586` |
| `test-elp2-restore-inventory-rls.sh` | `38f16c00667ffda498361abac077e093d444481f4789285ef801123f1dcc986f` |
| `test-elp2-restore-checkpoint-pg.sh` | `45028c599dcd421f23ac9ff0d016feafbb536520e98d21fa5d26627b98c44a18` |

## Remaining / next owner

Core must still complete independently held monotonic checkpoint and old-holder
fencing, full post-snapshot source terminal/ACK reconciliation, and a restore
rehearsal; issuer and restore remain fail-closed. Edge remains the only source
coordinator for genuine original/ACK and P7/A2 commissioning. Read-only Edge
worktree inspection this turn found no later matching Core handoff than the
existing 2026-11-05 checkpoint; this is not proof no other remote state exists.
No frontend contract/action. Candidate freeze, impacted tests and one normal
hook remain necessary before landing. Rollback is no install; never fabricate
or delete an ACK to satisfy the check.
