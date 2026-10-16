# Scoped bootstrap shadow, cutover and read rollback

EPG10-10 internal control package, not an activated operator HTTP/SQL/CLI API.
Canonical Rust owns projection/control. Source publishers, current authority,
Research composition and financial command authority remain their owners.
Use [the main plan §23.19](../../upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md#2319-epg10-10-shadow-fenced-cutover-and-rollback-execution--2026-10-16)
and [source-dark manifest](../manifests/execution-edge-scoped-cutover.v1.json).

## Connected entry conditions

Resolve the exact dataset/group/profile scope qualified by09, not all roadmap
dependencies. Bind actual authenticated publication, native stale-writer fence,
archive/floor/retention, current human/workload/session/field authority and
fresh TS–DL–Research coexistence budgets. Record immutable candidate/reader-only
rollback image digests, stable service names, versioned config, change window,
operator/revoke/rollback owners and verified checkpoint/backup recovery proof.
Missing inputs mean SOURCE_DARK, not fabricated PASS or a new generic approval.

Do not apply a migration to shared PG, restart or swap operational routes merely
because this template exists. The independent drill uses disposable real PG
with TEST_ONLY fixtures. No native source, broker, HA or capacity claim follows.
Do not copy a phase worktree into a long-lived runtime directory.

## State/operation sequence

1. Expand only with0022 on the approved Portal projection target. Reapply
   embedded migrations idempotently. Keep0019–0021 data and all command ledgers;
   never down-migrate/drop columns as rollback. Existing AUTO callers retain
   behavior. Preserve V1/Manager/D4 responses and versioned original/restated
   Score history; Edge neither recalculates Score nor falls back to old penalty.
2. Obtain an authenticated scoped `Manifest`; call `bootstrap_begin_shadow`.
   Its durable root takeover fences the previous writer immediately; active
   reads remain previous generation and explicitly STALE/TTL-bound. Hold new
   source traffic at the matched barrier until comparison/selection completes.
   Stage authenticated pages, immutable history and complete delta groups using
   the existing04 protocol. Never ACK source before durable COMMIT.
3. Inspect `bootstrap_rollout_status`: SHADOW + candidate INITIALIZING,
   CATCHING_UP or READY is not ACTIVE. A candidate becomes READY only after all
   datasets/references and consistency-group checkpoint commit atomically.
   Do not manually UPDATE roots/rows or use MAX(id) as a continuity proof.
4. `bootstrap_compare_shadow` must succeed: same scoped binding/epoch/schema/
   policy, barrier/checkpoint and exact bidirectional row/revision/payload/
   tombstone AND immutable-fact equality. It returns a private CAS capability
   and matched counts, never a browser token or source-wide hidden totals.
   Compare real source counts/digests/versions/quality and measured costs from
   the qualified09/06 receipts as well; this local equality is not those receipts.
5. Call `bootstrap_activate_shadow` with fresh verified control and that private
   capability. It rechecks writer, revisions/checkpoint, retained scope/TTL and
   active pointer under the same root lock; selection + previous-generation
   retention + ACTIVE state commit together. New history/delta invalidates the
   comparison. On conflict, re-inspect and recompare; never fabricate a fresh pin.
6. Read/probe only the selected scope. An in-flight old read may complete its
   single repeatable-read snapshot; old continuation pins reject after pointer
   or revision change. Record observation window, gap/duplicate/digest/quality,
   resource ceilings, stale-writer rejection and operator state, not just health.
   Commands remain separately disabled unless their exact operation/profile and
   native permission-through-COMMIT/status/recovery path already qualified.

## Stop and rollback

Stop selection/new entry on mismatch, unexplained loss/duplication, stale rights,
source retention breach, budget breach, missing receipt or unknown command
outcome. Preserve raw source archive/checkpoints and accepted facts/receipts;
reconcile UNKNOWN through the same typed idempotency identity, never resubmit a
new business intent or restore an old financial/policy/session database.

`bootstrap_rollback_read` selects only the persisted previous generation in the
same binding/barrier and unexpired retention window. It records ROLLED_BACK;
the candidate remains the sole writer and can keep capturing accepted facts.
Do not revive the old writer or deploy an old AUTO-only writer binary with the
manual candidate handle. A code fallback is reader-only and separately checked
for schema/current-policy compatibility; retain the current fenced writer.

Rollback reads are explicitly STALE with `stale_until_ms`; after TTL they fail
RESYNC_REQUIRED. No false current-state/financial equivalence is promised.
Full new facts and command receipt/status lookup remain durable in their own
generations/ledger even when the old read generation lacks newer facts. Recovery
access still needs current authority; read rollback never restores revoked rights.

If the candidate advanced, do not reuse the old comparison or automatically
roll forward: obtain a fresh matched-barrier generation/evidence workflow.
An equal unchanged candidate may be deliberately re-compared/reselected.

## Interruption/resume and evidence

Reconnect with the SAME verified manifest/mode and generation. Inspect durable
status, resume missing staged inputs or last committed checkpoint. A lost
activation ACK can be retried idempotently while its comparison is current;
otherwise inspect ACTIVE status instead of guessing. A repeated read rollback
is idempotent within retention. A newer writer fences every old control handle.

Record five T10 case results separately for isolated and connected scope,
image/config pins, current/previous/writer generation, comparison counts,
checkpoint/revisions, timeline, rollback TTL, preserved fact/receipt digests and
current authority proof. Keep only bounded sanitized evidence in Git, no row
bodies, raw logs, private identities/keys or credentials. Cleanup only exact
owned test targets under their measurement lease; inventory active + named
rollback images and verify operational tuples remain unchanged.
