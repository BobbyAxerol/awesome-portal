# Official Trading System Owner Request — Master Capability & Current-Source Adapter Campaign

Status: `OFFICIAL_SINGLE_OWNER_REQUEST_V3_1 / OWNER_PUBLICATION_PENDING / NO_RUNTIME_AUTHORITY`

Request revision: `portal.execution.trading-system-owner-request.v3.1`  
Date: 2026-09-06  
Requested by: Bobby / Portal  
Portal implementation owner: Portal backend  
Source and execution authority owner: Trading System

Supersedes `portal.execution.trading-system-owner-request.v2`. Git history is
the audit trail for v1/v2; neither is an active change request. This v3.1
request retains the accepted **source-as-is** direction after N18–N27: Portal
adapts every semantically usable current source itself and asks Trading System
only for nine capabilities proven genuinely absent.  It adds one **current
source publication** annex (EDS-11R4) so the owner receives one coherent
packet rather than a separate market-data request.

> **Send only this document and the manifest-bound N28 contract directory to
> the Trading System owner.** The EDS-11R4 annex below is part of this same
> request. Do not send N02/N03/N11/N12/N15 fragments or create one request per
> screen.

Machine authority:

- `services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/owner-request.v3.json`
- `services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/owner-response.v1.schema.json`
- `services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/MANIFEST.sha256`
- `services/portal-execution-edge-rs/contracts/eds11r-market-context-v1-request/market-context-owner-request.v1.json`
- `services/portal-execution-edge-rs/contracts/eds11r-market-context-v1-request/market-context-owner-return.v1.schema.json`
- `services/portal-execution-edge-rs/contracts/eds11r-market-context-v1-request/MANIFEST.sha256`

The existing `owner-request.v3.json` remains normative for exactly
`MC-01…MC-09`.  EDS-11R4 is deliberately not an MC entry: it is a thin,
source-as-is publication adapter over already-running Data Layer services. Its
separate subdirectory in the one owner return pack prevents a schema collision
with the nine-gap response while preserving one owner campaign.

## 1. What Portal already adapts; no owner work requested

N28 proved 13 alternatives from existing sources and keeps them source-dark
until N29 product acceptance:

1. Gateway latest market tick;
2. Market Data Layer Binance candles;
3. Market Data Layer VNM preload candles with `fresh=false` forced;
4. current venue/session calendar;
5. benchmark series derived from adapted candles;
6. exact cross-profile drift from Portal projection;
7. partial Gateway order-lifecycle events, explicitly poll-bounded;
8. Gateway health;
9. Gateway alpha/account inspect;
10. N25 performance query;
11. Gateway broker state/exposure reads;
12. Gateway portfolio-create candidate;
13. Gateway alpha-risk plan-and-verify candidate.

These are not Trading System gaps. Portal owns their bounded adapters,
canonical BFF composition, projection/cache/SSE behavior and product release.
The current partial event route must never be represented as a complete event
stream.

Three operations are intentional exclusions and must not receive replacement
APIs: direct Redis inspect, testnet hard reset and lab hard reset. They remain
host/operator procedures outside Portal.

## 2. Exact owner scope: nine genuinely missing entries

The required field lists, schemas, bounds, semantics and fixture names in
`owner-request.v3.json` are normative. This table is the human index only.

| ID | Capability | Why current sources cannot satisfy it |
|---|---|---|
| MC-01 | `event.full-incremental` | current Gateway events cover only bounded order lifecycle, not complete entity/event truth |
| MC-02 | `artifact.reference` | no published digest-bound artifact metadata/reference contract |
| MC-03 | `execution.broker-ack-timestamps` | current records do not publish authoritative submit/source/broker/terminal clocks |
| MC-04 | `execution.signal-intent-funnel` | signal and intent identities/stages are not published for an authoritative join |
| MC-05 | `binding.full-exposure-population` | current exposure response does not prove full population/completeness |
| MC-06 | `venue.vnm-order-types` | authoritative VNM order-type/session compatibility is not published |
| MC-07 | `admin.sizing-explanation` | no typed sizing explanation/constraint route |
| MC-08 | `admin.config-plan-apply` | no bounded, versioned plan/apply/verify contract |
| MC-09 | `command.delegated-terminal-policy` | no complete delegated command-terminal/step-up/approval policy publication |

Owner implementation may be partial. Every unimplemented row must be returned
as `TYPED_UNAVAILABLE`; it must not be simulated from `updated_at`, inferred
from incomplete populations, or implemented through raw CLI/SQL/Redis.

## 2A. EDS-11R4 — Current-source Market Context v1 annex

**Purpose:** publish the already-running private Data Layer through the
existing Manager/Edge trust boundary.  This is deliberately an **adapter**, not
a request for a new market database, a history re-ingest, a public API, an
unbounded chart store or a Portal-to-Redis/Data-Layer connection.

### 2A.1 Exact ownership and safe source reuse

Implement this only in a clean Trading System feature worktree, based on the
current approved source branch.  Do not modify Portal source, deployed
Portal/Edge containers, the Source Proxy runtime, network policy or secrets.
The owner may reuse the existing private readers that are already present in
the Trading System codebase:

- `DataLayerV2Facade.latest_market` / `latest_bar` for current observations;
- `VersionedDataLayerClient.warmup_ohlcv` (or its bounded Data Layer
  equivalent) for historical OHLCV;
- the existing session/universe reader for calendar and allowed-instrument
  metadata; and
- `MarketCacheReader.execution_market_context()` only as a private source
  input, never as a raw cache/Redis object exposed outside Trading System.

The adapter is additive beside the Manager-v2 serving boundary.  It must use
the existing TLS 1.3 mTLS and short-lived delegated-JWT path; it must not make
the Data Layer, Redis, broker, CLI, database or source credentials reachable
by Portal or a browser.

### 2A.2 Required capability catalogue

Publish the versioned capability family `market-context.v1` using the frozen
operation identifiers and private paths in
`market-context-wire-contract.v1.json`.  The owner may choose its internal
implementation, but it may not rename, widen or route these two Portal-facing
operations through the generic relation surface.  Every response has
Every response has `schema_version`, contract revision, active profile,
availability/reason, freshness, completeness, `as_of_ms` and source/provider
provenance.  All timestamps are UTC milliseconds and every financial quantity
is a decimal string; binary floats must not cross the contract.

| Product operation | Existing source to wrap | Required bounded request/response semantics | Honest fallback |
| --- | --- | --- | --- |
| `market.latest.v1` | `latest_market` / `latest_bar` / validated execution-market context | profile + exact venue/instrument; one latest mark/last/index observation per requested instrument; observed/source timestamp, quote currency, provider and freshness | `AUTHORITATIVE_EMPTY` when no observation; typed source failure when provider is stale/degraded |
| `market.candles.v1` | bounded `warmup_ohlcv` / kline reader | profile + venue/instrument + allowlisted interval + closed UTC range + bounded point limit; OHLCV, interval, source coverage and sampling semantics | typed unavailable only when that exact provider/instrument/interval is unsupported |
| `venue.calendar.v1` | existing current session/universe reader | profile + venue + effective date/range; trading day, timezone, session kind, open/close UTC milliseconds and calendar revision | typed unavailable when exact calendar source/schema is not available; never invent a trading session |
| `market.benchmark.v1` | approved candle series only | exact benchmark identity, formula/series revision, source coverage and derived label; no implicit benchmark chosen from a random symbol | `TYPED_UNAVAILABLE` until the owner can prove the exact benchmark semantics |
| `market.vnm-constraints.v1` | approved effective-dated venue configuration only | venue + effective time; explicit rule/version/effective-at fields safe for Portal display | `TYPED_UNAVAILABLE` until the source publishes a stable, non-secret constraint schema |

The first two rows are the minimum immediate deliverable because the AWS-HK
read-only audit has confirmed their readers.  The remaining rows may be
returned `TYPED_UNAVAILABLE` individually if the existing source cannot prove
their exact semantics; that is a valid source-as-is result and must not delay
latest/candle publication.

### 2A.2a Exact private Manager/Edge route contract

The packet now freezes the end-to-end private transport in
`market-context-wire-contract.v1.json`, with schemas for the positive latest
and candle envelopes.  The Source Proxy exposes only these mappings after a
separate owner-approved deployment slice:

| Capability | Portal → Edge path | Edge → Manager path | Allowlisted query names |
| --- | --- | --- | --- |
| `market.latest.v1` | `/internal/v2/manager/market/latest` | `/portal/execution/v2/manager/market/latest` | `venue`, `instrument` |
| `market.candles.v1` | `/internal/v2/manager/market/candles` | `/portal/execution/v2/manager/market/candles` | `venue`, `instrument`, `interval`, `from_ms`, `to_ms`, `point_limit` |

The Manager server authenticates mTLS and the exact delegated resource before
it validates the named query and calls its private Data Layer adapter.  Unknown
parameters, cross-profile instrument/venue, invalid ranges and unsupported
intervals are rejected before source I/O.  `HTTP 200` with an empty `items`
array is the only authoritative-empty shape; a stale/degraded/unsupported
source is a typed non-2xx response.  Neither route is a generic relation route
or a browser endpoint.

### 2A.3 Admission, bounds and negative behavior

- Bind the delegated identity to the exact `execution:manager-v2:read` market
  capability, audience, deployment environment and profile.  Reject
  cross-profile, unknown venue/instrument, malformed range, unallowlisted
  interval, expired JWT and invalid/missing mTLS before any source call.
- Resolve only the profile's admitted instruments/universe.  Do not accept a
  caller-selected database table, Redis key, provider URL or free-form query.
- A latest request may carry at most 200 logical instruments.  A candle source
  response may contain at most 2,000 raw bars and 8 MiB; it must state its
  coverage/sampling.  Portal will request a smaller visual series and emit no
  more than 200 chart points per same-origin BFF page unless it uses an
  explicitly documented adaptive aggregation.
- Responses must distinguish `AUTHORITATIVE_EMPTY`, `PARTIAL_BOUNDED`,
  `STALE`, provider degradation, authorization denial and unsupported exact
  capability.  Do not convert any of these into a generic HTTP 200 data set.
- The adapter remains read-only, idempotent and dark by default:
  `portal_activation=false`; no command, broker side effect, profile activation
  or network/container restart is authorized by this annex.

### 2A.4 One return sub-pack and acceptance proof

Return the following non-secret directory inside the **same** v3 owner return
pack.  It is not a second request and it must not change the MC-01…MC-09 JSON
schema.

```text
portal-execution-owner-return-v3/
  market-context-v1/
    market-context-capability.v1.json
    schemas/
    fixtures/                 # synthetic/redacted only
    acceptance/
    RETURN_MANIFEST.sha256
```

The capability document states the precise operation IDs, schema revisions,
source commit, immutable image digest, per-profile availability, the exact
two private paths above, and SHA-256 paths for every
schema/fixture/acceptance artifact.  It must validate against
`market-context-capability.v1.schema.json`.  The acceptance proof must
include positive Paper/Sandbox/Live reads where rows exist, authoritative-empty
where rows do not exist, and negative mTLS/JWT/profile/venue/instrument/range/
interval/limit cases.  It also proves no direct Data Layer/Redis/browser route
was opened.  No secret, certificate, JWT, DSN, raw business row, account,
strategy or customer identifier may appear in this pack.

### 2A.5 Portal receipt and phase closure

Portal validates the sub-pack manifest and schemas before adding a named
same-origin BFF operation.  It then keeps market windows in its profile-local
projection, preserves exact values/provenance/freshness/coverage and emits
only local R3 invalidations over SSE.  A browser never receives upstream
relation/cursor/JWT/mTLS data.

EDS-11R4 closes only after source-owned contract acceptance **and** an
end-to-end Portal consumer test for Paper, Sandbox and Live profile isolation.
Until then, only the dependent market panels show
`PENDING_MARKET_CONTEXT_ADAPTER`; all currently published Manager data remains
available to the rich UI.

## 3. Common transport and authority contract

Any published entry must use:

- TLS 1.3 mTLS between workloads;
- short-lived delegated JWT bound to exact capability, resource and profile;
- separate read and command identities;
- `X-Trading-Contract-Revision` negotiation with additive compatibility;
- at most 5,000 rows, 8 MiB response and two concurrent requests per identity;
- no automatic retry; command ambiguity is reconciled, never blindly retried;
- no browser-direct access, database/Redis authority, raw CLI/shell or broker
  credential handoff.

Publication does not activate Portal. All returned entries must set
`portal_activation=false`; N29 separately accepts and promotes compatible
bytes.

## 4. One sanitized return pack

Return one directory, never chat fragments:

```text
portal-execution-owner-return-v3/
  owner-response.v1.json
  owner-response.v1.schema.json
  market-context-v1/          # EDS-11R4 annex; non-secret and manifest-bound
  schemas/
  fixtures/
  acceptance/
  RETURN_MANIFEST.sha256
```

`owner-response.v1.json` must validate against the supplied schema and contain
exactly MC-01…MC-09. A `PUBLISHED` row binds its contract revision, schema,
fixture index and acceptance result by SHA-256. An unavailable row has all
publication references null. The top-level source commit and immutable image
digest bind the whole pack.

The return pack contains no credential, key, certificate, DSN, SQL, business
row, account/strategy/instrument identifier or customer data. Synthetic and
fully redacted fixtures are required.

## 5. Owner acceptance checklist

Before returning the pack, the Trading System owner must prove:

1. exact schema validation and fixture coverage named by each entry;
2. positive and negative mTLS/JWT scope tests;
3. page/body/concurrency bounds and typed rate/backpressure behavior;
4. additive compatibility or an explicit incompatible revision;
5. restart, duplicate, cursor/terminal ambiguity and loss behavior where
   applicable;
6. no authority broadening and `portal_activation=false` everywhere;
7. `sha256sum -c RETURN_MANIFEST.sha256` passes from the return root.

## 6. Portal receipt behavior

Portal verifies the returned schema, exact nine-entry inventory, source
commit/image digest and all manifest hashes. Until that succeeds:

- product responses remain typed unavailable using the N28 reason codes;
- existing partial adapters continue to report their real completeness;
- no owner entry is connected, no command is enabled and no source traffic or
  runtime flag changes.

After verification, N29 may accept compatible entries individually. Returning
a contract is evidence, not production authority.
