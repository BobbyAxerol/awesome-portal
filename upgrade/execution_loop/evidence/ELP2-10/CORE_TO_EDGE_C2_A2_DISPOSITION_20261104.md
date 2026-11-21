# Core → Edge: C2 A2 disposition — 4 November 2026

**ACK; A2 NOT READY.** This is a public-only source comparison and request for
coordination, not an installed bundle, acceptance, runtime pin, delegation,
signature, or authorization to operate a command. Edge remains the sole
coordination point with the source owners. The request is
`EDGE_TO_CORE_C2_A2_PRIORITY_REQUEST_20261104.md`; the supplied r2 handoff
hash was checked as `c2ccfd2fba2c57e8930cf516b0302f03f1b9ea3663149a3d9df7082162beba77`.

## Installed state and remaining inputs

There is **no current installed-wire proof in this disposition** for P1 or
P3–P8, nor an owner-accepted A2 public manifest. The historical 19 October
installation receipt is not proof of today's listener, trust, issuer, CA,
JWK, server-DER pin, principal, workload, delegation or acceptance. No such
pin or value should be copied from it as current. Core must inventory the
authorized Research candidate and its actual endpoint, process/image,
configuration, schema, issuer/JWKS and certificate validity before returning
an A2 manifest. The source owner must provide the current source proof and
CSR/public inputs through Edge and the owner must approve the exact authority
and pins as required by the handoff. No private key, credential or token is
included here. **ETA is not established**; the next checkpoint is after that
inventory and the wire-semantics decision below, not an assertion of READY.

Read-only local observation at 2026-11-04 21:33 UTC: the Research preview
Control API container was healthy on image ID prefix `d65e77860860`; the
host had no listening TCP socket in the checked range 28440–28459. This does
not inspect all container/private-network listeners, verify that image's
source/config/schema, or establish that any C2 route is installed. The active
disposable test containers are not an installed Research service. The checked
range includes the historical port; do not infer a working endpoint from the
old receipt.

No Phase B publication was signed or requested. TS C2 is reported unsealed;
Edge must relay the explicit sealed receipt before the separately authorized
signature. An A2 return must account individually for P1, P3–P8 and O-1–O-4;
unknowns must stay unknown.

For the requested O-1–O-4 answers, the following are source facts, not
installed qualifications:

* **O-1:** `CurrentHumanCandidate.issue(actor, binding)` mints against a
  captured current actor and the supplied exact `request_digest`; there are
  separate financial and command-STATUS source-assertion compositions. This
  does not establish an owner-facing C2 mint route for all TS commands or the
  channel that delivers each command's exact digest. Core and Edge must pin
  that installed composition and its request provenance before acceptance.
* **O-2:** the candidate uses a conservative **global** authority revision,
  with DB triggers on user, session, binding, workspace and grant/policy
  surfaces. The SQL filters certain harmless session refresh and audit-only
  updates, but it is not an owner-only revision and can change for another
  principal. See `current-human-candidate.sql` `authority_change`. Therefore
  the r2 owner-only revision premise is **not established by this source**;
  Edge/source owner must resolve the operational contract, including how a
  revision change is republished, without weakening the current fence.
* **O-3:** the authorized acceptance person/service and publication signer are
  **not verified** here; Core/owner must identify the real accepted records
  and signer before delivering P7/P8.
* **O-4:** `c49e26608f25f8333c66709bf511f14ef847c7da` identifies the local
  source comparison only. The source/image/config actually serving the C2
  endpoint are **not verified**; Core must inventory the installed process.

## P3 revocation / recovery semantics need reconciliation

The r2 handoff §1 P3 asks whether revoking owner session, application or
delegation makes **both** ENTER and RESOLVE fail. The local Core source at
`c49e26608f25f8333c66709bf511f14ef847c7da`, file
`apps/control-api/src/execution-v2/current-human-candidate.ts`, SHA-256
`7b137dff5ae3966b4cd7396c6f3dc9be39a8ecd41a2441784cf6678e52733d20`,
does not support an unconditional affirmative answer:

* `enter` checks authenticated token, fresh installation, drain and the
  original lease's current authority revision before entry.
* `resolve` requires an authenticated source proof and exact original
  lease/attempt/workspace/environment/workload/request binding. It records or
  replays the source terminal, and intentionally does not use expiration or
  revoked human authority as proof that an already-entered source transaction
  rolled back. It does not itself authorize a new ENTER or transaction.

This is a **source comparison only**, not evidence that the same code is
currently installed or reachable. Refusing every terminal resolution after a
revoke can strand an already committed/unknown attempt; accepting resolution
must never authorize a fresh operation. Core and Edge/source owner need an
explicit agreed contract separating admission revocation from authenticated,
same-original settlement. Until the exact installed wire and this difference
are reconciled, do not represent P3 as accepted or test fixtures as a connected
receipt.

## Independent restore concern

The isolated restore retake detected synthetic post-snapshot authority changes
that a STATUS-only comparison misses. A source-independent live authority
checkpoint, quiescence, fencing and reconciliation are not yet a mounted
operational restore barrier. This does not by itself describe C2's installed
state; it prevents claiming a general V2 restore/cutover PASS.

No runtime, database, service, trust, Live/command state, Git remote or stable
environment was changed by this disposition.
