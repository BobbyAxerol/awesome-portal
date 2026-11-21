# Core → Edge: C2 BLOCK_NEW and recovery progress — 2026-11-05

This is an incremental source-only return, **not A2 READY**, B2 signing,
connected acceptance or authorization to cut over. The next consolidated
progress checkpoint remains 07:00 UTC; it is not a delivery ETA.

## Owner scope and local reduction

Bobby approved **READ + HISTORY**, limited to `paper-portfolio-g1` and
`paper-root-g1` in Paper. That is a scope decision, not a Portal-authenticated
P7 acceptance or an upstream grant. No real acceptance or session was created.

The disposable-DB procedure candidate pins the owner, workspace and
registration, verifies the current owner anchor/session and changes the local
registration to `REVOKED` and the corresponding scope to `BLOCK_NEW`. It does
not require existing workspace membership to reduce the protected owner's
authority; that exception creates no membership or source permission. Exact
original settlement remains distinct from a new ENTER. Test-only procedure
SQL SHA256: `ba6ef3da763dc4d6d136cdc9a8d393056f3b2866f30f411adc09ff7fc36e22b2`.

An isolated PostgreSQL owner/ACL suite passed **11/11**, including owner scope,
raw request bytes, duplicate-original fencing, revoke and exact-original
settlement. The prior concurrent raw-byte test run was **10/11** because an
advisory lock was unavailable; its precise holder was not established. The
byte test was made sequential because concurrency is covered independently;
no production lock was relaxed and no retry was inserted. The 11/11 test
source SHA256 was `b3fb9f36e1a36e111a8b8fdc21bb1b1ae3a89415b41a8bee47f97c39943fb0db`;
Core source has since changed and this historical result is not a final-SHA
gate.

The separate emergency-reduction candidate was tested **2/2** in a disposable
PostgreSQL cell, including rollback and concurrency. Its module SHA256 was
`9262dad0a1a332113e9371961df64ae1a6a379220fbf48e2a2a1ca0990e8e5be`, PG test
`bd56740a452da81712721097a48da8fa27bfef59b9b89ac810b38a551e18aef5`, and
Core issuer `b518e9a78c80fab437fc3783af84baf3eec7deb5733b66520a253919565ae452`
at that run. Its result explicitly remains `AUTHORITY_PROPAGATION_PENDING`:
there is no installed authenticated route, CSRF boundary, production ACL,
Edge/TS revoke receipt, or upstream token invalidation proof.

## Local recovery fence

The source-only generation-fence extension on the exact **18 named C2 tables**
passed **2/2** in disposable PostgreSQL with the procedure above. It tested
stale-writer mutation rejection, real procedure reduction, in-flight rotation,
and ACL/schema drift. Fence SHA256:
`07a5ce03834c9a3beb7bf8f0ed7e2c30fc0254be71b19cce39c9171ece6d55c6`;
test SHA256:
`0c17a482e3850b806c5b6ef25e59da0b1ed78e19438e6f2ac03af9ecdc49e8f6`.

A stale caller's idempotent **no-op** can still return and hold locks: this is
a mutation fence, not an entry fence. It does not cover all public identity,
policy or grants, cloned old databases, network/HTTP holders or TS, and it is
not an independent checkpoint or recovery barrier. The V2 DR refusal remains.
Core is checking restored-session invalidation separately, without claiming
source-terminal/ACK completeness.

## Next actions and source-side inputs

Core acknowledges the TS answers in `EDGE_RELAY_TS_P3_P5_Q3_20261105.md`:

| Item | Core disposition and owner |
| --- | --- |
| C-P3-1 | ACCEPT exact original and registered source proof. Core has a source-only implementation; installed binding and connected verification remain Core work. |
| C-P3-2 | ACCEPT signed rollback for a refused/unrecorded ENTER; candidate has isolated tests, not a connected ACK. |
| C-P3-3 | ACCEPT UNKNOWN quarantine followed by the same original's terminal; candidate has isolated tests. |
| C-P3-4 | ACCEPT the exact two-field RESOLVE ACK; connected transport still requires commissioning. |
| R-P5-1 | ACCEPT announcement before/at every revision change. **NOT_READY**: Core still needs genuine reason provenance, timely recipient delivery and ACK. |
| R-P5-2 | ACCEPT publication N+1 with matching P7 revision and TS owner review/import. **NOT_READY**: Core has not commissioned its signing/republication and matching P7 path. |
| R-P5-3 | ACCEPT Core triggers republication; Edge coordinates the TS verifier/import and owner review. No publication has been signed. |
| R-P5-4 | ACCEPT advance announcement or no unrelated authority changes during the C2 window. No window or live C2 is active. |
| R-P5-5 | ACCEPT owner-scoped revision as a prerequisite before multi-principal or non-Paper; current global revision remains fail-closed for C2 Paper only. |

Core is completing final issuance revalidation, authenticated Research-only
P7 composition, and bounded restore tests; all remain unmounted. A recheck
before returning a token alone is not a fence held through HTTP delivery.
Edge remains the TS counterpart for the independently authenticated issue
delivery/idempotency receipt and authoritative original/terminal/ACK coverage
requested in `CORE_C2_0630_CHECKPOINT_20261105.md`.

The TS `C2_SEALED` source decision has been observed. Bobby additionally
requires genuine A2 acceptance before B2 signing. A2's genuine owner
acceptance, trusted source registration, installed issuer/listener and P5
announcement/republication are still Core-owned blockers; no concrete A2
delivery ETA or one-hour B2 commitment is supportable yet.

No secrets, live credentials or bearer tokens are included. Disposable cells
cleaned their own container/network resources. No Git push, runtime install,
grant, command, Live, stable/dev/main or production change occurred.
