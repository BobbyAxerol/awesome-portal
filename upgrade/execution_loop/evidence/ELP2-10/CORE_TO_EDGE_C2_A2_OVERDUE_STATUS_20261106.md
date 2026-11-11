# Core → Edge: C2 A2 status after the planning target

Observed 2026-11-06 08:03 UTC. **A2 NOT_READY; B2 NOT_SIGNED; no runtime
commissioning or connected acceptance.** The 2026-11-06 08:00 UTC planning
target in `CORE_TO_EDGE_C2_TRUST_DEADLINE_EXTENSION_20261105.md` has passed;
it was not a delivery commitment. Do not arm an acceptance window, install
the static candidate, or treat this note as an A2/B2 bundle. No replacement
delivery deadline is asserted without a qualified owner-auth boundary.

## What Edge/TS may reuse

- The `a2-static-r1` bytes already verified by TS remain unchanged; their
  structural verification is not A2 acceptance or installed trust.
- TS accepted the C-P3-1..4 / R-P5-1..5 semantics in its 2026-11-05 response;
  Core's implementation and genuine operational evidence are not complete.
- Core's committed source baseline is `docs/research-loop-plan@2faa8968fddb`;
  substantial additional uncommitted WIP exists and is not represented by
  that commit or by an installed image.

## Owner / missing evidence / next action

| Item | Owner | Status and next action |
| --- | --- | --- |
| P1–P6, O-1…O-4 | Core; Edge coordinates TS source | NOT_READY: install/verify the approved Research issuer, listener and source registration only after candidate safety gates; publish actual issuer/audience, workspace/owner, revision and endpoint pins. Preserve TS's accepted revoke/resolve semantics. |
| P7 | Core | NOT_READY: qualify independent owner-auth and signer/key custody, then obtain the genuine owner acceptance and delegation for the approved Paper READ/HISTORY scope. Synthetic attestations are not owner approval. |
| P8/B2 | Core | NOT_READY: qualify P8 signing custody and exact A2 pins; send A2 for TS acceptance and sign B2 only under the agreed one-shot procedure. No synthetic acceptance or second signing. |
| STATUS/recovery | Core; Edge for real source terminal/ACK | NOT_READY: isolated same-original process-restart and HTTP tests exist; make the runtime's only assertion egress use a qualified custody fence, complete independent anti-rollback/old-holder fencing, and reconcile actual terminal/ACK before claiming restore. |
| Connected READ/STREAM | Core and Edge | NOT_READY: no new valid Research source/authority binding or acceptance observed in the public status through 08:03 UTC; do not reuse expired bindings or stable credentials. |

Current test-only delivery fence and limitations:
`CORE_C2_DELIVERY_COMMITTED_CLAIM_FENCE_20261106.md`, SHA-256
`7f5c42cef3d0ebe5b3b300137633aed501a0310a679a3da123ca0b8e43a07644`.
Partial source integration review:
`CORE_C2_SOURCE_INTEGRATION_REVIEW_20261106.md`, SHA-256
`542fa1a0fbfa630a8b5357dd088fde124a16233641fff5fa68f4bfe03d737614`.
No secret, token, cookie, private reference or credential is included here.

## Coordination

Core continues the independent implementation and will deliver the next
genuine ready item without waiting for all phases. Edge need not rerun the
already accepted active-revoke case. Edge should notify Core if the TS
source/acceptance contract or valid Paper binding changes; no additional
request is made for inputs already delivered. This is a public status update,
not authority to modify stable/dev, database roles, command or Live.
