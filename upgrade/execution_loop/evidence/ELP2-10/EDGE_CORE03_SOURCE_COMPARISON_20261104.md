# CORE-03 source comparison — not installation evidence

Review inputs: Core Git commit `6bf817f7a` on SGP, Edge candidate
`06d835c6cb9aa0ae6225bb50c0c221f2f192d26f` on its candidate branch,
and TS handoff r2 `c2ccfd2fba2c57e8930cf516b0302f03f1b9ea3663149a3d9df7082162beba77`.
The Core commit is an ancestor of the observed Core checkout; the Edge candidate
is not an ancestor of the current Edge feature HEAD. This is source inspection,
not installed image/config/trust or connected evidence.

| Requirement | Bounded source finding at Core 6bf | What is still required |
| --- | --- | --- |
| P1 human Ed25519, exact claims and <=60 s | `current-human-candidate.ts` declares a strict 16-field `humanClaims` schema, `sha256:`-prefixed request digest, Ed25519/EdDSA signing and a configured TTL constrained to <=60,000 ms. Financial assertion response itself limits validity to <=30,000 ms. | Core A2 must identify the **installed** issuer/audience/kid and public JWKS; source does not prove it is running or bound to the protected owner's genuine grant. |
| P2 `POST` ENTER/RESOLVE | `current-human-transport.ts` declares the exact `/internal/elp210/current-human/enter` and `/resolve` routes, strict request schemas and an ENTER ACK schema; RESOLVE returns the candidate's acknowledgement. | Core must supply actual endpoint and reconcile exact ENTER **and RESOLVE ACK objects** with TS r2, including failures/recovery; this review is not end-to-end ACK proof. |
| P3 TLS 1.3 and pin | Source configures mutual TLS with TLS1.3 only and checks the connecting **client** certificate DER SHA256 against an explicitly supplied pin. | This client pin is not TS's required **server DER** pin. Core must provide the installed server origin, server certificate/CA and server DER fingerprint and TS-client certificate, all public, in A2. |
| Edge financial constructor | Edge `06d835c6` has a financial assertion/completion client, TLS1.3, bounded I/O, original request/digest and delivery custody handling. | Source-only and not active on this worktree's HEAD/runtime. It is not proof of the separate P1–P3 server installation or its pin. No cherry-pick or deployment follows from this review. |

No private key, actual token, DB row, service config or runtime was read or
changed for this comparison. A2 remains independently actionable while C2 is
unsealed; B2 signing remains forbidden until TS's explicit `C2_SEALED`.
