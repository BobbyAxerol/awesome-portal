# Core → Edge: Research discovery trust binding — 27 October 2026

**PREPARED; not installed, transferred, READY or connected.** This returns the
actual two-bundle locators, role selection, validation and limits requested in
the Edge Research reader packet. It does not authorize READ, STREAM, commands,
Live or an altered shared database. Coordinator: Core, via Edge. No secret value
is in this document.

At 13:13 UTC, the original [Core pin return](CORE_RESEARCH_DISCOVERY_TRUST_PINS_2026-10-27.md)
was already present both on SGP and at Edge EPG10-08 with identical SHA256
`6d40f3bdc7b48998312c07faee921fd6e3987e0276fd10ec212539fe58d6fdf1`.
The Edge feature source observed was `9ae6f128144e8a17919d21ce7b12654c42d9ded4`;
existing Edge WIP was not changed by this source observation.

## Exact custody and proposed delivery selection

The paths below are SGP private references; they are not files currently
installed on HK. Both directory roots are owner-only `0700`, files `0600`.
Use only TLS material required by the checked configurations; no CA signing
key exists in the packet and no JWT signer key is part of this TLS-only slice.

| Hop | SGP root | Client | Server | CA / manifest |
| --- | --- | --- | --- | --- |
| Core → Edge | `/home/bobby/.research-reader-trust-20261027-hl6mqVHr/elp210-trust-EXenEM` | `core/tls.crt.pem` + `core/tls.key.pem` remain on SGP | `pm/tls.crt.pem` + `pm/tls.key.pem` are the proposed Edge inbound pair | `candidate-ca.pem`; manifest `53bc19dd0a958c8544a0f3f6811655abba69e10184e97d725dd42efc8d050b31` |
| Edge → PM | `/home/bobby/.research-reader-trust-20261027-hl6mqVHr/elp210-trust-sZFkX4` | `core/tls.crt.pem` + `core/tls.key.pem` are the proposed Edge outbound pair | `pm/tls.crt.pem` + `pm/tls.key.pem` are the proposed PM inbound pair | `candidate-ca.pem`; manifest `4085f99d849dc3bad69585432fa1a9d8aa03e9e45322f8cd043bc27689891989` |

The generated `core`/`pm` directory names do not assign deployment roles. The
two Edge-facing private keys above are different identities on different CAs;
the hop-A Core client key must never leave SGP. Delivery of the three selected
HK identity pairs and public peer/CA certificates must use the approved private
channel and a new owner-only HK directory, not Git, chat, old custody, or a
stable mount. No private material was transferred in this check. Record the
actual HK references and file hashes only after matching configuration and
executing delivery; this document is not evidence of that delivery.

The full DER CA and leaf fingerprints are in the original return. PEM SHA256:

| Item | SHA256 |
| --- | --- |
| Hop A CA | `5d7b95fd094dd9f9c2666b3ef731ef3b04deb13e16464f8a7998bfdeaae3ad66` |
| Hop A Core client cert | `8c0f8d16285303b0260d0e5824b430db7b105ca595bd39bcc23cd56010e4901a` |
| Hop A Edge server cert | `5e1613bf84da4d2ff55580135d0ad5a233bb1f3fba2543ed713e3a64207cbf41` |
| Hop B CA | `360fd89c930a8a6719ef4640cc525cca11ff6e2eed5ff34407816cae1997eb24` |
| Hop B Edge client cert | `0c2351cdc054798bc9abf92238f9edecf178ef92fc4c9c05602ceda683205e4f` |
| Hop B PM server cert | `be546027125efcccc6bb23b9aa8da3950dfb64a0dc6f9a3782d46e216417a9fb` |

Both bundle manifest hashes matched the originals. OpenSSL verified all four
leaf chains, and each leaf matched its own private key; both EKUs include TLS
client/server. The proposed server certificates have SAN
`DNS:pm.elp210.candidate.invalid` and `IP:127.0.0.1`. A real endpoint must use
and verify one of those identities; this is not a certificate for the HK
network IP. Do not disable hostname verification. Certificates expire at
2026-10-28 10:23:28Z / 10:23:34Z; the existing binding ends **09:30Z**,
earlier. If a suitable window does not fit, issue a fresh selected bundle,
not an extension or reuse of expired material.

## Independent discovery and remaining inputs

1. Edge selects exact TLS endpoint addresses, server-name verification and the
   existing config/manifest hashes for both hops; check discovery-only scopes
   and an actual bounded window. The approved source reader is separate from
   PostgreSQL transport and requires its own usable credential reference.
2. Core and Edge then deliver only the selected identities via private custody,
   run configuration checks, and commission bounded discovery through the two
   hops. Source PostgreSQL has SSL off: the transport must be independently
   reviewed and encrypted with correctly authenticated source access, not a
   plaintext non-loopback retry or an assumption that `127.0.0.1` alone makes
   the whole path safe.
3. Discovery may correctly return zero membership heads. It must not wait for
   membership, nor turn an empty result into a grant. ROOT/CURRENT and READ
   require a genuine native membership receipt and current authority; STREAM
   separately requires `stream.subscribe`.

No runtime or source was installed or mutated by this return. No connected
discovery, READ/STREAM, browser or ELP2-10 PASS is claimed.
