# N15B — Current-capability inter-cell gateway acceptance

Status: `N15B_CURRENT_QUERY_ACCEPTED / COMMAND_DEFERRED_N16B / EVENT_ARTIFACT_TYPED_UNAVAILABLE / PRODUCT_RUNTIME_DARK`

Date: 2026-08-29  
Owner: Portal backend  
Accepted source: current Manager-v2 Paper read plane  
Trading System mutation: none

## Goal and decision

N15B accepts the smallest real inter-cell slice that the current source can
honestly serve. It does not wait for an ideal four-interface publication and
does not invent missing source capabilities.

The accepted slice is exactly:

- environment `paper`;
- Manager profile `PAPER_BINANCE_USDM`;
- delegated audience `portal-execution-edge-paper`;
- screen `PAPER_TRADING_SCREEN`;
- Query capabilities `deployments.positions`,
  `deployments.execution-quality` and `sessions.current`;
- Manager sources `deployments`, `performance`, `positions` and `sessions`;
- bounded `GET` over HTTP/2, TLS 1.3 mTLS and exact-resource delegated JWT.

Contract acceptance and product activation remain different authorities. This
phase accepts the private Query contract; it does not deploy the candidate,
enable the BFF/profile, promote registry data mode, enable SSE/Command or alter
Trading System.

## Independent interface result

| Interface | N15B result | Reason / next authority |
|---|---|---|
| Query | `ACCEPTED_CURRENT_SOURCE` | exact Paper screen and three capabilities pass immutable contract, identity, bounds, evidence and rollback gates |
| Command | `DEFERRED_N16B` | requires the separate `portal-execution-command` identity and N16B primitive-by-primitive acceptance |
| Event | `SOURCE_DOES_NOT_CURRENTLY_EXIST` | no authoritative owner incremental stream is published; a later Portal snapshot diff must be labelled only `PORTAL_PROJECTION_DELTA` |
| Artifact | `SOURCE_DOES_NOT_CURRENTLY_EXIST` | no current digest/schema/size-bound owner artifact-reference source exists |

The N13B inventory is also retained without reinterpretation: 29 capabilities
are classified as 14 connected, 10 derived, four supported-but-not-activated
and one source-does-not-currently-exist.

## Delivered architecture

### Canonical contract and immutable evidence binding

`execution-intercell-gateway-current.v1` is a strict JSON Schema plus one
canonical accepted fixture. The fixture binds byte-for-byte SHA-256 identities
for the N13B source map, N14B release profile, Manager owner publication,
Manager runtime qualification and D3 transport-acceptance report.

Rust parses the fixture at startup and independently revalidates those bytes,
the source-map classification counts, release profile, exact capabilities and
sources, transport limits, observed evidence, rollback steps and the absence
of runtime authority. Any drift fails startup before a source call.

### Rust Edge authority

`CurrentGatewayAcceptance::authorize_query` is now part of the Edge request
gate. Authentication still verifies issuer, audience, environment, exact
screen resource and profile first; N15B then permits only
`PAPER_TRADING_SCREEN`. A valid assertion for any other mapped screen is
rejected as typed unavailable before the Manager client can run.

This closes the important flag-widening failure mode: enabling a generic Paper
current-source flag cannot expose all 20 N13B screens when the immutable N14B
candidate accepts only one.

### TypeScript same-origin BFF authority

The Control API has the same exact Paper/screen guard before path construction,
delegation, bulkhead admission or HTTP/2 transport. Rejected scopes return
`N15B_QUERY_CAPABILITY_NOT_ACCEPTED` with
`SUPPORTED_BUT_NOT_ACTIVATED / UNAVAILABLE`. Accepted responses carry only a
sanitized gateway correlation identifier, interface/transport label and
`retry_count=0`; browser session tokens are never forwarded.

Existing safety bounds remain unchanged: maximum 200 rows, 1 MiB source
response, 2 MiB BFF response, short delegated assertion, no redirect and no
retry after dispatch.

## Evidence and tests

- N15B static contract/security gate: passed; exact four-interface result,
  immutable hashes, capability counts, bounds, runtime-dark state and
  secret-shape rejection verified.
- Rust focused tests: 25 Edge plus 18 gateway tests passed; exact profile,
  exact resource, cross-profile/screen denial, interface isolation, evidence
  drift, runtime widening and Event relabelling covered.
- Rust Clippy: passed with `-D warnings`.
- Control API: 201 tests passed against fresh PostgreSQL; migration and restore
  signature matched. N15B tests prove Paper acceptance and pre-transport denial
  for Paper-other-screen, Sandbox, Canary and Live.
- Shared contracts: 81 schema/fixture/parity tests passed; generated OpenAPI
  contracts remain unchanged because N15B adds no public runtime route.
- Reused immutable real evidence: D3 HTTP/2/TLS1.3/mTLS/JWT negative matrix,
  maximum 162.587 ms under the 2,000 ms ceiling, partition loss/recovery and
  rollback; Manager qualification p95 12.122 ms, maximum 47.075 ms and maximum
  observed payload 130,547 bytes.
- Commit hook/full workspace gate: passed, including N13B/N14B/N15A
  regressions, Compose renders and tracking reconciliation.

No fresh network probe was necessary: the accepted candidate binds and
revalidates the unchanged immutable D3/Manager evidence rather than consuming
an unversioned live source.

## Runtime truth and rollback

At closeout, candidate deployment, product BFF, registry promotion, SSE,
Command and Trading System change are all false. Stable/dev runtime and
databases were not changed.

Rollback is profile-scoped and needs no database restore:

1. disable the Control API Paper current-source gate;
2. disable Edge Manager-v2 read;
3. restore the previous N14B digest set;
4. verify typed unavailable and zero source calls.

## Next phase

The next backend phase is **N16B — current-primitive protective-path
acceptance**. It must classify each present Trading System command primitive,
bind a separate command identity, and prove plan → apply → verify,
idempotency, acknowledgement, terminal reconciliation and containment. No
read identity or Query acceptance may enable a command.

