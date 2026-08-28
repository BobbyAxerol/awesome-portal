# TS-OC-03E — Private Manager-v2 Paper Qualification

Status: **OWNER_LOOPBACK_QUALIFICATION_PASSED_CLEANED_UP**

This pack is the private runtime overlay for the frozen source-dark
`trading-system.portal-execution.manager-v2.v1` contract. It does not alter
that v1 pack: v1 correctly states that its route and source were disabled at
freeze time. The overlay revision is
`trading-system.portal-execution.manager-v2.runtime.v1`.

## What the overlay changes truthfully

- It retains the five exact private Manager-v2 `GET` paths and their tagged
  value/envelope model.
- It records that TS-OC-03D.1 has supplied a canonical key class for all 96
  current catalogue relations. Runtime catalogue entries use
  `QUALIFIED_TS_OC_03D1`; expression-unique and view-source composite key
  classes are explicit rather than pretending each is a primary key.
- A runtime record includes an encrypted, opaque `record_key`, because the
  source-dark DTO had no way to give Portal a safe input to its own
  record-by-key path. Page cursors and record keys bind the profile, catalogue
  digest, relation, key order, and short expiry.
- Runtime capability descriptors distinguish a listener/source proven by the
  owner from a Portal deployment. `registered=true` and
  `owner_loopback_qualified=true` never imply `portal_reachable=true`.

## Scope and invariants

The qualification listener is TLS 1.3 mTLS only, verifies the real peer
certificate against the Manager trust bundle, and requires an EdDSA delegated
JWT bound to that certificate. It fixes `PAPER_BINANCE_USDM`, uses the
facade-only read login in `REPEATABLE READ READ ONLY` transactions, and reads
only explicit safe catalogue columns through D1 canonical keyset policies.
It enforces a 200-row and 1-MiB response cap plus private independent rate and
concurrency limits.

Secret cells, raw provider/configuration payload columns, and recursively
secret-shaped structured fields are excluded. A caller cannot select SQL,
database, arbitrary fields/sort, source, mode, venue, profile, command,
Redis, broker, CLI, Event/SSE/replay, Sandbox, Canary, or Live.

## Deployment boundary

The existing Portal Source Proxy is an immutable deployed D4/V1 release. It
has no Manager-v2 location and its legacy read locations are guarded `503`.
This owner pack neither edits nor reloads it. A Portal-owned proxy/client
change-window operation can consume this overlay after it verifies the
manifest and owner qualification evidence; Portal still never receives a DSN,
database role, issuer key, or raw secret.

The runtime overlay is not a public endpoint, Portal production activation, or
permission to enable Sandbox/Canary/Live/commands. Those remain separately
governed.

## Qualification result

The owner ran a real private TLS 1.3 mTLS client against the temporary
read-only facade and checked all 96 catalogue relations, seven named
projections, opaque cursor/record-key use, 20 bounded-load requests, missing
mTLS, invalid JWT, revoked JWT, and denied non-GET method behavior. The source
transaction reported read-only and rejected an attempted temporary DDL. A
temporary facade transport loss failed closed; the normal isolated facade was
then recreated and requalified. The sanitized count/metric/cleanup result is
[`qualification-result.json`](qualification-result.json).

The container was removed after the run, its ephemeral server/client
certificates, cursor key, revocation-test input and runtime env were removed,
and the final private check found zero other facade-login sessions. No Trading
System or Portal service was restarted and no database data/schema, role/grant
or index was changed.
