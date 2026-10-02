-- Full lifecycle companion is additive; original P05/FOLD seals remain immutable.
CREATE TABLE research.child_audit_companion_batches_v1 (
  workspace_id text NOT NULL, run_id text NOT NULL, artifact_revision integer NOT NULL CHECK (artifact_revision > 0),
  companion_digest text NOT NULL CHECK (companion_digest ~ '^[0-9a-f]{64}$'),
  batch_ordinal integer NOT NULL CHECK (batch_ordinal BETWEEN 0 AND 99),
  batch_digest text NOT NULL CHECK (batch_digest ~ '^[0-9a-f]{64}$'),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 200),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=16384),
  PRIMARY KEY (workspace_id,run_id,artifact_revision,batch_ordinal),
  UNIQUE (workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest),
  FOREIGN KEY (workspace_id,run_id,artifact_revision) REFERENCES research.current_source_seals_v1(workspace_id,run_id,artifact_revision)
);
CREATE TABLE research.child_audit_companion_rows_v1 (
  workspace_id text NOT NULL, run_id text NOT NULL, artifact_revision integer NOT NULL,
  companion_digest text NOT NULL, batch_ordinal integer NOT NULL,
  audit_ordinal integer NOT NULL CHECK (audit_ordinal BETWEEN 0 AND 19999),
  fold_id text NULL, context text NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=8192
    AND (payload->>'audit_ordinal')::integer=audit_ordinal
    AND fold_id IS NOT DISTINCT FROM payload->>'fold_id'
    AND context IS NOT DISTINCT FROM payload->>'context'),
  CHECK (batch_ordinal=audit_ordinal/200),
  PRIMARY KEY (workspace_id,run_id,artifact_revision,audit_ordinal),
  FOREIGN KEY (workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest)
    REFERENCES research.child_audit_companion_batches_v1(workspace_id,run_id,artifact_revision,batch_ordinal,companion_digest)
);
CREATE INDEX child_audit_companion_fold_page_idx ON research.child_audit_companion_rows_v1
  (workspace_id,run_id,artifact_revision,fold_id,context,audit_ordinal);
CREATE TABLE research.child_audit_companion_seals_v1 (
  workspace_id text NOT NULL, run_id text NOT NULL, artifact_revision integer NOT NULL,
  companion_digest text NOT NULL CHECK (companion_digest ~ '^[0-9a-f]{64}$'),
  manifest jsonb NOT NULL CHECK (jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=16384),
  retained_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id,run_id,artifact_revision),
  FOREIGN KEY (workspace_id,run_id,artifact_revision) REFERENCES research.current_source_seals_v1(workspace_id,run_id,artifact_revision)
);
CREATE FUNCTION research.prevent_child_audit_append_after_seal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- All inserts and finalization serialize the same exact object, including
  -- callers outside the repository. Never allow a racing post-seal append.
  PERFORM pg_advisory_xact_lock(hashtextextended('child-audit:'||NEW.workspace_id||':'||NEW.run_id||':'||NEW.artifact_revision,0));
  IF EXISTS (SELECT 1 FROM research.child_audit_companion_seals_v1
    WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id AND artifact_revision=NEW.artifact_revision) THEN
    RAISE EXCEPTION 'child audit already sealed' USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER child_audit_companion_batches_seal_guard BEFORE INSERT ON research.child_audit_companion_batches_v1
  FOR EACH ROW EXECUTE FUNCTION research.prevent_child_audit_append_after_seal();
CREATE TRIGGER child_audit_companion_rows_seal_guard BEFORE INSERT ON research.child_audit_companion_rows_v1
  FOR EACH ROW EXECUTE FUNCTION research.prevent_child_audit_append_after_seal();
CREATE FUNCTION research.validate_child_audit_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected integer; actual integer; first_ordinal integer; last_ordinal integer; batch_count integer; batch_rows integer;
BEGIN
  -- Same lock as append, so even direct SQL finalization cannot race append.
  PERFORM pg_advisory_xact_lock(hashtextextended('child-audit:'||NEW.workspace_id||':'||NEW.run_id||':'||NEW.artifact_revision,0));
  expected := (NEW.manifest->>'source_record_count')::integer;
  IF expected IS NULL OR expected NOT BETWEEN 0 AND 20000
    OR NEW.manifest->>'workspace_id' IS DISTINCT FROM NEW.workspace_id
    OR NEW.manifest->>'run_id' IS DISTINCT FROM NEW.run_id
    OR (NEW.manifest->>'artifact_revision')::integer IS DISTINCT FROM NEW.artifact_revision THEN
    RAISE EXCEPTION 'invalid child audit finalization binding' USING ERRCODE='23514';
  END IF;
  SELECT count(*),min(audit_ordinal),max(audit_ordinal) INTO actual,first_ordinal,last_ordinal
    FROM research.child_audit_companion_rows_v1
    WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id AND artifact_revision=NEW.artifact_revision
      AND companion_digest=NEW.companion_digest;
  SELECT count(*),coalesce(sum(row_count),0) INTO batch_count,batch_rows
    FROM research.child_audit_companion_batches_v1
    WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id AND artifact_revision=NEW.artifact_revision
      AND companion_digest=NEW.companion_digest AND manifest=NEW.manifest;
  IF actual<>expected OR batch_rows<>expected OR batch_count<>(expected+199)/200
    OR expected>0 AND (first_ordinal<>0 OR last_ordinal<>expected-1)
    OR EXISTS (SELECT 1 FROM research.child_audit_companion_batches_v1
      WHERE workspace_id=NEW.workspace_id AND run_id=NEW.run_id AND artifact_revision=NEW.artifact_revision
      AND (companion_digest<>NEW.companion_digest OR manifest<>NEW.manifest)) THEN
    RAISE EXCEPTION 'incomplete child audit finalization' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER child_audit_companion_finalization_guard BEFORE INSERT ON research.child_audit_companion_seals_v1
  FOR EACH ROW EXECUTE FUNCTION research.validate_child_audit_finalization();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['child_audit_companion_batches_v1','child_audit_companion_rows_v1','child_audit_companion_seals_v1'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON research.%I FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation()',t||'_immutable',t);
    EXECUTE format('ALTER TABLE research.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE research.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY %I ON research.%I FOR ALL TO portal_research_runtime USING (workspace_id=current_setting(''research.workspace_id'',true) AND EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''research.actor_user_id'',true))) WITH CHECK (workspace_id=current_setting(''research.workspace_id'',true) AND EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id=%I.workspace_id AND m.user_id=current_setting(''research.actor_user_id'',true)))',t||'_tenant',t,t,t);
    EXECUTE format('REVOKE ALL ON research.%I FROM PUBLIC',t);
    EXECUTE format('GRANT SELECT,INSERT ON research.%I TO portal_research_runtime',t);
  END LOOP;
END $$;
