# EX-BE-02-LIVE — D4 Rust source-contract adapter

Date: 2026-08-25  
Status: `SOURCE_CONTRACT_ADAPTER_COMPLETE / TRANSPORT_PENDING / NO_SOURCE_CALL`

## Outcome

The new `paper-source-contract` crate is the strict Rust boundary for the
owner-published `d4.paper-read.v1` facade. It consumes the separately committed
five-file contract import and does not reuse the older alpha/Gateway v1
adapter, whose route, identity and paging semantics are incompatible with D4.

No HTTP client, source credential, Source Proxy change, PostgreSQL writer,
projection epoch or runtime flag is part of this slice.

## Build-time contract lock

The crate build fails unless:

- all five imported file hashes match `contract-pack.lock.json`;
- OpenAPI contains exactly four paths and only GET;
- scope remains `PAPER_BINANCE_USDM / paper / BINANCE`;
- source identity remains mandatory and the public-listener flag remains false;
- DB, Redis, CLI, broker, command, mutation, live and canary authority remain
  false;
- the allowlist remains the same four exact routes; and
- the Source Proxy template retains four exact locations, header stripping and
  loopback-only upstreams without a catch-all.

The generated Rust identity pins runtime-acceptance commit `99e912f` and the
observed unchanged source HEAD `4ad8f87`.

## Protocol model

- Request construction is enum-driven: snapshot begin, one of three immutable
  snapshot pages, or incremental event page. Callers cannot supply an arbitrary
  method/path, mode, venue, account, strategy or instrument query.
- Snapshot/cursor tokens are bounded to 4,096 bytes and redact themselves from
  `Debug` output.
- Page size is limited to 1–1,000. Snapshot population is capped at 100,000.
- Response structs reject unknown fields and preserve financial values as exact
  decimal strings.
- Contract revision, scope, status, snapshot echo, count, next cursor and
  completeness must agree exactly.
- Events require strictly increasing sequences, unique event IDs, bounded head,
  lowercase 64-hex entity versions and resource/operation/entity/record
  agreement. DELETE requires a tombstone; UPSERT requires the exact typed full
  record.
- HTTP 400/401/409/410/413/429/503 map to typed, payload-free failure classes;
  410 forces full BUILDING-epoch resync and 503 requires `Retry-After`.

## Evidence

- build-time contract/authority/proxy assertions: passed;
- Rust unit tests: 11/11 passed;
- rustfmt: passed;
- strict Clippy with warnings denied: passed;
- no source/network/storage state changed.

## Next backend slice

Add a separate bounded TLS 1.3 mTLS client for this contract and a
BUILDING-only snapshot/event orchestrator. The client must not possess the
Trading System read key: Source Proxy strips incoming headers and injects the
owner-held identity. Live execution remains prohibited until readiness and a
fresh owner window both pass.
