# P7 candidate — stalled witness and source lock release

**SOURCE/ISOLATED TEST ONLY.** This is not installed owner authority, a real
revocation receipt, A2/B2, connected Edge acceptance, restore qualification,
or a phase PASS. Checkout `docs/research-loop-plan@2faa8968fddb` plus shared,
unfrozen WIP.

## Change

The candidate signer sets PostgreSQL `idle_in_transaction_session_timeout` to
2 seconds in its source transaction. If the source session is idle while the
independent witness operation stalls, PostgreSQL can terminate it and release
its locks; the later source revalidation/COMMIT must still succeed or the
confirmation rejects. Custody now observes asynchronous errors on its checked
out source client and discards a failed client. The same original reservation
and witness are retained; no replacement intent or grant is created.

This timeout applies only to **idle** transaction time, not an absolute
end-to-end SLA or a replacement for network deadlines, lock ordering, owner
authority or old-holder fencing. A witness store commit can remain ambiguous
after source termination; the retained witness is not authorization and its
consumer must revalidate current owner, source and revocation. The source
client callback is internal trusted composition, not a boundary for plugins or
HTTP callers. Recheck the availability cost of the fixed 2-second value under
the approved production workload before considering commissioning.

## Evidence

- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`, two disposable PG
  systems, synthetic identities/source: **9/9 PASS**, exit 0. An isolated
  witness INSERT trigger delayed that store for 2.7 seconds while signer held
  source locks. A separate transaction acquired and updated the synthetic
  session with a 5-second statement limit; the stalled confirmation rejected
  and the same witness remained identifiable. The session update was then
  **rolled back** to preserve this suite's shared synthetic setup. It proves
  lock acquisition and refusal under this test, not a committed real revoke,
  a specific measured latency, or end-to-end source behavior. Existing P7
  negative, lost-write and max-one source-pool cases also passed. The nine
  tests overlap previous receipts and are not additive product coverage.
- Strict TypeScript for the two changed source roots: exit 0. A larger
  test-inclusive strict `tsc` attempt with 1,536 MiB heap timed out at 90s,
  exit 124; it is **not PASS**. After the test run, its revoker variable was
  changed from an overloaded inferred connection type to explicit
  `PoolClient`; this is type-only and did not change executable test logic.
- Test script configured an aggregate maximum of 2 CPU / 1.5 GiB; actual
  peaks were NOT_MEASURED. Its exact-name cleanup ran and a read-only Docker
  check found no remaining `elp2-c2-p7-` test containers/networks. No shared
  service, database, credential, UI or Edge runtime was changed.

## Pins

| Input | SHA-256 |
| --- | --- |
| signer source | `70800ea512b6334b3b5a922ca46485d61c07c4d339a6f7c6d614cff988502081` |
| custody source | `2447f856f9fef9f1afb4cef43bfa3a626eaa761ba13a69761709c5fafd00b3a2` |
| executed test, before type-only annotation correction | `7da934c10d04646948ffacdc674e4c95dde9066fc21add5ae0c9b033c06c342e` |
| current test after type-only annotation correction | `e22803ed7da018f5468b1edec90f2d58eadc50d03f6ae8207226fa9b9f2f7135` |
| test script | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Remaining

Test committed revoke and expiry with an independently authenticated source,
authority timeout/ambiguous commit, process loss and bounded concurrency;
qualify exact source-client/role/key boundaries. Complete independent P7 and
recovery authority, reconcile real Edge original/terminal/ACK, and review and
freeze WIP before affected gates and the normal hook. A2 NOT_READY,
B2 NOT_SIGNED and ELP2-10/11 remain open. Rollback: leave candidate unmounted
and V2 restore refused. No new frontend contract or consumer action.

## Follow-through — committed synthetic session revoke via HTTP

The same two-PG suite now also exercises the actual Nest/Fastify handler via
in-process injection: after a successful synthetic owner confirmation, a
retry using its same attestation and intent is delayed in the independent
witness DB. Once the store is observed sleeping, a separate Core PG statement
updates and **commits** the synthetic session to `REVOKED`. The delayed HTTP
request does not return 200; the session reads REVOKED, direct same-intent
signer retry is refused, later HTTP retry is 401 and the intent count does not
increase. This is a committed mutation only in the disposable test DB, not a
real user/Edge revocation, network browser receipt or independent owner proof.

Retake: `bash scripts/test-elp2-c2-p7-pg.sh owner-intent` **9/9 PASS**, exit
0; includes earlier max-one and rolled-back revoke cases. These nine overlap
earlier runs. Test hash
`3c8a9010932b885a01e165a24ba3449d21c23483105f9d907213fa1c5a31a0c9`;
signer, custody and test script remain at the source/script pins above. The
configured cell cap remained 2 CPU / 1.5 GiB, actual peaks not measured;
filtered Docker inspection found no remaining cell containers/networks.
No source implementation or runtime changed in this follow-through.

The witness in this case existed before the stall; test a first-write
ambiguous COMMIT, retained-witness/issuer races, expiry, process loss and
independently qualified principal separately. The test-inclusive compiler
timeout above has not been retaken. No A2, B2, V2 restore or phase PASS.

## Follow-through — first witness commits after synthetic revoke

The isolated suite now creates a distinct reviewed cycle with no witness,
delays its first witness INSERT, and commits revocation of the synthetic owner
session in the source PG while the independent authority PG is sleeping. The
original signer call fails after source session timeout, but the authority
store **does retain the first witness**. The test retrieves that exact witness,
constructs the authenticated issuer fence and verifies that the revoked owner
is refused; retrying the signer is also refused, and the intent count remains
exactly one higher than before the first attempt. The prior successful HTTP
confirmation and post-revoke HTTP 401 are also exercised, via in-process
Fastify injection. This tests a dangerous ambiguous outcome, not live source
authority, a real operator, installed issuance or a genuine Edge receipt.

Retake `bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0
on two disposable PGs, with the new first-write case and existing negatives.
This suite overlaps earlier nine-case receipts; do not add the counts. Test
SHA-256 `9368d82f0634306eb97bf7b7549a2632510136182ff7f3cf384e67cda15f790d`;
signer/custody/script hashes remain as in the pins above. Configured cap 2 CPU /
1.5 GiB; actual peaks not measured. Filtered Docker check found no remaining
`elp2-c2-p7-` containers/networks. No shared DB, runtime, credential, UI or
remote service was changed. The test-inclusive compiler timeout has not been
retaken after this edit.

Still required: independently authenticated owner and source; first-write
process-crash/restart and physical old-holder fencing; source/terminal/ACK
reconciliation and final migration/runtime/Edge qualification. Never use a
retained signed witness alone as a grant. A2 NOT_READY, B2 NOT_SIGNED and
ELP2-10/11 OPEN; keep P7 issuer and V2 restore fenced.
