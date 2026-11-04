# Core connected-gate review and clone rehearsal — 4 Nov 2026

## Pins and scope

Core `docs/research-loop-plan` was clean at `7c21f78f1f70f2cd5b861e21d27db83bdfd6d081`;
integrated code is `c61f60b8e4f77a0742893524b517c835ea46f0eb`, tree
`2ba11854b567e7b5cc5a0c89bb5a72c25d3142bf`. Its normal hook receipt is
[here](CORE_INTEGRATION_CHECKPOINT_2026-11-04.md#landing-receipt--supersedes-the-historical-wip-status-below).
This is source verification, not a claim about the image or schema serving preview.

## Retake on the landed test

The earlier clone receipt used a test file predating its target safety guard.
The landed test, SHA-256 `cca0778f3565beb1d5d52d7ef7014b657ea6d85671863c059d43f17ea08800fc`,
was rerun against the historical preview dump SHA-256
`324fb9f35dbb606773010af310caf1261e386abc6cb57be3abaf378f9f8c15c8`.
The clone was isolated on an internal Docker network, using PostgreSQL image
`sha256:44c4ee9810eff91f7eab4d822642e01115b1a9eccce4bcbdde7604752d68eac6`
and Node image `sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`.
The target guard and actual migration test passed **2/2**, exit 0. The test
restored ownership and ACLs, migrated 0155–0158, compared seven protected
tables and selected security metadata/trigger definitions, and confirmed 0158
down refuses without approved drain while preserving those checks. Migration
hashes match the [scoped receipt](CORE_INTEGRATION_CHECKPOINT_2026-11-04.md#historical-clone-migration-acl-and-rollback-guard--4-november-follow-through).

The first attempt exited 2 because `pg_isready` succeeded before the test DB
was created; the migration test did not run. The passing retake waited for a
query against the named DB. Both attempts reported cleanup of their explicit
containers and internal networks; PostgreSQL data was temporary. No preview
DB, protected source, shared service or retained backup was modified. This is
not a fresh backup, populated real-custody restore, successful operational
rollback or complete ELP2-11 acceptance.

## Connected inputs and remaining work

- Edge source checked read-only at `636d58a7c4368a617903734ab1d0ce933d2804ca`;
  registry SHA-256 `9257ebb0a3935bf58e6fe4858298bf4536cca2081e61f9c4543a82645a4f8c67`.
  Order status, reconciliation and obligations remain `UNAVAILABLE /
  NEW_EDGE_V1_EXPORT_NOT_QUALIFIED`, without enabled environments or coverage
  proof. Edge/source must qualify publication, field and parent relations;
  order-to-resource must not be inferred from an ID. Core remains source-dark.
  This is catalogue source state, not proof of Edge runtime configuration.
- Edge discovery V2 exists in a separate candidate at
  `4cf434c45b4ea5b5d62045edcfa536298c5d1da6`; it is not a connected receipt.
  Previous Research bindings expired. The 28 Oct observation of zero Paper
  root/membership was historical, not a fresh claim about protected data.
  Edge/source authority must establish current Research Paper root/delegation,
  separate READ and STREAM authorization, authenticated source transport and
  current trust/binding before testing READ, STREAM, revoke and recovery.
- STATUS restart/recovery source exists. Acceptance needs the commissioned
  Edge gateway, valid authority and genuine existing original with matching
  terminal/ACK. Do not create a new intent to manufacture proof.
- Financial needs a qualified carrier, same-snapshot/scope, currency,
  completeness, ownership/census and actual APPLIED-after-COMMIT/ACK. Partial
  historical publication and fixtures do not establish shared-account NET_PNL.
- Approval Evidence still has a **Core implementation gap**: the field
  authority defaults deny-all, and same-flight source/field authority and HTTP
  custody are required before commissioning a positive provider. Approval
  visibility is not independent field authority. Keep the route source-dark.
- G2 requires a qualified candidate/runtime, target, approved numeric bounds
  and calibration. Existing P184 latency thresholds do not approve a workload
  budget. Connected browser acceptance needs pinned real-source paths. Calendar
  remains `SOURCE_DARK` pending a qualified provider.

ELP2-10/11 remain **open**. No UI, command/Live, protected runtime, dev/main,
remote Git branch, credential or upstream grant changed in this retake.
