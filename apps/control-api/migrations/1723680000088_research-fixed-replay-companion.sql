-- Fresh fixed OOS custody is additive. Historical P05/Report bytes stay intact.
CREATE TABLE research.fixed_replay_companion_batches_v1 (
  workspace_id text NOT NULL,run_id text NOT NULL,artifact_revision integer NOT NULL CHECK(artifact_revision>0),artifact_id text NOT NULL,
  companion_digest text NOT NULL CHECK(companion_digest~'^[0-9a-f]{64}$'),batch_ordinal integer NOT NULL CHECK(batch_ordinal BETWEEN 0 AND 99),
  batch_digest text NOT NULL CHECK(batch_digest~'^[0-9a-f]{64}$'),row_count integer NOT NULL CHECK(row_count BETWEEN 1 AND 200),
  manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=16384),
  PRIMARY KEY(workspace_id,run_id,artifact_revision,batch_ordinal),
  UNIQUE(workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest),
  FOREIGN KEY(workspace_id,artifact_id) REFERENCES research.artifacts(workspace_id,artifact_id),
  FOREIGN KEY(workspace_id,run_id) REFERENCES research.runs(workspace_id,run_id)
);
CREATE TABLE research.fixed_replay_companion_rows_v1 (
  workspace_id text NOT NULL,run_id text NOT NULL,artifact_revision integer NOT NULL,companion_digest text NOT NULL,batch_ordinal integer NOT NULL,
  source_ordinal integer NOT NULL CHECK(source_ordinal BETWEEN 0 AND 19999),at_utc_ms bigint NOT NULL CHECK(at_utc_ms BETWEEN 0 AND 8640000000000000),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND octet_length(payload::text)<=8192
    AND (payload->>'source_ordinal')::integer=source_ordinal AND (payload->>'at_utc_ms')::bigint=at_utc_ms),
  CHECK(batch_ordinal=source_ordinal/200),PRIMARY KEY(workspace_id,run_id,artifact_revision,source_ordinal),
  UNIQUE(workspace_id,run_id,artifact_revision,at_utc_ms),
  FOREIGN KEY(workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest)
    REFERENCES research.fixed_replay_companion_batches_v1(workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest)
);
CREATE TABLE research.fixed_replay_companion_seals_v1 (
  workspace_id text NOT NULL,run_id text NOT NULL,artifact_revision integer NOT NULL CHECK(artifact_revision>0),artifact_id text NOT NULL,
  companion_digest text NOT NULL CHECK(companion_digest~'^[0-9a-f]{64}$'),
  manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=16384),retained_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id,run_id,artifact_revision),
  FOREIGN KEY(workspace_id,artifact_id) REFERENCES research.artifacts(workspace_id,artifact_id),
  FOREIGN KEY(workspace_id,run_id) REFERENCES research.runs(workspace_id,run_id)
);
CREATE FUNCTION research.prevent_fixed_replay_append_after_seal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('fixed-replay:'||NEW.workspace_id||':'||NEW.run_id||':'||NEW.artifact_revision,0));
  IF EXISTS(SELECT 1 FROM research.fixed_replay_companion_seals_v1 WHERE workspace_id=NEW.workspace_id
    AND run_id=NEW.run_id AND artifact_revision=NEW.artifact_revision) THEN
    RAISE EXCEPTION 'fixed replay already sealed' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fixed_replay_companion_batches_seal_guard BEFORE INSERT ON research.fixed_replay_companion_batches_v1
  FOR EACH ROW EXECUTE FUNCTION research.prevent_fixed_replay_append_after_seal();
CREATE TRIGGER fixed_replay_companion_rows_seal_guard BEFORE INSERT ON research.fixed_replay_companion_rows_v1
  FOR EACH ROW EXECUTE FUNCTION research.prevent_fixed_replay_append_after_seal();
CREATE FUNCTION research.validate_fixed_replay_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer;actual integer;first_ordinal integer;last_ordinal integer;batch_count integer;batch_rows integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('fixed-replay:'||NEW.workspace_id||':'||NEW.run_id||':'||NEW.artifact_revision,0));
  expected:=CASE WHEN NEW.manifest->'source'->>'state'='NOT_PUBLISHED' THEN 0 ELSE (NEW.manifest->'source'->>'row_count')::integer END;
  IF expected IS NULL OR expected NOT BETWEEN 0 AND 20000 OR NEW.manifest->>'workspace_id' IS DISTINCT FROM NEW.workspace_id
    OR NEW.manifest->>'run_id' IS DISTINCT FROM NEW.run_id OR NEW.manifest->>'artifact_id' IS DISTINCT FROM NEW.artifact_id
    OR (NEW.manifest->>'artifact_revision')::integer IS DISTINCT FROM NEW.artifact_revision
    OR NOT EXISTS(SELECT 1 FROM research.artifacts a WHERE a.workspace_id=NEW.workspace_id AND a.artifact_id=NEW.artifact_id
      AND a.run_id=NEW.run_id AND a.artifact_revision=NEW.artifact_revision AND a.state='SEALED'
      AND a.manifest_digest=NEW.manifest->>'manifest_digest') THEN
    RAISE EXCEPTION 'invalid fixed replay finalization binding' USING ERRCODE='23514';
  END IF;
  SELECT count(*),min(source_ordinal),max(source_ordinal) INTO actual,first_ordinal,last_ordinal
    FROM research.fixed_replay_companion_rows_v1 WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id
      AND artifact_revision=NEW.artifact_revision AND companion_digest=NEW.companion_digest;
  SELECT count(*),coalesce(sum(row_count),0) INTO batch_count,batch_rows FROM research.fixed_replay_companion_batches_v1
    WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id AND artifact_revision=NEW.artifact_revision
      AND companion_digest=NEW.companion_digest AND manifest=NEW.manifest AND artifact_id=NEW.artifact_id;
  IF actual<>expected OR batch_rows<>expected OR batch_count<>(expected+199)/200
    OR expected>0 AND(first_ordinal<>0 OR last_ordinal<>expected-1)
    OR EXISTS(SELECT 1 FROM research.fixed_replay_companion_batches_v1 WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id
      AND artifact_revision=NEW.artifact_revision AND(companion_digest<>NEW.companion_digest OR manifest<>NEW.manifest OR artifact_id<>NEW.artifact_id))
    OR EXISTS(SELECT 1 FROM(SELECT at_utc_ms,lag(at_utc_ms) OVER(ORDER BY source_ordinal) AS previous
      FROM research.fixed_replay_companion_rows_v1 WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id
        AND artifact_revision=NEW.artifact_revision) ordered WHERE at_utc_ms<=previous) THEN
    RAISE EXCEPTION 'incomplete fixed replay finalization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fixed_replay_companion_finalization_guard BEFORE INSERT ON research.fixed_replay_companion_seals_v1
  FOR EACH ROW EXECUTE FUNCTION research.validate_fixed_replay_finalization();
REVOKE ALL ON FUNCTION research.prevent_fixed_replay_append_after_seal(),research.validate_fixed_replay_finalization() FROM PUBLIC;
DO $$ DECLARE t text;BEGIN
  FOREACH t IN ARRAY ARRAY['fixed_replay_companion_batches_v1','fixed_replay_companion_rows_v1','fixed_replay_companion_seals_v1'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON research.%I FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation()',t||'_immutable',t);
    EXECUTE format('ALTER TABLE research.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE research.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON research.%I FOR ALL TO portal_research_runtime USING(workspace_id=current_setting(''research.workspace_id'',true) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''research.actor_user_id'',true))) WITH CHECK(workspace_id=current_setting(''research.workspace_id'',true) AND EXISTS(SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''research.actor_user_id'',true)))',t||'_tenant',t,t,t);
    EXECUTE format('REVOKE ALL ON research.%I FROM PUBLIC',t);
    EXECUTE format('GRANT SELECT,INSERT ON research.%I TO portal_research_runtime',t);
  END LOOP;
END $$;
-- Down migration deliberately non-destructive; roll back by disabling the lane.
SELECT 1;
