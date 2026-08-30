# N23 Sandbox and Live Read Release and Rollback

N23 extends the existing read-only Manager-v2 transport to two isolated
profiles. It does not add a Trading System mode for Canary, a source mutation,
projection writer, realtime stream or command route.

## Preconditions

1. Verify the N14A/N14B/N22/N23 immutable lineage against the same source
   commit and digest-pinned image set.
2. Verify the N23 schemas, generated types, profile negative matrix, bounded
   load, source loss/recovery and independent rollback renders.
3. Keep distinct delegated audiences and exact Manager profile IDs:
   `SANDBOX_BINANCE_USDM` / `portal-execution-edge-sandbox` and
   `LIVE_BINANCE_USDM` / `portal-execution-edge-live`.
4. Verify Paper remains unchanged and projection, SSE, analytics and command
   flags remain false.

## Release

Activate Sandbox first. Probe Sandbox Overview and Certification as an
authenticated member of the intended workspace, then activate Live and probe
Live Overview, Canary, Live Full and Live Gate. Every response must carry the
expected profile and source environment. Canary must declare
`PORTAL_CANARY_GOVERNANCE_OVER_LIVE_FACTS` and use the Live profile.

An all-zero Live result is a successful `empty/COMPLETE` response. A source
timeout, invalid envelope, cross-profile row or incomplete relation is never
translated to empty; it remains `partial` or `unavailable` with a typed code.

## Abort conditions

- Sandbox data appears in a Live/Canary response or the inverse;
- one profile's cache, cursor, quota or rollback state affects the other;
- a browser can select a source relation, origin, profile or audience;
- a response exposes an opaque record key, raw payload or secret-shaped field;
- any Live mutation, command relay, projection writer or fabricated row is
  enabled.

## Independent rollback

Rollback Sandbox with
`CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX=false`; Live and Paper
remain unchanged. Rollback Live with
`CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_LIVE=false`; Sandbox and Paper
remain unchanged. Redeploy the previous digest-pinned Control API image only
if a code rollback is required. N23 owns no durable source/projection writes,
so database restore is forbidden. Forward-fix with a new manifest chained to
the prior release digest; never edit a published release pack.
