# Financial parent orchestration — unmounted candidate

**SOURCE/TEST ONLY; NOT INSTALLED.** Checkout `docs/research-loop-plan` at
`2faa8968fddbde59b2e59525e334ba3d83886144` plus shared WIP. This is not an
Edge acceptance, real source grant, authenticated recipient ACK, V2 restore,
or closure of ELP2-05/10/11.

## What changed

The preceding encrypted-parent test explicitly called save, locate and
recovery in the harness. The new candidate coordinates these steps:

1. `begin` captures the exact actor/selection, registers privately, persists
   the encrypted parent under the caller's stable operation UUID, and only
   then makes that operation usable for ISSUE. A failed or ambiguous save
   refuses admission; it does not create a replacement operation.
2. `restoreFirst` captures and validates the exact request, loads the parent,
   derives its existing lease, and uses the authority's current P7/session/
   custody revalidation to rejoin that original. A saved parent without a
   bound ISSUE is not permission to create one during recovery. Wrong actor,
   request, binding or workspace is refused. Successor still requires the
   separate authenticated completion contract and is not enabled here.
3. The synthetic child now issues through this candidate; after SIGKILL the
   parent constructs the candidate again and calls `restoreFirst` without
   supplying a context or lease. The test coordinator already knows the UUID.

The candidate is not imported into a production composition. The actual
coordinator must persist the operation UUID, ensure sole issuance/HTTP custody,
fence an old live process, qualify the independent key/store/DB role and
retention, and reconcile actual Edge terminal and ACK. A caller with the UUID
is not thereby authorized; saved state is not owner acceptance. A crash after
an ambiguous parent write but before ISSUE can remain unavailable rather than
create a replacement. DB rollback and actual V2 restore remain unproven.

## Verification

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0,
  108 seconds, two disposable PostgreSQL clusters. The changed scenario checks
  save-before-ISSUE, same original/digest after child SIGKILL, a real DB
  limit-mismatch save refusal, wrong actor/request, missing bound ISSUE, no
  duplicate lease, and refusal of a successor without authenticated completion.
  Source and identities are synthetic. The initial sandbox-only invocation
  could not access Docker/sudo; the approved isolated test ran outside that
  sandbox. This is one test run, not connected acceptance.
- Financial and command assertion unit files **145/145 PASS**, exit 0; focused
  strict source typecheck and child `node --check` PASS. The first typecheck
  reported an uninitialized private field; constructor control flow was fixed
  and the same focused check passed. `git diff --check` passed before this
  documentation update. No full integration hook was run.
- Script resource ceilings were 2 CPU and 1.5 GiB combined; actual peak was
  not measured. The script's cleanup ran and a read-only Docker inventory
  found no matching test containers or networks. No runtime, live database,
  permissions, UI or Edge state was changed.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/c2-financial-parent-orchestrator-candidate.ts` | `a413c72dbee1e314bb6585a2c4a36bb0d69024a27dd3e606a35af34bfdcec5d7` |
| `apps/control-api/src/execution-v2/c2-financial-parent-candidate.ts` | `41294c45c64efa139cac1e9097dbf0d87f5c5cb9bcecead3d1b26c4093edd981` |
| `apps/control-api/src/execution-v2/financial-source-assertion.ts` | `93dfc714e25b985e0430077ea4e4d14d6d10558e7adba6be58cb3ae61f2a2222` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `db48ecd98a0e713ce1ac2105cbbd0d922069bf2b9b0b464e213881ed30224a98` |
| `apps/control-api/test/fixtures/c2-status-p7-restart-child.cjs` | `45761943e0538a29c5d41a9b6e54edb9752e708a51cb2c631d94b53bc7409e2e` |

These are shared working-tree hashes, not a commit, deployed image or schema.
No frontend contract or action is requested. Rollback is to leave this code
unmounted and keep the existing fail-closed runtime and V2 restore refusal.
