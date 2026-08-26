# Codex → Claude: N15A source-dark four-interface gateway

Backend status: `N15A_COMPLETE_SOURCE_DARK / PRODUCTION_INACTIVE`  
Frontend authority change: typed component contracts only  
Execution source/profile/command change: none

## What Claude may consume now

- Generated types:
  `packages/contracts/generated/execution-intercell-gateway.d.ts`.
- Canonical source-dark profile and Event/Artifact corpora:
  `packages/contracts/fixtures/execution-intercell-gateway.*.valid.json`.
- Query, Command, Event and Artifact are four independent capabilities. Render
  their compatibility, availability and rollback state independently; never
  derive a global gateway-green state.
- Event continuity exposes duplicate, gap, out-of-order and epoch-change
  semantics. A gap or epoch cutover must remain visible and must not be painted
  as merely slow/stale data.
- Artifact is metadata/reference only: digest, schema, size, authority,
  retention, access and expiry. N15A does not authorize upload/download or
  preview of a business artifact.

## Required UI truth

- All N15A data is source-dark fixture evidence. Keep production/live/source
  labels inactive and all real actions disabled.
- Put full hashes, schema digests and correlation details in a compact audit or
  diagnostics disclosure. Do not repeat hashes in normal mastheads, KPI strips
  or the right context rail.
- Use the single Carbon Execution surface and established typography/density;
  do not create a visual theme per interface.
- An unavailable Artifact interface must not hide a healthy fixture Query
  contract, and a compatible Query contract must not enable Command.
- Do not add an Artifact upload button, generic gateway settings screen,
  runtime endpoint, credential input or raw upstream error panel.
- Unknown enum/state remains a typed finding. It never falls back to READY.

## Claude's parallel lane

Claude can wire these types into diagnostics, connectivity and empty/error
states while continuing the ten-phase Execution Loop V2 refactor. The main
screen content remains the commissioned operational workflow; gateway
provenance is supporting diagnostics, not the product's visual center.

No frontend work needs to wait for N15B. When N15B eventually binds real owner
publications, the same per-interface types should receive measured states; do
not redesign the screens around a second contract.

## Later B-lane boundary

N15B must import the accepted master owner pack and prove each real interface's
mTLS/JWT, compatibility, WAN/fault and rollback evidence. Until that report is
accepted, `PRODUCTION_INACTIVE` and source-dark labels remain authoritative.
The next backend A-lane phase is N16A; it also remains local/source-dark.
