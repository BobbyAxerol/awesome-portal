# Research P24 — read-preserving rollback and operating checklist

This is an **isolated rehearsal/runbook**, not production rollout authority.
Its tested target is `portal-research-p23-ol12`, loopback `:8096`.
Use the existing deployment workflow for an eventual owner-approved release;
never edit an immutable release directory or copy the preview DB to stable.

## Preflight

1. Pin the reviewed source, seven runnable image IDs, profile revision and
   migrations. Preserve DB globals/custom dump and artifact archive hashes.
   Treat signatures, SBOM and provenance as separate evidence: local image
   hashes alone are not a signed release.
2. Assert no active Research jobs, no worker process, finite memory/no-swap
   limits and spare disk. Never interrupt another user's running attempt
   merely to obtain a rehearsal receipt.
3. Verify retained bytes and report pre-existing losses. The three historical
   test manifests are accounted for, **not recovered**; full strict integrity
   still fails. No reseal/new digest/deletion may turn that gate green.
4. Check reader compatibility against an existing sealed payload **before
   selecting a rollback image**. Old Control `ee6d220a…` rejects the new
   enrichment fields; it is NOT a compatible reader rollback target.
   Keep Control reader `edd22298…` for these seals.
5. Snapshot job count, artifact IDs/revisions/digests, parts, complete seal
   summary digest, migration digest and outside Execution/preview container
   identities/restart counts. Do not log credentials or raw business rows.

## Tested pause → producer rollback → forward

- Pause **only** the same-origin create path `/api/v1/research/runs` at the
  owned gateway. Return typed 503; keep authentication and historical reads.
  This tested pause is not a claim that publication/diagnostic/other mutation
  routes are all paused. A complete rollout must separately quiesce each
  active writer/utility/outbox path under its existing admission controls.
- Do **not** set `FEATURE_RESEARCH_RUN_PRODUCER=false` while leaving the
  progress/WFO profile enabled: current config requires their producer
  dependency and will refuse startup, removing the read plane too.
- Keep current Control readers, DB/schema, artifact refs, source mounts and
  all flags. Worker remains OFF. Switch only the isolated Python Portal API
  image `66cfd8cf…` → `1e454b12…` using retained tags and `pull_policy: never`.
- Recreate the owned gateway after changing an upstream container so it
  resolves the new address. Close qualification-client connections across
  gateway transitions; never retry an ambiguous mutation automatically.
- Read Progress, Evidence, Search, Report and Replay; require all 200 and
  byte-custody/migration/job/outside-runtime snapshots unchanged. A failed
  read or changed pin aborts the rehearsal, never modifies the stored seal.
- Forward Python API to `66cfd8cf…`, read again, then remove the pause overlay
  and restore the original exact configuration. Both success and failure
  paths restore it. Worker is not started and no compute is admitted.

Repro commands after safely starting the existing owned cell (no bootstrap):

```sh
node scripts/research-p23/release-rollback-receipt.mjs --reader-contract-probe
node scripts/research-p23/release-rollback-receipt.mjs --label=new-rehearsal-label
```

All receipts/templates/overlays are private 0600; prior receipts cannot be
overwritten. Probe is offline/read-only. The version rehearsal proves Python
service transition **with retained readers**, not full-stack downgrade,
worker execution on the old version or a second QuantBT release.

## Closeout / later release handoff

1. Reconcile original intents/outbox/receipts before resuming any real writer;
   never create a replacement intent to hide an uncertain outcome.
2. Revoke only disposable QA sessions through the normal owner API. Disable
   the 21 non-owner QA accounts; keep the owner anchor and real users intact.
3. Confirm zero nonterminal jobs/active QA sessions. `cell.mjs down` removes
   only the owned containers/network, **without `-v`**. Retain original and
   restore volumes, backups, artifacts and exact rollback images.
4. Inspect capacity. No broad prune, database VACUUM FULL, recursive code/
   worktree deletion, shared-service restart or market-data cleanup.
5. Hand off [V1 acceptance / remaining gates](../../upgrade/research_loop/evidence/P24/V1_ACCEPTANCE.md).
   Owner review, remote push/merge and a signed workflow release remain
   separate actions, never implied by this isolated receipt.
