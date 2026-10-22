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

## 5. Frozen financial, command and workload results

- Financial **`f1aa5eda6`**, two new test-only paths/+342:22/22PASS, one worker,
  13.90s total. Source factory → actual scoped projection interfaces with an
  explicit synthetic source mapping/SQL trace. No production reader, PostgreSQL
  authority or accepted economic source claim. Missing production mapping is
  identified in [consolidated§14](CORE_TO_EDGE_TS_PM_CONSOLIDATED_RETURN_2026-10-22.md#14-parallel-source-lanes-returned-independently-22oct1342utc).
- Command **`fcef184fe`**: five paths/+568−3, actual optional current-requester reconcile + binding
  and two new specs. **186/186PASS** across five focused no-PG specs,4.99s,
  one worker. Do not add the intermediate37/25test reruns to this count.
  Independent source/security review ACCEPT: pre/post current report authority,
  final disclosure, immutable-original locked update, no send/claim/fallback,
  default/service recovery unchanged. External Edge ingress not commissioned.
- Workload **`b4c3a2e9f`**, four paths/+434−7:10/10PASS,29.65s including real
  CLI dry-run invocation. Independent read-only review ACCEPT. Current manifest,
  owner artifacts and fresh repin are checked; dry-run starts no HTTP/collector,
  reads no credential and writes no output. Missing numeric/target authority is
  explicit. This is no G2/calibration/performance verdict.

Tests used own temporary files only and cleaned them in after-hooks. No new
Docker workload, source/grant/session or PG instance was created by these lanes.
Claude production financial readers, UI components and peer WIP are preserved.

## 6. Independent review changes closed without reissuing actual material

Commit **`9e74a94a6`**, four tooling/test paths/+347−82. Independent reviewer
accepted actual public artifacts but requested two source hardenings. Root
review ACCEPT after fixes: preparer independently verifies actual certificate
chain/issuer/root/SPKI/SAN/EKU/KU/current validity/client purpose and compares
receipt assertions against derived fields; issuer checks all five captured
public custody inputs before writing a success receipt. No receipt remains
successful after a late-custody failure.

```bash
node --test --test-concurrency=1 \
  scripts/execution-v2/test/issue-existing-manager-csr.test.mjs \
  scripts/execution-v2/test/prepare-issued-manager-config.test.mjs
```

**38/38PASS**,1.281s:18issuance +20preparation. The first hardening run found
two test-harness defects (hoisted fixture helper and mock restore API); fixed
then retook exactly the affected command. Earlier17issuance tests are a subset,
not extra coverage. Isolated temporary PKI directories cleaned by after-hooks.
No actual source key was opened by these tests. Root additionally ran the
hardened helper read-only against the existing public Research leaf/chain:
`PUBLIC_CRYPTO_REVALIDATION_PASS`, exact leaf33015a80/serverCA8fff563d,
digitalSignature/keyEncipherment, clientAuth,22–29Oct13:27:14Z. No output write,
network or reissuance; original issuance/config bytes unchanged.

Actual production build-typecheck `node node_modules/typescript/bin/tsc
--noEmit -p tsconfig.build.json` EXIT0. Tracking reconciliation PASS; scoped
diff/paths checked. Full source-image/hook qualification is intentionally not
claimed by these focused intermediate commits. Source/test work used one
worker; peak RSS and actual target/G2 load were **not measured**, no production
resource defaults inferred. No shared cache, source custody/audit or backup
was deleted. No frontend/PG/schema/runtime/push operation.

## 7. New Claude request reviewed this round, not silently marked delivered

Read Claude fe3`88286b3c8` / `CLAUDE_TO_CODEX_SIMULATED_KEYS_2026-10-22.md`
and fixture commit`9ab26b4f1`. Independent read-only review:

- **ACCEPT fixture-only scalar PERCENT:** `review-manager.ts:152` computes
  `net_pnl ×100 / denominator`, so `return_30d_pct`/PERCENT is internally
  consistent. This is not an accepted source TWR/MWR methodology.
- **CHANGE scale assumption:** actual `manager-series-publication.contract.ts:39`
  publishes RETURN as RATIO with **either FRACTION or PERCENT** via
  `ratio_scale`; Claude must honor that field, not assume name/magnitude or
  always FRACTION. No approved component/layout change requested.
- **BQ-FLEET-ALLOC remains a genuine legacy ambiguity:** legacy alpha-fleet-v2
  schema arrays carry currency but no economic-domain/profile attribution and
  envelope permits environment=all; `manager-lists.service.ts:432,736` combines
  environments before currency aggregation. Do not call that ACTUAL, allocation
  economic capital, account balance alpha-owned NAV or position PnL all-time
  performance. The current `scoped-manager.reader.ts:38,363` instead authorizes
  per environment and guards shared-account attribution; do not claim every
  runtime path is unsafe. Keep review fixture partitions explicit/use Manager
  partitioned DTOs, not a guessed combined financial total.
- **CHANGE docs:** only partition-metric keys are open; row metric/source-fact
  keys remain closed enums (`manager-model.contract.ts:135`). Selected-window
  fixture performance clears `window` at `review-manager.ts:272`; align metadata
  and the simulated register before claiming measured30D semantics.

Claude owns those fixture/register/consumer corrections on its lane; no edits
or tests were run by the reviewer, no new field/source/runtime accepted.
Actual source methodology/window/denominator/cash-flow treatment, economic
domain, ownership/dedup and allocation-versus-capital meaning still require
Edge-coordinated TS/PM input. Codex does not contact TS/PM directly.

## 8. Actual public delivery and final source scope

Consolidated return§§12–14 actually mirrored/read back in the exact HK Edge
EPG10-08 mailbox at **2026-10-22T13:50:31Z**, SHA256
`c7c8774348dcc3c031fdf170a6fba4e81d84a2eeda0968deacd9ca36f2a5a194`.
No fresh Edge PREPARED received at last check. Public delivery is complete;
the new interval is a proposal until exact packet ACK, not a fabricated READY.

Five source commits from entry3c83bd9e4 through9e74a94a6:16paths,
**+1996/−10 net**, including initial94line receipt. Subsequent R0 closeout
touches only two owned receipts and Codex marker blocks in Unified/sync;
pre-existing Edge/peer Markdown and inbound packets remain unstaged/WIP.
No code disappears, no Claude code is rebased/merged by this intermediate
source return. Shared frozen-image/landing gate is still separately required.
