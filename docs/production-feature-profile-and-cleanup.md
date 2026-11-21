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

### C4 — Self-hosted runner, Docker, worktree and cache hygiene

The self-hosted runner changes the capacity model: an accidental cleanup can
remove the only rollback image or a mounted volume, while no cleanup lets
build/cache bytes gradually consume the host.  The policy is therefore
**measured, phase-scoped and fail-safe**, rather than a blanket `docker system
prune`.

#### C4.1 — Responsibility separation

1. `portal-deploy-sgp1` / `portal-gh-deploy-runner.service` is a **deploy-only**
   runner.  It must remain non-root, outside the `docker` group, without a
   Docker socket mount and without a public listener.  It downloads a signed
   candidate and uses the reviewed, short-lived SSH path only; it never builds
   images locally and must not be used as a Docker garbage collector.
2. Image build cache belongs to the explicitly designated build host or CI
   runner.  Production container/image/volume cleanup belongs to a protected
   host maintenance action.  Neither responsibility may be silently inherited
   by an arbitrary phase test or by the deployment runner.
3. Per-job SSH keys, known-hosts files, release-pack staging and runtime
   evidence staging are confined to the named `RUNNER_TEMP` directory.  Every
   workflow that creates them requires an `if: always()` cleanup step which
   shreds keys and removes only those path-bound temporary files.

#### C4.2 — Required closeout after **every** completed phase

Before the phase is committed/handed off, its owner records a compact cleanup
decision in the phase evidence or tracking entry:

1. Run the phase's existing `trap`/Compose teardown and confirm that its
   phase-scoped test project is no longer running.  Remove only stopped test
   containers that have the exact approved Compose project label and whose
   branch/ref and evidence have been retained.  Never pass `--volumes` to a
   test teardown unless that phase created an explicitly disposable named
   volume and its test proves the volume is not shared.
2. Take a **read-only** capacity snapshot: root filesystem free bytes, Docker
   `system df` on the relevant host, runner service state, and the count of
   phase-scoped stopped containers.  This makes resource growth visible before
   it becomes an SSH/VS Code outage.
3. Remove only known phase-local temporary directories, test reports and
   downloaded archives under the documented workspace or `RUNNER_TEMP` path.
   Do not use broad `rm -rf`, `git clean`, recursive home-directory cleanup,
   or a glob that could cross a worktree boundary.
4. If a release/deployment is running, do **not** concurrently prune images,
   BuildKit cache, releases, backups, containers or database rows.  Record the
   observation and run the protected cleanup in a separate change window after
   the release reaches health/evidence collection.
5. A phase is not marked resource-clean merely because tests pass.  It needs
   either a `NO_ACTION_NEEDED` capacity record or a named, bounded follow-up
   action with target, retention proof and owner.  That follow-up is visible
   operational work, not hidden technical debt.

#### C4.3 — Protected Docker and build-cache cleanup

1. Before deleting Docker bytes, inventory each candidate by image digest,
   container reference, release marker, creation time and size.  Protect all
   active-container images; the currently deployed signed release; the
   immediately previous rollback-capable release; an in-window signed
   candidate; and any image/volume used by an active migration, backup or
   restore drill.
2. A quiet-window maintenance action may prune **only** confirmed unused
   BuildKit cache older than seven days, after verifying no build/publish job
   is active.  It must first capture `docker system df -v`, then record the
   reclaimed bytes.  This is cache cleanup, not application-data cleanup.
3. Dangling images may be removed only when unreferenced by the protected set
   above and older than the retention window.  Do not use `docker system prune
   -a`, `docker volume prune`, unqualified `docker image prune`, or any command
   that removes anonymous/named volumes as a routine phase closeout.
4. Stopped containers normally cost disk metadata, not RAM.  Prefer the
   labelled, evidence-backed test-stack deletion from C4.2 over deleting an
   unknown stopped container just to make a memory graph look cleaner.

#### C4.4 — Worktree and runner workspace retention

1. Use `git worktree list --porcelain` and remote branch/ref provenance before
   removing an old worktree.  Archive handoff markdown/evidence first; never
   delete the canonical `main`, `dev`, stable release or an active agent
   workspace.
2. Persistent GitHub runner workspaces are cleaned only after the job's
   `always()` evidence/SSH cleanup has completed and no other job is assigned
   to that runner.  Remove only the exact completed-job workspace, not the
   runner installation, `_work` root or another job's directory.
3. Dependency caches are retained when they are an intentional bounded cache
   with a documented key/TTL.  Orphaned package/build downloads are removed by
   exact path and age, never by deleting repository source or lockfiles.

#### C4.5 — Capacity triggers and escalation

1. At less than 30% root filesystem free, attach a capacity observation to the
   next phase closeout.  At less than 20% free, do not start another
   disk-intensive local build/release until an inventory-backed, scoped
   cleanup or owner-approved capacity change is complete.  The current release
   may finish only when its preflight proves sufficient backup/pull headroom.
2. If a phase finds cache growth that materially extends backup/restore time,
   prefer the existing bounded application-level TTL sweeper for recomputable
   rows.  Database cache deletion remains separate from Docker cleanup and
   never uses `VACUUM FULL` during normal operation.
3. Record CPU/RSS limits and restart policy for current Kafka/QDL,
   `live_data_executor`, Portal projection workers and the runner.  Restarting
   a healthy production service solely to free memory is not cleanup.

#### C4.6 — Research Loop P05 closeout record (2026-09-19)

1. P05 recorded a read-only root snapshot of `341,091,954,688` bytes free
   (`49%` used). This is above the 30% free-space observation threshold; the
   closeout decision is `NO_ACTION_NEEDED`.
2. The only phase-created Rust targets were exact
   `/tmp/portal-research-p05-rust-target.*` directories; each was removed by
   the gate's exact-path trap. P05's `research-p05-postgres-*` PostgreSQL
   proof used tmpfs and its exact self-removing container; post-gate inspection
   found no retained P05 test container.
3. No image, container, volume, BuildKit cache, worktree, HMD data,
   Execution/Trading System service or database row was removed. The Rust
   1.85.1 toolchain is retained as a declared Research development dependency,
   not a runtime cache.
4. The observed Docker reclaimable image total belongs to a separate C4.3
   protected quiet-window inventory. It is not a reason to run a broad prune
   during a Research phase, and it is not hidden P05 technical debt. See
   `upgrade/research_loop/evidence/P05/resource-cleanup.json` for the compact
   measured record.

#### C4.7 — Research Loop P06 closeout record (2026-09-19)

1. P06 recorded a post-gate, read-only root snapshot of `341,009,268,736` bytes free
   (`49%` used), above the C4.5 observation threshold. The closeout decision
   is `NO_ACTION_NEEDED`.
2. P06's PostgreSQL proof used only an exact `research-p06-postgres-*`
   tmpfs test container and its self-removal trap. Its cross-language Delta
   receipt used exact `/tmp/portal-research-p06-durable-child-*` and
   `/tmp/portal-research-p06-upgrade-*` paths, each removed by its own
   `finally` block. The post-gate read-only inventory found zero retained P06
   containers.
3. Runner observation was read-only: `portal-gh-deploy-runner.service` was
   `active`; `portal-ci-publish-sgp1.service` was `inactive`. P06 neither used
   nor restarted either runner, changed no deployment/workflow input and did
   not touch production services.
4. No image, volume, BuildKit cache, worktree, HMD data, Execution/Trading
   System resource, research artifact or database business row was removed.
   The `24.76GB` reclaimable-image observation remains a separate C4.3
   protected quiet-window decision, never an excuse for a broad prune during
   phase closeout. See
   `upgrade/research_loop/evidence/P06/resource-cleanup.json` for the compact
   measured record.

### C5 — Capacity follow-up

1. Add host swap or increase capacity only through a separate owner-approved
   infrastructure change; do not disguise it as a Docker cleanup.
2. Review this policy after every signed release and after any self-hosted
   runner incident.  A newly observed resource class must be added to the
   protected-set inventory before any agent is allowed to remove it.

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
5. Before any runner restart, confirm its GitHub job is terminal and its
   worker count is zero. The systemd service must invoke the runner-supplied
   `runsvc.sh` wrapper (not `run.sh` directly), then be checked for exactly one
   listener and one online GitHub registration. This prevents restart loops,
   duplicate sessions and avoidable RAM growth.
