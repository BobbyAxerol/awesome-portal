# N16A — Source-dark routing and emergency policy

Status: `N16A_COMPLETE_SOURCE_DARK /
SUPERSEDED_BY_N16B_CURRENT_PRIMITIVE_ACCEPTANCE / PRODUCTION_INACTIVE`

Date: 2026-08-27  
Owner: Portal backend  
External contact: none  
Public route changes: none  
Trading System traffic: none  
Network attempts: `0`

## Goal and boundary

N16A defines how one logical Portal will eventually retain a narrow emergency
operations surface when the SGP Research application is degraded. It closes the
Portal-owned route, session, ceremony, audit and failure semantics without
creating that public surface.

The normal Portal remains on SGP. The future path is fixed to
`https://portal.primusspark.com/ops/emergency/*`; browser traffic remains
same-origin and origin selection is server-side. The browser never receives an
AWS-HK/internal hostname or delegated workload token.

N16A does **not** create or change Cloudflare Access, DNS, tunnel, Nginx
production includes, AWS-HK services, source credentials, database migrations,
N12 owner bytes, N15 bindings or a Trading System command. Its OpenAPI contains
zero paths and zero servers. The route target represented by the Rust source-
dark authority is only `NONE`.

## Delivered architecture

### Same-domain routing and origin isolation

The canonical profile binds:

- normal profile `research_sgp_stable` and future emergency profile
  `execution_ops`;
- exact public origin and `/ops/emergency/` prefix;
- `SAME_ORIGIN_ONLY` browser mode and `SERVER_SIDE_ONLY` origin resolution;
- no CORS, redirect, internal-origin disclosure or browser token forwarding;
- `public_route_active=false`, `execution_origin_bound=false`,
  `network_authorized=false` and `source_call_authorized=false`.

The unmounted Nginx template contains no forwarding directive. If included by
mistake it returns a typed, non-retryable `503
N12_R3_CATALOGUE_UNPUBLISHED`. The origin-isolation template also records that
no Cloudflare application, DNS/tunnel route or execution origin exists.

### Typed health and failure model

Rust resolves local dependency snapshots into `SOURCE_DARK`, `DEGRADED`,
`UNAVAILABLE` or `ROLLBACK`. Health remains observable independently of command
publication. Research loss exposes `execution_ops` only as a future candidate;
the effective route stays `NONE`. Cloudflare loss cannot be bypassed through a
direct/internal URL. Simulated execution-origin loss and rollback also remain
fail-closed.

The canonical UI corpus covers normal Research, Research loss, Cloudflare loss,
Execution-origin loss and rollback. Every row has `control_visible=false`,
`source_request_sent=false` and `network_attempts=0`.

### Emergency session and break-glass ceremony

The source-dark policy requires the same Portal identity vocabulary plus:

- `OPERATOR` or `ADMIN` role;
- maximum five-minute emergency session;
- phishing-resistant WebAuthn step-up no older than 90 seconds;
- exact actor/session/incident/environment/resource/operation binding;
- 20–500 character reason and typed `BREAK-GLASS` confirmation;
- expiry no later than five minutes;
- at least two distinct approvers, neither silently counted from the actor.

This ceremony can be validated locally for frontend/readiness work, but it
does not grant PLAN/APPLY/VERIFY authority. N12 is the only future command
catalogue; N16 does not invent a second command API.

### R3/R4 structural separation

Only N12 protective candidates `live.halt`, `live.reduce` and
`live.emergency-close` map to the N16 R3 vocabulary. Because the owner catalogue
and dedicated command identity are absent, all are denied and hidden.

`live.resume` and `live.scale` are R4 risk-increasing operations and are
structurally forbidden from this path. No health, role, step-up, approval,
failover or future R3 acceptance can make R4 inherit emergency authority.

### Immutable Portal audit

`ImmutableAuditChain` appends bounded, length-prefixed SHA-256 records linked by
the prior record hash. It records ceremony validation, denial, session expiry,
dependency degradation and rollback facts. Verification rejects sequence,
timestamp, previous-hash or content tampering and survives a serialized restart
round trip. This is source-dark Portal evidence; N16B must additionally bind
the durable operational audit and observed Trading System receipt.

## Contract and code inventory

- schema and strict fixtures:
  `packages/contracts/schemas/execution-emergency-routing.v1.schema.json` and
  `packages/contracts/fixtures/execution-emergency-routing.*.valid.json`;
- component-only OpenAPI and generated TypeScript:
  `packages/contracts/openapi/execution-emergency-routing.openapi.json` and
  `packages/contracts/generated/execution-emergency-routing.d.ts`;
- pure Rust authority:
  `services/portal-execution-edge-rs/crates/emergency-routing`;
- unmounted route/origin-isolation blueprint:
  `deploy/execution-emergency/`;
- CI/static security gate:
  `scripts/execution-n16a-emergency-routing-test.sh`.

## Verification evidence

- JSON Schema/Ajv fixture and mutation tests: passed;
- OpenAPI-to-TypeScript generated snapshot parity: passed;
- Rust routing/session/ceremony/R3-R4/audit/failover tests: passed;
- strict Rust format and Clippy `-D warnings`: passed;
- static route/origin/secret/source-dark gate: passed;
- full shared-contract, Rust workspace and workspace verification: passed;
- runtime endpoints/servers: `0`; public route/origin/credential/source call:
  `0`; `network_attempts=0`.

Test commands and exact counts remain in CI output so later additive cases do
not make this report stale.

## Rollback

N16A is additive and unmounted. Rollback removes the N16A schema/fixtures/types,
Rust crate, deploy blueprint, CI gate and documentation, then regenerates
contracts/Cargo metadata. No runtime, Cloudflare, DNS, AWS, database or Trading
System rollback exists because none changed. The committed fail-closed template
is not a production include and cannot be promoted by flipping a value.

## A result and exact B next action

| Phase | Lane A result | Exact Lane B next action |
|---|---|---|
| N16 | same-origin profile, origin isolation, short-session/WebAuthn ceremony, typed health/failure states, immutable audit, R3/R4 split and local loss/rollback drills complete | N16B accepted the exact current `live.emergency-close` compatibility chain source-dark; N17B must bind the real origin only for an exact Account/window, observe acknowledgement/terminal reconciliation and retain R4 isolation |

N16B is now complete at
`N16B_CURRENT_PRIMITIVE_COMPATIBILITY_ACCEPTED / PRODUCT_RUNTIME_DARK`; see
[`EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md`](./EX_BE_19_N16B_CURRENT_PRIMITIVE_PROTECTIVE_PATH_ACCEPTANCE.md).
N17A is also complete source-dark. The next backend phase is **N17B — exact-set
production acceptance**.
