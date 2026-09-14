# Production execution feature profile and cleanup plan

## Current measured state — 2026-09-14

- Stable Portal release: `7665cf91861ea7db7c8fe051c2ca9baff9469ac9`.
- `CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=false` and
  `CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT=false` before this
  transaction.
- `CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR=false` and
  `CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS=false`; these remain
  mandatory until `execution_durable_mirror_range_rows` passes its backfill,
  freshness and parity gate.
- Market Context was found `true` in host runtime configuration even though
  the Paper qualification is not accepted: the committed evidence hash is
  `null`, and R3-2 recorded `502 MANAGER_V2_SOURCE_CONTRACT_REJECTED` for the
  incompatible Manager-facade shape.  The flag has not created a data bypass:
  the BFF fails closed with `MARKET_CONTEXT_PROFILE_QUALIFICATION_PENDING`.
  The immediate provenance is the signed stable-takeover helper introduced in
  `dd58dab3`: it intentionally preserved the pre-existing runtime feature
  values, including this one, without treating that preservation as Paper
  qualification. It is therefore configuration drift—not an accepted source
  activation—and is closed by the profile below.
- Production backup footprint is approximately 66 GB.  Release bundles are
  only approximately 17 MB, so releases are not the disk concern.

## Approved config-only profile

`execution-public-panels-v1` makes exactly these changes through the protected
GitHub Actions production workflow:

| Host key | Value | Reason |
| --- | --- | --- |
| `CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES` | `true` | Enable the labelled public-venue candle BFF only. |
| `CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT` | `true` | Enable read-only Command Center snapshot. |
| `CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR` | `false` | Do not read or write an incomplete durable mirror. |
| `CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS` | `false` | Prevent accidental history cutover. |
| `CONTROL_API_FEATURE_EXECUTION_MARKET_CONTEXT` | `false` | Close the unqualified R3-2 configuration drift. |

The workflow binds to the already-deployed commit and exact release-manifest
SHA-256, atomically updates only `/srv/portal/.env.production`, recreates only
`control-api`, checks readiness and actual container environment, and uploads
non-secret evidence.  It never edits a release directory, starts a command
relay, touches a database schema, changes users, or contacts a Trading System
database/CLI.

`execution-read-baseline-v1` is the exact rollback profile.

## Cleanup plan

### C1 — Runtime config and evidence hygiene

1. Use only named profiles through `.github/workflows/production-feature-profile.yml`.
2. Retain one root-only pre-change environment backup and one non-secret action
   evidence artifact per transaction for 30 days.
3. Remove the obsolete `MARKET_CONTEXT=true` state now; do not re-enable it
   until Paper has a positive, pinned adapter qualification proof.

### C2 — Durable mirror recovery, not deletion

1. Measure row count, newest `ts`, relation coverage and source/Portal parity
   using aggregate-only probes.
2. Resume the existing bounded drain/backfill with its current lease and
   pacing; no direct SQL repair, `VACUUM FULL`, truncation or history deletion.
3. Require fresh watermark, range parity, restart/resume evidence and
   per-screen financial query proof before enabling write, then separately
   enabling `DURABLE_MIRROR_READS`.

### C3 — Backup retention

1. Inventory each backup's release, checksum, creation time and restore-test
   status before deleting anything.
2. Retain the current release backup, the immediately prior rollback-capable
   release, seven daily and four weekly verified backups.
3. Delete only backups outside that set after a restore drill; never delete
   PostgreSQL volumes, Roadmap data or release evidence as a cache cleanup.

### C4 — Docker/worktree/cache hygiene

1. On AWS-HK, retain active Trading System/Data Layer/Edge containers and the
   current plus previous rollback image; prune only confirmed unused build
   cache and images after each release.
2. Remove stopped test stacks only after their owning branch/evidence is
   archived; stopped containers do not consume RAM, so they are not an urgent
   memory fix.
3. Review old local worktrees only after remote branch/ref provenance is
   verified; archive handoffs before removal.

### C5 — Capacity follow-up

1. Record CPU/RSS limits and restart policy for current Kafka/QDL,
   `live_data_executor` and Portal projection workers.
2. Add host swap or increase capacity only through a separate owner-approved
   infrastructure change; do not disguise it as a Docker cleanup.
