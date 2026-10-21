-- BE-P18 B1 large-scale EXPLAIN gate (test/be-p18-b1-explain.pg.spec.ts). The operations queue V2 filters
-- execution_operation_queue_v2 by (workspace_id, minted scope tuples (target_type, target_id, environment)). The view
-- (migration 141) presents target_id as CASE WHEN octet_length(target_id) BETWEEN 1 AND 191 THEN target_id END, so a
-- plain column index on target_id can never serve that predicate. Before this index every queue statement (total,
-- filtered, page, four facet counts) read the WHOLE 1M-row table even for a scope that selects a few hundred rows
-- (a 3-target scope still took ~1 s per request); with it a narrow scope is an index lookup per scoped target.
-- Additive, non-unique, non-partial: no column, constraint, writer, view or retention change. The key expression is
-- copied from migration 141's view definition on purpose: PostgreSQL only uses an expression index when the query
-- expression is textually the same parse tree, so a change to the view must change this index with it.
-- Plain (transactional) CREATE INDEX takes a SHARE lock that blocks queue writes while it builds; on a very large
-- table an operator may pre-create the identical index with CREATE INDEX CONCURRENTLY, after which IF NOT EXISTS
-- makes this migration a no-op.
-- Up Migration
CREATE INDEX IF NOT EXISTS execution_operation_queue_scope_idx
    ON execution_operation_queue_items
       (workspace_id, (CASE WHEN octet_length(target_id) BETWEEN 1 AND 191 THEN target_id END), target_type, environment);

-- Down Migration
DROP INDEX IF EXISTS execution_operation_queue_scope_idx;
