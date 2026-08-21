# EX-BE-01 — Rust contracts and Trading System v1 compatibility adapter

Status: `CONTRACT_COMPLETE`  
Branch: `feat/execution_loop`  
Portal authority: Rust compatibility boundary  
Trading authority: unchanged; Trading System remains authoritative

## 1. Goal and non-negotiable boundary

EX-BE-01 establishes the compile-time boundary that later Execution screens use
without reaching into Trading System PostgreSQL, Redis, CLI, broker adapters or
source code. It is intentionally a library workspace: there is no listener,
HTTP client, credential, command method or side effect in this slice.

The adapter can describe and decode only the seven proven `GET` routes:
`/v1/contracts`, `/v1/health`, `/v1/health/capabilities`, `/v1/orders`,
`/v1/fills`, `/v1/positions` and `/v1/events`. There is no arbitrary method or
path escape hatch. Network transport and live probes begin in EX-BE-02 only
after the mTLS/delegated-auth boundary is designed and tested.

## 2. Evidence and compatibility lock

The workspace pins the discovery pack in `contract-pack.lock.json`:

- Trading System source evidence commit
  `9081397de9e981c43b4e0f67fabe747e7ed964c7`;
- observed gateway digest prefix `sha256:4f63dc9949f8`;
- API, contract and schema revisions `v1`;
- contract-pack manifest SHA-256
  `9e4430fcb27cce87158376a53888dc80515673d32dbfe3b53d08e164de67e85d`;
- individual API-surface, response-shape, serialization, vocabulary and error
  catalog digests.

`build.rs` embeds `extract/vocabularies.json` and refuses drift from both the
summary and actual collections: 22 Python enums, 91 database CHECK constraints,
33 distinct CHECK fields, seven cross-table conflations, six venue/product
profiles, six cross-checks and three divergences. Unknown external values retain
their raw token and become `Unsupported`; they never crash or silently alias to
a known state.

## 3. Crate architecture

| Crate | Responsibility |
|---|---|
| `execution-contracts` | Portal canonical IDs, exact decimals, authority/freshness/panel state, source cursor/sequence facts and canonical order facts |
| `ts-contract-v1` | Serde wire structs and headers for the observed Trading System v1 contract; embedded complete vocabulary catalog |
| `ts-adapter-v1` | allowlisted GET request blueprints, source limit/scope validation, typed response/error normalization and wire-to-canonical mapping |

Money, price, quantity and PnL are accepted only as JSON strings and parsed with
`rust_decimal`; JSON numbers are rejected. Contract-success responses require
exact API/contract/schema headers. HTTP 406 stays an incompatible-revision
outcome, 403 retains its body reason code, 429 stays retryable, and non-JSON 5xx
is an explicit unavailable state. A missing source sequence remains `None`;
Portal never fabricates execution ordering.

## 4. Golden and negative corpus

Fixtures cover contract discovery, exact-decimal orders, an unknown future
order status, unsupported revision, body-reason denial and plain-text 5xx.
Tests also prove:

- all operations are GET-only and revision-pinned;
- missing alpha scope and endpoint-specific excessive limits fail closed;
- unknown extension fields remain forward-compatible;
- numeric JSON cannot enter an exact-decimal field;
- unknown enums preserve their raw token as unsupported;
- a 200 without all three exact revision headers is refused;
- canonical identifiers and timestamps are validated.

## 5. Container and quality gate

`Cargo.lock` and Rust `1.85.1` are committed. The CI Dockerfile pins the official
base image by digest and adds only `rustfmt` and Clippy. The test container runs
unprivileged with a read-only root, all Linux capabilities dropped,
`no-new-privileges`, read-only repository mount and ephemeral tmpfs dependency/
target directories. It leaves no `target/` or dependency cache in the worktree.

Run:

```bash
./scripts/execution-edge-test.sh
```

Evidence on 2026-08-21:

- complete contract-pack SHA-256 manifest: pass;
- `cargo fmt --all -- --check`: pass;
- unit/golden/negative tests: 14/14 pass across three crates and all seven
  allowlisted read surfaces;
- `cargo clippy --locked --all-targets -- -D warnings`: pass.

A production/runtime Docker image is deliberately absent: there is no network
server to deploy in EX-BE-01. Adding an idle or fake service would imply a live
integration that does not exist.

## 6. Frontend handoff and next slice

Claude may keep all 17 screens on `delivery_profile=fixture`. The new contract
confirms exact decimals, nullable source sequence, explicit unsupported values
and the distinct denied/unavailable/incompatible states, but it does not turn on
registry query, projection, SSE, Paper, Sandbox or Live flags.

Next is `EX-BE-02 — mTLS/delegated-auth boundary, capability negotiation and
read-only probes`. Its exit gate must prove private SGP↔AWS connectivity, exact
revision negotiation, least-privilege identity, bounded timeouts/retries and
read-only live probes before any registry delivery capability can leave false.
