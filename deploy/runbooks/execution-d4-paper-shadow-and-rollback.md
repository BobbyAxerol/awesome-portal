# D4 Paper Read Shadow and Rollback Runbook

Entry state: `D2_DARK_ACCEPTED / D3_TRANSPORT_ACCEPTED`  
Preparation state: `D4_OFFLINE_AUTHORIZATION_PREPARED`  
Successful future exit: `D4_PAPER_SHADOW_EVIDENCE_ACCEPTED / ACTIVATION_FALSE`  
Trading System mutation authority: **none**

This runbook defines the future bounded D4 change. It does not authorize a live
run today. The full Portal stays on SGP; only the minimal Execution Edge boundary
runs on AWS-HK.

## 1. Owner and contract prerequisites

Stop unless the Trading System owner publishes and independently tests:

- one dedicated Paper read identity, rejected when missing or wrong;
- an allowlist of exact GET routes only;
- a frozen OpenAPI/gateway/capability revision;
- stable cursor or bounded snapshot semantics for orders, fills, positions and
  events;
- event completeness and resync rules, including what a gap means; and
- explicit denial for POST, PUT, PATCH, DELETE, database, Redis, CLI and broker
  authority.

Do not ask Portal code to make the current optional-key contract safe. That
must be fixed or fronted by the Trading System owner at its own boundary.

## 2. Infrastructure prerequisites

Require accepted D2/D3 evidence, immutable signed images, workload mTLS/JWT
identities, healthy WireGuard and exact host-admission baseline. The projection
store must use owner-approved encryption with a tested backup and restore path.
The dark D2 root-volume database is not an acceptable D4 business store.

Copy `deploy/execution-d4/storage-input.env.example` outside Git, keep it mode
0600 and fill only the owner decision, resource identity and evidence digests.
The AWS control-plane evidence must independently prove `Encrypted=true` and
the KMS identity; guest `lsblk` output is not encryption evidence.

Run the read-only storage gate before Compose is allowed to create or reuse the
D4 volume:

```bash
sudo ./scripts/execution-d4-storage-preflight.sh \
  --env-file /PRIVATE/PATH/execution-d4-storage.env \
  --mode readiness
```

Use the D4 overlay only after this passes:

```bash
sudo docker compose \
  --env-file /PRIVATE/PATH/execution-runtime.env \
  -f deploy/compose.execution-edge.yaml \
  -f deploy/execution-d1/compose.dark.yaml \
  -f deploy/execution-d4/compose.encrypted-storage.yaml \
  config --quiet
```

The overlay must render a new `portal-execution-projection-pgdata-v2+`
bind-backed local volume targeting the dedicated D4 data directory. It must
never target `/`, the D2 volume or a directory on the root filesystem.

Copy `deploy/execution-d4/owner-input.env.example` outside Git, set mode 0600
and fill only identifiers/digests. Never put a source key, JWT, certificate,
password, account ID, alpha ID, order, fill, position or event payload in the
file.

```bash
python3 scripts/execution-d4-authorization.py \
  --input /PRIVATE/PATH/execution-d4-owner-input.env \
  --mode readiness
```

The validator must pass inside the approved <=2-hour window. Passing changes no
runtime state.

Render and validate only the D4-specific proxy profile; do not use the legacy
D1/D3 `paper-read` renderer:

```bash
sudo ./scripts/execution-d4-render-source-proxy.sh \
  --env-file /PRIVATE/PATH/execution-runtime.env \
  --output /srv/primus/portal/source-proxy/nginx-d4.conf

sudo ./scripts/execution-d4-source-proxy-preflight.sh \
  --runtime-env /PRIVATE/PATH/execution-runtime.env \
  --owner-input /PRIVATE/PATH/execution-d4-owner-input.env \
  --config /srv/primus/portal/source-proxy/nginx-d4.conf \
  --contract /srv/primus/portal/releases/RELEASE/d4-paper-read-locations.conf \
  --mode readiness
```

Compose must add both D4 overlays, with
`SOURCE_PROXY_D4_CONTRACT_FILE` pointing to the exact installed include:

```bash
sudo docker compose \
  --env-file /PRIVATE/PATH/execution-runtime.env \
  -f deploy/compose.execution-edge.yaml \
  -f deploy/execution-d1/compose.dark.yaml \
  -f deploy/execution-d4/compose.encrypted-storage.yaml \
  -f deploy/execution-d4/compose.paper-read-shadow.yaml \
  config --quiet
```

## 3. Create a BUILDING epoch only

When the production mapper exists at the locked commit, start it in read-only
shadow mode with one fresh `BUILDING` epoch. Keep all of these false:

```text
ACTIVATION_AUTHORIZED=false
ALLOW_QUERY=false
ALLOW_ANALYTICS=false
ALLOW_SSE=false
ALLOW_COMMANDS=false
ALLOW_TRADING_SYSTEM_CHANGES=false
REGISTRY_DELIVERY_PROFILE=fixture
```

The mapper may call only the locked GET allowlist through Source Proxy. It may
write only Portal-owned journal/snapshot/projection tables. No ACTIVE epoch may
be created or replaced.

## 4. Qualification drills

Capture redacted evidence for:

1. sealed-corpus reducer/replay semantic parity;
2. source-to-projection parity with exact decimal and authority labels;
3. freshness and source-loss fail-closed behavior;
4. cursor gap detection and owner-published resync;
5. duplicate/restart/replay determinism;
6. bounded cross-cell load without Trading System health regression;
7. encrypted backup, restore and restored-epoch parity; and
8. mapper/Edge rollback while D2 dark services remain healthy.

Evidence contains digests, counts, durations, state codes and redacted warnings
only. It must not contain business rows or credentials.

After owner review, fill the qualification digests and run:

```bash
python3 scripts/execution-d4-authorization.py \
  --input /PRIVATE/PATH/execution-d4-owner-input.env \
  --mode qualification
```

`PASSED` means the evidence set is internally complete. It still does not
activate the epoch or registry profile.

## 5. Rollback

On any auth, gap, parity, pressure, Trading System health, storage or secret-
hygiene failure:

1. stop only the D4 mapper;
2. preserve the failed `BUILDING` epoch as non-queryable evidence or destroy it
   through the approved data-retention process;
3. restore the accepted D3/D2 env and Source Proxy allowlist;
4. verify business source requests cease, Query/SSE/analytics/commands remain
   disabled and the registry stays `fixture`;
5. verify Trading System public health and all pre-existing services; and
6. record redacted failure/rollback evidence.

Never roll back by editing Trading System data, Redis state or broker state.

## 6. Separate activation decision

Moving a qualified epoch from `BUILDING` to `ACTIVE`, exposing Query/SSE or
changing `fixture -> shadow` is a later owner-approved change with its own
authorization and rollback rehearsal. D4 qualification cannot perform or imply
that decision.
