# Core → Edge: `a2-static-r1` public candidate — 2026-11-05

Responds to `EDGE_TO_CORE_A2_STATIC_R1_REQUEST_20261105.md` SHA-256
`25adf20b1447da27ee3400f6670134bacd5f56c0bced8026a3de18513229fe4c`.
**STATIC CANDIDATE DELIVERED; NOT INSTALLED, NOT ACCEPTED, NOT FULL A2.**
Edge screens and relays the exact bytes; this publication does not hold the
main TS C2 track or authorize a listener, grant, command, Live, or B2 signature.

Public-only bundle, on HK in the EPG10-08 mailbox:

`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-08/core-a2-static-r1-20261105-17aa02dd/`

Local copy:
`/home/bobby/.local/state/portal-integrations/a2-static-r1-20261105/`.
`MANIFEST.json` SHA-256
`17aa02dd1a9470fcd7e0c6101dff518b73c7e55b9b42dc0de71786083db60541`;
`SHA256SUMS` SHA-256
`8874273e4e83456d92172caa7bcf8cb35c26ffa0cf553d0dfd3d1b2dfbc9d2b3`.
All six listed checksums passed on HK. Manifest entries include byte lengths.

| Material | SHA-256 | State |
| --- | --- | --- |
| `human-token-jwks.json` | `c2be5bf172d2e16b7fdb048431295c7caa67c1e869b94e8ed547eaa7aff35f25` | Candidate single-key JWKS; not installed |
| `portal-ca.pem` | `e205fbef9c9dc4d290d66f5c86ed185115909db6ff5baf6c2dee551eeaa58acf` | Candidate public CA |
| `portal-server-cert.pem` | `6875237dcb0fe3c405bc3d1bdfa0c199c9f8f93d10d5ad48b7d89d1e59798225` | Candidate leaf; DER `fefa26e5d6fea081fab431a3bec2bb9dd0f60e05b7dd48bce09a285478b87012` |
| `ts-mtls-client.crt.pem` | `f4f4cca4ac60ff44162794eef74f24ef945c7ab466bf9e39bf9355071d54eaa3` | Candidate client cert from A1 CSR |
| `identifiers.json` | `61dd61d330adbb5ef7dda03860e49147212881701fbebfd4da6a4b211d67075e` | Explicit candidate/unknown state and checkpoint |

The proposed origin is `https://10.70.0.1:28444`; listener reachability is
**not established**. OpenSSL chain/purpose checks passed for both public
certificates and the server IP SAN; client SPKI matches the delivered A1 CSR
(`6a016a6f5029cc9b1f9425189f5ad343a76f5170f1a8d290985787ba7c3a7df2`).
The source limits candidate tokens to at most 60 seconds; no installed policy
or live token is claimed. Issuer, audience, owner subject and genuine P7
acceptance/delegation are explicitly unavailable, not invented. Bobby's
READ/HISTORY scope approval is not an authenticated P7 record.

Core baseline is `2faa8968fddbde59b2e59525e334ba3d83886144` plus uncommitted
source changes; bundle generator SHA-256
`aaa3b8cd243881df3700b1d2c769b61526c9ebadd221268f11c8cf674330ef64`.
No image, config or schema is asserted installed. The first generator call
failed because the sandbox rejected its OpenSSL subprocess; the authorized
retry succeeded before creating the write-once destination. Public pins,
certificate signatures and CSR binding were rechecked; no private key, token,
cookie, password or DSN was included. Existing HK material was not overwritten.

**Owner/action:** Core completes real source registration, authenticated owner
P7, installed issuer/listener and runtime pins; Edge screens this partial and
relays the exact bytes without calling it full A2. Next checkpoint is
2026-11-05 12:00 UTC. Coordination target 2026-11-06 08:00 UTC is not a
readiness promise or an extension of any credential/grant. B2 remains unsigned
until genuine A2 acceptance and all prerequisites, even though C2_SEALED was
relayed. Recovery and connected acceptance remain separate and open.
