# EX-BE-02-LIVE D4 — Owner Action Packet: Encrypted gp3 and Paper Read Identity

Date: 2026-08-24  
Status: `D4_OWNER_ACTION_PACKET_PREPARED / OWNER_ACTIONS_PENDING / NO_SOURCE_READ`

## 1. Outcome and authority boundary

This packet gives Bobby two independent owner actions required for D4:

1. create one encrypted EBS data volume for the Portal-owned projection
   PostgreSQL database on the existing AWS-HK EC2 instance; and
2. ask the Trading System owner to publish and implement one dedicated,
   mandatory-auth, read-only Paper API identity and the stable four-resource
   read contract.

These actions are deliberately separate. The EBS volume is a writable Portal
data store. The Trading System identity is an API read identity and must never
be a database, Redis, CLI, broker or command credential.

This document itself creates no AWS resource, credential, mount, service,
source request or projection epoch.

## 2. Recommended EBS configuration

Use the existing AWS-HK instance and do not create another EC2 or RDS service.

| Setting | D4 value | Reason |
|---|---|---|
| Region | `ap-east-1` | same region as the Execution Cell |
| Availability Zone | **exactly the EC2 instance AZ** | EBS can attach only within the same AZ |
| Volume type | `gp3` | predictable general-purpose SSD without burst credits |
| Size | **40 GiB** | safe initial headroom over the 20-GiB hard gate; expandable later |
| IOPS | **3,000** | included gp3 baseline; do not pay for more before measurement |
| Throughput | **125 MiB/s** | included gp3 baseline; sufficient for the first Paper shadow |
| Snapshot source | none / new empty volume | prevents accidental data inheritance |
| Encryption | **enabled** | mandatory for D4 business projections |
| KMS | `alias/aws/ebs` for D4 v1 | simplest managed-key boundary; customer-managed KMS is optional later |
| Multi-Attach | disabled | one PostgreSQL writer on one host |
| Delete on termination | disabled | prevents instance lifecycle from deleting projection evidence |
| Filesystem | `ext4` | reviewed by the current storage preflight |
| Mount | `/srv/primus/portal/projection-d4` | exact dedicated mount boundary |
| PostgreSQL data | `/srv/primus/portal/projection-d4/postgres` | exact bind target for the D4 Compose overlay |
| Container ownership | `70:70`, directory mode `0700` | official PostgreSQL image runtime identity |
| Docker volume | `portal-execution-projection-pgdata-v2` | prevents D2 `v1` reuse |

AWS currently documents that gp3 includes a baseline of 3,000 IOPS and 125
MiB/s, and that EBS encryption covers at-rest data, instance-volume I/O and
snapshots. The guest OS does not prove that encryption; keep the AWS
`DescribeVolumes` evidence required below.

Capacity policy for this first volume:

- warn at 70% filesystem use;
- plan expansion before 80%;
- do not increase IOPS/throughput until CloudWatch plus PostgreSQL evidence
  shows sustained pressure; and
- never store Trading System source credentials on this volume.

## 3. AWS Console procedure

Use an owner/admin AWS Console session. The instance role does not need direct
KMS API access for PostgreSQL; EBS encryption is transparent to the guest.

1. Open **EC2 → Instances**, select instance
   `i-00a12daa5535dc225`, and record its Availability Zone.
2. Open **EC2 → Elastic Block Store → Volumes → Create volume**.
3. Set the exact values from §2: `gp3`, `40 GiB`, `3000 IOPS`, `125 MiB/s`,
   same AZ, no snapshot, encryption enabled and `alias/aws/ebs`.
4. Add at least these tags:

   ```text
   Name=portal-execution-projection-d4
   PrimusSystem=portal
   PrimusPlane=execution-edge
   Environment=paper
   DataClass=paper-projection
   ManagedBy=bobby
   BackupPolicy=daily-7d-weekly-4w
   ```

5. Create the volume and wait for state `available`.
6. Select it → **Actions → Attach volume** → instance
   `i-00a12daa5535dc225` → requested device `/dev/sdf`.
7. Wait for state `in-use`. Do not format anything until the AWS volume ID has
   been matched to the Linux NVMe serial as described below.

Equivalent CLI shape, if Bobby deliberately uses CloudShell, is:

```bash
aws ec2 create-volume \
  --region ap-east-1 \
  --availability-zone REPLACE_WITH_INSTANCE_AZ \
  --volume-type gp3 \
  --size 40 \
  --iops 3000 \
  --throughput 125 \
  --encrypted \
  --kms-key-id alias/aws/ebs \
  --tag-specifications 'ResourceType=volume,Tags=[{Key=Name,Value=portal-execution-projection-d4},{Key=PrimusSystem,Value=portal},{Key=PrimusPlane,Value=execution-edge},{Key=Environment,Value=paper},{Key=DataClass,Value=paper-projection},{Key=ManagedBy,Value=bobby},{Key=BackupPolicy,Value=daily-7d-weekly-4w}]'
```

Do not run the CLI with a guessed AZ or attach a volume whose returned ID has
not been recorded.

## 4. AWS-HK host preparation

The following step formats a block device and is destructive if the wrong
device is selected. The agent/operator must stop unless **all** of these are
true:

- AWS says the new volume is encrypted, 40 GiB, gp3 and attached to the exact
  instance;
- its serial matches the returned volume ID with the hyphen removed;
- `FSTYPE` is empty;
- it is not mounted and has no child partitions; and
- it is not the root disk.

First perform only read-only discovery:

```bash
lsblk -o NAME,PATH,TYPE,SIZE,FSTYPE,MOUNTPOINTS,SERIAL
ls -l /dev/disk/by-id/
sudo wipefs --no-act REPLACE_WITH_MATCHED_DEVICE
sudo file -s REPLACE_WITH_MATCHED_DEVICE
```

Nitro can rename `/dev/sdf` to `/dev/nvme*n1`; never select an NVMe index by
guessing. Match the EBS volume ID/serial and retain the actual stable
`/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_vol...` path.

Only after the checks above pass, create the filesystem once:

```bash
sudo mkfs.ext4 -m 0 -L portal_projection_d4 REPLACE_WITH_STABLE_BY_ID_DEVICE
sudo install -d -o root -g root -m 0750 /srv/primus/portal/projection-d4
sudo blkid REPLACE_WITH_STABLE_BY_ID_DEVICE
```

Add one `/etc/fstab` record using the filesystem UUID, not `/dev/nvme1n1`:

```text
UUID=REPLACE_WITH_UUID /srv/primus/portal/projection-d4 ext4 defaults,nofail,nodev,nosuid,noexec,noatime 0 2
```

Then mount and prepare the private PostgreSQL directory:

```bash
sudo systemctl daemon-reload
sudo mount /srv/primus/portal/projection-d4
sudo install -d -o 70 -g 70 -m 0700 /srv/primus/portal/projection-d4/postgres
findmnt -M /srv/primus/portal/projection-d4 -o SOURCE,TARGET,FSTYPE,OPTIONS,UUID,SIZE,AVAIL
lsblk -o NAME,PATH,TYPE,SIZE,FSTYPE,MOUNTPOINTS,SERIAL,UUID
```

Do **not** start the D4 Compose overlay yet. The storage and D4 authorization
preflights must pass first, followed by a separate owner-approved change
window.

## 5. Evidence/config to return to Codex

Do not send a KMS key value, database password, API key or raw business data.
Return these non-secret fields:

```text
AWS_INSTANCE_ID=i-00a12daa5535dc225
AWS_AVAILABILITY_ZONE=<exact AZ>
AWS_VOLUME_ID=vol-...
AWS_VOLUME_TYPE=gp3
AWS_VOLUME_SIZE_GIB=40
AWS_VOLUME_IOPS=3000
AWS_VOLUME_THROUGHPUT_MIBPS=125
AWS_EBS_ENCRYPTED=true
AWS_KMS_KEY_ID_SHA256=sha256:<digest of the canonical KMS key ARN text>
AWS_DESCRIBE_VOLUME_EVIDENCE_SHA256=sha256:<digest of sanitized DescribeVolumes JSON>
EXPECTED_DEVICE=/dev/disk/by-id/<actual stable symlink>
EXPECTED_FILESYSTEM_UUID=<UUID>
MOUNT_PATH=/srv/primus/portal/projection-d4
DATA_DIRECTORY=/srv/primus/portal/projection-d4/postgres
FILESYSTEM=ext4
OBSERVED_MOUNT_OPTIONS=<findmnt options>
PROJECTION_DB_CONTAINER_UID=70
PROJECTION_DB_CONTAINER_GID=70
PROJECTION_DB_VOLUME_NAME=portal-execution-projection-pgdata-v2
```

Canonical evidence can be produced from CloudShell without publishing the
file contents:

```bash
aws ec2 describe-volumes \
  --region ap-east-1 \
  --volume-ids REPLACE_WITH_VOLUME_ID \
  --query 'Volumes[0].{VolumeId:VolumeId,Type:VolumeType,Size:Size,Iops:Iops,Throughput:Throughput,Encrypted:Encrypted,KmsKeyId:KmsKeyId,AvailabilityZone:AvailabilityZone,State:State,Attachments:Attachments,Tags:Tags}' \
  --output json > d4-volume-evidence.json
sha256sum d4-volume-evidence.json
aws kms describe-key \
  --region ap-east-1 \
  --key-id alias/aws/ebs \
  --query 'KeyMetadata.Arn' \
  --output text
```

Hash the single returned KMS ARN line locally and return only the hash. Keep
the evidence JSON private. Fill a private copy of
`deploy/execution-d4/storage-input.env.example`. After reviewing the filled
file, seal it for the live readiness check:

```bash
sudo chown root:root /home/bobby/secure/portal-execution-d4-storage-input.env
sudo chmod 0600 /home/bobby/secure/portal-execution-d4-storage-input.env
```

Then run:

```bash
sudo ./scripts/execution-d4-storage-preflight.sh \
  --env-file /home/bobby/secure/portal-execution-d4-storage-input.env \
  --mode readiness
```

The expected result is `PASSED` with no host or Docker state changed.

## 6. Copy-paste request for the Trading System owner agent

Send the Markdown block below to the agent that owns the Trading System. It is
authorized only for the bounded compatibility/read boundary described here;
it is not permission to change matcher, risk, accounting, execution, broker
state or business data.

```markdown
# D4 Paper Read Identity and Stable Source Contract — Implementation Request

You are the Trading System owner agent on AWS-HK. Read the current Trading
System plans, runtime contract, service manifests and tests before changing
anything. Your task is to implement and verify a dedicated Portal Paper
read-only API identity plus the stable source contract needed by D4.

## Absolute boundaries

- Do not modify trading decisions, matcher, risk, accounting, order state,
  fill state, broker adapters, broker credentials or live/paper execution
  behavior.
- Do not grant Portal database, Redis, CLI, shell, admin or broker authority.
- Do not expose a new public listener. Keep the source API/facade loopback-only
  behind the Portal-owned Source Proxy.
- Do not place any credential, private key, account/alpha ID or business row in
  Git, Markdown, logs or your response.
- Do not call mutation routes during verification.

## Required identity

Create one versioned identity contract for scope `PAPER_BINANCE_USDM`:

- authentication is mandatory, never optional;
- missing credential returns an explicit deny;
- wrong/revoked credential returns an explicit deny;
- the identity allows only exact GET access to `/v1/orders`, `/v1/fills`,
  `/v1/positions` and `/v1/events`;
- POST, PUT, PATCH, DELETE, HEAD, OPTIONS, all `/admin` routes and every command
  route are denied;
- identity is distinct from broker, admin, Portal-session and command identities;
- rotation, overlap, revocation and audit ownership are documented; and
- logs contain identity fingerprint/request ID/status only, never the secret or
  response payload.

Prefer a dedicated loopback read facade if making the existing optional
`X-API-Key` mandatory would break other clients. The facade must bind only to
`127.0.0.1`, fail closed, and forward/read only through Trading System-owned
APIs or domain services. Do not solve this with direct Portal DB access.

Store the generated secret only in the approved root-owned runtime secret
location. Deliver it to the Portal Source Proxy runtime file
`/srv/primus/portal/source-proxy/secrets/trading-system-read-header.conf`
through an owner-approved secret handoff. Required file contract:
`0640 root:portal-runtime`. Never print or return its value. The Source Proxy
already terminates TLS 1.3 mTLS from the Rust Edge, strips caller credentials,
and injects this dedicated source credential.

## Required stable four-resource contract

For every route publish and test:

- exact typed query parameters and maximum page size;
- deterministic total ordering with a unique tie-breaker;
- an opaque stable cursor or snapshot watermark;
- end-of-page and full-population completeness semantics;
- immutable dedupe/entity identity;
- exact-decimal string serialization;
- retention/cursor-expiry behavior;
- retryable vs terminal error mapping and `Retry-After` behavior; and
- alpha/account scope enforcement without leaking another scope.

Publish one race-free initial-snapshot + incremental-events protocol:

1. obtain snapshot watermark;
2. page orders/fills/positions to a proven complete boundary;
3. consume events strictly after the watermark with deterministic tie ordering;
4. detect duplicate, missing, expired and ahead-of-head cursors;
5. define bounded resync; and
6. state when a full BUILDING-epoch rebuild is mandatory.

## Required tests

Run positive and negative tests for:

- correct, missing, wrong, expired and revoked credential;
- all four exact GET routes;
- every other route and non-GET method denied;
- pagination with tied timestamps and concurrent new events;
- duplicate/retry/restart determinism;
- cursor expiry, gap detection and resync;
- scope isolation;
- response-size/page-size/rate limits; and
- existing Trading System health and latency before/during/after the bounded
  test, proving no execution-path regression.

Do not send real payload examples back to Portal. Synthetic/redacted fixtures
are sufficient.

## Sanitized response required

Write one Markdown response plus a SHA-256 manifest containing only:

- implementation commit and image/gateway digest;
- identity contract revision;
- SHA-256 of the opaque identity identifier;
- credential header/scheme name, never its value;
- secret delivery file path and file mode/owner, never contents;
- exact four-route allowlist digest;
- OpenAPI/schema and capability digests;
- cursor, completeness and resync contract digests;
- maximum page/rate/response limits;
- positive/negative test counts and evidence digests;
- missing/wrong/revoked/mutation-denial evidence digests;
- source health/latency evidence digest;
- rollback procedure and rollback evidence digest; and
- explicit statement: `NO_DB_REDIS_CLI_BROKER_OR_COMMAND_AUTHORITY_GRANTED`.

Return status exactly as one of:

- `D4_SOURCE_CONTRACT_ACCEPTED / DEDICATED_READ_IDENTITY_READY / SECRET_NOT_DISCLOSED`; or
- `D4_SOURCE_CONTRACT_BLOCKED / <specific blocker> / NO_SECRET_DISCLOSED`.

Do not enable Portal source traffic, create a Portal epoch or change the Portal
registry. Codex will independently reconcile the response, pin all digests and
open a later owner-approved D4 qualification window.
```

## 7. What Codex does after both responses

Codex will independently verify the EBS metadata/mount, storage preflight,
Trading System response manifest, exact source routes, identity negative
matrix and cursor/resync semantics. Only then may a new change window start the
Rust mapper against one fresh `BUILDING` epoch.

Query, analytics, SSE, registry promotion and every command remain disabled
throughout D4 qualification.

## 8. Official AWS references

- [gp3 baseline and limits](https://docs.aws.amazon.com/ebs/latest/userguide/general-purpose.html)
- [Create an EBS volume](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-creating-volume.html)
- [Attach an EBS volume](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-attaching-volume.html)
- [EBS encryption](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-encryption.html)
- [Prepare and persist a Linux mount](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-using-volumes.html)
- [Identify EBS NVMe devices safely](https://docs.aws.amazon.com/ebs/latest/userguide/identify-nvme-ebs-device.html)
