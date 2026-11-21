-- SOURCE-ONLY CANDIDATE. Not a product migration or permission to install.
-- Review ownership/ACL and rehearse a representative backup before use.
-- This is an additive upgrade of the earlier disposable P7 schema shape.
-- It never infers owner intent for old records and never opens the issuer.
BEGIN;
SET LOCAL lock_timeout='1000ms';
SET LOCAL statement_timeout='5000ms';
SET LOCAL row_security=off;
LOCK TABLE elp210_c2_p7_candidate.records, elp210_c2_p7_candidate.owner_intents IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE missing_guard boolean;
BEGIN
  -- Refuse absent, already-upgraded, partially upgraded, or non-table inputs.
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='elp210_c2_p7_candidate.records'::regclass AND relkind='r') OR
     NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='elp210_c2_p7_candidate.owner_intents'::regclass AND relkind='r') OR
     EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_c2_p7_candidate.records'::regclass
       AND attname IN ('owner_intent_id','confirmation_sha256') AND attnum>0 AND NOT attisdropped) OR
     NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_c2_p7_candidate.owner_intents'::regclass
       AND attname='intent_id' AND atttypid='uuid'::regtype AND attnotnull AND attnum>0 AND NOT attisdropped)
  THEN RAISE EXCEPTION 'C2_P7_LINK_UPGRADE_SCHEMA_MISMATCH'; END IF;
  SELECT EXISTS (SELECT 1 FROM (VALUES
    ('elp210_c2_p7_candidate.records'::regclass,'p7_immutable_rows',
      'elp210_c2_p7_candidate.immutable()'::regprocedure,27),
    ('elp210_c2_p7_candidate.records'::regclass,'p7_immutable_truncate',
      'elp210_c2_p7_candidate.immutable()'::regprocedure,34),
    ('elp210_c2_p7_candidate.owner_intents'::regclass,'owner_intents_immutable',
      'elp210_c2_p7_candidate.owner_intent_immutable()'::regprocedure,27),
    ('elp210_c2_p7_candidate.owner_intents'::regclass,'owner_intents_no_truncate',
      'elp210_c2_p7_candidate.owner_intent_immutable()'::regprocedure,34)
  ) AS required(relid,name,procedure_id,trigger_type) WHERE NOT EXISTS (SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid=required.relid AND t.tgname=required.name AND t.tgenabled='O' AND NOT t.tgisinternal
      AND t.tgfoid=required.procedure_id AND t.tgtype=required.trigger_type AND t.tgqual IS NULL)) INTO missing_guard;
  IF missing_guard THEN RAISE EXCEPTION 'C2_P7_LINK_UPGRADE_GUARD_MISSING'; END IF;
END $$;
ALTER TABLE elp210_c2_p7_candidate.records
  ADD COLUMN owner_intent_id uuid,
  ADD COLUMN confirmation_sha256 text,
  ADD CONSTRAINT p7_record_confirmation_sha_check CHECK (confirmation_sha256 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT p7_record_link_pair_check CHECK ((owner_intent_id IS NULL) = (confirmation_sha256 IS NULL)),
  ADD CONSTRAINT p7_record_intent_unique UNIQUE (owner_intent_id),
  ADD CONSTRAINT p7_record_owner_intent_fk FOREIGN KEY (owner_intent_id)
    REFERENCES elp210_c2_p7_candidate.owner_intents(intent_id);
COMMIT;
