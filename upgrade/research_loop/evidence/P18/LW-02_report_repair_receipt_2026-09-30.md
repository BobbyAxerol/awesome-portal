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
unauthorized refusal and ineligible-run claim refusal.
Forward migration from the actual preview-067 ledger through 079 passed 2/2,
preserving the historical ledger rows and data/auth sentinel bytes; an
idempotent migrator restart added no row.

Real preview acceptance: git 9ea4351e7c637b081fbda3b4bef79551165bf6f6,
Control API image sha256:a4e98b3386833eedcd2ad245109e5c4bbd91e671287799fe5ce60c57de0fb386,
migration head 079. R-WFO-020 (rrun_3258a4c450816129d2d285f25b801061)
returned HTTP 200 Report revision
p18r1_649daeca18b8a516b8e43aa9e95b5bb8e1148071a09c6a10392adf31bae911fe.
A second GET returned the same revision. Its preview-only repair row was
SEALED with attempt_count=1 and no failure_code. No report or business bytes
were copied into the repository; the repair changed only the isolated preview.
