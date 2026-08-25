# Execution D4 — Paper Read Shadow Authorization

Status: `D4_RUNTIME_ENTRYPOINT_OFFLINE_ACCEPTED / LIVE_SOURCE_DARK / NO_PORTAL_SOURCE_TRAFFIC`

D4 is the first phase allowed to observe bounded Paper business data. It is not
an activation phase. A passing D4 qualification may create and validate only a
`BUILDING` projection epoch; it cannot expose Query API, analytics, SSE,
commands, a non-fixture registry profile or any Trading System mutation.

## Placement

- The full Portal, browser gateway and TypeScript Control API remain on SGP.
- AWS-HK keeps only the bounded Source Proxy, Rust Execution Edge and private
  projection database on the existing 8-core/16-GiB host.
- D4 business projection storage must be encrypted and separately approved. It
  must not silently use the unencrypted host root volume used by dark D2.

## Encrypted-storage assets

- `storage-input.env.example`: credential-free storage decision and evidence
  schema;
- `compose.encrypted-storage.yaml`: D4-only bind-backed volume overlay; and
- `../../scripts/execution-d4-storage-preflight.sh`: template/offline/readiness
  gate that never creates, formats or mounts a device.

Before any Compose handoff, the live storage input must pass `readiness` and
the D4 data path must resolve to a dedicated filesystem UUID different from
`/`. The guest-side gate also requires private AWS `DescribeVolumes` and KMS
identity digests because Linux mount metadata alone cannot prove EBS
encryption.

## D4 Source Proxy assets

The D4 proxy is deliberately separate from the legacy D1/D3 Gateway renderer:

- `source-proxy/nginx.conf.template` accepts HTTP/2 over TLS 1.3 mTLS on the
  private bridge only;
- the digest-verified imported location include routes exactly four GET paths
  to the owner facade at `127.0.0.1:8011`;
- `compose.paper-read-shadow.yaml` mounts that include without changing any
  Query/SSE/analytics/command setting; and
- `../../scripts/execution-d4-source-proxy-{preflight,test}.sh` prove the
  boundary without opening a source connection.

Never render D4 through `execution-d2-render-source-proxy.sh paper-read`: that
legacy compatibility path targets port 8000 and is not the D4 contract.

## D4 one-shot qualifier assets

- `qualification-runtime.env.example` holds only non-secret, bounded runtime
  metadata and the digest of the validated owner input;
- `compose.paper-read-shadow.yaml` profile-gates a no-port
  `paper-read-qualifier` job;
- `../../scripts/execution-d4-qualification-preflight.sh` validates the
  separate qualifier config, owner-input byte identity, mTLS client bundle and
  runtime-role TLS DSN without opening a socket; and
- the Edge image commands `d4-prepare-building` and `d4-qualify` can only
  create/resume one declared Paper `BUILDING` epoch.

The D4 values intentionally do not extend the D1 env schema. Compose receives
the already-validated D1 env and D4 qualifier env as separate `--env-file`
inputs so predecessor preflights keep rejecting unknown keys.

## Hard stop gates

`owner-input.env.example` records decisions and SHA-256 evidence references,
never credentials or source payloads. Readiness is rejected unless:

1. D2 is `D2_DARK_ACCEPTED` and D3 is `D3_TRANSPORT_ACCEPTED` at the accepted
   deployment commit. This predecessor gate passed on 2026-08-24 at
   `5ec282ec8c00c60696f66a70186ffd80b051d8a0`.
2. The Trading System owner has published and locally accepted a dedicated
   Paper read identity that
   rejects missing and wrong credentials and denies all mutation methods.
3. Exact GET routes, OpenAPI/facade/capability identity, cursor completeness
   and resync semantics are digest-locked.
4. The production mapper and sealed replay corpus bind to the deployment
   commit.
5. An encrypted, approved projection store and tested backup/restore path exist.
6. Named source, rollback, backup and observability owners approve a window no
   longer than two hours.

The old optional-key Gateway contract remains intentionally rejected. The new
dedicated `d4.paper-read.v1` facade contract is the only candidate source and
must be consumed through the mTLS Source Proxy. Portal must not compensate with
direct database, Redis, CLI or broker access.

## Offline gate

```bash
python3 scripts/execution-d4-authorization.py \
  --input deploy/execution-d4/owner-input.env.example \
  --mode template
python3 scripts/test_execution_d4_authorization.py
./scripts/test-execution-d4-storage.sh
```

After owner source/storage evidence arrives but before any change window or
Source Proxy delivery, validate the private mode-0600 manifest with
`--mode reconciliation`. This mode requires the published source/runtime/
storage identities while also requiring D4 authorization, proxy delivery and
evidence acceptance to remain false.

For a future private owner input, use mode `readiness` before any source read and
mode `qualification` only after all replay/parity/freshness/gap/restart/load/
restore evidence exists. Both modes print only a decision and change no state.

The executable live sequence is in
`../runbooks/execution-d4-paper-shadow-and-rollback.md`. It remains prohibited
until all predecessors are accepted.

The current read-only prerequisite audit and the exact Trading System owner
request are recorded in
[`../../upgrade/backend/EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md`](../../upgrade/backend/EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md).
D2/D3 predecessors are accepted. The dedicated source runtime and encrypted
host storage are owner-prepared; contract import, the offline D4 Source Proxy
profile and the BUILDING-only one-shot runtime entrypoint are complete. Live
secret/route delivery and a fresh owner qualification window remain gated.

The historical storage deployment boundary was
`D4_ENCRYPTED_STORAGE_BOUNDARY_PREPARED / LIVE_VOLUME_NOT_PROVISIONED /
NO_SOURCE_READ`. It is superseded by owner-proven encrypted gp3 host
preparation; no Portal Compose stack or projection epoch has started. Evidence:
[`../../upgrade/backend/EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md`](../../upgrade/backend/EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md).

The exact owner-side gp3 procedure, return fields and copy-paste Trading System
agent request are in
[`../../upgrade/backend/EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md`](../../upgrade/backend/EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md).
Its status is `D4_OWNER_ACTION_PACKET_PREPARED / OWNER_ACTIONS_PENDING /
NO_SOURCE_READ`; it is guidance, not authorization or runtime evidence.

The current reconciliation and v2 authorization stop gates are recorded in
[`../../upgrade/backend/EX_BE_02_LIVE_D4_SOURCE_AND_STORAGE_RECONCILIATION.md`](../../upgrade/backend/EX_BE_02_LIVE_D4_SOURCE_AND_STORAGE_RECONCILIATION.md).
