# Execution D4 — Paper Read Shadow Authorization

Status: `D4_OFFLINE_AUTHORIZATION_PREPARED / D3_PREDECESSOR_ACCEPTED / LIVE_D4_INPUTS_BLOCKED`

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

## Hard stop gates

`owner-input.env.example` records decisions and SHA-256 evidence references,
never credentials or source payloads. Readiness is rejected unless:

1. D2 is `D2_DARK_ACCEPTED` and D3 is `D3_TRANSPORT_ACCEPTED` at the accepted
   deployment commit. This predecessor gate passed on 2026-08-24 at
   `5ec282ec8c00c60696f66a70186ffd80b051d8a0`.
2. The Trading System owner has published a dedicated Paper read identity that
   rejects missing and wrong credentials and denies all mutation methods.
3. Exact GET routes, OpenAPI/gateway/capability identity, cursor completeness
   and resync semantics are digest-locked.
4. The production mapper and sealed replay corpus bind to the deployment
   commit.
5. An encrypted, approved projection store and tested backup/restore path exist.
6. Named source, rollback, backup and observability owners approve a window no
   longer than two hours.

The discovered Trading System contract currently treats `X-API-Key` as optional
on alpha-facing reads and does not publish complete stable pagination/event
semantics for every required source. That contract is intentionally rejected;
Portal must not compensate with direct database, Redis, CLI or broker access.

## Offline gate

```bash
python3 scripts/execution-d4-authorization.py \
  --input deploy/execution-d4/owner-input.env.example \
  --mode template
python3 scripts/test_execution_d4_authorization.py
./scripts/test-execution-d4-storage.sh
```

For a future private owner input, use mode `readiness` before any source read and
mode `qualification` only after all replay/parity/freshness/gap/restart/load/
restore evidence exists. Both modes print only a decision and change no state.

The executable live sequence is in
`../runbooks/execution-d4-paper-shadow-and-rollback.md`. It remains prohibited
until all predecessors are accepted.

The current read-only prerequisite audit and the exact Trading System owner
request are recorded in
[`../../upgrade/backend/EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md`](../../upgrade/backend/EX_BE_02_LIVE_D4_READINESS_AUDIT_AND_OWNER_REQUEST.md).
D2/D3 predecessors are accepted; identity/contract and encrypted-storage inputs
remain blocked.

The storage deployment boundary itself is
`D4_ENCRYPTED_STORAGE_BOUNDARY_PREPARED / LIVE_VOLUME_NOT_PROVISIONED /
NO_SOURCE_READ`. No separate block device currently exists on AWS-HK, so the
overlay remains render-only. Evidence:
[`../../upgrade/backend/EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md`](../../upgrade/backend/EX_BE_02_LIVE_D4_ENCRYPTED_STORAGE_BOUNDARY.md).

The exact owner-side gp3 procedure, return fields and copy-paste Trading System
agent request are in
[`../../upgrade/backend/EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md`](../../upgrade/backend/EX_BE_02_LIVE_D4_OWNER_ACTION_PACKET.md).
Its status is `D4_OWNER_ACTION_PACKET_PREPARED / OWNER_ACTIONS_PENDING /
NO_SOURCE_READ`; it is guidance, not authorization or runtime evidence.
