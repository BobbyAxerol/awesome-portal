# D4 Portal Paper Read Facade

Status: `SOURCE_RUNTIME_LOCAL_ACCEPTANCE_PASSED / LOOPBACK_ONLY / D4_SOURCE_PROXY_DISABLED`.

This is a Trading System-owned, loopback-only compatibility facade for the
Portal D4 Paper projection. It is intentionally independent of the alpha
Gateway because the legacy alpha `X-API-Key` path is compatibility-oriented and
cannot satisfy D4's mandatory identity or stable-cursor contract.

## Authority and non-goals

The facade is a read source only. It does not change Trading System authority
for orders, fills, positions, risk, paper matching, accounting, reconciliation,
brokers, Redis streams, CLI commands or databases. Portal receives neither a
database credential nor a Redis, CLI, admin, broker or command identity.

The source reads only a runtime-configured fixed scope:

```text
scope_id = PAPER_BINANCE_USDM
mode     = paper
venue    = BINANCE
accounts/strategies/instruments = root-owned runtime scope file only
```

The static source tree contains no production account, strategy, instrument,
credential, private key, DSN, alpha or business row.

Both the read-only SQL adapter and the facade validate this fixed scope. If an
unexpected mode, venue, strategy/account pair or instrument reaches the
facade, it returns no record and fails closed rather than widening the
projection.

## Listener and identity

- Facade host listener: `127.0.0.1:8011` only. In the standalone Docker
  manifest, the process uses `0.0.0.0` **inside its isolated container** so
  Docker can reach it; the sole host publication remains `127.0.0.1:8011`.
  Direct/local execution defaults to `127.0.0.1`, and any bind address other
  than those two explicit values is rejected.
- API header: `X-Portal-Paper-Read-Key`.
- Contract header: `X-Portal-Read-Contract: d4.paper-read.v1`.
- Every request needs both headers. Missing, wrong, expired or revoked key is
  denied with `401`; a key never falls back to the alpha or admin auth paths.
- One current and one overlap credential are permitted. Revocation is explicit
  in the root-owned identity document. Rotation is: add overlap → update Source
  Proxy runtime include → verify both keys with synthetic requests → revoke old
  key → remove old key after its overlap window.
- Audit logging contains only request method/path/status, request ID and
  SHA-256 identity fingerprint. It never logs request headers, query values,
  source records or response bodies.

The Source Proxy secret include is the only handoff location for the caller
credential:

```text
/srv/primus/portal/source-proxy/secrets/trading-system-read-header.conf
owner/group/mode: root:portal-runtime / 0640
```

Use [the template](deploy/portal-d4/trading-system-read-header.conf.example),
not a Git-tracked secret. The proxy must discard incoming caller headers and
inject only the dedicated D4 headers. Its four exact location blocks are in
[the D4 proxy include](deploy/portal-d4/source-proxy-d4-read-locations.conf.template).

## Exact allowlist and typed query contract

Only these four exact routes accept `GET`; no trailing-slash redirect, `HEAD`,
`OPTIONS`, mutation, admin, command, health, docs or catch-all route exists.

| Route | Query parameters | Result order | Paging |
|---|---|---|---|
| `/v1/events?snapshot=begin` | `snapshot=begin` only | N/A | creates one bounded snapshot and returns its event watermark cursor |
| `/v1/orders` | required `snapshot`, optional `cursor`, optional `page_size` 1–configured max | `updated_at ASC`, `account_id ASC`, `client_order_id ASC` | signed opaque snapshot cursor |
| `/v1/fills` | required `snapshot`, optional `cursor`, optional `page_size` 1–configured max | `trade_time ASC`, `fill_id ASC` | signed opaque snapshot cursor |
| `/v1/positions` | required `snapshot`, optional `cursor`, optional `page_size` 1–configured max | `updated_at ASC`, `account_id ASC`, `position_id ASC` | signed opaque snapshot cursor |
| `/v1/events` | required `cursor`, optional `page_size` 1–configured max | monotonically increasing `sequence` | signed opaque event cursor |

Unknown, repeated or caller-supplied scope query parameter is denied. A client
cannot choose a mode, venue, account, strategy or instrument through URL
parameters. Financial values are serialized as decimal strings. Raw provider
payloads, raw request/response columns and error text are deliberately omitted.

The machine-readable, static contract is
[`contracts/openapi/portal-paper-read-d4-v1.json`](contracts/openapi/portal-paper-read-d4-v1.json).
It is deliberately not served by the facade: exposing discovery or docs would
widen the four-route surface.
The matching capability and exact allowlist artifacts are
[`contracts/portal-paper-read-d4-v1.capability.json`](contracts/portal-paper-read-d4-v1.capability.json)
and
[`contracts/portal-paper-read-d4-v1.allowlist.txt`](contracts/portal-paper-read-d4-v1.allowlist.txt).

The following response bounds are runtime configuration, defaulting to a
250-row page, 1 MiB response, 10,000 rows per full snapshot and 10,000 retained
state-delta events. A request exceeding a configured response bound returns
`413 RESPONSE_SIZE_EXCEEDED`; it is never silently truncated.

## Race-free snapshot and incremental protocol

1. Call `GET /v1/events?snapshot=begin` through the mTLS Source Proxy.
2. Persist the returned opaque `snapshot` token and `event_cursor` before
   applying any rows.
3. Page orders, fills and positions using the same snapshot token until each
   response declares `complete=true`.
4. Persist the snapshot projection atomically on the Portal side.
5. Poll `/v1/events` strictly with the returned event cursor. Every event is a
   full-record, idempotent `UPSERT` or a tombstone `DELETE`, with unique
   `event_id`, `entity_id`, `entity_version` and monotonic `sequence`.
6. Persist the next event cursor only after durable application of the page.

The facade captures each baseline in one Trading System-owned
`REPEATABLE READ READ ONLY` transaction, then emits derived state deltas in its
own bounded source epoch. It does not claim an immutable Trading System audit
log. This is intentional: the projection reducer applies full state upserts,
not an inferred execution lifecycle.

Duplicate/retry is safe: repeating a cursor returns the same events. A cursor
that is tampered with is `400`; ahead of the current head is `409`; evicted,
expired or pre-restart epoch cursors return `410` and require one fresh
`BUILDING` epoch. The facade never guesses a missing range or moves a cursor
forward on behalf of the caller.

## Runtime wiring and prerequisites

Use only the standalone
[D4 Compose manifest](docker-compose.portal-paper-read.yml), never merge it
with the normal Trading System Compose definition. It is profile-gated as
`portal-read-d4`, has no default start, binds only the external
`executor_network`, bind-mounts only four root-owned files and has a read-only
root filesystem, dropped capabilities and `no-new-privileges`. This prevents a
D4 run from inheriting the shared runtime's `.env`, services or lifecycle.

Required private files are separate from the Portal Source Proxy secret:

| Purpose | Container path | Required property |
|---|---|---|
| Dedicated Trading System **read-only** DB DSN | `/run/secrets/portal-paper-read-postgres-dsn` | no Portal possession; read-only role; not world-readable |
| Identity rotation document | `/run/secrets/portal-paper-read-identity.json` | root-owned host file, no world access |
| Paper scope document | `/run/secrets/portal-paper-read-scope.json` | root-owned host file, contains approved business scope only |
| Cursor HMAC key | `/run/secrets/portal-paper-read-cursor-key` | random ≥32 bytes; root-owned host file, no world access |

Example formats are under [`config/examples`](config/examples). They are schema
examples only and must not be copied to a live path unchanged. The source
facade fails closed when any private file is missing, malformed, too permissive
or broad.

Before any run, the owner must separately supply the D4 encrypted EBS evidence,
the exact approved runtime secret files, a least-privilege internal PostgreSQL
read DSN, an immutable image digest, a Source Proxy mTLS configuration review
and an approved change window. No Portal source traffic, epoch, registry change
or query/SSE surface is enabled by this source change.

## Verification and rollback

Required source gates cover mandatory/missing/wrong/expired/revoked identity,
all four GET routes, every other method/route denial, fixed scope, exact decimal
strings, tied-order paging, duplicate retry, cursor tamper/ahead/epoch expiry,
rate and response limits. Test fixtures are synthetic only.

Runtime acceptance is separate: image pin, loopback bind, Source Proxy mTLS,
all negative cases, health/latency comparison, storage preflight and a bounded
fresh `BUILDING` projection. Rollback is removal of the dedicated facade
container/proxy include/secret mount only; Gateway V1 and every execution
service remain unchanged.
