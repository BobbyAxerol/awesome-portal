# EDS-11R4 Market Context v1 — Master Request Annex

This directory is the machine-readable annex for **EDS-11R4**.  It is sent
only with the single
`TRADING_SYSTEM_PORTAL_EXECUTION_MASTER_CAPABILITY_REQUEST.md` owner campaign;
it is not a second request and does not alter the exact `MC-01…MC-09` return
schema.

The Trading System owner implements an additive private Manager/Edge adapter
over existing Data Layer readers.  The owner does not create a new database,
make a public listener, provide direct Portal/Redis/database access, or enable
runtime services as part of this packet.

## Files

- `market-context-owner-request.v1.json` is the exact source-as-is request.
- `market-context-owner-return.v1.schema.json` is the required sanitized
  owner return shape.
- `owner-return.pending.example.json` demonstrates the only honest state until
  a source-owned adapter is accepted.
- `fixtures/expected-coverage.v1.json` records the product semantics and
  source/Portal bounds without business data.
- `MANIFEST.sha256` binds every file in this directory byte-for-byte.

Run `sha256sum -c MANIFEST.sha256` before accepting or extending the packet.
Published source facts must use TLS 1.3 mTLS and a short-lived delegated
`execution:manager-v2:read` identity bound to profile/environment/audience.
The browser must never see upstream URLs, source cursors, mTLS material or
delegated JWTs.
