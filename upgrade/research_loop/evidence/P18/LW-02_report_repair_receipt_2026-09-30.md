# LW-02 — durable WFO report repair, bounded by completed source truth

The Delta WFO terminal report was a best-effort sidecar. Its failure was logged,
but the terminal checkpoint still advanced, so a completed run could answer
`RESEARCH_REPORT_NOT_FOUND` forever. No QuantBT or source rerun is needed:
the retained P05 reads already supply the report inputs.

Migration 079 adds a workspace/run-scoped repair state (`RETRY`, `FAILED`,
`SEALED`), code, attempt count and next-attempt time. A report GET may claim
only a `SUCCEEDED` run bound to the exact Delta WFO profile with no immutable
report manifest. Claims have a durable 60-second cooldown; duplicate attempts
remain idempotent under the existing manifest advisory lock. On failure, the
route answers typed 503 with the code and scheduled retry; an in-flight repair
answers typed 409. No source path, raw artifact, engine call or frontend change.
Terminal callback failures now also persist the typed failure state instead of
existing only in stderr.

Focused evidence: Control API build; 43/43 WFO Report/P18/RS-01 tests; disposable
PostgreSQL P18 migration 5/5 including runtime role, typed failure→sealed state,
unauthorized refusal and ineligible-run claim refusal. The preview API acceptance
of R-WFO-020 and the code/image pin must be appended before product acceptance.
Forward migration from the actual preview-067 ledger through 079 passed 2/2,
preserving the historical ledger rows and data/auth sentinel bytes; an
idempotent migrator restart added no row.
