# Recovery V2 — externally attested exact-ancestor floor candidate

**SOURCE/TEST ONLY. Not installed, not an independent monotonic service, not a
restore permit, and not ELP2-10/11 qualification.** Checkout
`docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144` plus
uncommitted shared WIP. No live DB, credentials, frontend, Edge or runtime changed.

## Finding and implementation

The [previous counterexample](CORE_C2_RECOVERY_WITNESS_STORE_COUNTEREXAMPLE_20261106.md)
showed authority and witness stores restored together can produce matching fresh
signatures for an old head. The new **unmounted** consumer requires a separate
Ed25519-key-pinned floor issuer to answer fresh nonce challenges before and after
the existing signed authority/witness read. It checks issuer, audience, exact
checkpoint/source/authority pin, expiry, both matching floor tuples, and a
different public key from both other signers. The full `(generation, event hash,
operation id)` floor is captured before asynchronous work and must occur in the
verified authority history; generation alone is insufficient. A newer head is
permitted only when its actual verified chain contains that exact ancestor.
Neither the old witness reader nor the new consumer grants cutover.

**Critical limitation:** an additional signature does not establish independent
key custody or a monotonic store. The floor signer and its storage were synthetic
in the test; if the third signer/store also rolls back or lies, the protection
does not hold. There is no commissioned independent service, selected trust,
source/old-holder fence, atomic restore cutover, real terminal/ACK census, or
permission to restore. The older witness-only method remains observable but is
not a valid V2 restore authorization. Keep the existing fail-closed guard.

## Verification and cleanup

- `bash scripts/test-elp2-restore-checkpoint-pg.sh witness`: **4/4 PASS** in
  three isolated PostgreSQL clusters and ephemeral keys. The same four test
  cases include valid initial and descendant head, distinct key requirement,
  bad signer/nonce/replay, changing floor between challenges, and the prior
  coordinated rollback: witness-only observation still accepts the old head,
  while the independently retained newer floor rejects it. This is synthetic
  signer behavior, not proof of a real third trust domain.
- Focused strict `tsc --noEmit` of the witness test and imports: exit **0**.
  Its first attempt exited **2** with constructor definite-assignment errors;
  throwing directly in invalid constructor branches corrected the issue. The
  test did not replace a full project typecheck or normal hook.
- The first test attempt was refused by the sandbox's `sudo` restrictions;
  the explicitly authorized escalated disposable test completed, retaken after
  adding negative cases. Both completed test cells self-cleaned. Read-only
  `sudo -n docker` checks found no `elp2-ckpt-` containers or networks. Disk
  `/home/bobby`: 266 GiB free, 58% used. Actual peak resources not measured;
  the script's configured aggregate maximum is 2 CPU / 1.5 GiB.

## Exact WIP source pins

| Path | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-fresh-witness.ts` | `a6339f4a247d877519ed929736741f2d3186c97598e1fc8d772a9094515a36a5` |
| `apps/control-api/src/execution-v2/restore-checkpoint-independent-floor.ts` | `0c4641074abe45def23648ba50a005cad85561237bbe24961d28b4916c2815a6` |
| `apps/control-api/test/restore-checkpoint-witness-producer-pg.spec.ts` | `52ec3e2573758095836b5d659e1b10260826fc19ba42f3751dd0d0b9a8dade17` |

These are working-file pins, not a frozen candidate, image, config or installed
service. Next Core work: qualify a genuinely independent monotonic floor and key,
fence old holders/source/HTTP, reconcile genuine post-snapshot terminals and ACKs,
and rehearse actual restore. Complete C2 STATUS/P7/custody, A2 and the integrated
candidate separately. No frontend contract or consumer change in this slice;
Claude does not need to change UI. Rollback is to leave the new candidate unmounted,
preserve custody and continue refusing V2 restore.
