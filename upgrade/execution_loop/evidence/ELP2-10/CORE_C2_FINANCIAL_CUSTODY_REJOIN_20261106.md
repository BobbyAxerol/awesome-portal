# C2 financial — rejoin a known custody-pending original

**SOURCE/TEST WIP ONLY; NOT MOUNTED.** Checkout
`docs/research-loop-plan@2faa8968fddb` has shared uncommitted changes. No
runtime, real source, credential, permission, migration or frontend was changed.

## Gap and implementation

The C2 issuer can retain an exact lease even when independent custody append or
revalidation fails; it reports `C2CustodyPendingError` without returning a
bearer. The financial authority previously cached that failure forever even
though its C2 adapter could resume the existing lease. The new test reproduced
this failure before the change (**1 FAIL / 55 SKIP**).

The unmounted inner adapter now exposes its existing same-lease resume method.
For an explicit custody-pending error with a valid lease, financial authority
remembers that original within the current context and coalesces concurrent
exact-request retries to the pinned resume method. It validates the returned
lease and all assertion binding fields, rechecks the current context and
authority, and counts recovery against the pending-work bound. Different
request bytes, a different lease and retired context refuse. Generic ambiguous
errors do not guess a lease or trigger another issuance. The adapter still has
no terminal capability; this change does not synthesize completion or ACK.

This is **same-process recovery only**. Context and delivery remain in memory;
after process loss, the authority still refuses the vanished context. It is
not durable correlation, cross-process fencing, sole HTTP delivery custody,
qualified owner/source/field authority, a genuine terminal or an Edge ACK.
The public C2 composition remains fenced, and no runtime or gate is opened.

## Verification and cleanup

- Financial assertion/transport/composition: **3 files / 153 PASS** on
  synthetic/loopback inputs. A later changed test file retake was **58/58**,
  including the added retirement-during-resume negative; the counts overlap.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, two
  disposable PG clusters. The added case holds the custody head lock until
  the real candidate has created a synthetic lease and reports pending, then
  releases it; financial authority resumes exactly that lease and the
  independent test custody inventory contains one matching original. This is
  neither a real source nor an OS-process restart or Edge receipt.
- Focused strict source-and-assertion-test TypeScript check: **PASS** with
  768 MiB Node old-space. It does not include the large PG test file, a full
  project typecheck, normal hook, runtime or migration qualification.
- The PG script sets an aggregate ceiling of 2 CPU / 1.5 GiB; actual resource
  peaks were not measured. Its exit trap removed its test containers/network;
  read-only filtered Docker inspection found none afterwards.

| Working file | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/financial-source-assertion.ts` | `e5dbf6d7c38e2f05f3d23805ed95be5f72070900f2dae366420bb143f6ecaeda` |
| `apps/control-api/src/execution-v2/c2-financial-assertion-inner-candidate.ts` | `43489f47bfacd01f97d0b4608664c7e828bdb8ba9814dba9aa4bdf8de4400fe1` |
| `apps/control-api/test/financial-source-assertion.spec.ts` | `c72542655ab1c8a22bb24a8a0344da413e6386e54b0de1d542a9c5c456e89052` |
| `apps/control-api/test/c2-p7-owner-intent-candidate-pg.spec.ts` | `6051c84ab1b62d1c5a23fd284c2a07782ac1418553ab0323c9c64f653848ccc2` |

Direct hashes supersede the corresponding older receipt pins, not a frozen
candidate/image or transitive dependency hash. Core still must persist and
fence context–original–lease across process loss, establish independent
authority and sole HTTP custody, reconcile genuine source/Edge terminal and
ACK, and qualify V2 restore. No public contract or frontend action changes;
Claude may continue the existing fixture work. Rollback: leave the candidate
unmounted and retain existing fail-closed C2 and restore guards.
