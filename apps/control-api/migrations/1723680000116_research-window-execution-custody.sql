-- Additive companion only. Existing source/artifact/report seals are unchanged.
CREATE TABLE research.window_execution_batches_v1 (
  workspace_id text NOT NULL, run_id text NOT NULL, artifact_revision integer NOT NULL CHECK(artifact_revision>0),
  artifact_id text NOT NULL, companion_digest text NOT NULL CHECK(companion_digest~'^[a-f0-9]{64}$'),
  batch_ordinal integer NOT NULL CHECK(batch_ordinal BETWEEN 0 AND 199999),
  start_ordinal integer NOT NULL CHECK(start_ordinal BETWEEN 0 AND 199999),
  row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 200), batch_digest text NOT NULL CHECK(batch_digest~'^[a-f0-9]{64}$'),
  PRIMARY KEY(workspace_id,run_id,artifact_revision,batch_ordinal),
  UNIQUE(workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest),
  FOREIGN KEY(workspace_id,artifact_id) REFERENCES research.artifacts(workspace_id,artifact_id)
);
CREATE TABLE research.window_execution_rows_v1 (
  workspace_id text NOT NULL,run_id text NOT NULL,artifact_revision integer NOT NULL,companion_digest text NOT NULL,batch_ordinal integer NOT NULL,
  source_ordinal integer NOT NULL CHECK(source_ordinal BETWEEN 0 AND 199999),
  kind text NOT NULL CHECK(kind IN ('OBSERVATION','ANALYTICS','EXECUTION')),
  window_kind text NOT NULL CHECK(window_kind IN ('IS','OOS','HOLDOUT','FULL_SAMPLE')),fold_id text,at_utc_ms bigint,
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=131072
    AND (payload->>'source_ordinal')::integer=source_ordinal AND payload->>'kind'=kind AND payload->>'window'=window_kind
    AND payload->>'fold_id' IS NOT DISTINCT FROM fold_id AND (payload->>'at_utc_ms')::bigint IS NOT DISTINCT FROM at_utc_ms),
  PRIMARY KEY(workspace_id,run_id,artifact_revision,source_ordinal),
  FOREIGN KEY(workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest)
    REFERENCES research.window_execution_batches_v1(workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest)
);
CREATE INDEX window_execution_named_page ON research.window_execution_rows_v1(workspace_id,run_id,artifact_revision,kind,window_kind,fold_id,source_ordinal);
CREATE UNIQUE INDEX window_execution_one_analysis ON research.window_execution_rows_v1(workspace_id,run_id,artifact_revision,window_kind,coalesce(fold_id,'')) WHERE kind='ANALYTICS';
CREATE TABLE research.window_execution_seals_v1 (
  workspace_id text NOT NULL,run_id text NOT NULL,artifact_revision integer NOT NULL CHECK(artifact_revision>0),artifact_id text NOT NULL,
  companion_digest text NOT NULL CHECK(companion_digest~'^[a-f0-9]{64}$'),
  manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=65536),
  retained_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,run_id,artifact_revision),
  FOREIGN KEY(workspace_id,artifact_id) REFERENCES research.artifacts(workspace_id,artifact_id)
);
CREATE FUNCTION research.guard_window_execution_append() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('window-execution:'||NEW.workspace_id||':'||NEW.run_id||':'||NEW.artifact_revision,0));
  IF EXISTS(SELECT 1 FROM research.window_execution_seals_v1 WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id AND artifact_revision=NEW.artifact_revision) THEN
    RAISE EXCEPTION 'window execution sealed' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER window_execution_batches_guard BEFORE INSERT ON research.window_execution_batches_v1 FOR EACH ROW EXECUTE FUNCTION research.guard_window_execution_append();
CREATE TRIGGER window_execution_rows_guard BEFORE INSERT ON research.window_execution_rows_v1 FOR EACH ROW EXECUTE FUNCTION research.guard_window_execution_append();
REVOKE ALL ON FUNCTION research.guard_window_execution_append() FROM PUBLIC;
CREATE FUNCTION research.validate_window_execution_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer; actual integer; first_ordinal integer; last_ordinal integer; batch_rows integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('window-execution:'||NEW.workspace_id||':'||NEW.run_id||':'||NEW.artifact_revision,0));
  expected := (NEW.manifest->'source'->>'row_count')::integer;
  IF expected IS NULL OR expected NOT BETWEEN 0 AND 200000 OR NEW.manifest->>'workspace_id' IS DISTINCT FROM NEW.workspace_id
    OR NEW.manifest->>'run_id' IS DISTINCT FROM NEW.run_id OR NEW.manifest->>'artifact_id' IS DISTINCT FROM NEW.artifact_id
    OR (NEW.manifest->>'artifact_revision')::integer IS DISTINCT FROM NEW.artifact_revision
    OR NOT EXISTS(SELECT 1 FROM research.artifacts a WHERE a.workspace_id=NEW.workspace_id AND a.artifact_id=NEW.artifact_id
      AND a.run_id=NEW.run_id AND a.artifact_revision=NEW.artifact_revision AND a.state='SEALED'
      AND a.manifest_digest=NEW.manifest->>'manifest_digest') THEN
    RAISE EXCEPTION 'invalid window execution finalization binding' USING ERRCODE='23514';
  END IF;
  SELECT count(*),min(source_ordinal),max(source_ordinal) INTO actual,first_ordinal,last_ordinal
    FROM research.window_execution_rows_v1 WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id
      AND artifact_revision=NEW.artifact_revision AND companion_digest=NEW.companion_digest;
  SELECT coalesce(sum(row_count),0) INTO batch_rows FROM research.window_execution_batches_v1
    WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id AND artifact_revision=NEW.artifact_revision
      AND companion_digest=NEW.companion_digest;
  IF actual<>expected OR batch_rows<>expected OR (expected>0 AND (first_ordinal<>0 OR last_ordinal<>expected-1)) THEN
    RAISE EXCEPTION 'incomplete window execution finalization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER window_execution_finalization_guard BEFORE INSERT ON research.window_execution_seals_v1 FOR EACH ROW EXECUTE FUNCTION research.validate_window_execution_finalization();
REVOKE ALL ON FUNCTION research.validate_window_execution_finalization() FROM PUBLIC;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['window_execution_batches_v1','window_execution_rows_v1','window_execution_seals_v1'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON research.%I FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation()',t||'_immutable',t);
    EXECUTE format('ALTER TABLE research.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE research.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON research.%I FOR ALL TO portal_research_runtime USING(workspace_id=current_setting(''research.workspace_id'',true) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''research.actor_user_id'',true))) WITH CHECK(workspace_id=current_setting(''research.workspace_id'',true) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''research.actor_user_id'',true)))',t||'_tenant',t,t,t);
    EXECUTE format('REVOKE ALL ON research.%I FROM PUBLIC',t);
    EXECUTE format('GRANT SELECT,INSERT ON research.%I TO portal_research_runtime',t);
  END LOOP;
END $$;
-- Rollback disables the read lane; never drop immutable retained evidence.
SELECT 1;
