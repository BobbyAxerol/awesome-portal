# Recovery V2 — checkpoint guard function drift, 2026-11-06

**SOURCE/TEST CANDIDATE ONLY. NOT A RESTORE BARRIER OR CONNECTED PASS.**
On `docs/research-loop-plan@2faa8968f` plus shared uncommitted WIP, the
checkpoint reader checked that both journal triggers were enabled and pointed
to the expected function OID. A privileged `CREATE OR REPLACE FUNCTION` can
preserve that OID while changing the function body. A disposable PostgreSQL
test replaced the body with a no-op: the reader incorrectly accepted the same
unchanged journal. The added negative made the suite **22/23**, reproducing the
problem without changing a persistent database.

The unmounted reader and writer candidate now fail closed when the referenced
function body or relevant language/security/volatility attributes differ from
the pinned candidate guard. Both the journal and closed-observation checks
in the writer apply it. The regression checks a replaced no-op against reader
and writer, rejects a `SECURITY DEFINER` variant at the reader, restores the
original function and confirms the reader still accepts its unchanged head.
The first attempted check rejected the valid body because PostgreSQL `btrim`
without a character set does not remove the initial newline; that run was
also **22/23**, was corrected, and is not counted as PASS.

## Verification and cleanup

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: final **23/23** across
  three suites using two disposable PostgreSQL clusters. These results overlap
  earlier checkpoint receipts and are not additional independent coverage.
- Focused strict TypeScript check of both modules and the PG test: **exit 0**.
  A prior full typecheck applied before these source/test edits; rerun the
  appropriate full gate on the final integrated candidate.
- The isolated runner's cleanup trap removed its own resources; a name-filtered
  read-only Docker container check found no `elp2-ckpt` container. Free disk:
  269 GiB. Actual peak CPU/memory were not measured.

| Candidate source or test | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority-reader.ts` | `7442b3ce7e585bb731d3210e282ee31fd31a638037f409cf4c026fcbcc95e7c9` |
| `apps/control-api/src/execution-v2/restore-checkpoint-authority.ts` | `18105232d8661bce184344be89252e46a7c34efae4b661fef441aa8196c8f055` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `ef7de1fa6466763ace784af769a3f794250eac0aa5f89a511e77014f7367909f` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `6cb5ec3096b69873b1b1b5d78d620b108f5e29e3b2606ce51ff5214a20604bf7` |

## Remaining boundary and handoff

This is detection at the check, **not a lock on function DDL**. A privileged
actor may replace a function after it is checked; table locks alone do not
qualify protection of `pg_proc` or an independent authority. Writer role/DDL
privileges and independent signer/witness, old-holder/source fences, complete
post-snapshot terminal/ACK reconciliation and real V2 restore remain open.
Other custody and upgrade paths using similar trigger checks were not changed
or qualified by this slice. Continue to refuse V2 restore and keep issuer
unmounted. No frontend contract/action or runtime activation is requested.

## Follow-through: original/source-proof custody

The independent custody candidate had the same trigger-OID-only check. Its
preflight and authoritative append now also compare the exact candidate body
and relevant security attributes of **both** `immutable_event()` and
`immutable_source_proof()`. A disposable test replaces each function in turn
with a no-op without changing its trigger, checks that preflight and append
both refuse, restores the function, and checks normal preflight. Existing
same-original restart/retry and custody tests remain in the run.

`bash scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS** on two
disposable PostgreSQL clusters. Counts include the new assertions within an
existing case; they are not extra independent tests. The test connects with
the disposable database owner; it does not qualify a restricted runtime role.
The runner cleaned its
own resources; a subsequent name-filtered Docker container check found no
`elp2-custody` container. Actual resource peaks were not measured.
Focused strict TypeScript check of the custody module and its PG test: **exit
0**; despite the focused entrypoints, their import graph took several minutes.
The full typecheck and normal hook have not been rerun after these edits.

| Follow-through source or test | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-independent-custody-candidate.ts` | `40317432d32ee88637ff550ca73cd05e28bfe26c30209b4a7931b8a7cb949cb5` |
| `apps/control-api/test/restore-independent-custody-candidate-pg.spec.ts` | `559629a4236bb0f1ff053b388458053b378d1fdde4977ca38b5353e7aa4a0744` |
| `scripts/test-elp2-independent-custody-pg.sh` | `83a59ce01c88d510b8a9aa90163b395fc5f8de3c498f457ff743c8eb269522d6` |

These checks do not prevent a concurrent privileged function replacement
after inspection, establish independent custody, or supply a source ACK.
The earlier statement that custody was not changed applies only to the first
slice; this follow-through does not qualify the other upgrade paths. No schema,
frontend, shared runtime or production data was changed. Full integration,
P7/owner authority, independent recovery and Edge qualification stay open.
