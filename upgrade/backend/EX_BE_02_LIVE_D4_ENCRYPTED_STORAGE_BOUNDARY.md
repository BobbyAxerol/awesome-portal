# EX-BE-02-LIVE — D4 Encrypted Projection-Storage Boundary

Date: 2026-08-24  
Status: `D4_ENCRYPTED_STORAGE_BOUNDARY_PREPARED / LIVE_VOLUME_NOT_PROVISIONED / NO_SOURCE_READ`

## Outcome

The D4 storage path is now explicit and fail closed without creating a paid AWS
resource or changing the AWS-HK host. A D4 PostgreSQL volume can no longer
silently reuse the D2 named volume or the host root filesystem.

This checkpoint changed no AWS resource, mount, Docker volume, runtime service,
Trading System route or registry profile. It read no order, fill, position or
event.

## Fresh live audit

The private D4 owner input remains a valid unauthorized template; `readiness`
rejects it because D4 ownership is incomplete. A read-only AWS-HK check still
finds only the 150 GiB root device, with `/` on its ext4 partition. No separate
D4 block device or mount exists. The accepted D2 Edge, Source Proxy and
projection PostgreSQL containers remain healthy and the only projection volume
is `portal-execution-projection-pgdata-v1`.

Therefore live D4 storage remains unavailable. The existing volume is still
dark-schema-only and prohibited for Paper business data.

## Delivered boundary

- `deploy/execution-d4/storage-input.env.example` records only owner decisions,
  AWS resource identities and evidence digests; no KMS key, database password
  or source credential belongs in it.
- `scripts/execution-d4-storage-preflight.sh` provides three modes:
  - `template`: verifies the committed file stays unapproved;
  - `offline`: validates the filled metadata and planned boundary without
    inspecting the host; and
  - `readiness`: performs read-only host checks against the approved device,
    filesystem UUID, exact mountpoint, ext4 type, hardened mount options,
    minimum size, ownership and any existing Docker volume options.
- `deploy/execution-d4/compose.encrypted-storage.yaml` replaces the D2 named
  volume with a new versioned local-driver volume bound to the approved D4 data
  directory. It changes no source, Query, analytics, SSE or command flag.
- `scripts/test-execution-d4-storage.sh` proves the template/offline paths,
  rejection of unencrypted/root/D2-volume reuse and the rendered Compose
  boundary.

## Security properties

Readiness requires all of the following:

1. an owner-approved private mode-0600, root-owned input;
2. an AWS `Encrypted=true` decision plus canonical digests for KMS identity and
   the independently captured `DescribeVolumes` evidence;
3. a stable `/dev/disk/by-id/...` device whose filesystem UUID matches the exact
   dedicated mount and differs from `/`;
4. `rw,nodev,nosuid,noexec`, reviewed ext4, at least 20 GiB and exact mount/data
   directory ownership;
5. a new `portal-execution-projection-pgdata-v2+` name; and
6. if that Docker volume already exists, exact `type=none,o=bind,device=<D4
   data directory>` options.

The guest OS cannot independently infer EBS encryption. Therefore the live
gate requires AWS control-plane evidence; the boolean alone is not accepted
without its evidence and KMS-identity digests. The evidence remains private.

## Tests

- shell syntax: passed;
- storage template/offline positive path: passed;
- unencrypted EBS rejection: passed;
- root mount rejection: passed;
- D2 volume-name reuse rejection: passed;
- undersized volume, data-path drift, missing AWS evidence and weak input-mode
  rejection: passed;
- committed storage schema credential-name scan: passed; and
- Docker Compose render: passed with D4 bind-backed volume and all runtime
  activation flags still false.

The monorepo gate tracks and executes these assets. No state-changing command is
part of the validator or test.

## Remaining live inputs

Before a live storage window, Bobby still must explicitly approve the separate
encrypted gp3 volume, capacity/I/O/budget, KMS ownership, mount/retention and
backup destination. The attached IAM role must then be checked for the exact
create/attach/describe/tag permissions or Bobby may create the volume manually.

Independently, the Trading System owner must publish the dedicated mandatory-
auth Paper read identity and exact cursor/completeness/resync contract. Storage
readiness alone never authorizes a business source call or BUILDING epoch.
