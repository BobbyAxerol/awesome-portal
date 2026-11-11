# C2 financial / STATUS issuer workspace fence — 2026-11-06

**SOURCE WIP ONLY; unmounted.** Baseline: `docs/research-loop-plan` at
`2faa8968fddbde59b2e59525e334ba3d83886144` plus the shared dirty worktree.
This is neither a committed reproducible candidate nor source/field authority,
HTTP custody, an installed runtime, genuine Edge ACK, A2 readiness, or a phase
exit. No frontend or public contract/schema was changed.

## Scope and finding

The unmounted financial adapter accepts only an internally selected owner,
Paper workspace, workload and six explicit paths; it hashes the exact request
bytes, rejects a changed actor/binding/path/query and uses the custodied issuer
to issue, resume the same lease and revalidate. Selection must still be supplied
by an independently authenticated and qualified caller; these six test paths
are not a source catalogue. Selection objects/arrays with accessors or proxies
are rejected and path values are copied at construction.

The first workspace regression showed that a misconfigured adapter could be
constructed with workspace B while its issuer's installation was workspace A:
the issuer derives the actual workspace from its own configuration. The adapter
now verifies exact Paper workspace **and** workload against that installation
both at construction and on each operation. The unmounted STATUS adapter uses
the same configuration-identity check. This is a consistency fence, not a
grant, an owner authentication, an expiry extension or field authorization.

## Verification

- Before the fix, the isolated two-PostgreSQL owner-intent suite returned
  **5 PASS / 4 FAIL**: the new mismatched-workspace assertion did not throw;
  three later tests also failed after the shared setup test stopped early. Do
  not count the latter as independent security findings or as passing tests.
- After the fix, the same harness returned **9/9 PASS**, exit 0. It includes
  mismatched workspace/workload constructor negatives for financial and
  STATUS, financial request/actor/path/query negatives, exact-lease resume and
  synthetic revalidation. It uses test identities, keys and source; a new
  adapter instance in the financial case is not an OS-restart receipt.
- Strict source-only TypeScript check for both adapter roots and their imports
  passed with Node old-space limited to 768 MiB. This is not the test-inclusive
  typecheck, full build or normal hook. An earlier attempt to wrap the harness
  in an additional `flock` self-conflicted with its own lock and exited 1
  before starting the cell; it is not a test result.
- The harness uses two disposable PostgreSQL clusters with synthetic data,
  bounded to 2 CPU / 1.5 GiB aggregate; actual peaks NOT_MEASURED. Its exit
  trap removed the exact test resources, and a read-only root-Docker container
  listing for `elp2-c2-p7-` returned no remaining containers. The first
  non-root Docker listing was denied. Root filesystem after test: 250 GiB free.

## Direct working-file pins

| File | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `2ffa5a5c9d7a7a01cf5560c559e8c31129d9119c9e7556bfbc0183fcb0203941` |
| `c2-financial-authority-adapter.ts` | `71b2db58505933fe47b4c54deb4643cc46deb7079f1c2673edc9e13bf6a7e4a4` |
| `c2-command-status-authority-adapter.ts` | `a35a33c3fcb406c53af13f5ead2fc526f61044ba83feb67336cb8ffec88eaa19` |
| `c2-custodied-issuer-candidate.ts` | `7ddbe383142ccd24692e8ef936030890040e3f9551bb8f51953837768bc1f98f` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `01c81a421876034a0cdc7d2c656d431f1369891ece971e081e103ad68bdc7f42` |

These are direct hashes, not transitive dependency pins or a frozen image.

## Remaining and handoff

Financial still needs durable context/original/lease correlation, qualified
selection and field authority, a sole HTTP custody path and genuine Edge
terminal/APPLIED/ACK. STATUS still needs runtime authority/egress and real
original/ACK. Independent P7 owner authentication, A2, anti-rollback and
old-holder fences, V2 restore, candidate review and normal hook remain open.
Do not mount this adapter or replace the existing C2 fail-closed composition.
No new frontend field or Claude action is required; fixture/browser acceptance
does not qualify these backend gates. Edge is the upstream coordination point;
no new source input or connected PASS is asserted here. Rollback is to retain
the existing unmounted/fail-closed runtime configuration.
