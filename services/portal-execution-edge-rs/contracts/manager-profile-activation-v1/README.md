# Manager profile runtime activation v1

This contract activates the exact current Manager-v2 read surface for Paper,
Sandbox and Live without rewriting the historical N19 source-dark authority.
The Rust Edge binds the N19 compatibility matrix, the N22/N23 release profiles,
the N29 product candidate and the sanitized 2026-09-01 mTLS qualification
evidence into one immutable image.

An empty source page is authoritative data, not a transport failure. This is
particularly important for Live: a valid, fresh response containing zero rows
must reach the Portal as typed empty instead of generic unavailable.

This contract grants GET-only `execution:manager-v2:read`. It does not grant
command relay, mutation, raw browser access, SQL, Redis, CLI, generic origins,
generic profiles or a Trading System change. Projection, analytics and SSE use
their existing independent runtime gates and are activated only after their
ordered operational checks pass.
