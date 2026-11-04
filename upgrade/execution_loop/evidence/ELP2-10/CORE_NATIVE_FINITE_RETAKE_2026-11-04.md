# Core native finite / Approval / sibling retake — 4 November 2026

## Scope and change

The integrated Core branch began at `b9d77bd1b`. No API is mounted, no source
or credential is installed, no frontend is changed, and the three sibling
routes remain source-dark without a qualified producer. Review of the
unmounted sibling composition found that a server qualifier could return a
body and field proofs without actually consuming the selected source. It now
requires at least one native-fenced read and, for every published non-envelope
field, a read of the selection named by that field's proof. This proves only
that the selected read occurred: source meaning, relation and lineage still
belong to the separately qualified server adapter. It does not authorize a
fixture or turn an order ID into account/deployment authority.

## Results

- On the changed working tree, three focused local suites
  `sibling-native-delivery`, `sibling-native-http-composition` and
  `approval-evidence-native-http` passed **31/31**. They include no-read and
  wrong-selection refusal and existing CURRENT/HISTORY negatives. Their native
  fences and authorities are synthetic; they are not actual Edge acceptance.
- A pinned PostgreSQL/Node disposable, internal-only Docker cell ran the one
  `joins Account profile` test in
  `elp210-native-current-relations-provider.spec.ts`: **1 passed, 21 skipped**.
  It now also exercises Approval two sections using one source read; physical
  HTTP custody and final-dispatch revoke with zero bytes; terminal response
  loss twice followed by a newly constructed provider's recovery using the
  same persisted originals and terminal IDs/digests; and all three sibling
  families with native PG/mTLS, cursor paging, cross-workspace refusal and
  final-dispatch revoke. The source publisher, identities, rights, qualifier,
  mappings, approval and terminal source responses are TEST_ONLY synthetic;
  the provider restart is a **new instance in one process**, not proof of an
  OS restart. Synthetic ACK is not the Edge ACK. No semantics of an order's
  real account/deployment relationship are established by this test.
- This fast diagnostic cell mounted the existing local dependencies read-only
  and did **not** run the full build, official restore drill or normal hook.
  It used Node image `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
  and PostgreSQL `sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`.
  Cleanup was restricted to that invocation's unique container/network.
- Three earlier attempts failed on the evolving integration test itself:
  advisory leases were incorrectly counted as the HTTP lease; then a final
  dispatch abort was incorrectly expected to throw; finally one dropped ACK
  was immediately retried by the provider. Those attempts were not PASS.
  The last fast run exercises the corrected expectations and double lost ACK.
- `npm run typecheck` in `apps/control-api` completed **exit 0** on this
  working source, including tests and the cross-loop TypeScript project. An
  earlier invocation stopped after its source changed is not counted.
- The official `scripts/control-api-test.sh` grouped isolated gate then passed
  **53/53** across the native PG/mTLS provider, sibling delivery/HTTP and
  Approval native HTTP suites; its PostgreSQL restore drill also passed. It
  built the copied source in its own disposable cell and cleaned its resources.
  Inputs and qualifiers remain synthetic; this does not establish a real Edge
  ACK or process-restart acceptance.
- The normal monorepo hook subsequently completed successfully on code commit
  `d1462632c446891d0bb115f21a6aab245a38f865` (tree
  `c13c848df239c303288facc030f1f760b40f22ab`). It included the Control API
  suite and PostgreSQL restore drill, contract/OpenAPI checks and the normal
  integration gates. This is a source/test result, not an installed image or
  a connected Edge, browser or G2 acceptance.

Working-file SHA-256 at this retake:

| File | SHA-256 |
| --- | --- |
| `apps/control-api/src/execution-v2/sibling-native-delivery.ts` | `e03d9401978af38bf0fb848333a1d17c84f200ab91cabb9567fa524bd58b23e1` |
| `apps/control-api/test/elp210-native-current-relations-provider.spec.ts` | `89f9f41ebed18f1d7243ef584e7c3b66283b59c05c23a49ae29ae23749cc5171` |
| `apps/control-api/test/sibling-native-delivery.spec.ts` | `c9e98a9b86562bb401f9e9c3a588f74f12561b03947cf24f9bb7fde98afea81e` |
| `apps/control-api/test/sibling-native-http-composition.spec.ts` | `5e168ede4649a7f568c7bb8263aa29a45c5d71fd9443a894138a2b52c7fe6bac` |

## Next and limits

[HISTORY/diff authority design](APPROVAL_HISTORY_DIFF_AUTHORITY_DESIGN_2026-11-04.md)
keeps historical sections refused on CURRENT. [Qualification matrix](CORE_AUTHORITY_QUALIFICATION_MATRIX_2026-11-04.md)
separates reusable source pins from final connected, restore and G2 gates.
Further independent work remains: an Approval recovery across an actual process
boundary and an approved operational rollback; the combined
historical-clone/custody restore is recorded below. Edge must qualify the real
source, grants, field policy and approval/order lineage. STATUS real ACK,
financial/Approval, connected browser and G2 are not established here.

## Historical clone with synthetic custody — restore retake

An isolated PostgreSQL cell restored historical preview backup SHA-256
`324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`.
The backup was read-only; the shared preview database was not contacted.
A TEST_ONLY settled custody record was added to the clone before migration.
The guarded clone test, SHA-256
`cca0778f3565beb1d5d52d7ef7014b657ea6d85671863c059d43f17ea08800fc`,
passed **2/2** for migration through 0158, protected rows, scoped security
metadata and refusal of an unapproved down. Afterwards, TEST_ONLY STATUS
context and ACK records were added to that same clone; a new custom dump was
restored into another disposable database in the cell. Scoped row digests
(users, sessions, custody, STATUS context/ACK and migrations) and relation
owner/ACL/RLS, non-internal trigger and function owner/ACL/definer digests
matched. This is synthetic ACK data, not an Edge receipt.

This did not execute an approved operational rollback or compare all database
objects; real custody, final candidate/runtime and integrated connected gates
remain unqualified. PostgreSQL and Node image pins match the fast cell above.
The cell's explicit containers and internal network were removed; a read-only
name check found no `elp2-restore` containers or networks. An initial readiness
attempt before this retake failed before migration because the test database
was not yet created; it is not counted as PASS.

## Separate-process recovery diagnostic

A subsequent disposable PG/mTLS cell ran the same Approval lost-ACK path on
`d1462632c` with a temporary test overlay. A separate Node process constructed
the provider, with TEST_ONLY loopback TLS material and signing key sent over
private IPC, and called `recover()` against the same database and synthetic
source. The child PID and provider source configuration digest were checked;
the test also compared the original base body and terminal receipt id/digest,
confirmed no new issue and that the original became settled. Result: **1 test
passed, 21 skipped**. The two earlier attempts failed before the test ran:
first the Vite cache was on a read-only mount; second the temporary dependency
directory was empty. Neither failure is counted as PASS. The final test's source
overlay SHA-256 was `30155f115cfbf44d180cd9bdd7a4425954c27b7893eb5b92f3e3d5d22b4da790`;
the diagnostic child script SHA-256 was
`b74d6d5ca71bc98922ebe998464324b2580042d7f75c147b913355e2d4766fc3`.
The non-secret diagnostic inputs, including the cell runner, were retained
locally under `/home/bobby/.local/state/portal-research-evidence/elp2-approval-boundary-20261104/`;
they are not part of the committed regression suite or a remote artifact.

The issuer process remained alive throughout. This proves recovery across a
process boundary, **not** kill/restart of the issuer, a production source,
or real Edge ACK. The overlay was a disposable diagnostic, not a maintained
regression test. Promoting an issuer-kill/restart test into the suite remains
follow-up; no real-world credential or session was used. The cell containers
and network were removed and checked by their explicit names.
