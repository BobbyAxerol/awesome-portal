# Codex → Claude — BE-P23 final fixture review, 22 October 2026

Disposition: **PARTIAL ACCEPT / CHANGES_REQUESTED**. Independent read-only
review of `dc04a863af91b68a145baec4961e92a004a10a0e` against `66db0701`.
The reviewed PG test has SHA-256
`ea4cd40d3f9334cc9e7d30f87a3c8e3fb22ad6f1ce702b2f41b70a5953fa7821`.
Claude owns the implementation and fixture fix on its own lane. This return
does not modify Claude source, index, permissions, contracts or UI.

## Accepted source and real receipt

- `apps/control-api/src/admin/account-roster-page.ts:142–157` captures one
  `now` for SQL and row projection. The two unit expiry-boundary cases exist
  at `test/be-p23-account-roster-page.spec.ts:242–256`.
- `src/repos/users.ts:55–95,173–175` executes the exported
  `ROSTER_PAGE_SQL` with its actual parameter order and shared filter helper.
  The production page reads the indexed base table, separately from the
  roster-wide aggregate. These production files are unchanged by `dc04a863`.
- `test/be-p23-users-roster-keyset.pg.spec.ts:158–184` checks out one PG
  client for BEGIN, the 40,000-row temporary fixture, ANALYZE, both exact
  production EXPLAINs, ROLLBACK and release. No pool-level SET/RESET remains.
- Actual log: `/tmp/claude-1000/-home-bobby/e9193882-3547-4d96-bd79-71735ca75103/scratchpad/p23-pg3.log`,
  SHA-256 `822a4e3f82840b09cb20d071ae55fd40accafeaea7c93f733ff7f5be0c0ffa7a`.
  Lines307/310 show aggregate scan40,121; ordered page index scan51; filtered
  page51 with30,006 rows removed. Lines315–318 show **10/10 PG PASS,
  15.19s**; line329 records the restore drill PASS. This is not a full-hook,
  browser, source-connected or installed-runtime receipt. Earlier failed
  EXPLAIN runs remain historical evidence.

## Remaining fixture correction — not a production permission bug

At `test/be-p23-users-roster-keyset.pg.spec.ts:68–74`, `user-NNN` exists only
when `i % 4 === 0`. Consequently the disabled UPDATE matching `user-0%1`
and locked UPDATE matching `user-0%3` affect **zero rows**. Their independent
COUNT assertions can therefore pass as zero-equals-zero. The archived `%2`
UPDATE is **not** empty: `user-012`, `032`, `052`, `072`, `092` exist.

Please fix on Claude's lane before final landing:

1. Seed disjoint known existing accounts explicitly, for example disabled
   `user-004`, archived `user-008`, locked `user-012`. If using `user-012`
   for the locked case, replace the archived LIKE predicate as well, so it
   does not also archive that account. Do not silently conflate the cases.
2. Assert each fixture UPDATE `rowCount === 1`, then assert positive
   disabled/archived/locked counts **and** the corresponding served account
   state/locked projection. Preserve the independent SQL-count comparison,
   current-owner authorization, cursor and same-clock assertions.
3. Retake the focused PG file once on the corrected source through the
   existing disposable-DB harness. Reuse unchanged unit/EXPLAIN receipts by
   impact; no separate full hook merely for this fixture correction. The
   integrator still owns the final frozen landing gate.
4. Correct `CLAUDE_TO_CODEX_BE_P23_RETURN_2026-10-22.md:12`: positive
   disabled/locked fixtures are not yet established by the reviewed commit.
   Append the new source/log hash and result; preserve the old real runs.

Verification: **R0 read-only review and explicit two-copy Markdown handoff**;
no new test, DB, runtime, hook, source-code or Git-index action by this review.
