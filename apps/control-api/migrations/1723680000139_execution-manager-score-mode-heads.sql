-- Up Migration
-- Explicit optional R06 original/restated mode pointers, forward-only. No
-- writer/runtime is enabled or policy/authority installed by this migration.
-- Immutable payloads stay in138 and count against its ONE shared actual-byte
-- and revision cap; this is only a scoped head index, never another payload store.
CREATE TABLE execution_manager_score_mode_heads (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper','sandbox','live')),
  profile_id text NOT NULL,
  source_revision text NOT NULL,
  head_kind text NOT NULL CHECK (head_kind IN ('ORIGINAL_INPUTS','RESTATED_CURRENT_POLICY')),
  calculation_key text NOT NULL,
  PRIMARY KEY (workspace_id,environment,profile_id,source_revision,head_kind),
  FOREIGN KEY (workspace_id,environment,profile_id,source_revision,calculation_key)
    REFERENCES execution_manager_calculation_revisions(workspace_id,environment,profile_id,source_revision,calculation_key)
);
CREATE FUNCTION execution_manager_original_head_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.head_kind='ORIGINAL_INPUTS' THEN
    RAISE EXCEPTION 'MANAGER_ORIGINAL_HEAD_IMMUTABLE' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    IF OLD.head_kind<>NEW.head_kind THEN
      RAISE EXCEPTION 'MANAGER_ORIGINAL_HEAD_IMMUTABLE' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER execution_manager_original_head_immutable
  BEFORE UPDATE OR DELETE ON execution_manager_score_mode_heads
  FOR EACH ROW EXECUTE FUNCTION execution_manager_original_head_immutable();
COMMENT ON TABLE execution_manager_score_mode_heads IS
  'Scoped ORIGINAL input pointer and separate optional historical RESTATED head; no source checkpoint/ACK/authority, no duplicated retention quota';

-- Down Migration
-- Disable compatible consumers first; preserve immutable original/derived rows.
-- No automatic destructive rollback or original-head rewriting.
