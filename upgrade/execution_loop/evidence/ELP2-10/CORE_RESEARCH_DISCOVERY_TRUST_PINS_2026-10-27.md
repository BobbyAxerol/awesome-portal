# Research discovery trust candidate pins — 27 October 2026

**PREPARED, NOT INSTALLED/TRANSFERRED/READY.** Public certificate pins and
private-reference locators only; no key or secret values are included. These
candidate certificates establish no membership, grant or connected acceptance.

The two separate 0700 SGP bundles were created by the existing
`scripts/execution-v2/provision-candidate-trust.mjs` under approved Research/Paper
scope; transient CA signing keys were retired. Both leaf chains verify against
their own CA. No Edge or PM key has yet been transferred to HK.

## Proposed hop A: Core client → Edge server

- Private bundle `/home/bobby/.research-reader-trust-20261027-hl6mqVHr/elp210-trust-EXenEM`.
- Trust manifest SHA256 `53bc19dd0a958c8544a0f3f6811655abba69e10184e97d725dd42efc8d050b31`.
- CA DER SHA256 `0696160a6c1a5584938d5461d16f9b1c94d4f2683af5201ae8b58b842552acb9`.
- `core` leaf DER SHA256 `8870853a85074c7954b0337523681a147c0f5efc395ca07f3cf3c5b9b24847bf`: stays on SGP as Core client.
- `pm` leaf DER SHA256 `0272239221f0b909ef9396750593fcf204d9fa69d7dbe5f0d466d6517208bcb9`: proposed Edge server identity; the generated directory label does not change the selected role.
- Certificate expiry `2026-10-28T10:23:28Z`; actual binding closes earlier at `2026-10-28T09:30:00Z`.

## Proposed hop B: Edge client → PM server

- Private bundle `/home/bobby/.research-reader-trust-20261027-hl6mqVHr/elp210-trust-sZFkX4`.
- Trust manifest SHA256 `4085f99d849dc3bad69585432fa1a9d8aa03e9e45322f8cd043bc27689891989`.
- CA DER SHA256 `c0acbabc63815b06b828ff95ba9a433d5e9935de1832687793604e623954e55a`.
- `core` leaf DER SHA256 `87e55acb288d0ad2eff15fbbf1dfef920e2476ac5d2ad3b51f531b8529e217e0`: proposed Edge client identity, distinct from hop A's Core client. The generated directory label does not assign it to Core.
- `pm` leaf DER SHA256 `026a43186de3bc977d3dec0768edd0a2deb782e07e36f8e1a6429504a3840325`: proposed PM server identity.
- Certificate expiry `2026-10-28T10:23:34Z`; actual binding closes earlier at `2026-10-28T09:30:00Z`.

The leaves have only their generated DNS identity and `127.0.0.1` as SAN.
The actual endpoints, hostname and TLS verification must match; do not bypass
hostname checking or assume these certificates cover a different private IP.
Material delivery, listener/config/manifest and a shorter viable window must be
matched and pinned before activation. Transfer only the exact required HK-serving
party material via the approved private channel; never transfer the hop-A Core
client private key, JWT signer keys not needed for this TLS-only slice, or CA
signing keys. Do not activate expired materials or reuse a retired session.

Connected discovery remains independent of the missing Paper membership root;
the latter still blocks ROOT/CURRENT and READ/STREAM. See
[Paper authority and transport receipt](PAPER_AUTHORITY_AND_SOURCE_TRANSPORT_2026-10-27.md).
