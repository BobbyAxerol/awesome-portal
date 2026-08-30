# N22 Full Paper Read Release and Rollback

N22 publishes four session-guarded product BFFs over the already accepted
`PAPER_BINANCE_USDM` Manager-v2 profile. It does not add a Trading System
route, database identity, command path, Sandbox/Live scope, projection writer,
SSE stream or browser-accessible raw source route.

## Preconditions

1. Generate and verify N14A, N14B and N22 manifests from the same 40-character
   Portal source commit and immutable `image@sha256:...` bindings.
2. Verify the N22 contract fixtures, generated OpenAPI types, Control API tests,
   Manager compatibility tests and the bounded Paper-fast test.
3. Verify the existing mTLS files and delegated-JWT audience for
   `portal-execution-edge-paper`; never place secret material in a manifest.
4. Render Compose and confirm only
   `FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=true` and
   `EDGE_MANAGER_V2_READ_ENABLED=true` are enabled for this slice.

## Release

Deploy the digest-pinned release through the existing dev release workflow.
Probe the four product routes as an authenticated member of the intended
workspace. Accept `ready`, `empty`, `stale`, `partial` or `unavailable` only
when the response carries the matching typed capability state. Raw Manager
routes must continue returning `410 N20_RAW_SOURCE_BROWSER_FORBIDDEN`.

No fixture is removed merely because the route exists. A frontend fixture may
be retired only after the corresponding product field has source-backed parity
and the frontend consumes the canonical N22 response.

## Abort conditions

- any non-Paper row crosses the product boundary;
- a response contains `record_key`, raw payloads, a source URL or relation
  selector;
- a source request exceeds the fixed seven-call screen fan-out;
- auth/workspace isolation, freshness, response bounds or the source pacer fail;
- Sandbox/Live, projection, SSE, analytics or command flags become enabled.

## Rollback

Set `CONTROL_API_FEATURE_EXECUTION_CURRENT_SOURCE_PAPER=false` and redeploy the
previous digest-pinned Control API release. If the Edge profile also needs to
be stopped, set `EDGE_MANAGER_V2_READ_ENABLED=false` or stop only the
`portal-execution-edge-paper` project. Do not mutate or restore a database;
N22 owns no projection or Trading System data. Sandbox/Live remain unchanged.
Forward-fix by generating a new N22 manifest chained to the prior manifest
digest; never edit a published manifest.

