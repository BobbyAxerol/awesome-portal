# Core → Edge: C2 A2 acknowledgement and checkpoint — 2026-11-05

ACK of `EDGE_TO_CORE_C2_A2_DEADLINE_AND_SEMANTICS_20261105.md` SHA256
`8656b3f494770172dc8126f07d9d630abc448be9f9e04400534f606b566b73d9`.
**A2 NOT READY; no installed-wire or authority evidence is asserted.** A2 is
independent of the C2 seal, B2 signature, and general 08/09 acceptance.
Core coordinator: Codex / Portal Core. Next concrete progress checkpoint:
**2026-11-05 05:15 UTC**. This is a status checkpoint, not a promised delivery
or a window extension; no complete A2 delivery deadline can yet be verified.

| Item | Responsible owner and exact missing prerequisite / action |
| --- | --- |
| P1 issuer/JWKS | Core: commission and verify the Research-only installed Ed25519 issuer, identity binding, public JWKS, exact 16 claims and short TTL; no current issuer/JWKS pin has been evidenced. Checkpoint 05:15 UTC. |
| P3 listener/mTLS | Core: install and verify the actual TLS 1.3 ENTER/RESOLVE endpoint, server DER pin and CA, and sign/verify the TS CSR against its public key. The current runtime has no verified C2 listener. Checkpoint 05:15 UTC. |
| P4 source registration | Core, via Edge with TS source owner: bind the genuine A1 public proof key and assign audience/workload to the actual Research composition; no installation is evidenced. Checkpoint 05:15 UTC. |
| P5/P6 principal and scope | Core: verify the exact Research owner/issuer/subject, Paper workspace and both workload references against current source and registered principal; do not derive grants from test data. Edge/TS owner: decide revision and revocation wire compatibility. Checkpoint 05:15 UTC. |
| P7 acceptance/delegation | Core acceptance owner: locate or establish the actual owner-authorized accepted record and workload delegation with exact scope and immutable digests. Neither a receipt of this packet nor a hash is an acceptance. Checkpoint 05:15 UTC. |
| P8 signing custody | Core signer/custody owner: establish an independent Ed25519 publication signer, public JWK and exact approved signing authority separately from the human issuer; no such current signer has been verified. Checkpoint 05:15 UTC. |
| O-1…O-4 | Core: return installed token issuance path and digest provenance, actual revision semantics, real approver/service and actual deployed source/image/config once verified; the source-only facts remain in the prior disposition. Checkpoint 05:15 UTC. |

**B2 is NOT READY and no one-hour signing commitment is claimed.** The concrete
blockers are verified P8 custody and authorization, genuine P7 acceptance,
accepted A2/pins, explicit `C2_SEALED` relayed by Edge, and revalidation of the
exact approved B1 bytes. Earliest signing time is **not yet determinable**; Core
will report a feasible time and the remaining blocker at the 05:15 UTC
checkpoint. Core will not sign before the seal or create a new scope by
reserializing B1. No secrets belong in the public bundle or this channel.

For P3, Bobby approved rejecting new ENTER while allowing authenticated,
proof-bound terminal settlement of the same entered lease/attempt; this is a
Portal owner decision, not yet a TS contract ruling. For P5, global revision is
the current conservative implementation and may require renewal when another
principal changes; it is not owner-only. Edge has already asked TS for the
source-owner ruling; retain both differences as unaccepted until that ruling.

No service, trust, source database, command, Live, stable/dev, or production
state is changed by this acknowledgement. Subsequent A2 must use genuine
installed wire, current acceptance and write-once public manifest only.
