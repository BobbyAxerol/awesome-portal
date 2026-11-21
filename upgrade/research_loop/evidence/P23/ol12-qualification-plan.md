# OL-12 / P23 qualification harness

Current ledger status (2026-10-05): `QUALIFICATION_LEDGER_RECONCILED`.
[Current T01–T15 dispositions and positive product sampler](./P23_QUALIFICATION_CLOSEOUT_2026-10-05.md)
supersede the historical `HARNESS_READY · QUALIFICATION_NOT_RUN` description
at the scopes explicitly listed there. The strict fifteen-PASS machine
aggregator below remains unchanged; an owner-approved 83/86 historical
exception is not fabricated into a strict PASS envelope or signed certificate.

2026-09-27 verifier amendment: the matrix matches Guide P23 byte-for-byte;
each private T receipt must bind `project`, `base_url`, `candidate_source_sha`
and referenced private regular-file byte hashes. A SHA-shaped string is not
evidence. Changed/missing/symlink/public/oversized proofs stay BLOCKED.
T01/T11 additionally require a linked cgroup time series and 20-principal
read receipt in the same measurement window; T01 also requires one active
heavy slot, >=4 distinct queued heavy intents and an actual completion.
All checks are repeated on final aggregation. The runtime JSON must equal
the hashed file, not a substituted object with a `passed` label.

Config requires the exact `candidate_source_sha` (40 hex). Per-T envelope:
`{test_id,status,project,base_url,candidate_source_sha,evidence:[{kind,locator,command,exit_code,sha256}]}`.
Evidence JSON/files stay 0600 outside Git. `--resource-receipt`, `--read-receipt`
and `--workload-receipt` consume the corresponding sanitized, referenced
JSON files; resource/read timing must overlap the workload. A live one-off
`--resource-project` idle sample is diagnostic only, never qualification.
Canonical `/api/v1/quantbt/runs` and its named sparkline GET are included in
the bounded read sampler, without admitting the legacy producer namespace.
Positive unit verifier fixtures do not become real P23 receipts.

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
