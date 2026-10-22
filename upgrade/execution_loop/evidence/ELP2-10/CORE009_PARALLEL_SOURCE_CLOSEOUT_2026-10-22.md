# Core009 — P0 handshake and independent source closeout,22Oct2026

Scope: Bobby's latest approval prioritizes native08 ACK/connectivity while
Manager trust, financial mapping, command preparation and workload tooling
progress independently. Canonical entry`3c83bd9e4af54191569ebcd36e18cadcc3b83dc3`,
branch`docs/research-loop-plan`. Claude fe3 clean`0149041fc` at ownership check;
preserve all inbound Edge/shared Markdown WIP. No frontend changes.

## 1. P0 delivered before parallel work

[Consolidated return§12](CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md#12-p0-immediate-preparation-acknowledgement-and-longer-replacement-slot-22oct1322utc)
actually reached HK and byte-readback matched at13:23:17UTC:
`acd9a5111979824c5a4dc84f8414e6960798a1777d8f248f5eb3d516225762d3`.
Accept preparation and ACK→install/READY→sole-Core-specimen sequence, explicit
CHANGE old13:00–13:30 to proposed14:00–16:00UTC. New proposal is not a fabricated
ACK of new artifacts. Edge must issue fresh pins and Core ACK them **before**
Edge install/READY; no wait for READY to ACK PREPARED. Grant/source/session
expiries are never extended silently. Full08/read09 staysNOT_MET.

## 2. CORE-02 actual issuance and transport check

New bounded operator scripts:

- `scripts/execution-v2/issue-existing-manager-csr.mjs`: pin existing CSR,
  client DER-SPKI, actual SGP ClientCA/root/serverCA and extension profile;
  verify issuer key/public match without exposing private bytes; random
  explicit serial, one-to-seven-day validity, existing-key-only clientAuth
  issuance into exclusive0700 custody. No CA index/serial update or overwrite.
- `scripts/execution-v2/prepare-issued-manager-config.cjs`: actual issued
  public material into additive inactive config, using existing pinned pure
  validator in memory. No Docker/network/DB/grant or environment write.
- `scripts/execution-v2/test/issue-existing-manager-csr.test.mjs`: isolated
  temporary PKI,17named cases, actual openssl cryptographic checks; no real key
  custody used by tests. Cases guard hash/key/subject/validity expectations,
  permission/symlink/overwrite and issuer/key/CSR immutability assertions.

Actual17/17PASS after sandbox denied child pipe creation (`spawnSync EPERM`)
and the scoped TEST_ONLY command was approved outside that restriction:

```bash
node --test scripts/execution-v2/test/issue-existing-manager-csr.test.mjs
```

Actual issuance13:27:14UTC, existing Research CSR41a94f89 + clientSPKIc164a42f
under existing SGP ClientCA78a6, no new keypair. Seven-day client leaf ends
29Oct13:27:14UTC; leaf33015a80, chain665a11f7, receipt2f49af15. Exact hashes,
serial/private-reference names and validation results live in
[consolidated§13](CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md#13-manager-client-issued-and-inactive-config-verified-22oct1329utc).
All public artifacts0600, directory0700. Initial unsafe parent rejection
happened before signing; no parent permissions widened. Strict actual config
validation13:29:05UTCPASS, config153a8f0e; unchanged sourceec6d1863 and old
inactive config3efc6346 are explicitly pinned. No private file opened by config
preparation, no JWK/certificate/token committed.

Five public artifacts actually copied into the existing HK inactive Research
custody; readback13:30:53UTC exactly matches leaf/chain/config hashes. No key
transfer. Actual bounded TLS-only Paper probe to10.70.0.2:8443 using newly
issued leaf and original Research key: OpenSSLEXIT0, TLS1.3,
TLS_AES_256_GCM_SHA384, peerCNportal-execution-edge.paper, `Verification: OK`,
DONE. First probe failed locally on a nonexistent guessed private subdirectory
before any connection; metadata-located original was then used. No HTTP/JWT/
business request sent; actual mTLS/JWT authorization and financial read remain
NOT_QUALIFIED. Inactive per-mode proposal does not grant other-mode access.

Remaining owner/action: Edge validates received public artifacts/overlap79133170
and returns exact reconcile/config/window pins; Core applies only the separately
accepted Research overlay. No stable/dev/main, provider28445 or shared trust
mount changed. PKI issuance alone does not grant READ/STREAM or command/Live.

## 3. Parallel lanes and test scope

One root integrator; three reused independent agents, single-writer paths:
financial new helper/spec only, command reserved narrow STATUS seam and tests,
M5/M7 tooling and selector/tests. Root alone handles trust/P0/shared docs.
Focused tests are source evidence, never a replacement for an actual source,
PostgreSQL transaction or G2 calibration. Lane results/pins and integration
handoff are appended below once writers freeze and root review completes.

## 4. Gate, rollback and cleanup

This is an intermediate source slice under campaign§10.10c: use the affected
focused tests/scripts and BE build-typecheck when command source is frozen;
full R2/R3 hook is deferred to a single frozen landing, not repeated for each
Markdown/public handoff. No full-P22 image build, load or Docker/PG gate is
started in the pending native finite window. Old P22 buildFAIL134 is retained,
not claimed fixed by this source work.

Issuer/old custody and rollback image/config are retained. TEST_ONLY temporary
PKI directory removed by its own test after-hook; no shared caches/images,
backup, authority row or immutable audit deleted. New issued public artifact
is retained for planned Research use, no key was generated or needs disposal.
Rollback source by a reviewed revert; unused inactive artifacts need no service
rollback. Actual runtime unchanged, connected acceptance still open, no push,
dev/main promotion, signed release or ELP2-11.
