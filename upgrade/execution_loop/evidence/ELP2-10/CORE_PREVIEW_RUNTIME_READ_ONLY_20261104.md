# Research Control API: read-only runtime inventory — 4 November 2026

At approximately 23:36 UTC, read-only container inspection observed
`portal-research-preview-control-api-1` running image
`sha256:d65e77860860dbf24fa5bbf6ded8bc6225b063ebc15578ed6a2dd8d1e92132f8`,
started `2026-10-26T19:13:24.885507451Z`. Its image label declares revision
`05ab409900bdd87dffc6ed0c6b0c4a9dfa5d1af0`, which is a Git commit and an
ancestor of the current local branch. A label is a declaration, not proof
that the image was reproducibly built from that revision.

The container network namespace had listeners on `0.0.0.0:4000` and Docker's
internal DNS only. No separate C2 listener was observed there. This does not
establish whether an internal C2 route is mounted on port 4000, whether a
different container supplies one, or whether a caller can reach it.

The following compiled files exist in `/opt/control-api`; their presence does
not establish that their code is instantiated, configured or connected:

| Image-relative path | SHA-256 |
| --- | --- |
| `dist/execution-v2/current-human-candidate.js` | `daad11e0a77d4ef43d36e21af3b1496ccfc906713a4263dfc224bc280c49823c` |
| `dist/execution-v2/native-core-runtime.js` | `be65b9e636037ced6a79eaf3f11b1d31e2e8a0c5e1a751450199b6ab681cd696` |
| `dist/execution-v2/command-source-assertion.js` | `9350c4165638fc40406292185ff6087c622c4452f30ce8db54c3848bf093015d` |
| `dist/execution-v2/financial-source-assertion.js` | `718b2fa9d5e4083ec4fd124c2235e0af967ac3a65edefa8ebe7699ecb7b3be60` |

This inventory did not inspect credentials, application configuration, DB
rows, schema, TLS issuer, signer or effective delegation. It did not exercise
an endpoint, alter runtime, authorize command/Live, or establish a qualified
source, real ACK or connected acceptance. The earlier
[C2 disposition](CORE_TO_EDGE_C2_A2_DISPOSITION_20261104.md) remains
**NOT READY** until the installed wire, trust, authority and the documented
ENTER/RESOLVE semantics are independently verified and reconciled.
