-- N25 adds the deployment lineage feed without invalidating immutable N24
-- cycle receipts. New writers require 13 feeds; historical 12-feed receipts
-- remain auditable and read-only.
ALTER TABLE portal_projection.manager_projection_cycles
  DROP CONSTRAINT manager_projection_cycles_feed_count_check;
ALTER TABLE portal_projection.manager_projection_cycles
  ADD CONSTRAINT manager_projection_cycles_feed_count_check
  CHECK (feed_count IN (12, 13));

-- N25 keeps the exact-query hot path indexed for both legacy flattened
-- projection payloads and N24 Manager-v2 tagged fields. These expressions are
-- intentionally identical to projection-store-pg/src/query.rs.
CREATE INDEX idx_entities_n25_status
  ON portal_projection.entities (
    epoch_id, entity_kind,
    (COALESCE(payload->>'status',payload#>>'{fields,status,value}','')),
    entity_id
  );
CREATE INDEX idx_entities_n25_currency
  ON portal_projection.entities (
    epoch_id, entity_kind,
    (COALESCE(payload->>'currency',payload#>>'{fields,currency,value}','')),
    entity_id
  );
CREATE INDEX idx_entities_n25_deployment
  ON portal_projection.entities (
    epoch_id, entity_kind,
    (COALESCE(payload->>'deployment_id',payload#>>'{fields,deployment_id,value}','')),
    entity_id
  );
CREATE INDEX idx_entities_n25_portfolio
  ON portal_projection.entities (
    epoch_id, entity_kind,
    (COALESCE(payload->>'portfolio_id',payload#>>'{fields,portfolio_id,value}','')),
    entity_id
  );
CREATE INDEX idx_entities_n25_strategy_account
  ON portal_projection.entities (
    epoch_id, entity_kind,
    (COALESCE(payload->>'strategy_id',payload#>>'{fields,strategy_id,value}','')),
    (COALESCE(payload->>'account_id',payload#>>'{fields,account_id,value}','')),
    entity_id
  );

COMMENT ON INDEX portal_projection.idx_entities_n25_deployment IS
  'N25 exact query index over legacy and N24 Manager-v2 tagged deployment fields';
