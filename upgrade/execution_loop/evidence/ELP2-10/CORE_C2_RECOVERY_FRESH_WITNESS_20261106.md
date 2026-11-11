# Recovery V2 — fresh witness preparation, 2026-11-06

**SOURCE/TEST ONLY; UNMOUNTED. NOT AN ANTI-ROLLBACK QUALIFICATION OR A
RESTORE PERMIT.** This follows [signed anchor preparation](CORE_C2_RECOVERY_SIGNED_CHECKPOINT_ANCHOR_20261106.md).

## Why and what changed

The prior signed anchor can be replayed within its validity period against a
rolled-back authority DB. `RestoreCheckpointFreshWitness` adds an unmounted
consumer protocol: it generates fresh random 256-bit challenges before and
after the journal read, requires bounded canonical Ed25519 responses from a
separately pinned public key, and compares both exact generations, event hashes
and operations against the signed anchor and actual journal read. It checks
source/authority cluster IDs, checkpoint, issuer/audience, time, nonce and key;
refuses the same key as the
anchor signer; bounds and aborts the request; and snapshots the caller's anchor
bytes before invoking the asynchronous request. It returns only
`FRESH_SIGNED_NOT_CUTOVER`. The signed anchor also now turns a malformed
generation into its typed invalid response instead of a thrown `BigInt` parser
error. No API, DB schema or runtime configuration is changed.

The witness request is an injected interface, **not an implemented or
commissioned witness service**. Different keys do not establish separate
operators or storage. A signer that signs a stale head, or a rolled-back
witness store, can defeat this check even with a fresh challenge. A new head
can also appear after the second response: this observation is not a fencing
or cutover protocol. The signer
must independently read and protect a monotonic head, with qualified clock,
transport, access, key custody, durability and anti-rollback. The wrapper
does not independently fence old holders, establish a complete source and ACK
census, or prove the source DB is closed. The current V2 restore refusal and
P7/issuer startup fences remain unchanged. In particular, no signed test
envelope is an owner approval, Edge response or operational restore authority.

## Tests, cleanup and pins

- `bash scripts/test-elp2-restore-checkpoint-pg.sh`: **23/23** across three
  test files on two disposable PostgreSQL clusters. The existing migrated
  candidate-schema case now tests an ephemeral second key, valid challenge,
  replayed witness, wrong key, changed head in either direction, malformed
  generation, wrong operation/audience, expired witness or anchor, same signer
  key, wrong selected pin, request timeout/abort, concurrent mutation of the
  caller's anchor bytes, and a head that changes between the two challenges.
  These are assertions inside the existing case, not additional independent
  test counts. The final run exercises both pre- and post-read checks.
- Strict focused TypeScript check of the new module and PG test: **PASS**.
  The first typecheck exposed definite-assignment errors in the constructor;
  they were corrected before the final retake. `execution-tracking-test.sh`
  and tracked `git diff --check`: **PASS**. The latter does not check the
  untracked candidate files. Full typecheck and normal integration hook were
  not run on the unfinished candidate.
- The test harness bounded each PG container to 0.4 CPU / 320 MiB and Node to
  1.2 CPU / 896 MiB; actual resource peaks **NOT_MEASURED**. Only its own named
  containers/network were removed; post-run name-filtered Docker checks were
  empty. An initial sandbox run could not access the Docker socket; the
  authorized isolated rerun produced the result above.

| Uncommitted source/test | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/restore-checkpoint-fresh-witness.ts` | `a03624ee7b9b270dd369ccd78f2e41c051062b30e6b2398ccaae76695c9722e5` |
| `apps/control-api/src/execution-v2/restore-checkpoint-signed-anchor.ts` | `4dc2aa35c433dce900595cb7d2658b32aa5bf3fb00cf499525715b502e99f598` |
| `apps/control-api/test/restore-checkpoint-authority-pg.spec.ts` | `9144af39058d98893f912bb629037677fe1ae82201fa5d6574f05387feaf2963` |

## Next, exit and handoff

Backend must implement and qualify the genuinely independent current-head
authority, fence old holders and reconcile source terminal/ACK after snapshot;
then review and rehearse the integrated candidate. P7/A2, real Edge connected
gates, ELP2-10 and ELP2-11 remain open. Rollback is to leave this candidate
unmounted and retain the V2 restore refusal. No frontend field or Claude
consumer action is introduced.
