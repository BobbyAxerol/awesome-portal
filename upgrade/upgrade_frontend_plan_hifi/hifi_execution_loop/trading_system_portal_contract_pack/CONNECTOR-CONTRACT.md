# Trading System → Portal connector contract

> **Audience:** Portal backend team building `portal-execution-edge-rs`
> **Status:** discovery evidence, `READ-ONLY`. Not an implementation authorization.
> **Captured:** 2026-08-21 UTC, Execution Cell AWS HK, host `ip-172-31-16-126`
> **Method:** source AST extraction + read-only runtime inspection. No Trading System
> file, container, database row, Redis key or credential was modified or read as plaintext.

This document is the human entry point. Every claim below resolves to a
machine-readable file under [`extract/`](extract/) that a code generator can consume
directly. Where evidence is absent the status is `MISSING` / `UNKNOWN` / `PARTIAL` —
never inferred.

---

## 0. Read this first: the OpenAPI document is not a connector contract

The gateway publishes a valid OpenAPI 3.1 document at `/openapi.json`, and it is
**semantically accurate about which routes exist** — 91 paths, 104 operations, an exact
match against the committed `contracts/openapi/trading-system-v1.json`. It is **not
usable as a client contract**, because FastAPI handlers take a bare `Request`:

| What a connector needs | What the spec declares | What we recovered | Coverage |
|---|---|---|---|
| query parameters | **0** (only 47 `in: path`) | 31 operations, exact names + aliases | **100%** |
| request bodies | **0 of 104** | 46 of 48 mutations resolved to a field list; the other 2 genuinely take none | **100%** |
| response schemas | every 200 is `{}` | 43 row shapes + 23 composed shapes + 38 envelopes | **100%** |
| serialization | not expressible | pg type → JSON wire type → Rust type, all 630 typed fields | **100%** |
| component schemas | **2** (`HTTPValidationError`, `ValidationError`) | 85 models / 468 fields across 32 modules | — |
| `securitySchemes` | **null** | 4 auth classes resolved per operation | **100%** |
| error contract | absent | 124 reason codes; 40 attributed to specific endpoints | **~85%** |

Consequence: **generate the Rust client from [`extract/`](extract/), not from
`openapi.sanitized.json`.** Use the OpenAPI document only to assert that the route set
has not drifted.

Generation inputs, in order: [`api-surface.json`](extract/api-surface.json) (routes, auth,
params) → [`request-contracts.json`](extract/request-contracts.json) (bodies) →
[`response-shapes.json`](extract/response-shapes.json) (fields) →
[`serialization-contract.json`](extract/serialization-contract.json) (types) →
[`vocabularies.json`](extract/vocabularies.json) (enums) →
[`error-catalog.json`](extract/error-catalog.json) (failure mapping).

> **Note on `data_layer`:** the opposite is true there. Its OpenAPI declares query params,
> request bodies and typed schemas, so generate that client straight from its own spec.
> See [`extract/data-layer-contract.md`](extract/data-layer-contract.md).

---

## 1. Runtime identity — re-verified, and it drifted

The previous capture (2026-08-20) is **stale**. Current state:

| Component | 2026-08-20 capture | 2026-08-21 observed | Impact |
|---|---|---|---|
| `gateway_service` | `tradingsystem-image:v1.2.0-9081397` | **`tradingsystem-image:sha-8b88daa61e3`** (`sha256:4f63dc9949f8…`, built 07:28Z) | image changed, **API surface did not** — `/openapi.json` is byte-identical (`sha256:c4f65309…`) |
| `command_journal_service` | not running (profile `durable-command`) | **running** (`sha-8c9a96cc8eb`) | closes prior gap TS-GAP-006 |
| `market_data_service` | `v1.2.0-9081397` | `sha-8c9a96cc8eb` | rebuilt |
| 10 other TS services | `v1.2.0-9081397` | unchanged, up 3 days | — |
| data layer | `data_layer_service` V1 only | V1 **plus** a 17-container `qdl_v2_stable_candidate` stack (3× Kafka, 3× rust_core, 2× query_v2, stream_v2 active/passive, 4 ingestors incl. OKX) | V2 market-data plane is now live-ish; still **not** the Trading System authority |

`trading_system` git HEAD is unchanged at `9081397de9e981c43b4e0f67fabe747e7ed964c7`
(detached, tag `v1.2.0`), so **the running gateway is not built from the checked-out
source.** Treat the container image digest as identity, not the git SHA.

> **Connector rule:** pin to the image digest and re-run
> `scripts/00_runtime_identity.sh` before any deploy. Evidence:
> [`evidence/phaseF/runtime_identity.txt`](evidence/phaseF/runtime_identity.txt).

---

## 2. Authentication — the most important finding in this pack

**`X-API-Key` is optional on every alpha-facing endpoint.**

`services/gateway/core/engine.py:check_auth_and_rate` gates on membership in the
Redis set `gate:active_alphas`, then validates the key **only if the header is
present**:

```python
is_active = await self.redis.sismember("gate:active_alphas", alpha_id)
if not is_active:
    return False, "UNAUTHORIZED_ALPHA", 403
if api_key is not None:          # <-- omitting the header skips verification entirely
    ...verify_api_key(...)
```

So knowing an active `alpha_id` is sufficient to read that alpha's orders, fills,
positions, balances and events, and to submit orders in its name. Confirmed at
runtime: `GET /v1/orders?alpha_id=<unknown>` returns `403 UNAUTHORIZED_ALPHA`, which
proves the set-membership branch is the only gate being exercised.

| Interface | Operations | Credential | Verified how | Gap vs handoff §6 |
|---|---|---|---|---|
| Admin | **54** | `X-Admin-Token`, or `X-Admin-User` + `X-Admin-Password` | `secrets.compare_digest`; `503 admin auth is not configured` if neither is set | no RBAC tiers, no actor identity, no approval binding |
| Alpha read/write | **41** | `alpha_id` in `gate:active_alphas`; `X-API-Key` **optional** | `sha256$v1$` / `hmac-sha256$v1$` peppered digest, only when header present | **no authentication when the header is omitted** |
| Alpha replay scope | **3** | as above **plus** `account_id`→`alpha_id` ownership check | `403 ACCOUNT_ALPHA_MISMATCH` | strongest gate in the system |
| Public | **6** | none | — | `/v1/health` exposes service topology and venue capability |

`GATEWAY_LEGACY_PLAINTEXT_API_KEYS_ENABLED` defaults to **`true`**, so plaintext keys
still authenticate and are transparently upgraded to a hash on first use.

**Connector consequences**
1. The Portal edge is the **only** identity boundary. Do not describe a Trading System
   call as "authenticated by Trading System" in any audit record.
2. Never expose an `alpha_id` to a browser context that can reach the execution network.
3. A dedicated Portal service account is technically an allowlist entry in
   `gate:apikeys` — but creating one is a mutation and remains
   `OWNER_DECISION_REQUIRED`.

Evidence: [`extract/api-surface.json`](extract/api-surface.json) (`auth` per operation),
[`extract/runtime-probes.json`](extract/runtime-probes.json) (rejection contract).

---

## 3. Query surface — 104 operations with real parameters

Full table: [`extract/api-surface.md`](extract/api-surface.md) ·
machine-readable: [`extract/api-surface.json`](extract/api-surface.json)

Per operation you get: method, path, handler symbol + line, auth class and the exact
gate function, path params, **query params actually read**, **body fields actually
read**, explicit status codes, literal response envelope keys, and the repository
methods called.

### Pagination — confirmed gap, with a confirmed workaround

| Endpoint | Filters | Ordering | Paging | Cursor |
|---|---|---|---|---|
| `GET /v1/orders` | `alpha_id`\|`strategy_id`, `mode`, `venue`\|`exchange`, `symbol` | `updated_at DESC` | `limit` (default 100) | **none** |
| `GET /v1/fills` | same | `trade_time DESC` | `limit` (default 100) | **none** |
| `GET /v1/positions` | + `include_flat` | `updated_at DESC` | `limit` (default 200, capped 500) | **none** |
| `GET /v1/events` | `trace_id`, `client_order_id`, `alpha_id`, `account_id`, `mode`, `venue`, `event_type`, `from`/`ts_from`, `to`/`ts_to` | **`event_ts ASC, created_at ASC`** | `limit` default 500, **max 5000** | **`(event_ts, created_at)` time cursor** |

There is no keyset cursor on the list endpoints and no `offset` either — deep paging
of a large blotter is not expressible. `ORDER BY updated_at DESC` is also unstable
under concurrent updates, so naïve `limit` paging can skip or duplicate rows.

**Workaround that needs no Trading System change:** build the Portal projection from
`GET /v1/events` (ascending, time-cursored, gap-resyncable) and serve blotter paging
from the projection. See §4 for why this path is thinner than it looks.

### Request bodies — resolved for all 48 mutations

The gateway binds the whole body (`data = await request.json()`) and hands it to a
repository or a Pydantic model, so the field contract lives one hop deeper.
[`extract/request-contracts.json`](extract/request-contracts.json) follows that hop:

| Resolved via | Ops |
|---|---|
| handler reads fields directly | 29 |
| callee `payload["x"]` / `payload.get("x")` | 11 |
| Pydantic model built inline from the body | 5 |
| Pydantic model built inside the callee (`engine.validate_* → AlphaOrder`) | 1 |
| **genuinely no request body** (path params only) | 2 |

`required` is derived from the access form: `payload["x"]` raises on a missing key,
`payload.get("x")` does not. 264 fields total.

### Response shapes

43 endpoints resolve to an exact ordered field list, 23 more to a composed dict shape,
38 to an envelope. 630 of 667 fields carry a real PostgreSQL type read from the live
catalog. Envelope is uniformly `{"status": "OK", "<collection>": [...], "count": N}`.

Four replay-job endpoints are **hand-verified rather than machine-derived** (their
repository writes with `RETURNING *`, which the SQL parser cannot resolve) and are
flagged `hand_verified: true`. All four are gated behind `REPLAY_V2_ENABLED=false` and
currently return `503 replay v2 is disabled`.

```
GET /v1/positions -> {"status","positions","count"}, rows from positions_v2:
  position_id, strategy_id, account_id, mode, venue, instrument_id, symbol, side,
  signed_qty, quantity, avg_px_open, avg_px_close, realized_pnl, unrealized_pnl,
  peak_qty, opened_at, closed_at, updated_at        (ORDER BY updated_at DESC)
```

Note `strategy_id` is the wire name for what the rest of the system calls `alpha_id`.

---

## 3.5. Serialization — the trap that breaks naive codegen

Every repository passes rows through a `_jsonable()` helper before encoding:

```python
if isinstance(value, Decimal):  return str(value)      # numeric -> JSON STRING
if hasattr(value, "isoformat"): return value.isoformat()  # timestamptz -> string
```

So **63 `numeric` columns arrive as JSON strings, not numbers** — `quantity`, `price`,
`realized_pnl`, `unrealized_pnl`, `avg_px_open`, every balance and every PnL field. A
Rust struct generated from the PostgreSQL types in `db-schema.json` would declare `f64`
and fail to deserialize on the first response.

| PostgreSQL | JSON wire | Rust |
|---|---|---|
| `numeric` | **string** | `rust_decimal::Decimal` (serde-with-str) — never `f64` |
| `double precision` | number | `f64` |
| `bigint` / `integer` | number | `i64` / `i32` |
| `timestamp with time zone` | string | `chrono::DateTime<Utc>` |
| `timestamp without time zone` | string | `chrono::NaiveDateTime` — **no offset, do not assume UTC** |
| `jsonb` | object/array/scalar | `serde_json::Value` |
| `uuid` | string *(usually)* | `String` — see below |

**One more trap:** `_jsonable()` is copy-pasted across 13 sites and the copies differ.
Only `services/gateway/repository/event_store.py` stringifies `UUID`; **7 other copies
do not**, so a raw UUID object reaches the encoder there. Treat every uuid-typed column
as `String` and tolerate both forms until confirmed per endpoint.

Full per-endpoint table: [`extract/serialization-contract.md`](extract/serialization-contract.md).

---

## 4. Events — the design is sound, the runtime is nearly empty

This is the largest correction to the previous pack, which listed 12 event facts as
`CONFIRMED_SOURCE`.

**Runtime truth** (aggregate counts only, no payload row was read):

| Fact | Observed |
|---|---|
| distinct `event_type` in `domain_events` | **1** — `ORDER_STATUS` |
| rows | 1 179 |
| window | 2026-06-30 → **2026-08-17** (no events for 4 days) |
| producers | 1 — `postgres.order-state-projector.v1`, `schema_version 2.0`, `canonical_contract_version 2.0.0` |
| `copy_event_outbox` | **0 rows** |
| Redis stream `copy:events:v1` | **XLEN 0** — never created |
| `copy_event_dead_letters` | 0 |
| `event_idempotency` | 0 |

So `fill.created`, `position.changed`, `account.changed`, `reconciliation.changed`,
`operation.changed`, `deployment.changed` and `risk.changed` have **no runtime
instance whatsoever**. They exist as source constructs (7 `event_type` literals,
5 `domain/events.py` dataclasses, 7 committed JSON Schemas under `contracts/events/`)
but nothing emits them today.

**What rescues the design:** `EventStoreRepository.synthetic_projection_events()`
reconstructs `ORDER_STATUS`, `ORDER_FILLED`, `ORDER_BRACKET_STATE` and
`ORDER_BRACKET_LEG_STATE` **from the canonical `orders` / `fills` / brackets tables**
when `domain_events` has no row. The replay API therefore returns a complete order
lifecycle even across the event-log gap. This is the path the Portal projection should
be built on.

| Property | Value |
|---|---|
| durable source | `domain_events` (hypertable, 8 chunks) + canonical tables via synthetic projection |
| read path | `GET /v1/events` (alpha replay scope), `GET /v1/admin/events` (admin) |
| ordering | `event_ts ASC, created_at ASC` |
| cursor | `(event_ts, created_at)`; `event_id` is the **dedupe** key, not filterable |
| global sequence | **MISSING** — `copy_event_outbox.sequence_id` exists but is not exposed over HTTP |
| delivery | at-least-once, dead-letter after `COMMAND_JOURNAL_MAX_ATTEMPTS = 10` |
| gap recovery | `/v1/admin/replay/order-lifecycle`, `/v1/admin/replay/compare`, `/v1/replay/*` |
| realtime push | **MISSING** — no SSE, no WebSocket in 104 operations. Portal edge owns fan-out. |

Evidence: [`extract/event-catalog.json`](extract/event-catalog.json).

---

## 5. Commands — richer than previously reported

The prior pack recorded `expected_aggregate_version` and the `DENIED`/`CONFLICT`/
`EXPIRED` states as `MISSING`. Both are **wrong**.

### Optimistic concurrency exists

`services/gateway/schemas/order_group_schema.py:134,143` declare
`expected_version: int | None = Field(default=None, ge=0)`, enforced in
`services/order_groups/repository.py:784` and surfaced as:

```
HTTP 409  {"status": "CONFLICT", "reason": "VERSION_OR_STATE_CONFLICT"}
```

Scope: **order groups only**. No other aggregate exposes a version. Five operations
return 409 (`POST /v1/order-groups`, `PATCH /v1/order-groups/{id}`,
`POST /v1/admin/order-groups/{id}/reconcile`, `POST /v1/order-packages/arb`,
`POST /v1/execution-sessions/{id}/pre-risk`).

### The durable command journal has a full state machine

DB `CHECK` constraints (authoritative):

| Table.column | Values |
|---|---|
| `command_journal.state` | `DISPATCH_PENDING`, `DISPATCHED`, `ACCEPTED`, `ACKNOWLEDGED`, `BUSINESS_REJECTED`, `UNCERTAIN`, `SUPERSEDED`, `SHADOW_OBSERVED`, `DEAD` |
| `command_journal.command_kind` | `PLACE`, `AMEND`, `CANCEL`, `EMERGENCY_CLOSE` |
| `command_ack_evidence.outcome_class` | `ACCEPTED`, `BUSINESS_REJECTED`, `RETRYABLE`, `TERMINAL`, `UNCERTAIN` |
| `command_delivery_attempts.outcome_class` | `DISPATCHED`, `RETRYABLE`, `TERMINAL`, `UNCERTAIN` |
| `command_dispatch_outbox.state` | `PENDING`, `LEASED`, `DISPATCHED`, `ACKNOWLEDGED`, `CANCELLED`, `DEAD` |
| `operator_operations.status` | `PLANNED`, `INTENTS_QUEUED`, `PARTIAL`, `VERIFIED`, `FAILED` |
| `execution_replay_jobs.status` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED` |

Mapping to handoff §5.4: `PLANNED`→`PLANNED`, `DISPATCHED`/`ACCEPTED`→`ACCEPTED`,
`DISPATCH_PENDING`/`RUNNING`→`IN_PROGRESS`, `ACKNOWLEDGED`/`VERIFIED`→`VERIFIED`,
`PARTIAL`→`PARTIAL`, `DEAD`/`FAILED`→`FAILED`, `BUSINESS_REJECTED`→`DENIED`,
`VERSION_OR_STATE_CONFLICT`→`CONFLICT`, `UNCERTAIN`→ no Portal equivalent, **add one**.
`EXPIRED` remains genuinely `MISSING`.

### But the journal is switched off and full of dead rows

| Signal | Value |
|---|---|
| `COMMAND_JOURNAL_ROLLOUT` | **`"OFF"`** |
| `COMMAND_JOURNAL_ACK_REQUIRED` | **`false`** |
| `command_journal` rows | **430, every one in state `DEAD`** |
| `command_dispatch_outbox` | 430 rows, all `DEAD` / `delivery_stage=INGRESS` |
| `command_ack_evidence` | 430 rows |
| `command_delivery_attempts` / `command_broker_attempts` | 0 |

The service is running and `/v1/health.command_journal` now reports
`{rollout, status, pending, dispatched_unacked, dead, dead_operator_quarantined,
dead_actionable, oldest_pending_seconds, max_attempts, uncertain}` — but with rollout
`OFF` and 430 dead ingress rows, **no command has ever completed a journalled
lifecycle here**. Treat the state machine as `CONFIRMED_SOURCE`, not
`CONFIRMED_RUNTIME`, and raise the dead-row backlog with the owner before wiring the
Operations Queue to it.

### PLAN → APPLY → VERIFY

Only `emergency-close` implements all three
(`GET …/plan` → `POST …` → `GET …/{operation_id}`). `config` has plan + apply.
Every other mutation applies directly. `POST /v1/order-groups?submit=true` is the
**only** endpoint that returns `202`; everything else returns `200` on accept.

### CLI → API reachability

64 CLI actions across 19 groups. **47 are pure HTTP** (Portal-reachable), 10 are mixed,
and **7 have no HTTP equivalent at all** — `authority list`, `authority create`,
`redis get|scan|alpha-auth|trading-state|stream`. Those reach Postgres or Redis
directly, which the Portal is forbidden to do (handoff §2.3), so they are genuine
capability gaps. Full table: [`extract/cli-command-map.md`](extract/cli-command-map.md).

---

## 6. Vocabularies — fail-closed mapping tables

[`extract/vocabularies.md`](extract/vocabularies.md) · 22 Python enums,
**91 DB `CHECK` constraints across 33 distinct fields**, 6 venue/product profiles.

Two traps:

1. **Never key a vocabulary by column name alone.** 7 field names carry different
   value sets on different tables — `status` means one thing on `settlements`
   (`SCHEDULED|SETTLED|FAILED|CANCELED`) and another on `reconciliation_findings`
   (`OPEN|ACKED|RESOLVED`). The extract is keyed `table.column` for this reason.
2. **`orders.status` has no DB `CHECK`.** The 12-value `OrderStatus` enum
   (`INITIALIZED, SUBMITTED, ACCEPTED, REJECTED, DENIED, PENDING_UPDATE,
   PENDING_CANCEL, PARTIALLY_FILLED, FILLED, CANCELED, EXPIRED, TRIGGERED`) is
   enforced in application code only. Storage will accept anything, so the connector
   must validate on read, not trust the column.

### Venue / product capability matrix

| Venue | Product | Modes | Exec | Position modes | Rollout |
|---|---|---|---|---|---|
| BINANCE | USD_M | paper, sandbox, live | ✓ | ONE_WAY, HEDGE | `ACTIVE` |
| BINANCE | SPOT | paper | — | NET | `MARKET_DATA_ONLY` |
| DNSE | VN_EQUITY | paper, live | ✓ | NET | `ACTIVE` |
| DNSE | VN_DERIVATIVE | paper | ✓ | NET | `PAPER_ONLY` |
| OKX | SWAP | sandbox, live | — | NET, LONG_SHORT | `DISABLED_PENDING_ACCEPTANCE` |
| OKX | FUTURES | sandbox, live | — | NET, LONG_SHORT | `DISABLED_PENDING_ACCEPTANCE` |

### Corrections to the previous DD-05 conclusions

| Previous claim | Actual |
|---|---|
| "LO/ATO/ATC do not exist" | `OrderType` **does** define `ATO` and `ATC`. But **no service handles them** — they appear in no adapter, matcher or validator. Status: declared, unimplemented. `LO` genuinely does not exist (VN `LO` maps to `LIMIT`). |
| "`VN_T_PLUS` is not in trading_system source" | **Wrong.** `VN_T_PLUS` is fully implemented: `SettlementPolicy` enum, `FixedBusinessDaySettlementPolicy` (policy `VN_T_PLUS`) in `domain/settlements.py`, `paper_matcher_config.default_settlement_policy` CHECK, portfolio repo T+ logic, CLI `--settlement-policy`, unit tests. |

---

## 7. Errors — 124 reason codes, no RFC-7807

There is no `application/problem+json` anywhere. Bodies come in **two incompatible
shapes**, and HTTP status alone is ambiguous — one `403` carries
`UNAUTHORIZED_ALPHA`, `INVALID_API_KEY` or `ACCOUNT_ALPHA_MISMATCH`.

```jsonc
{"status": "REJECTED", "reason": "UNAUTHORIZED_ALPHA"}   // engine/domain rejections
{"detail": "invalid admin credentials"}                   // FastAPI HTTPException
```

Runtime-confirmed contract surfaces:

| Probe | Result |
|---|---|
| admin route, no token | `403 {"detail":"invalid admin credentials"}` |
| alpha route, unknown alpha | `403 {"status":"REJECTED","reason":"UNAUTHORIZED_ALPHA"}` |
| unknown path | `404 {"detail":"Not Found"}` |
| `X-Trading-Contract-Revision: <bogus>` | `406 {"status":"UNSUPPORTED_CONTRACT_REVISION","requested_revision":…,"supported_revisions":["order-command.v2@2.0.0","v1"],"authoritative_revision":"v1"}` |
| **`GET /v1/positions` with no `alpha_id`** | **`500` plain-text `Internal Server Error`, and no `X-Trading-*` headers at all** |

That last row is a real robustness gap: the middleware does not attach contract
headers on an unhandled exception, so a connector cannot distinguish "gateway bug"
from "gateway gone" by headers. Treat any non-JSON 5xx as retryable-unknown.

Every response otherwise carries `X-Trading-Api-Version: v1`,
`X-Trading-Contract-Revision`, `X-Trading-Schema-Version: v1`.

Full list: [`extract/error-catalog.md`](extract/error-catalog.md).

---

## 8. Freshness and authority — the Portal envelope must be synthesised

Trading System emits none of the handoff §5.1 envelope. Mapping:

| Portal field | Source | Status |
|---|---|---|
| `as_of` | row `updated_at`/`ts`/`trade_time`; `/v1/health.ts` for health scope | `PARTIAL` — no server `as_of` on list responses |
| `source_sequence` | none over HTTP | **`MISSING`** |
| `aggregate_version` | order groups `version` only | `PARTIAL` |
| `freshness_state` | derive from `/v1/health.checks.stale_or_bad_services` (heartbeat age > **180 s**), adapter `circuit_open`, data-layer feed staleness (**180 s**) | `PARTIAL` — no single enum |
| `projection_lag_ms` | connector computes `now − max(updated_at)` | connector-derived, **must be labelled as such** |
| `source_authority` | constant `EXECUTION_CELL`; per-venue in `/v1/health/capabilities.rollout_state` | `CONFIRMED_RUNTIME` |

**VN calendar lives in the data layer, not in Trading System.** `_is_market_open()`
in `data_layer/app/stream/dnse_ws.py`: Mon–Fri, UTC+7, sessions **09:00–11:30** and
**13:00–14:30**; statuses `MARKET_CLOSED | OPEN_HEALTHY | OPEN_STALE | BROKEN`. A
connector reading only the gateway **cannot** see VN session state and must also read
the data-layer health surface. `SUSPENDED_BY_CALENDAR` (a normal closed market) and
`STALE` (a broken feed) come from different services — do not conflate them.

Evidence: [`extract/freshness-authority.json`](extract/freshness-authority.json).

---

## 9. Database boundary

94 tables + 2 views, **zero drift** between the 41 `init-db` migrations and the live
catalog (96 objects, no runtime-only, no source-only). 1 291 columns, 123 indexes,
10 hypertables, 10 TimescaleDB background jobs. PostgreSQL **15.18**, TimescaleDB
**2.28.3**.

### Retention — correcting the previous pack

The previous pack recorded "retention policy 1d for snapshots". That reads the
TimescaleDB **schedule interval** as if it were the retention window. The actual
`drop_after` values, from `timescaledb_information.jobs` and confirmed against
`init-db/19-performance-pnl-ops.sql`:

| Hypertable | Compress after | **Drop after** |
|---|---|---|
| `performance_snapshots` | 7 days | **90 days** |
| `account_equity_snapshots` | 7 days | **730 days** |
| `portfolio_equity_snapshots` | 7 days | **730 days** |
| `broker_sync_valuation_history` | 7 days | *(no retention policy)* |
| `broker_sync_raw_hot` | 1 day | *(no retention policy)* |
| `orders`, `fills`, `domain_events` | *(none)* | *(no retention policy)* |

So Trading System retains **two years of equity history** and never drops orders,
fills or domain events. A Portal projection is still worth building for query shape
and cursor stability — but it is not required to preserve history.

Never readable by the Portal: `broker_sync_raw_hot` (raw broker payload),
`venue_credentials`, `dnse_trading_tokens`, and any `*_credential*` column.

A dedicated `SELECT`-only role is technically feasible without touching source, but
creating it is a mutation → `OWNER_DECISION_REQUIRED`.

Full inventory (typed, per column): [`extract/db-schema.json`](extract/db-schema.json).

---

## 10. What the Portal can safely start on

`paper` + `BINANCE USD_M`. It touches no broker (internal matcher), has complete
orders/fills/positions/snapshots, and `live` is HALTED by kill-switch with no live
adapter connected.

**Safe today, read-only:** all 6 public endpoints; the alpha-scoped read subset of the
41 alpha operations, once an `alpha_id` is agreed; `/v1/events` + `/v1/replay/*` for projection build and gap
resync; `GET` admin reads once a Portal-specific admin token exists.

**Blocked pending an owner decision:** service account + API key allowlist; read-only
DB role; live-mode connect window; whether the `order-command.v2@2.0.0` shadow becomes
authoritative; whether the observability profile is enabled.

---

## 11. Gap register

| ID | Gap | Status | Impact | Portal can mitigate? |
|---|---|---|---|---|
| TS-GAP-001 | No cursor/keyset paging on orders/fills; `ORDER BY updated_at DESC` unstable | `CONFIRMED_RUNTIME` | Full Blotter deep paging | **Yes** — project from `/v1/events`, page from the projection |
| ~~TS-GAP-002~~ | **Not a gap.** The copy-event pipeline was **retired by design** (owner-confirmed 2026-08-21); empty outbox + absent stream is the correct end state | `CONFIRMED_RUNTIME` + owner | none — Portal was never meant to consume it | n/a — read path is `/v1/events` + synthetic projection |
| TS-GAP-003 | No JWT / mTLS / delegated actor assertion | `CONFIRMED_RUNTIME` | Portal edge is the sole identity boundary | Yes, at the edge — **must be stated in audit records** |
| TS-GAP-004 | Read-only DB role not approved | `OWNER_DECISION_REQUIRED` | DB adapter path undecided | Yes — go via API |
| TS-GAP-005 | No `/metrics`; observability profile off | `CONFIRMED_RUNTIME` | health + logs only | Yes — health-based |
| TS-GAP-006 | ~~command_journal not running~~ → **running but `ROLLOUT=OFF`, 430 rows all `DEAD`** | `CONFIRMED_RUNTIME` | Operations Queue has no live ACK evidence | Partly — model the states, do not claim runtime proof |
| TS-GAP-007 | Live mode HALTED, no live adapter | `CONFIRMED_RUNTIME` | Canary/Live screens unprovable | Yes — paper/sandbox |
| **TS-GAP-008** | **`X-API-Key` optional; `alpha_id` alone authenticates** | `CONFIRMED_RUNTIME` | alpha-facing API is effectively unauthenticated | Edge-only mitigation; **owner must be told** |
| **TS-GAP-009** | `GET /v1/positions` without `alpha_id` → `500`, no contract headers | `CONFIRMED_RUNTIME` | connector cannot classify the failure | Yes — always send `alpha_id`; treat non-JSON 5xx as unknown |
| **TS-GAP-010** | OpenAPI declares 0 params / 0 bodies / 0 security schemes | `CONFIRMED_RUNTIME` | no codegen from spec | **Closed** — `extract/` now carries the full request+response+type contract |
| **TS-GAP-011** | `orders.status` has no DB CHECK | `CONFIRMED_RUNTIME` | invalid status could be stored | Yes — validate on read |
| **TS-GAP-012** | `ATO`/`ATC` declared in `OrderType`, handled by no service | `CONFIRMED_SOURCE` | VN auction orders unsupported | No — needs a Trading System change |
| **TS-GAP-013** | 7 CLI operator actions have no HTTP equivalent | `CONFIRMED_SOURCE` | those operations unreachable from Portal | No — needs a Trading System change |
| **TS-GAP-015** | `_jsonable()` copy-pasted 13× and the copies diverge — only 1 of 8 stringifies `UUID` | `CONFIRMED_SOURCE` | uuid fields may arrive quoted or unquoted | Yes — accept both |
| **TS-GAP-016** | `REPLAY_V2_ENABLED=false` — 4 replay-job endpoints return `503` | `CONFIRMED_SOURCE` | Paper Exit Review / Incident Detail lose the job API | Partly — `/v1/admin/replay/order-lifecycle` and `compare` still work |

---

## 12. Reproducing this pack

Every artifact is regenerable. Scripts live outside the Trading System repository in
[`scripts/`](scripts/) and only read:

```bash
cd trading_system_portal_contract_pack
scripts/00_runtime_identity.sh              # docker ps / image digests / git / GET health
python3 scripts/10_api_surface.py           # 104 operations from handler AST
python3 scripts/20_payload_models.py        # 85 models / 468 fields
python3 scripts/25_request_contracts.py     # request body per mutation (46/48 + 2 body-less)
python3 scripts/35_serialization.py         # pg type -> JSON wire type -> Rust type
python3 scripts/45_data_layer.py            # market data + VN calendar contract
python3 scripts/30_db_schema.py --runtime   # 94 tables, source vs live catalog
python3 scripts/40_event_catalog.py --runtime
python3 scripts/50_vocabularies.py
python3 scripts/60_error_catalog.py
python3 scripts/70_cli_map.py
python3 scripts/80_response_shapes.py
python3 scripts/85_config_surface.py        # secrets redacted by name pattern
python3 scripts/90_runtime_probe.py         # GET only, type skeletons
python3 scripts/95_freshness_authority.py
python3 scripts/98_redaction_audit.py       # handoff §9.1 gate — exits 1 on any finding
python3 scripts/99_assemble.py              # MANIFEST.sha256 + extract/COVERAGE.json
```

Safety properties, by construction: no script imports or executes Trading System code;
SQL helpers reject anything that is not `SELECT`/`WITH` and run under
`default_transaction_read_only=on`; the HTTP prober only issues `GET`; the config
extractor reads source declarations and never the environment, `docker inspect`, or a
`*_FILE` target.

`REDACTION-AUDIT.json`: **PASS**, 70 files scanned, 0 findings, all 7 handoff §9.1
checklist items clear.
