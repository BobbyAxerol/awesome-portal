# Execution D2 — dark deploy and rollback runbook

> Status: `PREPARED_ONLY / DO_NOT_EXECUTE`  
> Required authority: accepted D1 evidence, explicit Bobby D2 authorization,
> named AWS operator/change window/rollback owner and admitted resource budget.

## 1. Dark-only outcome

D2 may deploy only the Portal-owned projection PostgreSQL, one-shot Rust
migrator, Source Proxy and Rust Execution Edge with immutable verified image
digests. Projection ingestion, Query/Analytics, SSE, source probes, commands
and registry activation remain false/`fixture`. All seven Source Proxy routes
contain an exact `return 503` guard, so D2 neither requires nor mounts a Trading
System read credential and sends no source request. D3 later unlocks only the
three public-at-source contract/health probes; D4 separately unlocks the four
alpha reads.

## 2. Stop gates

Before any pull, migration or container creation:

1. D1 is `D1_NETWORK_ACCEPTED / APPLICATION_DARK` and its rollback path is
   still proven;
2. the temporary D1 operator instance profile is detached from the shared
   AWS-HK host, or a separately reviewed control proves IMDS unavailable from
   every Portal workload, including the host-network Source Proxy;
3. AWS OOM/I/O review assigns CPU, memory, PID, file and disk budgets;
4. both image digests have verified provenance/SBOM/signature and an accepted
   vulnerability decision;
5. `portal-runtime` numeric GID, secret/config directories and separate mTLS/
   JWKS/source identities pass `execution-d2-preflight.sh --mode readiness`;
6. projection PostgreSQL placement, least-privilege roles, TLS, backup/PITR and
   restore owner are approved, or ingestion remains absent/false;
7. pre-change Docker/network/listener/pressure/Trading System health baselines,
   candidate and rollback digests and configuration hashes are recorded without
   secret values;
8. no public/VPC-wide 5432/8443/8444 rule exists.

## 3. Render, establish ownership and run readiness preflight

Run on the target host using a private mode-0600 env file:

```bash
./scripts/execution-d2-render-source-proxy.sh \
  --env-file /secure/path/d2.env \
  --output /srv/primus/portal/source-proxy/nginx.conf
sudo chown root:PORTAL_RUNTIME_GID /srv/primus/portal/source-proxy/nginx.conf
sudo chmod 0640 /srv/primus/portal/source-proxy/nginx.conf
./scripts/execution-d2-preflight.sh --env-file /secure/path/d2.env --mode readiness
docker compose --project-directory /srv/primus/portal \
  --env-file /secure/path/d2.env \
  -f deploy/compose.execution-edge.yaml \
  -f deploy/execution-d1/compose.dark.yaml config --quiet
```

Replace `PORTAL_RUNTIME_GID` with the exact numeric value already recorded in
the private D2 env file; do not source that file in a shell. The renderer also
assigns this group before its atomic rename and fails closed when the invoking
operator lacks permission. The explicit root ownership above is the target-host
boundary; readiness runs after it so the validated file is the file Compose
will mount. This order also removes the first-deploy placeholder requirement.
The projection secret directory and bootstrap script are separately owned by
`root:<PROJECTION_DB_CONTAINER_GID>` (currently container GID 70); the script is
mode 0550, the TLS key/passwords are 0640 and the certificate is 0644. Do not
assign those PostgreSQL-only files to `portal-runtime`.

Rendering or preflight is not authorization to pull or start.

## 4. Future bounded deploy

Only inside the approved window:

1. verify candidate and rollback image signatures/attestations by digest;
2. pull both candidate images by digest;
3. create the Portal-only bridge without altering Trading System networks;
4. start projection PostgreSQL, run the one-shot migrator, then start Source
   Proxy and Edge with every dark flag unchanged;
5. prove PostgreSQL TLS/SCRAM, separate non-superuser owner/runtime roles,
   runtime no-DDL authority, migration completion and no published 5432 port;
6. prove non-root/read-only/cap-drop/limits/secret readability and health;
7. prove 8443 binds only to the WireGuard IP and 8444 only to the private bridge
   gateway; public and VPC paths remain denied;
8. send only local health/config negative-auth probes — no business route;
9. prove an absent Source Proxy upstream does not prevent Edge readiness while
   `EDGE_SOURCE_PROBES_ENABLED=false`;
10. record sanitized container/image/config/limit evidence.

Exit is `D2_DARK_ACCEPTED / SOURCE_INACTIVE`, never source availability.

## 5. Rollback triggers

Rollback on image/attestation mismatch, secret/identity failure, unexpected
listener, widened flag, host pressure, Trading System health change, container
restart loop, read-only violation or inability to attribute the exact change.

## 6. Rollback order

1. capture sanitized trigger/timestamp and stop Edge;
2. stop Source Proxy; do not restart or edit Trading System;
3. stop the migrator/DB after recording migration and DB health; preserve the
   named projection volume by default and never use `down -v` in rollback;
4. remove only D2 containers and the D2-owned bridge; retain D1 unless D1 itself
   is implicated;
5. render the recorded rollback digests with the same dark config and compare
   the normalized manifest before any retry;
6. if rollback deployment was explicitly approved, start the preserved DB,
   rollback migrator, Proxy and Edge and repeat dark checks; otherwise leave
   services absent;
7. confirm public listeners, routes, source traffic and registry/runtime flags
   match the pre-change baseline;
8. revoke only compromised D2 identities through their named owners; never
   reuse SSH/WireGuard credentials;
9. open a new reviewed window before another attempt.

The offline `execution-d2-test.sh` proves candidate/rollback manifests differ
only by immutable image digests and preserve security/dark invariants. It does
not prove live rollback, RTO/RPO or source compatibility.
