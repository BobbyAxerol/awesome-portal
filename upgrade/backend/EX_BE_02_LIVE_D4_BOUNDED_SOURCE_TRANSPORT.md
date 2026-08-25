# EX-BE-02-LIVE — D4 bounded Source Proxy transport

Date: 2026-08-25  
Status: `BOUNDED_TRANSPORT_COMPLETE / INGESTOR_PENDING / NO_SOURCE_CALL`

## Outcome

The new `paper-source-transport` crate is the only HTTP transport allowed to
consume `paper-source-contract` requests. It is independent of the legacy
Gateway v1 transport and exposes no arbitrary method, path, query or header
API.

This slice performs no Portal source call and contains no source identity,
Source Proxy runtime include, projection writer, epoch or registry change.

## Production boundary

- one pathless HTTPS Source Proxy origin only;
- TLS 1.3 minimum and maximum;
- mandatory explicit CA plus workload client identity;
- HTTP/2 response required;
- system/environment proxies disabled and redirects denied;
- queue, connection, request, concurrency and response-byte bounds;
- hard maximum response size of 8 MiB and D4 default of 1 MiB;
- no Trading System API/read-key field in configuration or request code;
- no automatic retry that could advance a cursor outside the orchestrator;
- bounded integer `Retry-After` parsing; and
- response parsing delegated to the locked D4 contract adapter.

The Source Proxy remains responsible for discarding caller headers and
injecting the two owner-held facade headers. The Rust client authenticates only
to the Source Proxy through its separate mTLS workload identity.

## Evidence

- transport unit tests: 5/5 passed;
- exact GET/query encoding and absence of source-secret headers: passed;
- redirect, response-size and Retry-After negative gates: passed;
- production HTTPS/mTLS and limit-constructor gates: passed;
- rustfmt: passed;
- strict Clippy with warnings denied: passed;
- no network/runtime/storage state changed.

## Next backend slice

Implement the snapshot/watermark state machine and D4 mapper for the new wire
types. It must collect all three immutable snapshot resources, commit the
baseline atomically to one explicitly checked `BUILDING` epoch, persist the
event cursor only after durable event-page application, and force a fresh
`BUILDING` epoch on `410`. It must not activate or expose the epoch.
