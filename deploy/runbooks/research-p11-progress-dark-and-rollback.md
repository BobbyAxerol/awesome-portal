# Research P11 Progress — dark deployment and rollback

## Scope

P11 adds a source-owned structured journal, Control API materialisation and
same-origin BFF/SSE routes for a P10 Research run. It does **not** add direct
database access, Trading System/Execution Edge access, a CLI relay, browser
credentials or a new public port.

The overlay is additive and defaults to false. Do not alter a release directory
by hand; render it with the signed image deployment workflow.

## Preconditions before any activation window

1. Signed image contains the P10 and P11 code plus migration
   `1723680000044_research-progress-v1.sql`.
2. `portal-artifacts` is the same named durable volume for `portal-api` and
   `quant-worker-py`; no host path substitution.
3. `CONTROL_API_INTERNAL_PRINCIPAL_SECRET` has the same mounted value in
   Control API, Portal API and worker. Do not print it.
4. P10 private contract / worker qualification has passed. P11 must not be
   enabled as an orphaned UI/SSE feature.
5. A rollback owner, source of the signed release manifest, and one bounded
   Research test run are named in the change record.

## Render-only preflight

Use the normal release environment file and all three compose layers:

```bash
docker compose \
  -f deploy/compose.production.yaml \
  -f deploy/compose.production.stable-runtime.yaml \
  -f deploy/compose.research-progress.yaml \
  --env-file /srv/primus/portal/.env.production config
```

For a dark release, verify all four flags remain false:

```text
CONTROL_API_FEATURE_RESEARCH_RUN_PRODUCER=false
CONTROL_API_FEATURE_RESEARCH_PROGRESS=false
PORTAL_FEATURE_RESEARCH_RUN_PRODUCER=false
PORTAL_FEATURE_RESEARCH_PROGRESS=false
```

The Control API independently refuses progress=true unless its P10 feature and
internal principal secret are present. The worker independently refuses an
enabled journal with a missing callback origin/secret. These are intended
fail-closed checks, not a reason to weaken a configuration value.

## Bounded activation evidence (future approved window)

1. Run forward migration through the existing one-shot migrator only.
2. Enable all four flags together for the exact signed release; do not enable
   P11 without P10 or switch a browser endpoint independently.
3. Create one authorised Research P10 run and capture only sanitized evidence:
   - snapshot progresses through S1–S5;
   - event sequences are monotonic; reconnect starts from an opaque numeric
     `Last-Event-ID` / `after_seq`;
   - mandatory artifacts reach `SEALED` before `COMPLETED`;
   - one duplicate callback is idempotent; one stale/reclaimed callback is
     rejected; a private callback loss recovers from the fsync journal;
   - 20 viewers are accepted; the 21st gets the typed busy response;
   - an expired/revoked session closes the SSE stream and uses snapshot polling,
     not an endless retry loop;
   - admin cancellation stores one durable CAS and at most one private marker.
4. Retain no raw console, event journal, credential or artifact filesystem path
   in release evidence. Record only result codes, sequence bounds and digests.

## Rollback

Set all four flags false via the same signed release workflow and roll only the
P11 overlay configuration back. Do **not** drop P11 PostgreSQL tables, delete
journals or modify sealed bundles. Existing callbacks may be replayed later
when a compatible release is re-enabled; their sequence/digest checks are the
authority.
