# N14B Paper current-source release compatibility and rollback

Status: `IMMUTABLE_COMPATIBILITY / PAPER_ONLY / NOT_ACTIVATED`

This runbook consumes an accepted N14A release pack plus the N13B
current-source map. It never edits the N14A manifest and never treats release
compatibility as runtime deployment authority.

## Preflight

1. Verify the complete N14A candidate, including all six digest images,
   signatures, SBOM, provenance, vulnerability evidence and quality gates.
2. Verify the N14B adjunct and `SHA256SUMS`. Its N14A manifest, current-source
   map, Paper profile definition, Portal adapter files and three relevant image
   bindings must match byte-for-byte.
3. Confirm the candidate contains only `PAPER_TRADING_SCREEN`, the three
   accepted read capabilities and four qualified Manager-v2 source bindings.
4. Confirm Sandbox, Live, Query/SSE, projection, shadow and command flags are
   false. Confirm the phase authorization does not authorize runtime deploy,
   registry promotion or a Trading System change.

## Profile-scoped candidate render

Render SGP Control API with the Paper flag and exact Paper origin/profile/
audience while Sandbox and Live remain false. Render one AWS-HK Edge project
named `portal-execution-edge-paper` with the exact immutable Edge image,
`PAPER_BINANCE_USDM`, Paper audience and Manager-v2 read flag. Do not start
either render during compatibility qualification.

The protected-main image workflow creates the adjunct from the same verified
N14A candidate. A local or feature-branch image cannot be relabelled as that
artifact.

## Rollback rehearsal

1. Set `CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=false`.
2. Set `EDGE_MANAGER_V2_READ_ENABLED=false`.
3. Stop only project `portal-execution-edge-paper` if it was deployed in a
   later authorized change window.
4. Leave Sandbox and Live unchanged. Do not modify Trading System, Portal
   databases, registry state or sibling profile projects.
5. Preserve the rejected adjunct digest and typed operator-visible reason.

## Forward fix

Build the fix on a new protected-main commit, publish a new signed N14A pack,
then regenerate the N14B adjunct with
`previous_compatibility_sha256` equal to the rejected adjunct digest. Source
map, profile and owner pins cannot change silently; a source-scope change
requires a new reviewed compatibility revision.

## Activation boundary

This runbook proves immutable release compatibility only. Actual source
traffic, registry `data_mode` promotion and screen activation require the
separate profile/screen gate. Commands remain a separate N16B identity and
approval lane.
