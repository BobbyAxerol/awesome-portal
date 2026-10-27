# History selected-byte census consistency — 27 October 2026

**Scope:** local Core backend hardening, not a connected Edge/source or browser
acceptance. The entry checkout was `docs/research-loop-plan@f33d7823f`; preserve
the five previously staged Core/gate files and the unrelated untracked Edge
packets. No migration, public contract, UI, provider or runtime was changed.

The existing History query computes `sum(octet_length(fields::text))` and
`max(octet_length(fields::text))` over the same selected population and the
same repeatable-read transaction. A valid nonnegative population necessarily
has `largest_row_bytes <= total_bytes`. Previously the budget guard accepted
an impossible `total=39, largest=40` under a 100/40 byte policy, which could
trust an underestimated total if its census/provider were corrupted. The
guard now rejects that contradiction with the existing internal
`HISTORY_BYTE_CENSUS_INVALID` error before selecting the history fields.
Zero/zero and valid boundary cases retain their existing behavior. An error
rolls back and releases the same-cut read.

Verification:

- A read-only execution of the **old HEAD implementation**, transpiled in
  memory, confirmed it accepted `39,40` (`BASELINE_ACCEPTS_INCONSISTENT_CENSUS`).
  No repository files were replaced to run this negative control.
- Focused Vitest: `history-byte-budget.spec.ts` and
  `binding-financial-batch.spec.ts`, **57/57 PASS**; includes contradictory
  zero/nonzero and nonzero/largest checks and repository rollback-before-read.
- Control API `tsc --noEmit -p tsconfig.build.json`: PASS on the current source.
- These are local synthetic/regression tests, **not** data-volume,
  pagination, authorization/revoke, connected Edge, or latency receipts.
- Core and test changes remain uncommitted pending the normal shared-branch
  integration gate. The prior full test run was deliberately interrupted after
  almost seven minutes without a suite completion; that alone does **not**
  establish a stuck runner or a failed test. The focused Accounts build/restore
  and full contract results in `CORE_BACKEND_BATCH_2026-10-27.md` remain valid
  only within their recorded scope.

**Remaining:** the actual Edge HISTORY/REPLAY rights, source, candidate and
safe transport; pagination, byte budget, large real data, revoke/recovery and
browser receipt on that candidate. `CURRENT` does not confer HISTORY/REPLAY.
Claude needs no UI or DTO change for this private validation. ELP2-10 remains
open; Calendar remains `SOURCE_DARK`. Revert this guard/test only if necessary;
do not delete retained history, authority or prior evidence.
