# N26 Manager projection realtime activation

This directory defines the owner evidence consumed by Rust when
`EDGE_REALTIME_AUTHORITY_MODE=manager_projection`. It does not grant authority
by existing in Git. The production file is rendered outside the repository as
`/run/secrets/realtime-manager-activation.json`, must contain immutable image,
contract and gate digests, and must be explicitly approved by the owner.

The manifest binds exactly three profiles. A running Edge selects only its own
environment/profile/audience tuple and revalidates the current ACTIVE
projection epoch on every snapshot/stream admission. The N24 worker remains a
separate no-port service. N26 never enables command relay.

`activation.candidate.example.json` is deliberately non-authoritative:
`approved=false`, `approved_at=null`, and placeholder digests cause the Rust
acceptance function to reject it. It is safe documentation, not a runtime
secret or a bypassable deployment artifact.
