# R3-2 dev candidate and rollback runbook

This runbook is deliberately a **dev-only R3-4 handoff**. It does not authorize
a main/stable release, Trading System change, source-route activation, command
activation or deletion of any data/volume.

## Preconditions

1. Verify the static packet:

   ```bash
   ./scripts/execution-r3-2-closure-test.sh
   ```

2. Confirm the candidate manifest is exactly
   `DEV_CANDIDATE_READY_FOR_R3_4` and that its private D3 evidence hashes match
   the owner-held `0600` files. Do not copy those files into Git, images,
   frontend fixtures or logs.
3. Render a new dev-only image/config pair from one protected commit. Supply
   secret mTLS/JWT files via the existing read-only secret mount; never place
   them in a compose file, environment capture, browser bundle or evidence.
4. Keep all three source profile reads restricted to named BFF operations,
   current 200-row/1 MiB bounds and the R3-1 profile-wide admission limit.
   Keep `CONTROL_API_FEATURE_EXECUTION_COMMAND_RELAY=false`.
5. Keep Market Context disabled until the source owner deploys its exact
   Manager adapter and Paper produces a fresh positive qualification record.

## R3-4 deployment-shaped acceptance

Use disposable **dev** resources only:

1. Start two separately launched Control API processes/containers from the
   same candidate image against one disposable PostgreSQL instance. They must
   have distinct process IDs and share only the intended database state.
2. Use a real authenticated browser against same-origin Portal routes. Do not
   call Edge from the browser.
3. Prove the twelve R3 realtime/DR scenarios, in particular:
   cursor-before-status, `Last-Event-ID`, revocation, abort, hidden-tab
   coalescing, gap/resnapshot, 429/502/503 backoff, Edge/JWT refusal, worker
   restart, profile isolation, source-dark stale-last-good and rollback.
4. Measure and retain only aggregate evidence: PostgreSQL commit-to-journal,
   journal-to-SSE, SSE-to-DOM, source-call count, fan-out p95/p99, queue depth
   and memory. Do not retain source rows/cursors/credentials in test output.
5. Verify a Live empty response stays typed empty and never adopts Paper data.
   Verify a Market Context panel stays typed unavailable until its separate
   owner qualification succeeds.
6. Capture the candidate image digest, generated SBOM/provenance, rendered
   non-secret config SHA-256 and exact browser/API build identifiers. Bind all
   of them to the R3-2 candidate manifest before marking R3-4 accepted.

## Source dark and recovery drill

Only in the disposable dev stack, make the Portal's source transport fail
closed (for example with the existing dev overlay); never change AWS-HK or the
Trading System in this drill. Verify:

- a last-good Portal projection is marked stale/degraded, never fresh;
- retry pacing persists across either Control API worker restart;
- a profile fault does not leak or serialize another profile;
- commands remain disabled and no source-side effect occurs.

Restore the original dev transport and wait for the bounded retry gate. Do not
purge projections, cache records, audit rows or database volumes to simulate
recovery.

## Rollback

If candidate behavior is incorrect:

1. Stop only the candidate Control API processes.
2. Restore the prior signed dev image and its matching rendered non-secret
   configuration pointer.
3. Keep forward/additive migrations and every PostgreSQL volume. **Never** run
   `docker compose down -v`, `VACUUM FULL` as a rollback, manual cache-table
   deletion or source-data deletion.
4. Confirm the prior image reports its own runtime manifest and that command
   relay remains disabled.
5. Record only image/config identifiers and aggregate failure class. Do not
   copy private D3 evidence, JWTs, certificates, source rows or cursors.

The rollback target is an image/config pointer, not a database reversal. Any
source contract mismatch remains typed and requires a separate owner release;
rollback is never a reason to enable a Portal fallback.
