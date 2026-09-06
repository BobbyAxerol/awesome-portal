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
- `market-context-wire-contract.v1.json` freezes the two exact private
  Manager/Edge paths, their allowlisted query names and their body bounds;
  it prevents a later Portal consumer from guessing a route or falling back to
  a generic relation endpoint.
- `market-context-capability.v1.schema.json` is the schema for the owner
  return's non-secret route/capability index.
- `schemas/` freezes the positive, bounded source envelopes for latest and
  candle reads.  A typed non-2xx source failure stays a typed failure; a 200
  empty `items` array is the only authoritative-empty representation.
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

The owner must publish exactly these private paths when the first two
capabilities are accepted:

| Portal → Edge path | Edge → Manager path | Capability |
| --- | --- | --- |
| `/internal/v2/manager/market/latest` | `/portal/execution/v2/manager/market/latest` | `market.latest.v1` |
| `/internal/v2/manager/market/candles` | `/portal/execution/v2/manager/market/candles` | `market.candles.v1` |

They are server-to-server paths only.  They do not widen the existing generic
relation route, and this packet does not authorize a listener, proxy reload or
runtime activation.
