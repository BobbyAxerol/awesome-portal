# Core → Edge: C2 static trust and extended coordination window

2026-11-05 07:48 UTC. This supplements, and does not overwrite, the static
partial `CORE_TO_EDGE_C2_STATIC_TRUST_PARTIAL_20261105.md` (SHA-256
`4f559cff60cc002b4c0e61192b19bfc44b2f3a7f7df02eed038d1665e8a8b653`).
The static partial was delivered to the EPG10-08 mailbox before 07:45 UTC.

**Coordination target: 2026-11-06 08:00 UTC** (15:00 Vietnam time), 24 hours
after the original Core checkpoint. This is a planning target for returning
whatever has actually been completed, **not a claim or guarantee that A2 or B2
will be ready then**. Core will send a substantive earlier result as soon as it
is ready; next progress checkpoint is **2026-11-05 12:00 UTC**. Edge/TS must
not reserve or keep open a runtime window based solely on this target.

The previous static public pins remain **candidate only**, not installed or
accepted: the existing exact JWKS bytes have SHA-256
`c2be5bf172d2e16b7fdb048431295c7caa67c1e869b94e8ed547eaa7aff35f25`;
the proposed Research server leaf has DER SHA-256
`fefa26e5d6fea081fab431a3bec2bb9dd0f60e05b7dd48bce09a285478b87012`
and expires **2027-05-04 05:33:46 UTC**. The proposed origin is
`https://10.70.0.1:28444`; listener/runtime reachability is not established.
Certificate expiry is not a grant, token, session, authorization, or
commissioning-window extension. Revalidate all pins and authority at the
actual time of use; no expired trust or grant is extended by this note.

| Deliverable | Current disposition | Owner / next action |
| --- | --- | --- |
| Static issuer/audience, owner/workspace and P7 | NOT_READY | Core: qualify the actual identity binding, registration/ACL and authenticated owner acceptance/delegation. Bobby approved READ + HISTORY only for `paper-portfolio-g1` and `paper-root-g1`; that decision is not a session-bound P7 record. |
| Full A2, P1–P8 and O-1…O-4 | NOT_READY | Core: complete and test the real mounted issuer/listener and source trust, authorization/custody and exact runtime/source pins; return a public manifest only after evidence exists. |
| B2 publication | NOT_SIGNED | Core: `C2_SEALED` has been relayed, but signing also requires genuine A2 acceptance and the approved scope/P7/P8 checks. Sign once only when all conditions hold. No one-hour delivery promise. |
| Recovery V2 | NOT_READY | Core: independent authority checkpoint, old-holder/write/HTTP fencing and complete post-snapshot terminal/ACK reconciliation remain required; isolated tests and inventories are not recovery authority. |

Focused typecheck disposition is in
`CORE_C2_TYPECHECK_DISPOSITION_20261105.md` (SHA-256
`ba042dbb3a30612f30e36fe523e0363896ddf08887da44efd02aa66ba29b5690`):
two leaf modules passed semantic checks, while combined candidate typechecks
exhausted the bounded cell and did not pass. No normal hook, candidate runtime
installation, DB/DSN/TLS modification, source grant, secret transfer, command,
Live action, Git push or A2 acceptance is claimed.
