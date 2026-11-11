# C2 delivery fence follows P7 intent revoke — 2026-11-05

**SOURCE ONLY / NOT COMMISSIONED.** On `docs/research-loop-plan` at committed
HEAD `2faa8968fddbde59b2e59525e334ba3d83886144`, the candidate and tests are
uncommitted. No real DB, Research runtime, Edge source or frontend changed.

## Finding and candidate

The existing unmounted delivery obligation guard checked scoped registry and
authority but did not query the lease's P7 owner-intent revocation. A P7
intent can be revoked while the registration and scope remain OPEN; therefore
those fields alone do not prove a new reserve/send is authorized.

An additional **unmounted** candidate trigger now takes the authority lock,
requires READ COMMITTED and ties new reserve/send to the same lease, intent,
record, registration, session, workspace and authority revision. It rejects
revoked/expired intent and registration. Recording `UNKNOWN` for an existing
obligation remains allowed after revoke, subject to the original delivery
guard's immutable binding and state transitions. UNKNOWN is not an ACK or
proof of delivery.

## Validation

`scripts/test-elp2-c2-p7-pg.sh owner-intent`: **7/7 PASS** on two disposable
PostgreSQL clusters. The test reserved an obligation before intent-only
revoke; afterwards, a second fresh reserve and `RESERVED → SENDING` were both
rejected even though the scope stayed OPEN. `RESERVED → UNKNOWN` succeeded.
The same suite covers the restricted-login lease/revoke sequence and
synthetic original/issuer cases. Delivery operations in this test used the PG
test administrator, not the product delivery procedure or an HTTP connection.
The runner removed its disposable containers and network; `git diff --check`
passed. No Edge source or owner acceptance is claimed.

| File | SHA-256 |
| --- | --- |
| `c2-p7-delivery-fence-candidate.sql` | `d150a7d3cc36643a0e802de46bff9c2e244cc27aeeaebae7ffe1b3cda1b5be7d` |
| `c2-delivery-obligation-candidate.sql` | `caeddead23601720e2082a0631f6e09a20c660b6177a6826611bd1fa679f608a` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `d3805568945d9bed78b9f153d929363f6a94887b5c298918552de1734e547d6b` |

## Still open

The trigger must be integrated with the bounded delivery procedure and its
limited DB role/ACL, migration and historical obligations, with concurrent
revoke/send coverage. A DB state transition is not a fence through actual
HTTP write: revoke may still race after the transaction. Source authority,
same-original terminal/ACK, independent custody, recovery V2 and connected
qualification remain open. Issuer and restore remain fail-closed. No frontend
request or changed contract.
