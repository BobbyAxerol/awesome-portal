# B3 CG-FG-S14-04 — Alpha Registry exact total and bounded keyset

Status: BACKEND_ACCEPTED in disposable PostgreSQL; exact-head preview pending after commit.

`GET /api/v1/research/alphas` returns exact `total` for the authorized workspace and optional `alpha_id` filter, plus opaque `next_cursor` for a 200-entry page. The signed expiring cursor is workspace/filter/sort-bound, with source timestamp microseconds and `alpha_version_id` as tie-breaker. Count and page use one repeatable-read snapshot. No source bytes, database locators or relation names are exposed. Bad/tampered/cross-workspace/cross-filter cursors fail typed HTTP 400 `RESEARCH_ALPHA_REGISTRY_CURSOR_INVALID`.

Disposable PostgreSQL regression inserted 201 versions at one-microsecond intervals: 200+1 rows, total 201, 201 unique IDs, filtered total one, invalid scopes rejected. `scripts/research-loop-v11/test-p07-postgres.sh` passed 10/10; Alpha contract passed 6/6; Control API build passed. Additive index migration 080 changes no business rows.

Generated consumer: `packages/contracts/generated/research-alpha-import.d.ts` → `ResearchAlphaRegistryV1.total`, `next_cursor`, optional GET `cursor`. Canonical response: `packages/contracts/fixtures/research-alpha-import.registry.valid.json`. Claude should replace client-side filtering/truncation with server `alpha_id` filter and cursor without visual redesign. Preview/full-hook results will be appended at exact commit.
