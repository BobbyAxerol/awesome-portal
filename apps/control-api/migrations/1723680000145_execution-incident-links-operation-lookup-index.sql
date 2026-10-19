-- FE-042 independent review M1. The operations queue V2 reads incident links by
-- (workspace_id, operation_id = ANY(page ids)); the only existing index is the
-- primary key (incident_id, operation_id), which has no usable leading column
-- for that lookup, so every queue page could seq-scan the whole table and hit
-- the 2000 ms statement_timeout at 10^6..10^7 links. Additive index only: no
-- column, constraint, writer, view or retention change. The trailing columns
-- match the per-operation ranking (newest link first, incident id tie-break).
-- Plain (transactional) CREATE INDEX takes a SHARE lock for its duration, which
-- blocks link writes; the table is operator-scale today, and an operator who
-- later runs this against a very large table may pre-create the identical index
-- with CREATE INDEX CONCURRENTLY, after which IF NOT EXISTS makes this a no-op.
-- Up Migration
CREATE INDEX IF NOT EXISTS execution_incident_operation_links_operation_idx
    ON execution_incident_operation_links (workspace_id, operation_id, created_at DESC, incident_id DESC);

-- Down Migration
DROP INDEX IF EXISTS execution_incident_operation_links_operation_idx;
