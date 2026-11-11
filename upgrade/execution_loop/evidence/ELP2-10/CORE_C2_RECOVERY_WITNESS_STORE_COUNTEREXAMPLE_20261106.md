# Recovery V2 — durable witness candidate and rollback counterexample

**SOURCE/TEST ONLY. NOT AN INDEPENDENT ANTI-ROLLBACK AUTHORITY, RESTORE
PERMIT, INSTALLED SERVICE, OR ELP2-10/11 PASS.** Branch
`docs/research-loop-plan`, committed HEAD
`2faa8968fddbde59b2e59525e334ba3d83886144`; changes remain in shared WIP.

## Goal and candidate

The earlier fresh-witness consumer had no producer. The new unmounted
producer stores a verified signed closed head in a third PostgreSQL system,
requires separate pinned source/authority/witness system identifiers and an
independent Ed25519 key, signs only its own stored head in response to an exact
nonce challenge, and bounds transactions and proof validity. The authority
reader now checks that a newly observed head's verified event chain contains
the witness's exact previously recorded generation, event hash and operation;
a higher generation on a divergent branch is not accepted. Storage returns
`STORED_NOT_CUTOVER`, never permission to restore. No API, runtime, credentials,
public contract or migration was installed.

## Verification and important counterexample

- Three disposable PostgreSQL systems, ephemeral test keys, final focused
  `bash scripts/test-elp2-restore-checkpoint-pg.sh witness`: **4/4 PASS**.
  Assertions cover exact head persistence, producer reconstruction, invalid
  signer/cluster/nonce, same-head retry after a simulated lost COMMIT response,
  rejection after authority-only rollback, and rejection of a higher generation
  on a rewritten fork that lacks the stored exact ancestor.
- The fourth test deliberately rolls **both test-only stores** back to the same
  old head. A fresh signed read then succeeds with `FRESH_SIGNED_NOT_CUTOVER`.
  This is an expected **counterexample**, not a successful DR gate: a separate
  DB and signing key do not stop a privileged store rollback, or establish a
  monotonically held external head. Do not activate V2 restore on this basis.
- `bash scripts/test-elp2-restore-checkpoint-pg.sh authority`: **8/8 PASS**
  for the changed authority reader's existing disposable two-PG suite. Prior
  23/23 cited elsewhere is a broader historical suite, not this run.
- Focused strict TypeScript check of the witness test and imported modules:
  exit **0** after correcting constructor control-flow. The first check exited
  **2** with TS2564, which was fixed; it was not treated as a pass. The initial
  witness run was **1 PASS / 1 FAIL** because its expected refusal code differed
  from the authority reader's actual fail-closed code; the test expectation was
  corrected and the real divergent-history case added. Final 4/4 above is the
  retake, not an extra four product acceptance scenarios.
- Each three-PG cell was bounded to three times 0.3 CPU / 256 MiB plus Node
  1.1 CPU / 768 MiB; actual peaks **NOT_MEASURED**. Its exact test containers
  and internal network were cleaned by the script; a read-only post-check found
  no `elp2-ckpt-` containers/networks. `/home/bobby` filesystem: 266 GiB free,
  58% used at the read-only capacity snapshot.

## WIP pins (SHA-256)

| File | Hash |
| --- | --- |
| `restore-checkpoint-witness-producer-candidate.ts` | `565101a5a44f2e7e8db014b1d616dbbb9132a46c6deb26120206198ad4327160` |
| `restore-checkpoint-witness-store-candidate.sql` | `39e44a2baf40f6d36b77727063457669b9547ae0b38039ee4bb9fb69cf115b52` |
| `restore-checkpoint-authority-reader.ts` | `5a36b7d02862639f521488d38ea7edd09cd17fd0627925a2582012c7419d7504` |
| `restore-checkpoint-signed-anchor.ts` | `68288602f90d323442537845c709ae2fb68ec419e6cb4ff6ed00af20fd6801ae` |
| `restore-checkpoint-witness-producer-pg.spec.ts` | `34a4d4cc24bf228c55b920447ffda68df0d6d539e4b6e2833bfd63cf89070d6b` |
| `restore-checkpoint-authority-pg.spec.ts` | `ef7de1fa6466763ace784af769a3f794250eac0aa5f89a511e77014f7367909f` |
| `scripts/test-elp2-restore-checkpoint-pg.sh` | `992632502189ffec38a8af2fd7cc8f467138bd40a47127dc791924779773c3c6` |

## Next work, exit and rollback

Core must design and qualify an independently controlled monotonic head/key and
transport against coordinated rollback, fence old holders and new writes,
reconcile genuine post-snapshot source terminals/ACKs, and rehearse an actual
representative restore. P7 owner/source trust, full A2/B2 prerequisites,
connected acceptance, integration review and final gate remain open. A fresh
signature or an unchanged test hash is not source authority. Rollback is to
leave these candidates unmounted and retain the existing V2 restore refusal.
No frontend field or Claude consumer action is introduced.
