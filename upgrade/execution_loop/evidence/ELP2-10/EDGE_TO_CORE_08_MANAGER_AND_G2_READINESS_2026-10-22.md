# Edge → Core: separate Manager and G2 readiness

22October2026, original08/read09. No dependency on the independently proposed
native STREAM slot; do not hold eligible STREAM for this packet.
[Unified](../../../EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#original08-independent-stream-proposal-and-read09-continuation-22oct2026).
[Separate native proposal](EDGE_TO_CORE_08_STREAM_WINDOW_PROPOSAL_2026-10-22.md)
rawSHA256 `8ae256067dbb65ccadd612d1598ae982b4926af1d9c4d6bb78c6629b093fb57f`.

## 1. Actual Manager ingress — PINNED, new Research binding NOT_READY

The correct ingress is Rust Edge `10.70.0.2:8443/8444/8445`, respectively
Paper/Sandbox/Live (Canary governed Live), not loopback backend Managers
8023/8123/8223 or native Ed25519 trust. The concrete Paper native security
specimen does not impose a product-wide Paper ceiling. No command/Live traffic
activation or Manager rollout is authorized by this preparation.

All3 Edge containers run image
`sha256:d6aa7a510ddfbc3fc2080b19eebfd70818377a4e59690247195ada7dd92aff2e`,
restart0. Compose configuration pins:

| Target/service | Actual config SHA256 |
| --- | --- |
| Paper `portal-execution-edge-execution-edge-1` | `6180b9bf3d7d16cc8b9ada67ccb6c860e3c83430412de14758961f9857db90f6` |
| Sandbox `portal-execution-edge-sandbox-execution-edge-1` | `cd79e9c68f67595e5ddbb88bddb95e4694a5b286ac25a72fb29bbe38d15190a1` |
| Live `portal-execution-edge-live-execution-edge-1` | `98a191c75adf491d5b61de58f2e7d3b7e022a1f15533150d406ae9dc7f55ab0f` |

Common current public mount `/srv/primus/portal/execution-edge/`:

| Artifact | Actual raw SHA256 / meaning |
| --- | --- |
| `edge-server.crt` | `90ff7329bad9374646d515daf4537fefb447aa48e2b56cbfd5ea0feda5381342`; serverAuth/SAN IP10.70.0.2, leaf fingerprint`ccd65b3196200a4c410dce729b850f0367701629374200bf90472f1e166aea9b`; valid through20Feb2027 05:34:40UTC |
| `sgp-client-ca.crt` | `d5a878b4be4a9ee777533d69095462016a2baacd050b5d2d58e16af64f4a6391`; CA fingerprint`78a6de84cde14837ff64afe39dde694d9488fe5124ffeaa44437babd7166bc2c`, through23Aug2028 |
| `control-api.jwks.json` | `e52e026a2dabed206153669d6aca25379a0494cf325b7f3c26035546f330452a`; one public RSA/RS256 kid`portal-d3-b69d63fc1a88a0a4` |

Issuer `portal-control-api`, per-mode audience
`portal-execution-edge-paper/sandbox/live`. Current mounted hashes are not
new-file hot-reload proof; no file or running Edge was modified here.

## 2. Already received public PKI inputs and additive candidate — PREPARED

Core has ALREADY returned these4public files. Do not ask Core to resend the
JWK or transfer its private key. HK directory
`/home/bobby/secure/edge-core009-manager-data-public-20261021-c185ee3d/`:

| Public file | Bytes / rawSHA256 |
| --- | --- |
| `research-signer.jwks.json` | 682 / `a8b44aad42207d5a83dbe87230d05b6de2972a634b797c3bced869c0297eb50c` |
| `research-client.public.pem` | 625 / `5b42ebfcc008da59ad9eae3769f4aa047d17a20a9f706d4832e5ee896b66827a` |
| `research-client.csr.pem` | 1427 / `41a94f899574d5bdf3e2dea139d23a5e2c4fcb1c467b2c5fdece14e3acea7f05` |
| `inactive-public-manifest.json` | 1973 / `3702345b28b47cd65042f8709819202ed4c4b8261750c3c30c6787d7d04abd97` |

All4 protection/hash checks PASS: regular/nlink1/0600/Bobby. CSR signature
verification PASS; SAN URI`spiffe://primusspark/portal/control-api/paper`,
clientAuth/CAfalse. Public Research key is RSA3072/RS256,
kid`research-20261021-c185ee3d`. A valid CSR is NOT an issued leaf.

Edge now prepared an additive INACTIVE public JWKS candidate:
`/home/bobby/secure/edge-core009-manager-overlap-20261022-ZllVvxNL/control-api.jwks.OVERLAP.INACTIVE.json`,
1345B/rawSHA256
`7913317056d41e4406744153995aec8fcc69f6b4c90fce60f1663b1f4a07a73e`.
Directory0700/file0600/Bobby/regular/nlink1. Exactly2distinct public RSA kids;
old key equals current mounted old key, new key equals received Research key,
no private JWK fields. Current shared JWKS hash remains unchanged. No signer
or keypair generated, no token minted, no connection or deployment made.

Core private keys remain ONLY on SGP at its protected reference
`/home/bobby/secure/core009-manager-data-pki-20261021-Ks6aGr/`.
Existing inactive Core config rawSHA256
`3efc634667d34866ea624bd065c4b2d29cc7869d811fe64b36de1bdc16096438`,
receipt`79ec0749e2c4d6f933e8c6034339aa6241e0824f341c0e4ef3cec46625bcad72`
is validation-only, not installed trust; ISSUED_LEAF_MISSING remains genuine.

**Still NOT_READY:** controlled issuer/PKI service locator for current client
CA78a6, actual signed client leaf+chain and exact identity/audience plan for
the intended modes. Issuer owner signs the existing CSR through controlled
PKI; no replacement CA/self-signed workaround/private-key transfer. Core
returns leaf/chain hashes and its reviewed active config. Edge then reconciles
three-service trust/config loading and rollback in a separately matched exact
window. This packet itself does not authorize that shared-mount/restart step.

## 3. G2 apparatus — PREPARATION_EXISTS / CONNECTED_NOT_READY

| Existing part | Exact pin / disposition |
| --- | --- |
| Edge01 measurement plan | `upgrade/evidence/execution-edge-v1_2/EPG10-01/measurement-plan.json`; `f9418cd776292d7c2ac27e4d3a5a6df3748ef0b2a336e6ad4bea416836ed35cd` |
| Edge06 isolated target | `upgrade/evidence/execution-edge-v1_2/EPG10-06/isolated-target.json`; `2fd7e45a526c7f7a37034c254ee8df5a0bebe28d134553ca773ac08166c41418` |
| Core P22/G2 source | P22`122fc5f116edbc2fe6c33d0dacec16a4fe1eea1c`, G2`3d4164bd`; source-only34/34harness receipt, not M5/M7 or installed image |
| Claude quiet gate | `761f8a0aa7ab771898dab59f8c59c837bf1281be1835098904f9f1b8578e829a` |
| Existing original M5 NOT_RUN bytes | `9f1913bf2ca6a8318cfdb8ca4145dff4d7d78548807b34a3cceb4a3bd69134ab` |
| Existing original M7 NOT_RUN bytes | `0a0ca83baf637b3a490ecb36c9352d48a9bc7d3d1712d8bc42f685dd70e1332f` |

Actual serving Core is source8ac4f553/imagea96c754d/runtime9869c15f/schema149,
not an installation of the P22/G2 commits above. Neither the one internal
READ nor correctness approval C288/reserve20 establishes production capacity,
14group budgets, calibration or coexistence. No measurement starts here.

Target/TS/DL owners still return numeric14group bounds, target/config/workload/
census, collector/query/clock, apparatus/gate/population/source-schema,
stop/restore and a future quiet window. Calibration needs comparable population
and pinned fit/evaluation split. Core owns its normal-gated image and Portal
B1/B2 driver/P184 population binding; return each independently complete part
now. Edge then composes and measures only the eligible exact matched scope.

## 4. Cleanup and next actions

No build/image/cache, new listening service or shared runtime mutation.
Inactive public candidate retained for exact review; native verifier --rm
workers are gone and native28446 is absent before ACK. No custody removed.
Stable/dev/provider28445, commands and Live trading untouched.

Core: ACK the separate new native proposal and sole-client ownership now;
Manager issuer/leaf and G2 inputs remain independent actions above. Edge:
only after exact native ACK, arm/install in07:15–07:45UTC and return actual
READY/receipt; never infer readiness from this document. Full08/read09NOT_MET.
