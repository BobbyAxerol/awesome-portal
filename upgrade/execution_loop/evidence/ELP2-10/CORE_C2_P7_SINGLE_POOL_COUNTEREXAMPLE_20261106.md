# P7 owner confirmation — single-source-pool counterexample

**OPEN AVAILABILITY DEFECT; TEST ONLY.** Branch `docs/research-loop-plan`,
committed HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`, plus shared
unfrozen WIP. This is not an owner approval, commissioned issuer, A2, B2,
source authority, V2 restore, or connected acceptance.

The current candidate keeps a source transaction and its authority locks while
calling independent witness custody. Custody in turn checks source system ID
with `sourcePool.query`, borrowing a second connection from that same pool.
The constructor accepts a one-connection source pool. On that configuration the
retry of an existing signed synthetic intent times out: the caller holds the
only connection it needs to complete the custody call. Larger pools can still
be exhausted by concurrent requests. The failure is fail-closed, not evidence
of a forged grant, but the lock can delay a concurrent revocation. Neither a
larger arbitrary pool nor disabled verification is an adequate final fix.

## Verification

- Added a real-PG counterexample to the existing owner-intent test. After the
  normal synthetic witness is retained, it reconstructs the entire reviewed
  selection with the same original, custody/key and a separate `max: 1` pool;
  the same authenticated retry rejects on connection timeout and the retained
  original remains retrievable. The assertion deliberately expects the defect;
  green here does **not** mean the positive retry works with that pool.
- `bash scripts/test-elp2-c2-p7-pg.sh owner-intent` exited 0: **9/9** test
  cases, including the expected-failure counterexample. The test uses pinned
  public B1 inputs and two disposable PostgreSQL clusters, synthetic actor,
  attestation and source. It does not qualify actual authority. Aggregate
  configured maximum was 2 CPU / 1.5 GiB; actual peaks were not measured.
- The script's cleanup ran on exit; a read-only filtered Docker inspection
  found no `elp2-c2-p7-` test containers or networks. No shared DB, runtime,
  user, grant, key, UI or Edge service was changed.

| Working file | SHA-256 |
| --- | --- |
| `test/c2-p7-owner-intent-candidate-pg.spec.ts` | `557372502326374d55a7db04cfdec5e12fd1137de3d9810d43c1d3cc451a74ed` |
| `src/execution-v2/c2-p7-owner-confirm-signer-candidate.ts` | `ccb01490845282273f6b685052dbd35d10f30059834762c1511deb9f620c20b1` |
| `src/execution-v2/c2-p7-owner-witness-custody-candidate.ts` | `7e8031832ffe2cd67b5d9f3c0f0f95004d12665e91b03b8f51cafc7602920982` |
| `scripts/test-elp2-c2-p7-pg.sh` | `daa31f5783e43c1812dc355ab0a3e9e505aa54b3ca3b347ae544c9f3e15f60da` |

## Required follow-through

Remove nested source-pool acquisition and avoid holding authority/session
locks over an unbounded independent-store call **without weakening** exact
source verification, current-owner/revocation checks, one-intent recovery or
witness publication fencing. A redesign that simply commits and publishes a
witness before revalidation must account for another process consuming that
witness concurrently. Retest one-connection and saturated pools, concurrent
revoke, expiry, process loss and same-intent retry with real isolated PG before
mounting. The test must then be changed to assert successful safe retry, not
continued timeout. Continue to keep issuer/P7 unmounted and V2 restore refused.
No frontend contract or consumer action is requested.

## Follow-through — source-only single-pool repair

The unmounted custody candidate now owns the source checkout and supplies the
signer a single-use retention callback that checks the system identifier on
that exact source connection. The signer no longer borrows a second connection
while it holds the source transaction. The callback is invalid after checkout
completion, and an outstanding retention settles before the source connection
is returned. Existing signature, reservation, source and post-retain owner
checks remain in the candidate. This internal callback exposes a source
client: it is trusted-composition-only and is **not** an HTTP/plugin API.

The earlier expected-timeout assertion was replaced by a positive retry of
the **same** synthetic original using a one-connection pool and equality with
the previously retained witness; an escaped callback is refused. Current WIP
`bash scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, exit 0 on two
disposable PG clusters. These nine overlap the preceding run, not nine new
product scenarios. The suite also exercises its existing isolated revoke,
lost-write and HTTP negatives; it does not specifically prove a revoke while
the authority store is stalled. Focused strict TypeScript of the two changed
source roots exited 0. Filtered Docker inspection after the script found no
`elp2-c2-p7-` containers/networks. Configured resource cap was 2 CPU / 1.5 GiB;
actual peaks were not measured.

Current hashes: signer
`ecd4b2ce17cb83a178b725af2ff4c0d498ffe1195769bb35c3bef50846873f3d`, custody
`fe36592ee04743115a67c07201264a407e8003f3f4b56d0b3860c8c962aa65fe`, test
`c931551046e72b08b637c2015379529f07620449cc06751d4f1874226f8fb7a3`.

**Still open:** source authority locks remain held while the independent
authority store performs network/DB work; bounded pool timeouts are not proof
of prompt revoke. Test concurrent saturation, stalled store, revoke/expiry,
process loss and source identity failover against final composition. Review
the trusted-client capability boundary and qualifying independent owner/key
custody before mounting. No runtime, migration, Edge authority or V2 restore
was enabled; A2/B2 and ELP2-10/11 remain open. The checkout is shared WIP, not
a frozen candidate or normal-hook PASS.
