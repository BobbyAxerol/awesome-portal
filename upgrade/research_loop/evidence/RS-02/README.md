# RS-02 — Complete current-source adapters, retained data and screen read models

**Status:** `BACKEND_COMPLETE · FEATURE_DARK · DISPOSABLE_DB_GATE_PASS · CLAUDE_RS03_INTEGRATION_PENDING`  
**Date:** 2026-09-22  
**Worktree / branch:** `/home/bobby/portal-research` / `docs/research-loop-plan`

RS-02 closes the Portal implementation gaps A09–A11 identified by Astra for
the source facts that the installed public QuantBT Advanced-WFO output actually
publishes. It is intentionally additive: it does not reclassify the older
fixed-profile P13–P17 receipts as a full optimizer, it does not activate a
runtime feature, and it does not alter Execution, Trading System, brokers,
CLI, source databases or historical rows.

## What is now authoritative in this lane

- A private Python adapter admits only `rs02.quantbt-advanced-wfo.v1` with
  `rs02.delta-wfo-global.v1`. Wrong route/mode/schedule or legacy/fixed input
  is rejected; it never falls back to a smoke result.
- The adapter reads one P05-sealed artifact and writes bounded, canonical
  batches for full-resolution observations plus factual folds, trials,
  candidates and exactly one selection row.
- A private TypeScript custody repository appends only bounded batches
  (200 rows / 1 MiB), uses a shared revision lock, seals only dense and fully
  receipt-covered relations, and makes retained rows readable only after an
  immutable seal.
- The browser receives six named same-origin DTOs, not relation selectors or
  artifact locations: evidence, one series, split, search, freeze and replay.
  All reads are Portal-local PostgreSQL reads after retention.
- Exact decimal strings, UTC milliseconds, freshness/revision/availability,
  bounded pages and opaque relation-bound cursor semantics are preserved.
- P05 may retain source-private record metadata for custody, but the
  Portal-local screen reader deliberately emits only named fold/candidate and
  bounded (at most 24-field) parameter facts. A valid source result therefore
  cannot turn a 256-fold or 64-candidate screen into a multi-megabyte BFF
  response.

The authoritative detailed record is [phase-report.md](./phase-report.md).
Claude must start from [frontend-handoff-claude.md](./frontend-handoff-claude.md)
and the [screen field/action matrix](./field-action-coverage-matrix.md), not
from a manual DTO or a previous generic P13–P17 client.

## Explicit non-claims

RS-02 does **not** claim current source facts that are not emitted by the
sealed input: raw P05 artifact bytes, physical holdout I/O, warmup/purge/
embargo methodology, strict outer-OOS selection, objective/pruning/importance,
authoritative execution orders/fills/candles, or a market/broker replay. Each
is represented by its exact typed source state in the relevant panel; none is
filled with `0`, a fixture value, a browser calculation or an opaque generic
unavailable page.

## Activation boundary

`FEATURE_RESEARCH_CURRENT_SOURCE=false` remains the default. The feature may
not be enabled until the isolated PostgreSQL migration/grant/immutability gate
in [test-rs02-postgres.sh](../../../../scripts/research-loop-v11/test-rs02-postgres.sh)
has passed in an approved disposable Docker-capable acceptance environment
(it passed once on 2026-09-22 and left no matching container), and Claude has
returned RS-03 browser/HiFi receipts. That gate creates exactly one named
tmpfs PostgreSQL container and removes it in its `EXIT` trap.
