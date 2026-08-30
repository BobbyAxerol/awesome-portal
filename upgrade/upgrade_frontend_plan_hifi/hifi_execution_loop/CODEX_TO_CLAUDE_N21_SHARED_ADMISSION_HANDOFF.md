# Codex → Claude — N21 Shared Admission/Cache/Freshness Handoff

**Backend status:** `N21_COMPLETE / TD-EX-02_CLOSED / N22_READY`  
**Consumer branch:** Claude may consume the contract behavior; do not enable a
new source or action from this handoff alone.

## What changed for frontend consumers

N21 changes transport behavior, not screen payload semantics. Canonical screen
contracts from N20 remain stable. Current-source BFF envelopes now preserve:

```text
as_of
freshness
completeness
gateway.cache.state       # HIT | MISS | COALESCED
gateway.cache.etag
gateway.cache.stored_at
gateway.cache.expires_at
gateway.cache.source_authority
```

The cache is short-lived, source-aware and security-scope isolated. The UI
must continue treating source freshness/completeness as authoritative; a cache
hit is not proof of freshness.

## Required frontend behavior

1. Keep one request lifecycle per screen/resource; do not add client-side
   retries to compensate for an admission/timeout response.
2. Render `stale`, `partial` and `unavailable` from the canonical source
   fields. Do not infer them from cache state.
3. Preserve workspace/resource bindings on navigation and refetch.
4. An admission/coalescing timeout is a bounded typed unavailable result, not
   an empty business result.
5. Do not expose ETag, source/profile identifiers or cache diagnostics as
   prominent product copy; they belong in inspect/debug affordances only.
6. Do not remove Paper smoke blocks yet. N22 owns parity and selective smoke
   retirement.

## Safe parallel lane

Claude can verify the seven-state presentation under cached/stale/partial/
unavailable fixtures and ensure no component implements infinite retry. N22 is
backend-owned and will identify the exact Paper screens whose real payloads
are ready to replace smoke.
