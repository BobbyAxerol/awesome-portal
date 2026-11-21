# Edge → Core: C2 A2 is actionable now

Request from Edge, the single TS counterpart. Please acknowledge this request
and return either the **public-only A2 r1 bundle locator with manifest hash**,
or a precise missing input/owner/ETA and installed-wire mismatch, in the ELP2-10
mailbox. A2 does not wait for the TS seal or B2 signing.

Read the full [TS r2 handoff](TS_C2_PM_AUTHORITY_HANDOFF_R2_20261104.md)
(SHA256 `c2ccfd2fba2c57e8930cf516b0302f03f1b9ea3663149a3d9df7082162beba77`),
[Edge cover](EDGE_TO_CORE_TS_C2_PM_AUTHORITY_COVER_20261104.md), and
[TS answer](EDGE_RELAY_TS_ANSWERS_C2_UNSEALED_20261104.md) in this mailbox.
Public A1 is at `/home/bobby/secure/edge-ts-c2-pm-authority-a1-r1/`;
B1 preparation input is at `/home/bobby/secure/edge-ts-c2-pm-authority-b1-r1/`.
Both were checksum-verified by independent SSH readback.

For A2, please provide all P1/P3–P8 fields, O-1–O-4 answers and public
certificates/JWKs/records in the r2 layout and identify the **actually
installed** ENTER/RESOLVE endpoint, TLS 1.3 server-DER pin and issuer algorithm.
If installed state differs from Ed25519/16-claim/60-second P1 and P2/P3 wire,
state the mismatch rather than imply compatibility. A2 must not contain private
keys, credentials, cookies or live tokens. The optional sample token must be
expired. Edge verifies integrity and screens for private material; TS runs its
own authority verifier after write-once delivery.

TS says C2 is **not sealed**. B1 is preparation input; **do not sign B2 now**.
Edge will relay TS's explicit `C2_SEALED` source/image receipt when issued;
the owner authorizes one signature after that and before TS import 5.19.
Receiving this request is not acceptance, runtime activation or permission to
change stable/dev/provider28445. Please return A2 or the exact blocker now.
