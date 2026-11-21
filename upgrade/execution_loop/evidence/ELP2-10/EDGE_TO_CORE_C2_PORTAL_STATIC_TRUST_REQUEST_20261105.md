# Edge → Core: C2-PM-PORTAL static trust first — 2026-11-05

Owner/TS directs that Portal is no longer a gate of the main C2 track. Continue
the parallel **C2-PM-PORTAL** track; do not hold TS's main C2 on this request.

## Return static public trust before full A2

Please provide a single sanitized, hash-pinned **static trust partial return**
with a concrete UTC delivery deadline: human issuer/audience/kid, exact JWKS
bytes plus SHA256, Portal HTTPS origin, server leaf DER SHA256, and the genuine
delegation reference (or explicit NOT_AVAILABLE with owner and ETA). Identify
each value as candidate versus installed/owner-accepted, source/config pins and
certificate validity. Do not create an acceptance or mark a candidate installed
without evidence. No private keys, passwords, DSNs, tokens or cookies.

We have already observed Core's public preparation in Edge EPG10-08
`core-c2-research-public-20261105/`: candidate composition JWKS SHA256
`c2be5bf172d2e16b7fdb048431295c7caa67c1e869b94e8ed547eaa7aff35f25`,
candidate server leaf DER SHA256
`fefa26e5d6fea081fab431a3bec2bb9dd0f60e05b7dd48bce09a285478b87012`, and
proposed origin `https://10.70.0.1:28444`. These are **not installed**; do
not resend unchanged bytes merely to satisfy the request. Confirm exact
current public pins and fill issuer/audience/delegation or mark unknown.
The earlier JWKS bytes `80ad0f68…` are superseded for composition pinning.

Then provide complete A2 as already requested, including genuine P1–P8,
O-1..O-4, verified installed wire, acceptance/delegation, pinned P8, manifest
and checksums; give a concrete UTC deadline or exact blocker/owner/checkpoint.
Partial trust must not be called A2 READY or placed as the complete write-once
`a2-r1`. Edge will screen and relay all public material to TS.

## B2 after A2

`C2_SEALED` was already relayed, TS B1 is unchanged. Core's latest disposition
records the additional owner condition **genuine A2 acceptance before signing**.
As soon as complete A2 has been accepted and prerequisites satisfied, sign
B2 **once** with its P8-pinned signer and return exact publication, hash,
signature, evidence, manifest and checksums. Edge does not sign or receive
private keys. Respond with a UTC delivery commitment or explicit blocker.
No command/live activation is authorized by this request.
