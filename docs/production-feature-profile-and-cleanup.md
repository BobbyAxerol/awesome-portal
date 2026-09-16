# Production execution feature profile and cleanup plan

## Current measured state — 2026-09-14

- Stable Portal release: `7665cf91861ea7db7c8fe051c2ca9baff9469ac9`.
- `CONTROL_API_FEATURE_EXECUTION_PUBLIC_MARKET_CANDLES=false` and
  `CONTROL_API_FEATURE_EXECUTION_COMMAND_CENTER_SNAPSHOT=false` before this
  transaction.
- `CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR=false` and
  `CONTROL_API_FEATURE_EXECUTION_DURABLE_MIRROR_READS=false`; this is the
  legacy-only baseline. It is not the eventual durable-mirror state.
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

`execution-read-baseline-v1` is the initial legacy-only profile. Before a
durable-mirror warm-up it is the ordinary config rollback. After the writer has
started it is deliberately rejected: use the exact private transaction backup
on failure, or return to the reviewed writer-only profile after a later reader
cutover. This prevents a normal rollback from silently creating a new history
gap.

## Staged durable-mirror recovery

Production must not switch both flags together. The durable mirror is five
days behind because its writer has been disabled; leaving it disabled would
make it impossible for that table to catch up. The approved transition is:

1. Deploy the release that contains the dual-write correction and the
   reseed CLI. The existing release deliberately cannot be asked to perform
   this new operational action.
2. Dispatch `execution-durable-mirror-write-only-v1` with a unique
   `backfill_run_id`. It sets `DURABLE_MIRROR=true` and leaves
   `DURABLE_MIRROR_READS=false`; Public Candles and Command Center Snapshot
   remain enabled, and Market Context remains disabled.
3. The protected workflow stops only `control-api`, clears only its
   Portal-owned ladder cursor checkpoints, then starts it again. No source
   request happens in the one-shot step. The ordinary lease-controlled,
   mTLS-backed worker performs the bounded source re-drain after startup.
4. During this warm-up the worker dual-writes
   `execution_timeseries_history` and
   `execution_durable_mirror_range_rows`. Product reads stay on the legacy
   table, so a filling mirror cannot make a panel silently stale.
5. A later, separate read-cutover profile may set `_READS=true` only after
   production aggregate evidence proves all of the following per active
   profile/relation: mirror freshness within the configured ceiling, no legacy
   row missing from the mirror at canonical millisecond precision, no content
   conflict, restart/resume continuity, and a real product BFF probe. Dev
   freshness is never sufficient evidence for production.

The five-day hole is therefore **not accepted** as a permanent visible gap and
is never filled by copying Trading System data or by direct access to a
Trading System database. The existing Portal worker replays the published
Manager current-page range through its established bounded, paced path. If the
source cannot re-serve a particular retained range, qualification remains
`NO_GO` and the UI retains the legacy reader with an explicit bounded-coverage
caption; `_READS` stays false.

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
2. Use only the protected writer-only profile and its one-shot Portal cursor
   reseed. The normal worker resumes the bounded drain/backfill under its
   existing lease and pacing; no direct Trading System SQL repair, `VACUUM
   FULL`, truncation or history deletion.
3. Require fresh production watermark, range parity, restart/resume evidence
   and per-screen financial query proof before enabling
   `DURABLE_MIRROR_READS`. Writer enablement and reader enablement are separate
   transactions.

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

### C6 — Self-hosted CI/publication runner lifecycle

1. Keep `portal-ci-publish-sgp1` distinct from `portal-deploy-sgp1`: CI,
   browser tests, CodeQL and image publication run only on the former's
   rootless Docker daemon. The deployment runner must retain its narrow
   deployment label and never receive a general CI job.
2. The CI runner completion hook clears only its completed workspace, stopped
   rootless containers/networks after 24 hours, rootless images/Buildx cache
   after seven days, orphaned temp paths after one day and unused Playwright
   revisions after 30 days. It never prunes a volume, rootful Docker resource,
   `/srv/portal`, database, backup, release evidence or execution service.
3. Before an owner-approved runner retirement, cancel/finish active GitHub
   jobs and remove its labels from workflows. Then remove only the exact
   runner service, rootless daemon, helper directory and
   `/srv/portal-ci-runner`; do not treat a runner cleanup as a Portal runtime
   cleanup.
4. Every future CI/publish phase must use the checked-in runner assertion and
   the locked bootstrap. Do not add generic `self-hosted` routing, host Docker
   access, sudo, SSH deployment credentials or a persistent registry token to
   the CI runner.
