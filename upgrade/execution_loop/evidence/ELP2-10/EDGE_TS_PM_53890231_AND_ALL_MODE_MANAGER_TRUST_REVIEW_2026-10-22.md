# Edge — TS–PM53890231 and all-mode Manager trust review

Observed22Oct2026,12:11–12:23UTC. Status: **SOURCE_REVIEW_COMPLETE /
PUBLIC_TRUST_AND_CONFIGURATION_VERIFIED / RESEARCH_BINDING_NOT_INSTALLED**.
Full EPG10-08/read09 remains NOT_MET. This is the two-task owner-approved
review, not a runtime rollout, connected acceptance or new phase.

Continue through the [single consolidated request](EDGE_TO_CORE_TS_PM_CONSOLIDATED_REQUEST_2026-10-22.md)
and [seven-row review](EDGE_TO_CORE_TS_PM_CONSOLIDATED_REVIEW_2026-10-22.md).
This adds current source/issuer inputs to CORE-02/03/05/06. It does not rewrite
the hash-bound native proposal, renew its expired slot or authorize installation.
Manager/P22/calibration must not hold an independently eligible native specimen.

## 1. Source authority, merge and exact consumer impact

Read the actual PM checkout and owning Unified§58.340, generation migration
runbook and guide03/04/13–16, not a stale conflict snapshot:

- `/home/bobby/.worktrees/trading-system-pm-v1_1`, branch
  `feat/portfolio-account-v1_1-parallel`.
- Approved merge `53890231ca11e2936cef2b0ae5872def2af05e93`, tree
  `836dd337167984799a0e03ed48fa98d5295e2084`.
- Parents PM `337e71404d336ca6a2f5a3c493d370193748e50f` and TS
  `c4553ff4f89e06757150f5295bdb38628105cff2`.
- PM advanced to formatting commit `cd6d874337d69b34a66ec97d138251ee690ad509`
  during review. Both pins are recorded; its Rust byte changes require their
  own final-image qualification. Do not build/deploy an unspecified moving HEAD.
- Actual unresolved Git conflict paths: **0**. Active peer WIP is not merged
  evidence and was neither edited, staged nor reset.

Against the PM parent, committed trees contain **zero changed paths** under
`services/economics`, `services/portal_execution_owner`,
`contracts/baseline/portfolio-account-v1_1`, and `db/migrations`; the existing
PM command transport is also unchanged. All nine following file pins were
checked byte-for-byte against parent, merge and post-format commit:

| Owning PM path | SHA256 |
|---|---|
| `services/portfolio_management/edge_command_transport.py` | `912fe9d80a952ef7ef825ee8e8e015834de6c16cd6c7573fa4bde3e14fadd2c9` |
| `services/economics/generation_runtime.py` | `d561df7457343a13f0ad484879786ad431ae40e4deebd5a4227094254100c459` |
| `services/economics/native_artifact.py` | `051e7ffeaf8b4fdc2c7bc7f5bf9ce3aa0e0b080b6b2ad49afa4a342c327d8f0a` |
| `contracts/baseline/portfolio-account-v1_1/pma11-14-edge-command-transport.json` | `83d251e847169571bdfd13839d9a2bcace7db3dda1e5be5b340650a56a6437ba` |
| `contracts/baseline/portfolio-account-v1_1/pma11-14-edge-command-handoff.json` | `7b62d7e17198347c85adc5267a319a175733adc2cb3b540d167a35135ed04a0b` |
| `contracts/baseline/portfolio-account-v1_1/pma11-13-14-16-portal-owner-intake.json` | `3e29f0395e3b07f885baecf3a0c0057367d3111359de34382af37fe904c8c407` |
| `contracts/baseline/portfolio-account-v1_1/pma11-shared-db-expansion-evidence.json` | `4434db7f33237307c1d88143d8fe76d6004d874c75b0a31c875e67183784f815` |
| `contracts/baseline/portfolio-account-v1_1/pma11-ts-release-evidence.json` | `88f3ed870b31affbaf14da7bf6be35cc4364552b5f5d842d110230969afa3ac6` |
| `upgrade/PMA11_GENERATION_SCHEMA_MIGRATION_RUNBOOK.md` | `dfd6fcfc1fb086d39ecc1601d623c52b9cf37d72842d1369b2dc6a4ea15ef29a` |

**Corrected handoff pin, not a merge regression:** the old transport descriptor
still lists original transport3885c72d. Current transport912fe9d8 was introduced
by `82f237b9`; its authoritative additive evidence is
`contracts/baseline/portfolio-account-v1_1/pma11-14-16-edge-lifecycle-evidence.json`.
That composition holds the exact original lifecycle through COMMIT, lease exit
and final response/drain. It retains the same two POST routes, closed four-field
body, TLS1.3/current-human/request-byte binding, full Outcome and UNKNOWN rules.
Use descriptor83d251e8 **plus current source912fe9d8/lifecycle evidence**, not
the descriptor's historical source hash as a current binary pin. The owning
record reports11 isolated PASS; this review does not rerun or count those as
new tests, and it does not edit peer-owned historical evidence.

| Surface | Merge consequence / Edge action |
|---|---|
| Authority/generation | Existing field/workload/current-human/source leases, immutable generation and native equality guards remain source authority. No new grant, source-set, history selection or generation adoption follows from Git merge. |
| Native/image | Dockerfile adds market-data-writer and retains `scripts.ts_release seal` for union SQL + actual installed native. Its hash is `42aded574316954e89deb5b07ecbbf27d666cc09064a22d8b388f1aa8bc17a74`. New merged/formatted extension/image must be built and qualified by TS/PM; never relabel old SDK/image as53890231. |
| PM command Rust | `pm_source`, `pm_command_port`, retained command store remain compatible with unchanged published transport/body/outcomes. No Rust patch or new alias required. Qualified runtime/native cell arrays remain empty; source compatibility does not commission a target. |
| Manager Rust | Owner Manager source and catalogue contract unchanged; canonical N19 static compatibility + three-profile activation gate PASS. No generic SQL route, broad transport, DB credential or JWT added to Rust client. |
| CLI-derived reads | Catalogue validator PASS for74 operations. AST comparison finds only `cmd_ops` changed,61 other functions unchanged: emergency-close adds one invocation key retained across transport retries. CLI SHA is now `7de9d56c513061c9f9711c5dd909b4cb1785a084fbd7a9bdef4e2f4d5e9b7806`. It does not add a read operation or authorize command execution. |
| Orders/fills | Added `ordinary_recovery.py` is source-owned signed order-observation recovery, explicitly not an independent fill fact. Do not synthesize fill/economics events or authoritative journal coverage from it. |

Current Edge adapter SHA256, unchanged by this review:

```text
command-relay/src/pm_source.rs                af7da0b9f6447e4a1b9745521c1e6e1dde66caa46bcd6c4bab140e8ac0b93367
edge-service/src/pm_command_port.rs           db69b1682642c6c69b310260f8eceead249421b69a4195a606ace65d5873b60e
edge-service/src/pm_command_port/stored.rs    7633f16142417e7495fc2aee8c119252047cfc4b5df985819f277b2aa895f761
projection-store-pg/src/command_pm.rs         204736ab854a941bd6d743b82d12d466abca3a22a8713578b4908a931e91695d
manager-v2-client/src/lib.rs                  6e5758da58fbe165bb4144ef28413426efa98d180c11e861824a991c16a67e70
```

Paths are relative to `services/portal-execution-edge-rs/crates/`.
PM release evidence still describes union128 (TS103+PM25), compatible shared
DB and existing native121ce77e; it is not proof that the new merge binary was
installed. PM generation-head0 in that evidence is unrelated to the original
finite native install/revoke counter8. Never overwrite either with the other.
Existing native provider28445/image28ea is untouched; no source/grant/listener
was opened for this review.

## 2. Genuine issuer located — no key regeneration or certificate change

**The issuer-custody lookup is resolved**, not waiting for a guessed PKI owner.
On SGP `bobby@178.128.51.255`:

```text
/home/bobby/secure/portal-execution-pki-v1/authority/sgp-client-ca.crt
/home/bobby/secure/portal-execution-pki-v1/authority/sgp-client-ca.key
/home/bobby/secure/portal-execution-pki-v1/authority/offline-root.crt
/home/bobby/secure/portal-execution-pki-v1/authority/offline-root.key
```

The two key paths were checked **metadata only**,0600/Bobby; no private key
bytes were read/copied/used. Offline Root is the certificate's identity/name,
not a claim that its current custody host is physically offline or an HSM.
Public certificate inspection/chain validation proves:

| Certificate | DER fingerprint SHA256 / validity |
|---|---|
| Primus Portal SGP Client CA v1 | `78a6de84cde14837ff64afe39dde694d9488fe5124ffeaa44437babd7166bc2c`;23Aug2028 |
| Primus Portal Execution Offline Root v1 | `036ce3ad9d03ddf9aa94c3b7165c5f1e74eef061a43d48749d53ecc4976dece2`;21Aug2036 |
| Primus Portal Edge Server CA v1 | `63354fd3bc35da2cfd39431c440128a0e5710025cf1ebd615ba0f2aee29b3381`;23Aug2028 |

The actual HK `/srv/primus/portal/execution-edge/sgp-client-ca.crt` first
certificate has **the same78a6de84 fingerprint**. Root→SGP Client CA verification
and existing SGP client leaf sslclient verification both PASS. Existing leaf
CN `portal-control-api.paper`, URI `spiffe://primusspark/portal/control-api/paper`,
clientAuth, valid to20Feb2027. Public issuance profile is
`authority/sgp-client.ext` SHA256
`c518d5e37e8f32c9f98e185ac74637cfc5a769e92233c9c2c88c2ae2e5453f1e`;
identity inventory SHA256
`d6885c41c6eca29b14e4d656c24ee2d2f17726fca79a367705fc5e1a1eae5fd6`.
This supplies a real custody/issuer reference, **not** proof of a signed new
Research leaf or authority to sign during this inspection.

## 3. All-mode Manager matrix and separated trust legs

Actual read-only Docker inspect confirms all three Rust Manager gates are true,
issuer `portal-control-api`, RS256 delegation TTL<=60s, same current CA/JWKS
mount and no restarts. Core's current `manager-data-leg-config.ts` agrees:

| Owner mode | Core→Rust Edge | Required JWT audience | Required profile | Actual existing gate / new Research binding |
|---|---|---|---|---|
| Paper | `https://10.70.0.2:8443` | `portal-execution-edge-paper` | `PAPER_BINANCE_USDM` | enabled / NOT_INSTALLED |
| Sandbox | `https://10.70.0.2:8444` | `portal-execution-edge-sandbox` | `SANDBOX_BINANCE_USDM` | enabled / NOT_INSTALLED |
| Canary | governed Live ingress8445 | `portal-execution-edge-live` | `LIVE_BINANCE_USDM` plus owning Canary scope | Live binding exists; no separate Canary grant/qualification inferred |
| Live | `https://10.70.0.2:8445` | `portal-execution-edge-live` | `LIVE_BINANCE_USDM` | enabled / NOT_INSTALLED |

`edge-service::mtls_client_verifier` uses TLS1.3 WebPkiClientVerifier with the
configured client CA; it does not map client URI SAN to an environment.
`edge-auth` verifies exact issuer/audience, TTL/time and required environment;
Manager request admission also checks exact profile. Thus Paper-named SAN is
**neither** a grant for another mode **nor** a hardcoded TLS Paper-only refusal.
Keep the existing reviewed workload identity; do not create per-mode keys or a
fourth unrecognised `canary` environment. Business READ, STREAM and mutations
remain distinct grants; certificate validity is not any of those grants.

**Leg A, Research Core→Rust Edge:** existing Research public CSR/JWK are already
on HK; do not request new keys. CSR/public SPKI is
`c164a42f98c9cb16103b4705d424eb23984d997a76cbcf2059321bd4fbcc192f`;
RS256 `kid=research-20261021-c185ee3d`. Prepared additive inactive overlap
`/home/bobby/secure/edge-core009-manager-overlap-20261022-ZllVvxNL/control-api.jwks.OVERLAP.INACTIVE.json`
SHA256 `7913317056d41e4406744153995aec8fcc69f6b4c90fce60f1663b1f4a07a73e`
retains old JWK exactly. It is **not mounted**. Research still needs its issued
leaf+chain from the identified SGP issuer and exact reviewed config/window;
never substitute the old stable private client/signer or native Ed25519 trust.
See [existing Manager/G2 readiness](EDGE_TO_CORE_08_MANAGER_AND_G2_READINESS_2026-10-22.md)
for all four public input hashes and inactive Core config references.

**Leg B, Source Proxy→TS Manager:** this is a different CA/identity/JWT plane.
Actual six facade/issuer services share mounted Manager CA
`/home/bobby/secure/portal-manager-read-v2/runtime/mtls-ca-cert.pem`, raw SHA256
`e439296eea937aced7c4216120f246f249e927d0525e4f38b6adb69b76c92caa`.
Issuer-custody reference is HK
`/home/bobby/secure/portal-manager-read-v1/mtls-ca-private.pem`0600/Bobby,
metadata only. Public facade/issuer/client leaves are valid until
15Nov2026,12:37:33UTC. Both server chain+hostname checks and Proxy client
chain+sslclient check PASS. Proxy upstreams8023/4,8123/4,8223/4 are NOT the
Core ingress ports. All three actual profile env pairs agree on:

- mTLS subject `spiffe://trading-system.internal/portal-execution-edge/manager-read-v1`;
- issuer `trading-system.portal-manager-read-v1`, audience
  `trading-system.portal-manager-read`, **EdDSA**, maxTTL300s,
  certificate-binding required;
- exact per-mode profile/environment, source binding enabled, mTLS/JWT required;
- command/broker/CLI-execution false. Read capability across modes is not trading.

This resolves the Paper/Sandbox/Canary/Live **configuration/trust inventory**.
On-disk valid certificates, mounted config and process health do not prove a new
Research mTLS/JWT exchange, loaded-key rotation or all-mode current-authority
acceptance. No such connected PASS is claimed.

## 4. Tests, runtime, cleanup and exact next owner/action

Actually run:9 committed parent/merge/post-format pin equalities; conflict check;
CLI catalogue validator74 entries; function-AST comparison; union release seal
presence; canonical `scripts/execution-n19-manager-compat-test.sh` PASS; two
SGP chain/purpose checks, two Manager chain checks, two server hostname checks
and one Proxy client chain/purpose check PASS; Research CSR signature/SPKI,
public-only two-key overlap and exact retention of mounted old JWK PASS.
These are source/static/public
crypto checks, **not** a new Rust/PG suite, load test or connected specimen.
Final staged R0/link/tracking results belong to the linked Unified entry.

Read-only runtime inventory: Edge8443/4/5 image
`sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e`,
configs6180b9bf/cd79e9c6/98a191c7; three Source Proxy image
`sha256:aa14e21c546997a94c61238ee46cf92cb650e822c4ea22f357090e275886246b`,
configs21786bb0/da4b44c0/9bb20c88. Manager Paper facade/issuer image28ea3958,
configs225db775/7710fc8e; Sandbox/Live image0bd48db3,
configs453f59be/a97d6be0/976ebe89/e68c4429. All12 observed restart0.
Native28445 remains28ea3958, no temporary28446 installation. Existing stable
release `/srv/primus/portal/releases/a9b10385ab6c16350555f70f4379dfa23ca6b20c`
and rollback resources untouched. No new container/image/cache/schema/role,
source copy, certificate, key or test row; cleanup **NO_ACTION_NEEDED** for
this slice, not permission to prune peer/shared artifacts.

| Owner | Remaining exact action in existing phases |
|---|---|
| TS/PM release owner | Return final merged/formatted source + immutable image/native/release seal and affected qualification; authority/generation/history adoption only with actual accepted source. No Edge code repair required by unchanged wire. |
| Core/SGP PKI custodian, through Edge mailbox | Use existing Research CSR and genuine SGP Client CA custody above to return issued public leaf/chain, fingerprint/SPKI/purpose/validity and inactive per-mode config pins. No key regeneration or stable credential reuse. |
| Core + Edge | ACK exact additive JWKS/mTLS/config install and rollback set before a separate runtime reconcile; then qualify bounded per-mode Manager reads and negative audience/profile cases. Current inspection makes no trust/config change. |
| Core + Edge native08 | Return a NEW feasible exact ACK/slot for missing active-revoke case;12:00–12:30 preparation expires normally. Never install against an expired/unacknowledged slot. This does not wait for Manager/P22/G2. |

**Concurrent Core return noticed12:23UTC:** consolidated return changed to raw
`bf6231446db5be92edcc44fd2e028122ee097ccfb9090a947954ecd5a0e97c5e`.
Read its new§8 ACK_PREPARATION_PINS (12:10UTC) and12:13 backup/capacity
checkpoint. The source8→9/revoke9→10 pins match the existing review; Core
explicitly requires actual READY before12:24UTC with >6minutes left, otherwise
a new finite proposal. This is no longer a missing Core ACK. The current
approved source/trust inspection does not arm/install native or fabricate READY;
do not force the nearly-ended slot or change current custody. Core owns its
fresh backup and accepted parallel CHANGE work; Edge owns subsequent fresh
source-window preparation/binding. The old d5f22ff3 return and d8bc917b Edge
review remain historical inputs, not the latest raw Core-return hash.

Canonical source remains `/home/bobby/.worktrees/portal-execution-manager-v2`
`feat/manager-v2-paper-read@54c6f5f3`; active owned feature is
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`
`feat/execution-edge-upgrade-v1_2` from23a7c189. No push/merge, shared runtime
mutation or peer-owned code change is part of this review.
