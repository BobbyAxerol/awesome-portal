# C2 issuer: custody before bearer return — 2026-11-05

**SOURCE_ONLY; uncommitted and unmounted.** This is not A2 acceptance, an
authenticated owner approval, a source ACK, a V2 restore or connected evidence.
Research runtime, product DB, Edge and frontend were not modified by this slice.

## Finding and candidate change

The previous [generic issuer fence](CORE_C2_GENERIC_ISSUER_FENCE_20261105.md)
still allowed direct protected `issueC2ProtectedOwner` preparation without
independent custody; ENTER subsequently refused a missing binding. For the
selected `c2_delivery_schema_required` configuration, the protected issue and
resume methods now require the selected custody candidate, the same Core pool,
the source-proof vault and the matching binding. Issuance preflights custody
before allocating a lease; both issue and resume persist the same signed
original before returning a bearer and revalidate owner/P7 after that append.
An append or final revalidation failure returns only a pending lease identifier,
not the bearer. Recovery resumes that original lease, not a replacement.

Issuance and P7 helper methods involved in this fence use runtime-private
fields/methods, not TypeScript-only privacy. This does **not** establish a
separate security boundary against a compromised process, prove a registered
authority, fence older processes, protect HTTP delivery, or qualify restore.
The legacy unselected configuration preserves its previous behavior. The
candidate wrapper delegates its selected-C2 custody work to the protected
issuer and retains its preexisting behavior for the legacy path. This
supersedes only the earlier statement that direct protected issuance can return
a token without custody in the selected C2 configuration; other limitations in
that receipt still apply.

## Focused verification

- `scripts/test-elp2-c2-p7-pg.sh owner-intent`: **9/9 PASS**, including direct
  issue and resume denial without custody, retained assertion, tampered helper
  attempts, and a locked custody append recovered after issuer restart with
  the same lease and one retained original. Synthetic owners/keys; two
  disposable PostgreSQL clusters. Exit 0.
- `scripts/test-elp2-independent-custody-pg.sh`: **5/5 PASS**, including
  unavailable custody and revoke-before-revalidation; synthetic authority,
  two disposable PostgreSQL clusters. Exit 0.
- `scripts/test-elp2-restore-inventory-rls.sh c2-owner`: **23/23 PASS**,
  disposable PostgreSQL and synthetic identities. Exit 0.
- Strict focused TypeScript check of the three changed source modules: exit 0.
  This is not the full project/test-inclusive typecheck or normal hook.
- Test runners own their bounded cells and run their teardown traps. Root
  filesystem observation after tests: 270 GiB free, 57% used. No broad cleanup
  or deletion of user data.

| Input | SHA-256 |
| --- | --- |
| `current-human-candidate.ts` | `33d736b0a60077abab03ebcb44396d96d0b60f0bbecd4619d9009e8a71a2f9fe` |
| `c2-custodied-issuer-candidate.ts` | `bd5400d4b7b27f4c55b9b70f788798039681607fc3f77c2f373a9cae3e3bd31c` |
| `c2-custody-pending-error.ts` | `2d45510455ac011587656bf328a6929bfee964b89c5e9490b0d709e4c682daa5` |
| `c2-p7-owner-intent-candidate-pg.spec.ts` | `f78e2fb9c7c8f5ac75862ed6e8f044618104d20594361f2763f2ea25a7d138b1` |
| `restore-independent-custody-candidate-pg.spec.ts` | `2134e8af876e1542976e0c0d9c791b7c3128ec89deeae10ae87b8e4717edd2b9` |

## Remaining work and consumer impact

Core still needs an independently operated authenticated owner/writer and
qualified key custody, actual source/registration and old-holder fencing,
HTTP delivery custody, post-snapshot terminal/ACK reconciliation, integrated
restore rehearsal, review and normal hook on a final candidate. A2 remains
NOT_READY and B2 remains unsigned; no Edge ACK, connected READ/STREAM, G2 or
browser acceptance is asserted. No frontend contract or Claude action is added.
