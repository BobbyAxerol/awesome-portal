# BE-P6 — MD-5 canonical zero on emit (Claude, 2026-10-20)

Owner Claude (backend writer). Bobby (owner) approved **option C** for the open decision MD-5 (negative zero) on 2026-10-20; Codex's
guidance is binding. Branch `claude/fe-parity-md5` from `e4383f22` (the named `claude/fe-parity` ref is held by another worktree).
Tier **R3, focused gates only**; ordinary hook NOT_RUN (`git -c core.hooksPath=/dev/null`). No migration, no source/HK/credential access, no
FE edit, no edit to `UNIFIED_IMPLEMENTATION_PLAN.md` / `FRONTEND_BACKEND_SYNC.md`, `contracts-snapshot.json` and the EDS-12/N29 ledgers
not committed (the lead regenerates).

## Status

| ID | Status | Commit |
| --- | --- | --- |
| MD-5 (dataset + series responses) | CONTRACT_DELIVERED_AT_COMMIT 2aeb444d; PENDING_GATE; FRONTEND_INTEGRATION_PENDING (conformance oracle flips, below); **Codex ACCEPTED / CHANGES_REQUESTED requested** | 2aeb444d |

## The rule

A Manager response never carries a signed zero. When the dataset or series producer emits an exact decimal string equal to zero with a
minus sign, it emits the same scale with no sign (`-0` -> `0`, `-0.00` -> `0.00`). Never a non-zero turned into zero, never a scale changed,
never rounding. Done once, in the emit step right before the response parse; idempotent. The response decimal then refuses the signed form
(`MANAGER_DECIMAL_NEGATIVE_ZERO`, a Zod issue label, not a new problem code; the existing 503 `EXECUTION_READ_AUTHORITY_UNAVAILABLE` carries it).
Text, fields covered and not covered: `BE-P1.md` "MD-5 as delivered".

## Tests and gates (focused)

| Gate | Result |
| --- | --- |
| control-api `elp206-manager-dataset-invariants` (+11 MD-5), `elp206-manager-model` (+1 read path: a source `-0.00` denominator / `-0` sums emitted canonical, source facts untouched, idempotent), `be-p4-manager-series` (+2: a stored `-0` point is served `0`, a body with a signed zero point is refused), `be-p4-manager-lifecycle` | 4 files, 201 / 201 |
| control-api wide manager/ELP2 lane (`test/elp2 elp206 elp210 be-p4 manager`) | 91 files passed, 3,348 tests passed; 6 files failed, **all PostgreSQL-backed** (`manager-lists`, `elp2-query-scope`, `elp204-*-capture`, `elp204-parent-capture-guards`: no 127.0.0.1:5432), same as BE-P1 |
| `npx tsc -p apps/control-api/tsconfig.build.json --noEmit` | exit 0 |
| contracts host vitest `execution-manager-models`, `-series`, `-lifecycle` | 3 files, 135 / 135 (Zod and Ajv judged side by side) |
| `scripts/contracts-test.sh` (docker wrapper, under `/tmp/portal-heavy.lock`, once) | **exit 0, 86 files / 1,371 tests**; every `--check` generator and d.ts diff clean |
| Generators | `generate-execution-manager-models.mjs` and `generate-execution-manager-series.mjs` ran; each proves every negative case (`MD-5/*`) is refused with `MANAGER_DECIMAL_NEGATIVE_ZERO` and every `emit_examples` pair before writing; d.ts via `openapi-typescript` (models d.ts unchanged, series d.ts +2 description lines) |
| FE `readers/managerDataset*`, `readers/managerSeries*` (read-only run against the regenerated schema, to measure the oracle) | 3,667 passed, 5 expected-fail, **7 failed**, all the MD-S2 / MS-S2 pins listed below |

NOT_RUN: PostgreSQL-backed specs (above), the ordinary R3 hook, the Docker control-api suite, `contracts-snapshot.json` and the EDS-12/N29 ledger
regeneration (not committed by instruction; the lead regenerates).

## FE conformance oracle: needs a change (no FE file edited here)

The reader (`managerDataset.ts`, `managerSeries.ts`, rule MD-S2 / MS-S2: refuse `-0`) stays exactly as is. Seven conformance tests assert the old
"schema-valid but reader-refused" status of `-0` and must flip to "schema-invalid and reader-refused":
- `managerDataset.conformance.test.ts`: `reader never accepts what the schema refuses ...` (pinned count `MD-S2 negative zero ...: 24` leaves the
  reader-stricter map), `MD-S2 negative zero value`, `MD-S2 negative zero with decimals` (leave the stricter-on-purpose list), and
  `MD-5 (negative zero) is not a rule yet` (becomes: the schema and the producer refuse it).
- `managerSeries.conformance.test.ts`: `reader never accepts what the schema refuses ...` (pin `MS-S2 ...: 8` leaves), `MS-S2 negative zero point`,
  `MS-S2 negative zero with decimals`.
The new fixtures to read: `fixtures/execution-manager-dataset.invariants.synthetic.negative.json` (`MD-5/*`, `emit_examples`) and
`fixtures/execution-manager-series.negative-zero.synthetic.negative.json`.

## Producer-receipt request to Codex

1. ACCEPTED / CHANGES_REQUESTED on the rule text (BE-P1 "MD-5 as delivered") and on leaving `score_details` / `composition_details` /
   `regime_details` (sealed publications, verbatim) outside the emit step.
2. Run the PostgreSQL-backed specs I cannot and the ordinary R3 hook on the merged tree; regenerate `contracts-snapshot.json` and the EDS-12/N29 ledgers.
