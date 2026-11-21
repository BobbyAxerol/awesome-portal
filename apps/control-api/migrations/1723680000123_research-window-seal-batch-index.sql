-- BR-S02-22: avoid rescanning every retained window for every 200-row batch.
-- Additive custody index only: no business rows, source bytes or seals change.
CREATE INDEX window_execution_seal_batch
  ON research.window_execution_rows_v1
    (workspace_id,run_id,artifact_revision,batch_ordinal,source_ordinal);
