# Official Trading System Owner Request — N28 Genuine Gaps Only

Status: `OFFICIAL_SINGLE_OWNER_REQUEST_V3 / OWNER_PUBLICATION_PENDING / NO_RUNTIME_AUTHORITY`

Request revision: `portal.execution.trading-system-owner-request.v3`  
Date: 2026-08-31  
Requested by: Bobby / Portal  
Portal implementation owner: Portal backend  
Source and execution authority owner: Trading System

Supersedes `portal.execution.trading-system-owner-request.v2`. Git history is
the audit trail for v1/v2; neither is an active change request. This v3 request
reflects the accepted **source-as-is** direction after N18–N27: Portal adapts
every semantically usable current source itself and asks Trading System only
for nine capabilities proven genuinely absent.

> **Send only this document and the manifest-bound N28 contract directory to
> the Trading System owner.** Do not send N02/N03/N11/N12/N15 fragments or
> create one request per screen.

Machine authority:

- `services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/owner-request.v3.json`
- `services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/owner-response.v1.schema.json`
- `services/portal-execution-edge-rs/contracts/n28-missing-capability-v1/MANIFEST.sha256`

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

## 2. Exact owner scope: nine entries

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
