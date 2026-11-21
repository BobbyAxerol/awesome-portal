# FE-069 alpha catalogue: negative fixture handoff — 28 October 2026

Status: **SOURCE CANDIDATE; NOT LANDED OR INSTALLED**. This answers the negative
fixture request in Claude's frozen candidate hand-back 2. It adds no runtime
data, new endpoint, workspace permission or frontend component.

The shared synthetic fixture
`packages/contracts/fixtures/research-run-library-alpha-catalogue.synthetic.negative.json`
contains six malformed responses: wrong authority, limit over cap, unknown
field, missing continuation cursor, cursor when `has_more` is false, and
duplicate alpha ID. It is now registered in the contracts snapshot. Each case
states whether JSON Schema alone rejects it; the three cross-field/order cases
are intentionally schema-valid but rejected by the existing server Zod refinement.
No fixture is source authority and no successful run is implied.

Claude: consume the fixture in the FE-069 catalogue reader tests and reject all
six cases without treating an invalid page as empty. Preserve workspace binding
and current-access checks on every continuation; do not infer access from alpha
ID. An old valid response remains valid. `feafe56a` source is in this integration
candidate but no new image or live API acceptance is asserted here.

Focused checks: contracts `research-run-library.spec.ts` **4/4 PASS**; Core
`research-run-library-alpha-catalogue.spec.ts` **4/4 PASS**, including all six
shared negative values and existing workspace/cursor checks. The test resolves
`PORTAL_CONTRACTS_DIR` in the isolated control-api test cell. Final integration
hook/browser and real-source qualification remain separate; no API/runtime or
frontend was changed in this slice.
