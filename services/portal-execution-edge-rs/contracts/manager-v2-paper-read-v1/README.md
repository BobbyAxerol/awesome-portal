# Manager-v2 Paper Read v1 — Imported Owner Pack

Status: **PRIVATE_PAPER_ROUTE_QUALIFIED / NO_PRODUCT_CONSUMER**

This directory is Portal's immutable import of the Trading System owner
publication for TS-OC-03F. It lets a later bounded Portal consumer generate
types from the proven contract without reconstructing owner semantics or
private runtime state.

`contract-pack.lock.json` pins every imported byte. The offline D2 gate
recomputes those hashes, verifies the five exact Manager routes and rejects
secret-shaped content before a configuration change can be qualified.

## Current truth

- The qualified route is private, same-host and fixed to
  `PAPER_BINANCE_USDM`.
- It has exactly five `GET` operations: catalogue, capabilities, named
  projections, bounded relation records, and bounded record-by-key.
- The Portal Source Proxy has no Trading System DSN, database role, issuer
  signing key, Redis, broker, CLI, command, Event/SSE or replay authority.
- The N11-v1 publication remains a truthful 24-path
  `TYPED_UNAVAILABLE` result. The Manager-v2 extension is not a completed
  N11-v1 surface.
- Existing D2/D3/D4, V1 hard guards, Execution Edge, projection database and
  Portal UI remain unchanged. There is deliberately no Rust Manager client,
  projection, cache or UI consumer in this handoff.

## Imported material

- `manager-v2.openapi.json` and `manager-v2-fixtures.json` are the frozen
  DTO source-dark contract inputs.
- `owner-publication/` is copied byte-for-byte from the owner TS-OC-03F
  publication, including the exact unavailable N11-v1 result and the
  digest-bound qualified Manager overlay.
- `source-proxy-manager-v2-locations.conf.template` is the exact allowlisted
  Source Proxy route template qualified with the pack.

Private certificates, private runtime environment values, database credentials
and detailed evidence stay outside Git. This import is a handoff/evidence
boundary, not a grant of direct database access or an automatic product
activation.

## Validation and next boundary

Run `./scripts/execution-d2-test.sh` for the offline hash, contract and
configuration gates. The actual route has been qualified only as a private
same-host Paper path. A future product-consumer slice must add a distinct
bounded Manager client and its own mapping/freshness tests; it must not widen
the allowlist or reuse the V1 transport implicitly.
