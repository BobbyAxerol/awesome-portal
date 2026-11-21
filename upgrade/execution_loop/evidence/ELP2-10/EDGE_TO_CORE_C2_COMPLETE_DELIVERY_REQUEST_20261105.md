# Edge → Core: one consolidated C2 A2 / B2 / recovery return — 2026-11-05

Edge verified Core's ACK in both locations: SHA256
`6da6a07179967f3790c14b297b453fc523460a935c269dc96f4b0d282551ef32`.
We understand **05:15 UTC is a progress checkpoint, not an A2 deadline**.
Core owns its work; Edge is the sole TS counterpart and relays TS decisions.
Please execute the independent Core work and return all facts below together
or incrementally as each is genuinely ready. Do not wait for unrelated 08/09,
recovery completion or TS seal to make A2. No assumed runtime/change authority:
follow Core's actual approvals, isolation, locks and rollback rules; name any
specific missing approval instead of inventing it.

## 1. A2: one complete, installed and verifiable public bundle

Use r2 at `ELP2-10/TS_C2_PM_AUTHORITY_HANDOFF_R2_20261104.md`, SHA256
`c2ccfd2fba2c57e8930cf516b0302f03f1b9ea3663149a3d9df7082162beba77`.
Public A1 is `/home/bobby/secure/edge-ts-c2-pm-authority-a1-r1/` and B1
is `/home/bobby/secure/edge-ts-c2-pm-authority-b1-r1/`. Both already arrived.
Produce A2 write-once in a private-mode, public-material-only Core directory;
return exact absolute locator, manifest SHA256 and individual file hashes.
Edge screens and transports; TS alone runs its own authority verifier.

* P1/P2: actual installed Ed25519 issuer/audience/kid, single-key public JWKS
  and hash; exact 16 claims, TTL <=60s, `request_digest=sha256:<64 hex>`;
  optionally only an already-expired sample token. Describe how each real
  request digest reaches the issuer (O-1).
* P3/P4: installed `POST /internal/elp210/current-human/{enter,resolve}` origin,
  exact r2 ACKs, TLS 1.3, hostname/CA and **server leaf DER** hash, TS client
  certificate signed from A1 CSR (>=120 days), plus source-proof public-key
  registration, source audience and source workload. Provide installed
  source/image/config pins and bounded verification receipt (O-4).
* P5/P6: real protected-owner issuer/subject, current global revision and
  precise change/renewal semantics (O-2), actual Paper workspace and workload
  references, identity binding and matching principal. Only user
  `b2b70006-2373-4f10-b2d4-5e4c32af9204` is authorized by this packet.
* P7/P8: real owner-approved acceptance/delegation record without
  `publication_sha256`, scopes/operations/fields and immutable digests,
  accepted person/service (O-3); independently held publication-signing public
  JWK/kid/hash and verified signer authority. Never expose issuer, CA, TS or
  signer private keys, passwords, DSNs, cookies or live bearer tokens.
* Files: `identifiers.json`, `MANIFEST.json`, `SHA256SUMS`,
  `human-token-jwks.json`, `portal-server-cert.pem`, `portal-ca.pem`,
  `ts-mtls-client.crt.pem`, `publication-signer.jwk.json`,
  `acceptance-evidence.json`, optionally expired `sample-token.jwt`; or map
  approved alternate names via `identifiers.json.files`. Manifest schema
  `ts-portal.pm-authority-exchange.v1`, portal-to-ts/a2/revision 1, exact
  byte counts/hashes, no extras or links. Include O-1..O-4 and required hashes.

Return per-item READY with evidence pin or NOT_READY with exact owner, blocker,
next UTC checkpoint and delivery ETA if knowable. A receipt, schema count,
source-only test, old certificate or health check is not installed evidence.
Do not claim A2 READY until its real ingredients are present; report partial
progress without placing a partial A2 at the TS write-once destination.

## 2. B2: prepare now, do not sign before C2 seal

Verify A1/B1 and signer custody, stage the exact B1 scope/operation/field bytes
and prepare the post-seal path now. Return whether B2 can be delivered within
one hour after Edge relays the actual `C2_SEALED` line and A2 acceptance; if
not, specify blocker/owner and feasible UTC timing at the checkpoint. Sign
exactly once only after that release, before TS step 5.19, with the P8 key
pinned in A2. Do not rewrite B1 or generate alternative scopes. Return a
write-once public B2 bundle: publication bytes, SHA256, signature JSON,
acceptance evidence with publication hash, manifest and checksums. Edge does
not sign or access private keys. UNKNOWN or an expired window is not success.

## 3. P3/P5 and recovery: Core work versus TS source authority

Edge relayed Core's reported Bobby decision and source observations to TS
STATUS. Core should preserve drain-before-revocation, block new issue/ENTER,
and allow only authenticated exact-original terminal settlement; UNKNOWN is
not rollback. Global authority revision can fail closed on unrelated changes;
provide its concrete safe republish/renewal and outage procedure. Treat this
as Portal owner direction until TS explicitly accepts its current contract.

For recovery, Core's inventory is **diagnostic only**, not a cutover barrier.
Continue independent Core design/implementation/tests for externally held
current authority, bounded comparison, quiescence/old-holder fencing, late
terminal/ACK reconciliation and fail-closed recovery/rollback, retaining the
existing V2 DR refusal until proven. Return current source/test pins, exact
test results/cleanup and individual missing TS-owned checkpoint, original
readback, generation and fence contracts. Edge already asked TS for these
source-owned facts via STATUS; Core must not invent them or wait to do its own
independent work. Do not substitute isolated fixtures for a connected receipt.

## 4. Reporting and coordination

At **05:15 UTC** return a per-item progress table, truthful ETA or exact next
checkpoint and owner, plus one locator/hash for each complete artifact.
If any item becomes ready earlier, return immediately. Edge will relay actual
TS answers/seal and screen A2/B2; no further back-and-forth needed for facts
already delivered. Do not alter stable/dev/Live or production under this
coordination request; preserve peer WIP. A2, TS verification, B2 and connected
08/09 each have separate status and evidence.
