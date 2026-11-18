# Core009 — inactive Research Manager PKI return, 21 October 2026

Status: **GENERATED_INACTIVE_UNTRUSTED / PUBLIC_INPUTS_DELIVERED**.
This advances the [existing Manager data-leg preparation](CORE009_EXISTING_MANAGER_DATA_LEG_PREPARATION_2026-10-21.md),
not original lease recovery or fresh-data acceptance. Bobby approved a separate
compatible Research bundle; Edge's 07:03 intake requests these inactive inputs.
No current native trust/configuration, permission, session, grant or service changed.

## Actual artifacts and custody

Created at `2026-10-21T07:02:37.772Z`; candidate source remains
`734353113d8bec85f78b35ab81c9c1a40e93a67e`, Edge last read
`66b2bddb3eea404580b1c7c747bb6cf23735869b`.

- Proposed unique kid: `research-20261021-c185ee3d` (not trusted/activated).
- Two distinct RSA-3072 keypairs: delegation signer and mTLS client key.
- Private custody, SGP only: `/home/bobby/secure/core009-manager-data-pki-20261021-Ks6aGr/`.
  Signer `edge-signing.pkcs8.pem`; client `edge-client.pkcs8.pem`.
  Directory `0700`; files `0600`, Bobby/UID1000. These are references, not key values.
- Only the following public files were copied to HK:
  `/home/bobby/secure/edge-core009-manager-data-public-20261021-c185ee3d/`.
  Actual SCP exit0; all four hashes match SGP; remote directory0700/files0600/Bobby.

| Public input | Bytes | SHA256 |
| --- | ---: | --- |
| `research-signer.jwks.json` | 682 | `a8b44aad42207d5a83dbe87230d05b6de2972a634b797c3bced869c0297eb50c` |
| `research-client.public.pem` | 625 | `5b42ebfcc008da59ad9eae3769f4aa047d17a20a9f706d4832e5ee896b66827a` |
| `research-client.csr.pem` | 1427 | `41a94f899574d5bdf3e2dea139d23a5e2c4fcb1c467b2c5fdece14e3acea7f05` |
| `inactive-public-manifest.json` | 1973 | `3702345b28b47cd65042f8709819202ed4c4b8261750c3c30c6787d7d04abd97` |

CSR requests `CA:false`, digitalSignature, clientAuth and URI
`spiffe://primusspark/portal/control-api/paper`, matching the reviewed HK public
PKI profile. **A CSR is not an issued certificate.** No self-signed/TestOnly CA
or leaf was created. No JWT, login, grant or business request was issued.

## Validation, resources and cleanup

Five local cryptographic/custody checks PASS: CSR signature; CSR/public/private
key matching; distinct boundary keys; offline RS256 sign/verify with a non-token
message; exact permissions/owner. These are not product tests or trust acceptance.
Initial sandbox invocation hit `spawnSync openssl EPERM` after generating the
CSR; finalization resumed the **same** directory/keys under approved execution,
without regenerating or overwriting either key. No duplicate credential set.

No Docker cell, listener, DB row, service restart or build created. Keep the two
inactive keys in this named protected custody pending issuance/owner disposition;
do not install or remove them as anonymous cache. No stable/native key copied.

## Edge/offline issuer return required

1. Verify these public pins and proposed kid; identify the actual offline CA
   owner/reference and return a real client leaf plus public trust chain.
2. Review public JWK overlap while preserving existing stable kids. The issuer,
   audience and TTL metadata are proposals bound to existing Paper read contract,
   not authorization: `portal-control-api`, `portal-execution-edge-paper`, <=60s.
3. Prepare the smallest separately approved shared-Paper TLS/JWKS reconcile,
   exact old/new config/image pins, rollback and finite validation window.
4. Core then validates issued material and installs only in the agreed Research
   overlay. Original native28446 recovery still has priority; frozen inputs remain.

No new authority is inferred from possession of keys. `stream.subscribe` still
requires its own qualified whole-Fleet source and official scoped grant.

Claude may continue source-head/consumer/fixture work; this packet changes no
frontend contract and does not qualify a fresh Manager relation or writer.
