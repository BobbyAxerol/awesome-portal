# TS-OC-03F — N11 Owner Publication and Private Portal Handoff

Status: **OWNER_PUBLISHED / PRIVATE_PAPER_ROUTE_QUALIFIED**

This is a digest-bound publication of what the Trading System has actually
proven for the Portal Execution Edge. It has two intentionally separate
surfaces:

- The frozen N11-v1 24-capability catalogue is published exactly as
  `TYPED_UNAVAILABLE`. It is a complete unavailability statement, not a claim
  that any of the 24 V1 paths is callable.
- The separate Manager-v2 Paper extension is qualified through the private
  Portal Source Proxy. It has exactly five `GET` paths, TLS 1.3 mTLS on both
  hops, a fresh certificate-bound EdDSA assertion, a facade-only read-only
  database login and no public listener.

The Manager extension does not relabel, replace, or complete N11-v1. It is
fixed to `PAPER_BINANCE_USDM`; Sandbox, Canary, Live, commands, Redis, broker,
CLI, Event/SSE/replay, direct Portal database access and generic forwarding are
all absent.

The actual source/proxy runtime material and detailed evidence remain under
the private owner store. This pack contains only their SHA-256 bindings,
sanitized counts/statuses, and public contract/template references. No row,
credential, DSN, private key, certificate, JWT, SPIFFE value, raw SQL, or
runtime environment value is present.

Portal may import the Manager-v2 artifact bytes and this publication manifest
as a contract lock. It must not add a generic V1 transport, direct database
client, projection/UI consumer, or any additional Manager route in this
handoff. A later product-consumer task owns those changes.
