-- UNMOUNTED CANDIDATE ONLY; not a numbered production migration.
-- For a previously installed candidate schema that predates any of the pins.
-- Stop and fence all old issuers/holders before installing new code: old
-- binaries cannot populate the field. Never derive/backfill historical
-- issuers from today's config; NULL remains an explicit recovery refusal.
BEGIN;
-- Build the expected CHECK expressions in this same PG version. Comparing
-- catalog expressions avoids accepting a same-name CHECK(true) or a bare
-- nullable column from a partially applied / drifted candidate schema.
-- A pre-existing temp relation of this exact name fails closed.
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3000ms';
-- Acquire the eventual ALTER TABLE lock before reading any column,
-- constraint or trigger state. Otherwise a concurrent DDL owner can change
-- a validated constraint while this transaction waits for its first ALTER.
-- This protects the table's DDL only; separately owned function replacement,
-- role/ACL changes and old-holder fencing still require qualification.
DO $$ BEGIN
  IF to_regclass('elp210_candidate.leases') IS NULL THEN
    RAISE EXCEPTION 'C2_ISSUER_UPGRADE_LEASES_MISSING';
  END IF;
END $$;
LOCK TABLE elp210_candidate.leases IN ACCESS EXCLUSIVE MODE;
CREATE TEMP TABLE c2_issuer_expected_checks (
  human_issuer text CHECK (human_issuer IS NULL OR
    (octet_length(human_issuer) BETWEEN 1 AND 128 AND human_issuer=btrim(human_issuer))),
  source_trust_digest text CHECK (source_trust_digest IS NULL OR source_trust_digest ~ '^sha256:[a-f0-9]{64}$'),
  human_signing_key_digest text CHECK (human_signing_key_digest IS NULL OR human_signing_key_digest ~ '^sha256:[a-f0-9]{64}$'),
  human_assertion_digest text CHECK (human_assertion_digest IS NULL OR human_assertion_digest ~ '^sha256:[a-f0-9]{64}$'),
  c2_custody_binding_digest text CHECK (c2_custody_binding_digest IS NULL OR c2_custody_binding_digest ~ '^sha256:[a-f0-9]{64}$'),
  c2_p7_binding_digest text CHECK (c2_p7_binding_digest IS NULL OR c2_p7_binding_digest ~ '^sha256:[a-f0-9]{64}$')
) ON COMMIT DROP;
-- Never silently replace a drifted existing function: it may already be
-- referenced by a trigger or another object. Compare exact body and execution
-- attributes before touching candidate columns; the temporary function is
-- only a same-version reference and is explicitly dropped before commit.
CREATE FUNCTION pg_temp.c2_issuer_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.c2_custody_binding_digest IS DISTINCT FROM OLD.c2_custody_binding_digest OR
     NEW.c2_p7_binding_digest IS DISTINCT FROM OLD.c2_p7_binding_digest OR
     NEW.c2_p7_owner_intent_id IS DISTINCT FROM OLD.c2_p7_owner_intent_id OR
     (OLD.c2_custody_binding_digest IS NOT NULL AND NEW.human_assertion_digest IS DISTINCT FROM OLD.human_assertion_digest) THEN
    RAISE EXCEPTION 'C2_CUSTODY_BINDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END $$;
DO $$
BEGIN
  IF to_regclass('elp210_candidate.leases') IS NULL THEN
    RAISE EXCEPTION 'C2_ISSUER_UPGRADE_LEASES_MISSING';
  END IF;
  IF to_regprocedure('elp210_candidate.c2_custody_binding_immutable()') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_proc actual JOIN pg_proc expected
         ON expected.oid='pg_temp.c2_issuer_reference_guard()'::regprocedure
       WHERE actual.oid=to_regprocedure('elp210_candidate.c2_custody_binding_immutable()')
         AND actual.prosrc=expected.prosrc AND actual.prolang=expected.prolang
         AND actual.prokind=expected.prokind AND actual.prorettype=expected.prorettype
         AND actual.provolatile=expected.provolatile AND actual.proparallel=expected.proparallel
         AND actual.proisstrict=expected.proisstrict AND actual.proleakproof=expected.proleakproof
         AND actual.prosecdef=false AND actual.proconfig IS NOT DISTINCT FROM expected.proconfig
     ) THEN
    RAISE EXCEPTION 'C2_ISSUER_UPGRADE_EXISTING_FUNCTION_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid='elp210_candidate.leases'::regclass
               AND attname='human_issuer' AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid='elp210_candidate.leases'::regclass
               AND attname='source_trust_digest' AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid='elp210_candidate.leases'::regclass
               AND attname='human_signing_key_digest' AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid='elp210_candidate.leases'::regclass
               AND attname='human_assertion_digest' AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid='elp210_candidate.leases'::regclass
               AND attname='c2_custody_binding_digest' AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid='elp210_candidate.leases'::regclass
               AND attname='c2_p7_binding_digest' AND NOT attisdropped)
     AND EXISTS (SELECT 1 FROM pg_attribute
             WHERE attrelid='elp210_candidate.leases'::regclass
               AND attname='c2_p7_owner_intent_id' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'C2_ISSUER_UPGRADE_ALREADY_PRESENT';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
             AND attname IN ('human_issuer','source_trust_digest','human_signing_key_digest','human_assertion_digest','c2_custody_binding_digest','c2_p7_binding_digest') AND NOT attisdropped
             AND (atttypid <> 'text'::regtype OR attnotnull OR atthasdef OR attgenerated<>'' OR attidentity<>'')) THEN
    RAISE EXCEPTION 'C2_ISSUER_UPGRADE_EXISTING_COLUMN_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
             AND attname='c2_p7_owner_intent_id' AND NOT attisdropped
             AND (atttypid <> 'uuid'::regtype OR attnotnull OR atthasdef OR attgenerated<>'' OR attidentity<>'')) THEN
    RAISE EXCEPTION 'C2_ISSUER_UPGRADE_EXISTING_COLUMN_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_attribute ref
    JOIN pg_constraint expected ON expected.conrelid=ref.attrelid AND expected.contype='c'
      AND expected.conkey=ARRAY[ref.attnum]::smallint[]
    JOIN pg_attribute actual ON actual.attrelid='elp210_candidate.leases'::regclass
      AND actual.attname=ref.attname AND NOT actual.attisdropped
    WHERE ref.attrelid='pg_temp.c2_issuer_expected_checks'::regclass AND ref.attnum>0 AND NOT ref.attisdropped
      AND NOT EXISTS (SELECT 1 FROM pg_constraint found
        WHERE found.conrelid=actual.attrelid AND found.contype='c' AND found.convalidated
          AND found.conkey=ARRAY[actual.attnum]::smallint[]
          AND pg_get_expr(found.conbin,found.conrelid)=pg_get_expr(expected.conbin,expected.conrelid))
  ) THEN RAISE EXCEPTION 'C2_ISSUER_UPGRADE_EXISTING_CONSTRAINT_INVALID'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
                 AND attname='human_issuer' AND NOT attisdropped) THEN
    ALTER TABLE elp210_candidate.leases ADD COLUMN human_issuer text
      CHECK (human_issuer IS NULL OR
        (octet_length(human_issuer) BETWEEN 1 AND 128 AND human_issuer=btrim(human_issuer)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
                 AND attname='source_trust_digest' AND NOT attisdropped) THEN
    ALTER TABLE elp210_candidate.leases ADD COLUMN source_trust_digest text
      CHECK (source_trust_digest IS NULL OR source_trust_digest ~ '^sha256:[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
                 AND attname='human_signing_key_digest' AND NOT attisdropped) THEN
    ALTER TABLE elp210_candidate.leases ADD COLUMN human_signing_key_digest text
      CHECK (human_signing_key_digest IS NULL OR human_signing_key_digest ~ '^sha256:[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
                 AND attname='human_assertion_digest' AND NOT attisdropped) THEN
    ALTER TABLE elp210_candidate.leases ADD COLUMN human_assertion_digest text
      CHECK (human_assertion_digest IS NULL OR human_assertion_digest ~ '^sha256:[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
                 AND attname='c2_custody_binding_digest' AND NOT attisdropped) THEN
    ALTER TABLE elp210_candidate.leases ADD COLUMN c2_custody_binding_digest text
      CHECK (c2_custody_binding_digest IS NULL OR c2_custody_binding_digest ~ '^sha256:[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
                 AND attname='c2_p7_binding_digest' AND NOT attisdropped) THEN
    ALTER TABLE elp210_candidate.leases ADD COLUMN c2_p7_binding_digest text
      CHECK (c2_p7_binding_digest IS NULL OR c2_p7_binding_digest ~ '^sha256:[a-f0-9]{64}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='elp210_candidate.leases'::regclass
                 AND attname='c2_p7_owner_intent_id' AND NOT attisdropped) THEN
    ALTER TABLE elp210_candidate.leases ADD COLUMN c2_p7_owner_intent_id uuid;
  END IF;
END $$;
DO $install$
BEGIN
  IF to_regprocedure('elp210_candidate.c2_custody_binding_immutable()') IS NULL THEN
    EXECUTE $create$
CREATE FUNCTION elp210_candidate.c2_custody_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF NEW.c2_custody_binding_digest IS DISTINCT FROM OLD.c2_custody_binding_digest OR
     NEW.c2_p7_binding_digest IS DISTINCT FROM OLD.c2_p7_binding_digest OR
     NEW.c2_p7_owner_intent_id IS DISTINCT FROM OLD.c2_p7_owner_intent_id OR
     (OLD.c2_custody_binding_digest IS NOT NULL AND NEW.human_assertion_digest IS DISTINCT FROM OLD.human_assertion_digest) THEN
    RAISE EXCEPTION 'C2_CUSTODY_BINDING_IMMUTABLE';
  END IF;
  RETURN NEW;
END $body$;
    $create$;
  END IF;
END $install$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='elp210_candidate.leases'::regclass
      AND tgname='c2_custody_binding_immutable' AND NOT tgisinternal) THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='elp210_candidate.leases'::regclass
        AND tgname='c2_custody_binding_immutable' AND NOT tgisinternal AND tgtype=19 AND tgenabled='O'
        AND tgfoid='elp210_candidate.c2_custody_binding_immutable()'::regprocedure) THEN
      RAISE EXCEPTION 'C2_CUSTODY_BINDING_TRIGGER_INVALID';
    END IF;
  ELSE
    CREATE TRIGGER c2_custody_binding_immutable BEFORE UPDATE ON elp210_candidate.leases
      FOR EACH ROW EXECUTE FUNCTION elp210_candidate.c2_custody_binding_immutable();
  END IF;
END $$;
DROP FUNCTION pg_temp.c2_issuer_reference_guard();
COMMIT;
