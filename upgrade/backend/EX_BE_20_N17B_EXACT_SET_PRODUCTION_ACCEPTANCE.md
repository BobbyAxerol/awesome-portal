# N17B — Exact-set production acceptance

**Date:** 2026-08-29  
**Decision:** `N17B_EXACT_CURRENT_SET_ACCEPTED`  
**Runtime truth:** `PAPER_PRIVATE_QUERY_QUALIFIED / SIGNED_PRODUCT_IMAGE_NOT_PUBLISHED / LIVE_MUTATION_INACTIVE`

## 1. Goal and exact scope

N17B closes the source-as-is backend acceptance for the exact capability set
delivered by N13B–N16B. It does not make future Trading System capabilities a
precondition and does not pretend that an accepted contract is already a
public product deployment.

The accepted runtime slice is deliberately small:

- environment/profile: `paper / PAPER_BINANCE_USDM`;
- Portal screen: `PAPER_TRADING_SCREEN`;
- Query capabilities: positions, deployment execution quality and current
  sessions;
- source bindings: current Manager-v2 deployments, performance, positions and
  sessions relations;
- transport: private SGP↔AWS-HK route, HTTP/2, TLS 1.3 mTLS and a short-lived
  delegated JWT carrying only `execution:manager-v2:read`;
- Command: `live.emergency-close` remains compatibility-accepted but runtime
  inactive; no Live Account/window was supplied and no mutation was attempted;
- Event and Artifact remain `SOURCE_DOES_NOT_CURRENTLY_EXIST`.

## 2. Source-as-is correction

The deployed AWS-HK Edge does not publish the draft screen-native routes under
`/internal/v1/current-source/screens/*`; those routes correctly returned 404.
It does publish the current Manager-v2 contract under:

- `GET /internal/v2/manager/capabilities`;
- `GET /internal/v2/manager/relations/{schema}/{relation}`.

The Portal Control API now owns a versioned adapter from the unchanged
same-origin screen BFF to those exact current routes. The browser still cannot
choose an Edge origin, JWT audience/resource, profile, schema or arbitrary
relation. Only the four Paper source aliases and their seven allowlisted
relations can pass pre-transport validation.

## 3. Load/rate-limit finding and correction

A short diagnostic burst proved the Source Proxy's real `20 r/s` boundary:
five catalogue calls plus fifteen relation calls succeeded, then the proxy
returned 429 and the old Edge surfaced those as 502. This was rate pressure,
not a Trading System data failure.

N17B adds a process-local, burst-free FIFO pacer in the TypeScript BFF:

- source published maximum: `20 r/s`;
- Portal hard maximum: `15 r/s` (configuration rejects any larger value);
- default burst: one scheduled permit;
- maximum pace wait: 1,000 ms;
- excess work: typed `N17B_RATE_LIMIT_QUEUE_TIMEOUT`, no source call;
- upstream rate limit: typed `N17B_SOURCE_RATE_LIMITED`;
- automatic retry: zero.

This sits behind the existing concurrency/queue bulkhead, so the source is
bounded by both in-flight work and admission rate.

## 4. Real private-path evidence

The owner-approved N17B window ran a sanitized read-only probe from SGP to the
existing AWS-HK Edge. It emitted no business row or credential:

| Check | Result |
| --- | --- |
| transport | HTTP/2 + TLS 1.3 mTLS + delegated RS256 JWT |
| paced positive requests | 25/25 HTTP 200 at 10 r/s |
| observed p95 / maximum | 76.403 ms / 108.072 ms |
| maximum observed response | 2,881 bytes |
| no JWT | HTTP 401 |
| wrong delegated resource | HTTP 403 |
| wrong method | HTTP 405 |
| business rows emitted in evidence | 0 |
| source mutations / command dispatches | 0 / 0 |

The immutable record pins the current Edge image, Source Proxy image, Manager
publication/qualification and N13B/N14B/N15B/N16B/N17A contract digests.

## 5. Recovery, compatibility and rollback

The accepted adapter is stateless and creates no Portal projection or source
data. Therefore its Paper Query RPO is zero relative to the authoritative
source and no database restore is required for adapter rollback. N17A's
isolated PITR, encrypted restore, projection rebuild, source/auth loss,
credential compromise and release rollback evidence remains the recovery
baseline.

Rollback is exact and bounded:

1. disable only `FEATURE_EXECUTION_CURRENT_SOURCE_PAPER`;
2. restore the previous screen-native adapter to dark state;
3. close the Manager-v2 HTTP/2 session;
4. verify typed unavailable responses and zero source mutation.

No automatic retry after dispatch exists. A later owner contract can replace
the Manager-v2 adapter behind the same Portal output contract and roll back by
feature/profile pin, without widening the browser API.

## 6. Runtime and authority truth

N17B accepts the exact contract and qualifies the existing private read path.
It does **not** claim any of the following:

- this branch has been merged or a signed Control API image has been published;
- the product BFF or registry data mode is enabled;
- stable/public Portal was changed;
- Sandbox or Live read is enabled;
- Command transport or Live mutation is enabled;
- Trading System code/configuration was changed.

This distinction is encoded in the strict JSON schema, Rust validator and CI
gate; setting any forbidden flag true fails closed.

## 7. Implemented artifacts

- strict acceptance schema and sanitized canonical fixture;
- pure Rust exact-set validator with immutable digest and mutation tests;
- TypeScript current Manager-v2 adapter, exact relation allowlist and pacer;
- production Compose/env pacing defaults;
- executable `execution-n17b-current-acceptance-test.sh` wired into CI and the
  monorepo verifier;
- shared tracker and Claude frontend handoff.

## 8. Verification evidence

| Gate | Result |
| --- | --- |
| Control API build/typecheck/unit/integration | 22 files, 206/206 tests passed |
| canonical contracts/OpenAPI parity | 84/84 tests passed |
| Rust workspace test + Clippy | 290 tests passed; zero Clippy finding |
| PostgreSQL projection restore | restored signature matched |
| N17A isolated recovery rehearsal | WAL PITR, encrypted logical restore, rebuild and rollback passed |
| N15B compatibility regression | passed with lineage marker preserved |
| N17B exact-current-set gate | passed |
| complete monorepo verifier | passed |

## 9. Exit decision and next action

N17B is complete for the exact current set. No N13–N17 backend contract phase
remains open. The next delivery action is normal branch integration: review and
merge this commit into `dev`, publish the signed dev Control API image, then
open a separate Paper-only dev activation window. Live mutation remains a
future independently scoped owner action; it is not a hidden N17B blocker.
