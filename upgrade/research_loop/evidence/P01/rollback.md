# P01 rollback

P01 did not deploy, migrate, start, restart, alter, delete or clean a runtime
resource. There is no database/data/Execution rollback operation.

If this source-only baseline must be withdrawn during review, revert the one
coherent P01 commit through the normal branch-review workflow. Do not delete
the frozen archive, modify `apps/portal/strategy/main.py`, reset a shared
branch, force-push, or run a deployment helper as part of rollback.

The temporary directory used by `--self-test` is owned by the process and is
removed before the command returns. No other cleanup action is required.
