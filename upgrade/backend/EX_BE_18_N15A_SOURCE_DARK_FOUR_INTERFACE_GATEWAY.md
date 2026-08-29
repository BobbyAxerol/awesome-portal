# N15A — Source-dark four-interface gateway contract

Status: `N15A_COMPLETE_SOURCE_DARK / SUPERSEDED_BY_N15B_CURRENT_ACCEPTANCE /
PRODUCTION_INACTIVE`

Date: 2026-08-26  
Owner: Portal backend  
External contact: none  
Trading System traffic: none  
Network attempts: `0`

## Goal and boundary

N15A gives the Portal one formal authority for four **independent** inter-cell
interfaces without creating a live gateway. Query, Command, Event and Artifact
negotiate, fail and roll back separately. The phase owns contracts, pure Rust
domain validation, generated TypeScript types, source-dark fixtures and local
transport/fault doubles.

N15A does not publish an owner route, hostname, listener, credential, DSN,
artifact body or business datum. It does not call AWS-HK or Trading System,
mount an OpenAPI path, enable a source/profile/SSE/command, create a migration
or change any runtime. A compatible local fixture is not production authority.

## Delivered architecture

### Four independent interface authorities

| Interface | Foundation | Source-dark method model | Identity class | N15A authority |
|---|---|---|---|---|
| Query | N11 external-read schema | bounded `GET` | read | version/rollback negotiation only |
| Command | N12 command-relay schema | bounded `POST`, no automatic retry | command | version/rollback negotiation and assertion validation only |
| Event | N02/N03 incremental event schema | ordered `STREAM` model | read | replay/gap/duplicate/epoch semantics only |
| Artifact | N15 metadata/reference schema | signed `REFERENCE` model | read | digest/schema/size/access/expiry validation only |

Every interface has a closed semantic version range, preferred version,
rollback version, publication state and contract digest. Negotiation returns a
typed `FIXTURE_COMPATIBLE`, `UNAVAILABLE` or `INCOMPATIBLE` result per
interface; it never returns activation authority. One unavailable interface
does not degrade or promote another.

### Identity and bounded transport policy

Read and command workload identities are distinct. Delegated assertions are
accepted only after signature verification and require exact issuer, audience,
environment, interface and resource scope; wildcard scope and raw browser
token forwarding are rejected. Assertion TTL is at most 60 seconds, `jti`
replay is rejected and commands additionally require an approved operation.

All four transport blueprints require TLS 1.3 and HTTP/2, reject redirects and
bound connect/request/queue time, concurrency and response bytes. Nothing may
retry after dispatch. Command also has zero pre-dispatch retry. Observability
contains only interface/result/latency/attempt/correlation fields and cannot
carry assertions, credentials, payloads or artifact locations.

### Event continuity authority

The Rust replay guard is keyed by `(interface resource, epoch, sequence,
event_id)` and distinguishes:

- first apply and idempotent duplicate;
- sequence gap and out-of-order delivery;
- epoch change requiring snapshot/reconciliation;
- conflicting duplicate content;
- `UPSERT` and tombstone `DELETE` operations.

The canonical corpus includes two epochs and cannot hide a gap or treat an
epoch cutover as ordinary freshness.

### Artifact metadata/reference authority

Artifact V1 is deliberately not an upload/download API. A descriptor binds
digest, schema digest, media type, exact byte size, producer authority,
retention class, access policy, short expiry and detached signature state.
Local synthetic bytes exercise the verifier. The rejection corpus covers
`TOO_LARGE`, `SCHEMA_INCOMPATIBLE`, `EXPIRED`, `DIGEST_MISMATCH`,
`SIGNATURE_INVALID` and `POLICY_DENIED`; no URL, credential or artifact body is
published.

### Local-only failure model

`LocalTransportDouble` covers partition, timeout, unavailable, duplicate,
out-of-order, expired assertion, forged assertion, schema drift, source loss
and rollback selection. Its network-attempt counter is immutable at zero.
This lets the failure semantics and security boundary be tested without an
origin or secret.

## Contract and code inventory

- canonical schema:
  `packages/contracts/schemas/execution-intercell-gateway.v1.schema.json`;
- source-dark profile plus Event/Artifact corpora under
  `packages/contracts/fixtures/execution-intercell-gateway.*.valid.json`;
- component-only OpenAPI:
  `packages/contracts/openapi/execution-intercell-gateway.openapi.json`;
- generated TypeScript:
  `packages/contracts/generated/execution-intercell-gateway.d.ts`;
- Rust authority:
  `services/portal-execution-edge-rs/crates/intercell-gateway`;
- static security/parity gate: `scripts/execution-n15a-gateway-test.sh`.

## Verification evidence

- JSON Schema/Ajv fixture and negative-corpus validation: passed;
- OpenAPI-to-TypeScript generation and committed snapshot parity: passed;
- Rust unit tests for negotiation, identities, assertions, replay, Artifact
  policy and every local fault class: passed;
- strict Rust formatting and Clippy (`-D warnings`): passed;
- static source-dark/security gate: passed;
- full shared-contract and Rust execution-edge regression: passed;
- workspace verification and GitHub Actions lint: passed;
- runtime endpoints/servers: `0`; credentials/source calls: `0`;
  `network_attempts=0`.

The exact command counts are recorded by the test output and commit CI rather
than copied into the contract, so adding a legitimate negative case cannot
make this report stale.

## Rollback

N15A is additive and source-dark. Rollback removes the N15A schema, fixtures,
generated types, Rust crate and its workspace membership, then regenerates the
contract snapshot. No database or runtime rollback exists because this phase
creates neither. A negotiated interface rollback only selects the declared
lower compatible contract version; it never enables transport.

## A result and exact B next action

| Phase | Lane A result | Exact Lane B next action |
|---|---|---|
| N15 | four independent versioned authorities, identity/transport policy, Event continuity, Artifact reference policy and local fault doubles complete | after the single master owner pack is accepted, bind the exact owner commit/image/config/schema/route/auth publication for each interface; run real mTLS/JWT positive/negative, WAN partition, replay/duplicate/out-of-order/expiry/schema/source-loss/rollback and SLO trace tests independently; keep activation as a later explicit decision |

N15B later closed through source-as-is acceptance rather than a global owner
publication. Query is accepted only for the bounded Paper target; Command is
deferred and Event/Artifact remain typed unavailable. See
[`EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md`](./EX_BE_18_N15B_CURRENT_CAPABILITY_INTERCELL_GATEWAY_ACCEPTANCE.md).

The next backend phase is **N16B — current-primitive protective-path
acceptance**.
