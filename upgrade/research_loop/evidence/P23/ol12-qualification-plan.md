# OL-12 / P23 qualification harness

Status: `HARNESS_READY · QUALIFICATION_NOT_RUN`.

The backend lane owns the isolated project `portal-research-p23-ol12` and the
loopback base URL `http://127.0.0.1:8096/`. It never reuses the shared preview
(:8095), dev, stable, or a production volume. `scripts/research-p23/qualify.mjs`
contains the exact `P23-T01…T15` matrix and emits `BLOCKED` until each item has
a 0600 private receipt with an actual command/restore/browser/fault locator and
SHA-256. Fixtures, a source-code observation, or an idle shared-preview sample
cannot close a row.

`P23-T01` may consume the strict cgroup receipt from `resource-snapshot.mjs`
(5,000,000,000-byte aggregate cap, bounded services and no concurrent one-shot
escape) and the 20-session GET-only result from `read-load.mjs`. The remaining
fault, backup/restore, upgrade, browser, and rollback rows require their real
isolated-stack evidence. The harness does not execute destructive fault drills,
write commands, or touch a shared host; `--run` is limited to the named P23
project and private manifest.

Exit is `P23_QUALIFIED` only when all fifteen rows are `PASS`, the receipt says
`passed: true`, and a separate browser/ops owner records `V11-P23-DR/BR/GX`.
Until then the receipt is not a product-active or production-deployment claim.
