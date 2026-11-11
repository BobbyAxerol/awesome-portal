# Recovery checkpoint bound to a local drain — 2026-11-05

**SOURCE ONLY; NOT A RESTORE OR CUTOVER PERMIT.**

`RestoreCheckpointAuthority.appendDrainedSource` now requires the selected
source cluster, an exact active `restore_v2` drain ID and its current authority
revision. It holds that source authority row's transaction lock until the
independent PostgreSQL checkpoint append completes. The recorded inventory
digest is a domain-separated commitment to the caller's digest, source cluster,
checkpoint ID, revision and drain ID. A retry with the same operation and drain
recovers the original result; changing the drain cannot replay that operation
even if its revision is unchanged. A failed or ambiguous response must be
retried with the same IDs, not treated as a rollback.

This is a **local authority-row fence**, not a complete recovery barrier. It
does not verify that the caller's inventory digest was captured from the
source, block writers that bypass this row, physically fence an old DB/process,
prove independent administrative/failure domains, enumerate source terminal or
ACK history, or approve a restore. The existing V2 restore refusal remains.

## Checks

- Two disposable PostgreSQL clusters: **6/6 PASS**, including a real
  competing source write denied while the independent checkpoint is held,
  original-operation replay, changed-drain conflict and revision refusal.
- Existing checkpoint SQL-flow unit tests: **5/5 PASS**. Targeted strict
  TypeScript check of the changed module and `git diff --check`: exit 0.
- Runner teardown completed and no named checkpoint container remained in the
  subsequent read-only inventory. No shared DB, runtime or credential changed.

Local uncommitted SHA256:

| File | SHA256 |
| --- | --- |
| `restore-checkpoint-authority.ts` | `0d0d7ab51277a53423422bc6d0d6b0e5f809d325048a1ddd91c72599fc935d1e` |
| `restore-checkpoint-authority-pg.spec.ts` | `7135cb4dd7f697def5493deaf806681313e07b88ea6d6e330c80d4a9d562feae` |

Next Core work: authenticate and bind the captured inventory, cover all actual
authority/obligation writes, fence old holders and HTTP/in-flight delivery,
reconcile post-snapshot terminal/ACKs, then run restore/restart on the final
candidate. Claude has no UI/contract change to consume from this source-only
step. Full integration and normal hook remain outstanding.
