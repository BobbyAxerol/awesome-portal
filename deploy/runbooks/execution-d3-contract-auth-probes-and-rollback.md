# D3 Contract/Auth Probes and Rollback Runbook

State before entry: `D2_ACCEPTED / SOURCE_DARK`  
State after successful exit: `D3_ACCEPTED / BUSINESS_SOURCE_DARK`  
Owner: Bobby  
Trading System mutation authority: **none**

This runbook is executable only after D2 live acceptance. It does not grant D2
authorization, does not issue a Trading System read identity and does not
authorize D4, registry activation, Query/SSE or commands.

## 1. Stop gates

Record a private change-window ID and reject entry unless all conditions hold:

1. D1 WireGuard remains accepted with one exact UDP 51820-from-SGP `/32` rule.
2. D2 Edge, Source Proxy, PostgreSQL and migrator are accepted and rollback was
   rehearsed; the temporary EC2 operator instance profile is absent from the
   workload host.
3. Edge/Proxy digests have accepted D2 provenance, SBOM, vulnerability and
   Cosign evidence. The Control API probe image has the equivalent D3 evidence.
4. Real Edge server, SGP client, internal Source Proxy and delegation JWKS
   identities pass expiry/trust/key-separation checks.
5. Both cells have synchronized UTC time, healthy WireGuard, healthy existing
   services and admitted CPU/memory/I/O pressure.
6. A rollback operator retains SSH access independently of WireGuard.

Do not place an assertion, key, certificate body, API key, password, account,
order, fill, position or event payload in Git, terminal history or logs.

## 2. Prepare an isolated D3 candidate on AWS-HK

Use private absolute paths; these names are examples and contain no value:

```bash
sudo -n /srv/primus/portal/scripts/execution-d3-render-probe-env.sh \
  --d2-env /srv/primus/portal/runtime/execution-d2.env \
  --output /srv/primus/portal/runtime/execution-d3.env \
  --proxy-config /srv/primus/portal/source-proxy/nginx.d3-probe.conf

sudo -n /srv/primus/portal/scripts/execution-d2-preflight.sh \
  --env-file /srv/primus/portal/runtime/execution-d3.env \
  --mode probe-readiness
```

The renderer refuses to overwrite either output. Review a value-free diff by
key name only. The only semantic changes are:

```text
SOURCE_PROXY_SOURCE_MODE: dark -> contract-probe
EDGE_SOURCE_PROBES_ENABLED: false -> true
SOURCE_PROXY_CONFIG_FILE: D2 path -> separate D3 path
```

`EDGE_PROBE_ALPHA_ID` stays empty. Any additional flag delta is a stop.

## 3. Rebaseline before mutation

Privately record timestamps and status only:

- current D2 image digests and container health;
- WireGuard latest handshake/private ping;
- public TCP 8443/8444 denial;
- local Trading System `/v1/health` status without business payload;
- CPU, memory, disk and PSI; and
- current D2 rollback env/config digests.

Rollback immediately if Trading System health is not already green, time is not
synchronized, the WireGuard peer is stale or pressure exceeds the approved D2
admission envelope.

## 4. Apply only the D3 overlay

From the reviewed AWS-HK checkout:

```bash
sudo -n docker compose \
  --project-directory /srv/primus/portal \
  --env-file /srv/primus/portal/runtime/execution-d3.env \
  -f /srv/primus/portal/deploy/compose.execution-edge.yaml \
  -f /srv/primus/portal/deploy/execution-d1/compose.dark.yaml \
  -f /srv/primus/portal/deploy/execution-d3/compose.probes.yaml \
  up -d --no-deps source-proxy execution-edge
```

Do not pull an unreviewed tag in this step. The private env contains immutable
digests. Verify both containers retain non-root users, read-only root filesystems,
cap-drop, no-new-privileges and the D2 resource limits.

After at least one probe interval:

```bash
sudo -n docker compose \
  --project-directory /srv/primus/portal \
  --env-file /srv/primus/portal/runtime/execution-d3.env \
  -f /srv/primus/portal/deploy/compose.execution-edge.yaml \
  -f /srv/primus/portal/deploy/execution-d1/compose.dark.yaml \
  -f /srv/primus/portal/deploy/execution-d3/compose.probes.yaml \
  ps
```

The Source Proxy access log may contain only the three exact public probe paths.
Any `/v1/orders`, `/v1/fills`, `/v1/positions`, `/v1/events`, unknown path,
query parameter not produced by the adapter, or secret-like log value triggers
rollback. Projection row/journal counts must remain unchanged.

## 5. Generate the bounded assertion corpus on SGP

Use the signed Control API image digest from the D3 publication artifact. The
image runs with no network and writes only to a fresh mode-0700 directory:

```bash
sudo -n install -d -o 1000 -g 1000 -m 0700 /srv/primus/portal/runtime/d3-assertions

sudo -n docker run --rm --network none --read-only \
  --user 1000:1000 --group-add 987 \
  --cap-drop ALL --security-opt no-new-privileges \
  --volume /srv/primus/portal/control-api/delegation-private-key.pem:/run/secrets/delegation-private-key.pem:ro \
  --volume /srv/primus/portal/runtime/d3-assertions:/evidence \
  CONTROL_API_IMAGE_BY_IMMUTABLE_DIGEST \
  node dist/cli/execution-d3-assertions.js \
    --acknowledge D3_AUTH_NEGATIVE_MATRIX \
    --private-key-file /run/secrets/delegation-private-key.pem \
    --key-id CONTROL_API_ACTIVE_KID \
    --issuer portal-control-api \
    --audience portal-execution-edge-paper \
    --environment paper \
    --output-directory /evidence \
    --change-window-id PRIVATE_D3_WINDOW_ID
```

Verify the image's `node` UID and the shared runtime GID before substituting the
example numeric identities. The directory must be empty; the CLI never
overwrites. The valid assertion lives 45 seconds, so generate immediately before
the probe. If it expires, destroy the corpus and generate a new empty-directory
corpus; never extend TTL beyond 60 seconds.

## 6. Run the real SGP→AWS matrix

Prepare a deliberately untrusted client certificate/key from a separate probe
CA. It must not be added to Edge trust. Then run:

```bash
sudo -n install -d -o 1000 -g 1000 -m 0700 /srv/primus/portal/runtime/d3-evidence

/srv/primus/portal/scripts/execution-d3-live-probe.sh \
  --origin https://10.70.0.2:8443 \
  --ca-file /srv/primus/portal/control-api/edge-server-ca.crt \
  --client-cert-file /srv/primus/portal/control-api/sgp-client.crt \
  --client-key-file /srv/primus/portal/control-api/sgp-client.key \
  --wrong-client-cert-file /srv/primus/portal/runtime/d3-untrusted/client.crt \
  --wrong-client-key-file /srv/primus/portal/runtime/d3-untrusted/client.key \
  --assertion-directory /srv/primus/portal/runtime/d3-assertions \
  --evidence-file /srv/primus/portal/runtime/d3-evidence/probe.json \
  --change-window-id PRIVATE_D3_WINDOW_ID \
  --iterations 10 \
  --maximum-total-ms 2000
```

The accepted matrix is:

| Case | Expected |
|---|---|
| no client certificate | TLS rejection before HTTP |
| certificate from wrong CA | TLS rejection before HTTP |
| valid mTLS, no JWT | HTTP 401 over H2 |
| malformed, wrong signature, unknown KID | HTTP 403 over H2 |
| wrong issuer/audience/environment | HTTP 403 over H2 |
| expired, future `nbf`, TTL 61 seconds | HTTP 403 over H2 |
| missing `execution.read` | HTTP 403 over H2 |
| canonical 45-second assertion | HTTP 200 over H2 |
| unknown route | HTTP 404 over H2 |
| POST to compatibility route | HTTP 405 over H2 |

The positive response must show `contracts=SUPPORTED`, public health/capability
reads as `READ_ONLY`, and orders/fills/positions/events as `DISABLED` with
`alpha_probe_not_configured`. The evidence file stores only status, timing,
protocol, policy and capability snapshot ID.

## 7. Source-loss fault and recovery drill

This drill affects only Portal's Source Proxy, never Trading System:

1. Record Edge readiness and the capability snapshot ID.
2. Stop only `source-proxy` using the same D3 Compose stack.
3. Wait one full probe interval plus bounded timeout.
4. Confirm Edge readiness fails closed while its process remains live; no
   business/query/SSE endpoint becomes available.
5. Start only `source-proxy`; wait for healthy state and one probe interval.
6. Confirm Edge readiness recovers and a new public-only snapshot is available.
7. Recheck Trading System local health and unchanged projection counts.

Any restart loop, resource-pressure regression, stale readiness success during
source loss, business route access or Trading System health change fails D3.

## 8. Acceptance and cleanup

D3 is accepted only when:

- HTTP/2 and TLS 1.3 mTLS are observed from SGP;
- every positive/negative JWT result matches exactly;
- all bounded latency samples meet the owner-approved ceiling;
- capability identity/digest/revision match D0/D2 locks;
- only three public source routes were called;
- projection counts remain unchanged;
- source-loss/recovery and D2 rollback both pass; and
- no token, key or business payload appears in evidence/logs.

After the final assertion expires, remove the assertion corpus through the
approved secure cleanup process. Retain only the mode-0600 redacted evidence and
reviewed container/log digests. D3 acceptance does not alter registry delivery
profiles.

## 9. Roll back to D2

Use the unchanged D2 env and its separate dark Source Proxy config:

```bash
sudo -n docker compose \
  --project-directory /srv/primus/portal \
  --env-file /srv/primus/portal/runtime/execution-d2.env \
  -f /srv/primus/portal/deploy/compose.execution-edge.yaml \
  -f /srv/primus/portal/deploy/execution-d1/compose.dark.yaml \
  up -d --no-deps source-proxy execution-edge
```

Verify Edge becomes ready with source probes disabled, all seven Source Proxy
routes are guarded, no source request occurs and Trading System health remains
green. Do not remove the D2 PostgreSQL volume. A failed D3 never authorizes D4.
