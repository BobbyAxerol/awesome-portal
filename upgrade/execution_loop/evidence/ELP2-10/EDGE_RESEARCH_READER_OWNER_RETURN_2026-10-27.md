# Edge → Core: Research membership reader and trust — 27 October 2026

**Disposition: NOT_READY.** This is a source-owner action return, not a
connected READ/STREAM receipt or a claim that the required source rows do not
exist. Coordinator: Edge; PM/TS ownership stays with the owning source. No
credential, DSN, private key, cookie or unbounded source data is included.

## Actual observations

- At 02:48 UTC / 09:48 ICT, Edge worktree
  `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2` was on
  `feat/execution-edge-upgrade-v1_2@8727e5303b1815d54bc2bdcb927a55457ff4da5b`;
  existing worktree changes were preserved. The separately owned PM candidate
  `/home/bobby/.worktrees/pm-core-financial-assembly-20261024` was clean at
  `c8871acf3c5bcbd8c5ddad10eaa4a5294616a7a2`.
- PM `services/portfolio_management/registered_relations_operator.py` explicitly
  provides `config-check` and `serve` for an already reviewed Research Paper
  configuration; it does **not** create a reader, entitlement, original or
  correspondence. The factory requires separately pinned source, control,
  importer and catalogue-owner roles and private references. Source code and
  tests alone do not prove that this configuration is installed or qualified.
- The older native source's credential directory is root-owned mode0700; its
  contents were not accessed. The old installer's documented grants do not
  establish access to membership heads/revisions/receipts. We did not query
  actual extra grants, so neither lack of privilege nor lack of source rows is
  asserted. No stable credential, role or provider28445 was changed or used.
- The public TLS certificates in the earlier Research bundle
  `/home/bobby/secure/edge-core009-trust-20261022-5e3a2ac0` both expired at
  **2026-10-23 03:00:58 UTC**. The local certificate SHA256 fingerprint is
  `40252d3b9b2c5f4cefd2ac095b9cf9def1102c42f2be47d24bd3e575b4c263fc`;
  the peer certificate is
  `6fb3a1468139d3dcd2628ebe13c069f79b34461bb5e8f71b7cb54cf7f403e304`.
  Only public certificate metadata was read; no private key was read or
  transferred. These expired certificates are **not** current trust pins.
- Docker process metadata showed TS P184 and its PostgreSQL test cell active.
  No new load, test cell, listener, DB query, container restart or runtime
  configuration was attempted on HK during this observation.

## Exact owner actions

1. **PM/source owner through Edge:** identify the real database/system and
   an independently scoped Research membership-aware reader, source/control/
   importer/catalogue-owner role names and protected references. If no such
   reader exists, provision it through the owning approved Research procedure,
   with only necessary read/registration privileges; do not widen the legacy
   stable role or use its credential by assumption. Return references and hashes
   through the private channel, not their values.
2. **PM/source owner through Edge:** using that reader, perform the bounded
   read-only, repeatable-read observation specified in
   [Core's discovery request](CORE_EDGE_MEMBERSHIP_READER_DISCOVERY_2026-10-26.md):
   exact Research issuer/subject, Paper scope, ACTIVE identity, current
   membership head/revision, immutable `SET_MEMBERSHIP` receipt and lineage.
   Return current scoped identifiers/digests and provenance, or the precise
   missing/revoked/ambiguous result. If no qualifying original exists, name the
   actual authority/delegation owner and official writer action; do not insert
   source rows or fabricate an entitlement.
3. **Core + Edge:** once the genuine binding, approved source refs and a fresh
   bounded window are known, generate/install new Research-only trust under the
   already approved temporary-trust scope, verify peer CA/audience/leaf pins,
   and independently register/qualify ROOT, CURRENT and STREAM. Do not use the
   expired certificates. This is not permission to enable command or Live.
4. **Core:** select the named composition, then exercise genuine finite READ,
   independent STREAM/revoke/recovery and physical terminal/ACK before Claude's
   real-API browser receipt. Do not hold finite CURRENT on financial or G2.

No source-ready flag, private reference, authorization, new cert or actual
source result is claimed by this observation. ELP2-10 stays open; no remote
push, runtime change, production/dev/main change or rollback was needed.
