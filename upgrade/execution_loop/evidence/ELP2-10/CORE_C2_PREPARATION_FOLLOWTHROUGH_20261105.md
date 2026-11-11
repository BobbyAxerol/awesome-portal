# Core C2 preparation follow-through — 2026-11-05

This supplements the earlier mirrored `CORE_C2_CONSOLIDATED_PROGRESS_20261105.md`;
it does not replace its installed-state assessment. **A2 NOT_READY; B2 NOT_READY;
V2 recovery NOT_READY.** The source below is uncommitted, unmounted preparation
on Core `docs/research-loop-plan` at base `2faa8968fddbde59b2e59525e334ba3d83886144`;
the hash pins describe files, not a deployed image. No TS/PM decision is asserted.

## Per-item state and next action

| Item | State / responsible owner | Evidence or next action |
|---|---|---|
| A1/B1 input inspection | READY for preparation only / Core | B1 public input independently pinned `409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`; exact-byte/schema rejection tests pass. This is not acceptance. |
| A2 P1/P2 issuer/JWKS and request digest | NOT_READY / Core | Candidate code exists; no installed C2 issuer/JWKS and digest-to-issuer commissioning receipt. |
| A2 P3/P4 mTLS listener, source registration and O-4 | NOT_READY / Core | Public-material verifier now checks actual CSR signature, chain, SAN, EKU, lifetime and server leaf DER pin. It has not issued/installed the certificate, registered TS source, or proved a running listener. Runtime availability of `/usr/bin/openssl` must be checked before mounting. |
| A2 P5/P6 owner/workspace and O-2 | NOT_READY / Core | Match the protected-owner binding to TS principal and actual Paper workspace/workload with current authority; do not conflate TS UUID with Portal user UUID or reuse expired binding. Global-revision renewal and unrelated-owner outage procedure still needs operational commissioning. |
| A2 P7/O-3 acceptance/delegation | NOT_READY / Core | A genuine owner-approved accepted record and immutable evidence for the exact scope are not yet established; no acceptance is manufactured. |
| A2 P8 signer | NOT_READY / Core | A separately held publication signer, verified authority, public JWK and custody/one-shot controls are not yet commissioned. No private material appears in this packet. |
| B2 post-seal | NOT_READY / Core | Offline dry-run consumes exact pinned B1 and copies its scope without signing, I/O or publication. Requires real P7/P8, A2 acceptance, one-shot durable signing custody and Edge-relayed `C2_SEALED`. **A one-hour delivery is not yet confirmed**; reassess after these inputs exist. |
| P3/P5 source semantics | NOT_READY / Edge and TS | Bobby's Core rule is to reject fresh entry after revocation while accepting only authenticated terminal for the already-entered original; global revision remains conservative. Edge has relayed this; TS acceptance/source contract must not be assumed. |
| V2 recovery | NOT_READY / Core; source protocol via Edge/TS | A local persisted drain and reconciliation of the same already-entered lease/attempt now have isolated tests. Neither drain nor inventory proves an independent authority checkpoint, fences an old holder, or accounts for late source terminal/ACKs. Existing V2 DR refusal stays enabled. Need externally held authority/checkpoint, generation fencing, authenticated source original readback and ACK coverage, and restore/cutover tests. |

The previously requested 05:15 UTC is a status checkpoint, not an A2 ETA.
No complete installed A2 artifact exists to ship to the write-once destination.

## Preparation source pins

SHA256, relative to Core checkout:

| File | SHA256 |
|---|---|
| `apps/control-api/src/execution-v2/c2-b1-preflight.ts` | `2a72c6609b7db2d29b2b5f6614c6ac51effa77549c3db31fa3fb9d50ca0b90a4` |
| `apps/control-api/src/execution-v2/c2-b2-dry-run.ts` | `576e123f1cf70cbdc208f279def666addc4e3bb6728c3780f508f3f007019ca7` |
| `apps/control-api/src/execution-v2/c2-public-trust-preflight.ts` | `538b210d6ca6def156d4ed7b3d9c0d28e72d6fc9dbf829f6d3731bb2f620340e` |
| `apps/control-api/src/execution-v2/restore-core-quiescence.ts` | `5af356805a483a04f52c08dc917543d383d55706a976be8296ab2929de74ac33` |
| `apps/control-api/src/execution-v2/restore-inventory.ts` | `0510bdceb4a3e7e9ed61282625c5e731536a18e2122a064cdddb98640005f68b` |
| `apps/control-api/test/c2-b1-preflight.spec.ts` | `6b1e1c3c3b339af01997dc5b82d8d03370f814cc048615fc76137ea6bce688ac` |
| `apps/control-api/test/c2-b2-dry-run.spec.ts` | `c9fa9cacd912e437be7609e757a383909f71ba827322f039589f06aedc648fed` |
| `apps/control-api/test/c2-public-trust-preflight.spec.ts` | `1a40a89971a87c1546ebfb7a27b5884b4f8ef6ff1d57ba9e91cc3a3d878b7c02` |
| `apps/control-api/test/restore-core-quiescence.spec.ts` | `7c259f8e9429fe1834c68e9e8720d4389a4ffb555d4152ecabdf2295b5e9f948` |
| `scripts/test-elp2-restore-inventory-rls.sh` | `7ecad6ebdbb3a27ae29cfe52b87c53b3889948fa84ea8db5f4df1add82414a80` |

The B1 source pin above supersedes its earlier preparation-only pin in the
prior progress packet. It does not supersede the independently pinned B1 input.

## Verification and cleanup

- Combined focused suite: **32/32** passed across B1/B2, public trust,
  inventory and Core quiescence; Python canonicalization and genuine OpenSSL
  CSR verification run locally, with test-only cryptographic material. Actual
  B1 input was used in the opt-in byte-pin tests. This is not an A2 receipt.
- Disposable PostgreSQL test: **1/1**, 111 unrelated cases skipped. Same
  entered lease/attempt was reconciled with a real test-key signature; wrong
  attempt and wrong signer were rejected, identical terminal replayed, and the
  drain still rejected a fresh issue. This is not a restore/cutover or ACK test.
- Earlier focused actual-PostgreSQL results on these inventory/revoke changes:
  RLS negatives **2/2**, revoke/global revision **3/3**, old snapshot resurrection
  detection **1/1**. Independent isolated mTLS tests **19/19** use ephemeral
  credentials and do not prove installed Research authority.
- Disposable PostgreSQL and network were created under `/tmp/portal-heavy.lock`
  with bounded CPU/memory, and the test runner removes its exact containers and
  network. Public-trust tests remove their own test-only temporary materials.
- Normal integration hook has **not** been run; no final commit, installation,
  push, source permission change, command/Live enablement or connected PASS is
  claimed.
