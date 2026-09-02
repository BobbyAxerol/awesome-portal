# Phase 1 SGP-local projection release and rollback

## Authority and invariant

This release activates read-only Paper/Sandbox/Live ingestion from the exact
Manager-v2 relations already accepted by N22/N23/BR-EX-72. Trading System is
the source authority; PostgreSQL in SGP is the Portal read/replay authority.
Browser navigation and SSE never read AWS-HK. Commands and Trading System
mutation remain disabled.

## Preflight and activation

1. Deploy a content-addressed Control API image containing migration
   `1723680000018_execution-profile-local-projection.sql`.
2. Run the normal one-shot migration and verify the lease, snapshot and
   journal tables exist; retain the pre-migration backup evidence.
3. Include `compose.execution-current-source.yaml`, then
   `compose.execution-local-projection.yaml`. Pin the exact authenticated
   shared Execution workspace that already exists in the Portal `workspaces`
   table in `EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID`. The workspace is the
   source/projection scope for all viewers; each response separately preserves
   the viewer workspace. Never use an invented identifier because the N21
   shared-admission cache intentionally enforces its workspace foreign key.
   Session/RBAC remains the viewer authorization boundary.
4. Enable the already-qualified Paper/Sandbox/Live source flags. Keep command
   relay false. Set `CONTROL_API_FEATURE_EXECUTION_LOCAL_PROJECTION=true`.
5. Start one Control API replica, wait for one committed snapshot per enabled
   profile, then start remaining replicas. The database lease admits only one
   writer per `(workspace, environment, profile)`.
6. Verify local snapshot/BFF/SSE routes, row lineage, source ages and truthful
   empty profile populations. Repeated browser refresh must not increment
   cross-cell source counters.
7. Treat `execution_profile_projection_refresh_failed` or
   `execution_profile_projection_cycle_failed` as a failed activation. Both
   records contain only profile metadata and a bounded typed error code; the
   worker never logs source payloads or credentials.

## Abort conditions

Abort on any cross-profile row, non-contiguous projection sequence, wrong
workspace/profile, stale-ceiling breach, unbounded page, source mutation,
browser-triggered AWS read, or command activation. Do not delete projection
state while investigating.

## Rollback

1. Set `CONTROL_API_FEATURE_EXECUTION_LOCAL_PROJECTION=false` and redeploy the
   previous content-addressed Control API image.
2. Leave the three projection tables intact for forensic/replay evidence.
3. If necessary, disable the individual current-source profile flags after
   local reads are dark. Do not change Trading System or WireGuard.
4. Verify legacy typed-unavailable behavior and the previous product routes.
   Database restore is not required unless the ordinary PostgreSQL integrity
   gate fails.
