# RF-02 rollback

All contract changes are additive (optional fields on the Atlas release and modes); revert newest first.

- Preview stack: `scripts/research-preview/preview.sh teardown` removes only `portal-research-preview` containers and volumes. Dev, stable and the Execution probe are separate projects and ports.
- `12750366` (P14 timeline): reverting brings back refused terminal receipts for runs with warmup — do not revert without reverting RS-01's ingress rule.
- `996eef6c`: reverting leaves S02 sending an empty `config_digest` again (preflight refuses).
- Atlas facts / walk-forward options (`d67a0fb4`, `99d5b2a5`): manifest revision goes back to 2; S12 and S02 show "not published" for the absent blocks.
