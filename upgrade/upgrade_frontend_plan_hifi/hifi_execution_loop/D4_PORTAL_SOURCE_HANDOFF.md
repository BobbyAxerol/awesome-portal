# D4 Portal Paper Source Contract — Sanitized Handoff

Status: `D4_SOURCE_RUNTIME_PARTIAL_PASS / LOOPBACK_ONLY / D4_SOURCE_PROXY_DISABLED / REVOKED_PROBE_PENDING / NO_SECRET_DISCLOSED`

This is the only source-side handoff for the Portal owner/agent at this stage.
It describes a reviewed, additive source implementation; it is **not**
authorization to start a container, add a Source Proxy route, send Portal
traffic, create a projection epoch, or use a live/canary account.

## Source identity and connection contract

| Field | Value |
|---|---|
| Source implementation commit | `4ad5d49322ce2e90e95148d36c5aa535c98b4935` |
| Immutable facade image digest | `sha256:8cf9adbc567b26e2d9489564b30e6dbc0c0a93a8ff2d9768c8e1d7f46d5c8088` (local immutable image ID) |
| Existing Gateway digest | `NOT_APPLICABLE — dedicated facade, Gateway V1 unchanged` |
| Contract revision | `d4.paper-read.v1` |
| Runtime bind | host `127.0.0.1:8011` only; container process `0.0.0.0:8011` solely behind that loopback publication |
| Portal connection | approved mTLS Source Proxy only; never direct to the facade |
| Upstream | `http://127.0.0.1:8011` on the Trading System host after an approved activation |
| Required identity header | `X-Portal-Paper-Read-Key` (value never disclosed) |
| Required contract header | `X-Portal-Read-Contract: d4.paper-read.v1` |
| Secret delivery location | `/srv/primus/portal/source-proxy/secrets/trading-system-read-header.conf` |
| Secret file ownership/mode | `root:portal-runtime / 0640` |
| Identity identifier SHA-256 | `sha256:c893771cadf097c7a8c4fca124aeff9fd309afd9f68bc0aa9ff088797eab822a` |

The Portal agent must not create, copy, request in chat, log, or return the
identity secret. The Trading System owner performs the owner-approved secret
handoff directly into the Source Proxy runtime file. The proxy discards caller
headers and injects the two headers above only for the four exact locations.
That D4 secret delivery is intentionally **not yet installed**: no D4 Source
Proxy include or header file was changed, so there is no Portal source traffic.

## Exact allowlist and protocol

```text
GET /v1/orders
GET /v1/fills
GET /v1/positions
GET /v1/events
```

Every other route, `/admin` route, command route, and all non-GET methods
(including `HEAD` and `OPTIONS`) are denied. The scope is fixed at runtime to
`PAPER_BINANCE_USDM` / `paper` / `BINANCE` with root-owned strategy/account and
canonical-instrument allowlists. The caller cannot choose scope through query
parameters.

Initial synchronization is: `GET /v1/events?snapshot=begin` → persist the
opaque snapshot and watermark → page the three resources until
`complete=true` → persist the projection atomically → poll `/v1/events` from
the watermark. Events are idempotent facade-derived full-record `UPSERT`s or
`DELETE` tombstones, not an immutable execution audit log. Tampered cursors
return `400`; ahead cursors `409`; retention/epoch expiry `410` and require a
fresh `BUILDING` snapshot.

Runtime defaults are 250 rows/page, 1 MiB response, 120 requests/minute,
300-second snapshot TTL, 10,000 snapshot rows and 10,000 retained events.
Hard source maxima are 1,000 rows/page, 8 MiB response, 10,000 requests/minute,
100,000 snapshot rows and 100,000 retained events. The owner must pin the
actual approved runtime values in the final acceptance manifest.

## Pin before any qualification window

| Artifact | SHA-256 |
|---|---|
| Exact route allowlist | `sha256:c45c3f3f4f8f0aecc5ef4bdac3dcdf1250af1057454d8c3a0312bf803ec6e9d9` |
| OpenAPI/schema | `sha256:620fc88821c44a4019079b48055fa709b932ebf28c243a3122c6cb217fd3121d` |
| Capability / cursor / completeness / resync contract | `sha256:284caf2e299fbc71d924219d0f5312553a2c60c81a70adad716fb78cf093b11b` |
| Source guide | `sha256:478eaec1f51f849170cc8170ed1224dd08931f293c1d124f75a6996919110ee7` |
| Negative/positive source test evidence | `sha256:a1cd28d785dfff1697ed9527474c649fc6288b0839e080f64aae45fa5cea8922` |
| Runtime missing/wrong/revoked/mutation evidence | `PENDING_OWNER_RUNTIME_EVIDENCE` |
| Runtime health/latency evidence | `PENDING_OWNER_RUNTIME_EVIDENCE` |

Canonical source artifacts:

- `contracts/portal-paper-read-d4-v1.allowlist.txt`
- `contracts/openapi/portal-paper-read-d4-v1.json`
- `contracts/portal-paper-read-d4-v1.capability.json`
- `PORTAL_PAPER_READ_FACADE_GUIDE.md`
- `deploy/portal-d4/source-proxy-d4-read-locations.conf.template`

## EBS host-preparation handoff

| Field | Verified host value |
|---|---|
| Instance / AZ | `i-00a12daa5535dc225` / `ap-east-1a` |
| EBS volume | `vol-0e20a4b1657075930`, gp3, 40 GiB, owner states encrypted |
| Verified stable device | `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_vol0e20a4b1657075930` |
| Filesystem | ext4, UUID `a6d079c5-5237-4cf7-a92a-ed43d2ca0c65` |
| Filesystem label | `portal_d4_proj` (valid ext4 label; UUID is authoritative) |
| Mount | `/srv/primus/portal/projection-d4` |
| Effective mount options | `rw,nosuid,nodev,noexec,noatime` |
| Mounted root permissions | `root:root`, mode `0750` |
| Projection PostgreSQL data directory | `/srv/primus/portal/projection-d4/postgres`, UID/GID `70:70`, mode `0700` |
| Persistent fstab identity | UUID-bound, `defaults,nofail,nodev,nosuid,noexec,noatime` |
| Host capacity sample | 40 GiB total, 40 GiB available, 1% used |
| Storage readiness verifier | `scripts/execution-d4-storage-preflight.sh --env-file /home/bobby/secure/portal-execution-d4-storage-input.env --mode readiness` |
| Storage input template SHA-256 | `sha256:c7557d22447ad8c6a2de9c90a739ea2c1bfbcfdda561a1c18cf5f832de039cd3` |
| Storage verifier SHA-256 | `sha256:877ace2232f6073814e87bf37d06770d8711935fea42a2bb713dcc9a9c12e6b3` |

The host checks proved the exact NVMe serial, empty pre-format disk, no
partition, no prior mount and root-disk separation before the one filesystem
creation. No Compose/Portal/runtime process was started. The host has no
usable AWS SDK/instance-profile credential, so it cannot independently query
the AWS control plane. The owner-provided sanitized KMS and `DescribeVolumes`
hashes are retained only in the protected private owner-input, not in this
handoff or its Git template. The same read-only storage verifier now returns
`PASSED` for the complete host gate. Do not infer EBS encryption from guest OS
state alone, and do not treat storage readiness as authorization to open a
qualification window.

## Current runtime acceptance and agent continuation

The dedicated facade is currently running only for owner-local acceptance as
Compose project `ts_d4_source_read`, service `portal_paper_read`. It is pinned
to the image ID above, runs as the dedicated non-login UID/GID `999:986`, has a
read-only root filesystem, dropped capabilities, four read-only secret mounts,
and the only published address is `127.0.0.1:8011`. It connects to the existing
Trading System database through a dedicated `d4_portal_read` login with a
two-connection limit, read-only transaction defaults, timeouts and
column-level `SELECT` only on `orders`, `fills` and `positions_v2`.

The root-only runtime scope is a frozen, fail-closed snapshot of 12 current
`paper`/`BINANCE` strategy-account pairs and 5 instruments. It contains no
identifier in this handoff and does not automatically admit later accounts or
instruments. The DSN, identity, scope and cursor files live only under
`/srv/primus/portal/runtime/d4-source-read`, are `root:portal-read-d4 / 0640`,
and must not be copied, printed or committed. The non-secret runtime manifest
there is `root:root / 0600`.

Completed owner-local evidence, with bodies discarded and no Source Proxy or
Portal request:

- missing identity, wrong contract and wrong identity: `401`;
- `POST` and `OPTIONS`: `405`; `/admin`: `404`;
- correct snapshot handshake (`/v1/events?snapshot=begin`), paged orders,
  fills and positions, and incremental events: all `200`;
- redacted snapshot counts only: orders `1165`, fills `6088`, positions `20`;
- gateway health before the D4 start: `200` in 0.001509 seconds.

The owner paused immediately before the revoked-key runtime probe. The next
agent may perform only that bounded probe: add one temporary revoked overlap
credential to the private identity file, restart **only** this D4 container,
prove the revoked credential returns `401`, restore the original one-key file
and restart the same container. Do not print a key or response body. Then
collect an after-health status/latency sample, record only redacted evidence in
the source plan, and leave D4 Source Proxy delivery, Portal traffic, epoch,
registry, query/SSE/analytics/commands and live/canary untouched.

## Mandatory owner gates before status can change

1. Completed: a dedicated least-privilege Trading System read-only DB role/DSN
   and four private runtime files were created; Portal has no possession of the
   DSN.
2. Completed: the source image is pinned above and the running listener is
   host-loopback-only in its standalone, profile-gated Compose project.
3. Partial: the identity exists and local missing/wrong/mutation evidence
   passed; the single revoked-key probe is paused as described above. Do not
   deliver the identity secret to the Source Proxy before that review.
4. Partial: baseline gateway health is recorded. Capture the after-health
   sample and cleanup/rollback evidence after the paused probe, without Portal
   source traffic or an epoch.
5. Completed independently: the owner reconciled the sanitized AWS
   `DescribeVolumes` and KMS hashes through the protected owner-input, and the
   storage readiness verifier passed. The digests and raw evidence remain out
   of this Git handoff; that storage result is independent of this source API.

Rollback, if a later approved activation must be undone, is removal of only
the dedicated facade container, proxy include and secret mounts. Gateway V1,
matcher, risk, accounting, execution, broker state and the Portal projection
remain untouched.

`NO_DB_REDIS_CLI_BROKER_OR_COMMAND_AUTHORITY_GRANTED` to Portal.
