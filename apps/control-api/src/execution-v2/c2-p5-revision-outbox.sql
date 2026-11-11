-- SOURCE-ONLY CANDIDATE, never a numbered/runtime migration. Installation
-- begins capture at the recorded baseline; earlier changes are NOT RECORDED.
-- Overflow is represented as an explicit unreconciled range, NOT as delivered
-- per-revision notices; issuance is fenced while authority/revoke can continue.
-- With the present producer every recorded reason is unavailable; a change
-- therefore also fences issuance pending qualified provenance and delivery.
-- Definer ownership MUST be a reviewed NOLOGIN role with minimal privileges;
-- never install with a superuser as owner. Runtime needs no direct mutation of
-- candidate tables. A separate read-only role is required for the reader.
-- Still requires complete issuer coverage, ACL, source and DR qualification.
BEGIN;
LOCK TABLE elp210_candidate.authority IN SHARE ROW EXCLUSIVE MODE;
CREATE SCHEMA elp210_c2_revision_candidate;
REVOKE ALL ON SCHEMA elp210_c2_revision_candidate FROM PUBLIC;
CREATE TABLE elp210_c2_revision_candidate.baseline (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  revision bigint NOT NULL CHECK (revision BETWEEN 0 AND 9007199254740991),
  history_availability text NOT NULL CHECK (history_availability='PREINSTALL_HISTORY_NOT_RECORDED')
);
INSERT INTO elp210_c2_revision_candidate.baseline(singleton,revision,history_availability)
  SELECT true,revision,'PREINSTALL_HISTORY_NOT_RECORDED' FROM elp210_candidate.authority WHERE singleton;
DO $$ BEGIN
  IF (SELECT count(*) FROM elp210_c2_revision_candidate.baseline) <> 1 THEN
    RAISE EXCEPTION 'C2_P5_AUTHORITY_BASELINE_MISSING'; END IF;
END $$;
CREATE TABLE elp210_c2_revision_candidate.events (
  revision bigint PRIMARY KEY CHECK (revision BETWEEN 1 AND 9007199254740991),
  previous_revision bigint NOT NULL CHECK (previous_revision >= 0 AND previous_revision < revision),
  authority_scope text NOT NULL CHECK (authority_scope='GLOBAL'),
  reason_availability text NOT NULL CHECK (reason_availability='NOT_RECORDED'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE elp210_c2_revision_candidate.overflow (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  first_previous_revision bigint NOT NULL,
  first_revision bigint NOT NULL,
  last_revision bigint NOT NULL,
  change_count bigint NOT NULL CHECK (change_count >= 1),
  count_saturated boolean NOT NULL DEFAULT false,
  continuity_unknown boolean NOT NULL DEFAULT false,
  disposition text NOT NULL CHECK (disposition='REVISION_DETAIL_OVERFLOW_NOT_DELIVERED'),
  CHECK (first_previous_revision>=0 AND first_revision>first_previous_revision AND last_revision>=first_revision)
);
CREATE FUNCTION elp210_c2_revision_candidate.capture() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_SCHEMA<>'elp210_candidate' OR TG_TABLE_NAME<>'authority' OR TG_OP<>'UPDATE' THEN
    RAISE EXCEPTION 'C2_P5_TRIGGER_TARGET_INVALID'; END IF;
  IF NEW.revision=OLD.revision THEN RETURN NEW; END IF;
  IF NEW.revision<OLD.revision THEN RAISE EXCEPTION 'C2_P5_REVISION_REGRESSION'; END IF;
  IF EXISTS(SELECT 1 FROM elp210_c2_revision_candidate.overflow WHERE singleton) THEN
    UPDATE elp210_c2_revision_candidate.overflow SET last_revision=NEW.revision,
      continuity_unknown=continuity_unknown OR last_revision<>OLD.revision,
      count_saturated=count_saturated OR change_count=9223372036854775807,
      change_count=CASE WHEN change_count=9223372036854775807 THEN change_count ELSE change_count+1 END
      WHERE singleton;
  ELSIF (SELECT count(*) FROM elp210_c2_revision_candidate.events)>=2048 THEN
    INSERT INTO elp210_c2_revision_candidate.overflow(singleton,first_previous_revision,first_revision,last_revision,change_count,disposition)
      VALUES(true,OLD.revision,NEW.revision,NEW.revision,1,'REVISION_DETAIL_OVERFLOW_NOT_DELIVERED');
  ELSE
    INSERT INTO elp210_c2_revision_candidate.events(revision,previous_revision,authority_scope,reason_availability)
      VALUES(NEW.revision,OLD.revision,'GLOBAL','NOT_RECORDED');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c2_p5_revision_capture AFTER UPDATE OF revision ON elp210_candidate.authority
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_revision_candidate.capture();
CREATE FUNCTION elp210_c2_revision_candidate.immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'C2_P5_OUTBOX_IMMUTABLE'; END $$;
CREATE TRIGGER p5_baseline_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_c2_revision_candidate.baseline
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_revision_candidate.immutable();
CREATE TRIGGER p5_events_immutable BEFORE UPDATE OR DELETE OR TRUNCATE ON elp210_c2_revision_candidate.events
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_revision_candidate.immutable();
CREATE TRIGGER p5_overflow_no_delete BEFORE DELETE OR TRUNCATE ON elp210_c2_revision_candidate.overflow
  FOR EACH STATEMENT EXECUTE FUNCTION elp210_c2_revision_candidate.immutable();
CREATE FUNCTION elp210_c2_revision_candidate.protect_overflow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.singleton IS DISTINCT FROM OLD.singleton OR
     NEW.first_previous_revision IS DISTINCT FROM OLD.first_previous_revision OR
     NEW.first_revision IS DISTINCT FROM OLD.first_revision OR NEW.disposition IS DISTINCT FROM OLD.disposition OR
     NEW.last_revision<=OLD.last_revision OR NEW.change_count<OLD.change_count OR
     (OLD.count_saturated AND NOT NEW.count_saturated) OR (OLD.continuity_unknown AND NOT NEW.continuity_unknown)
    THEN RAISE EXCEPTION 'C2_P5_OVERFLOW_IMMUTABLE'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER p5_overflow_guard BEFORE UPDATE ON elp210_c2_revision_candidate.overflow
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_revision_candidate.protect_overflow();
-- Existing issuer writes a lease before returning a C2 token. This fence is
-- only a candidate until every token-producing route is independently audited.
CREATE FUNCTION elp210_c2_revision_candidate.fence_issue() RETURNS trigger LANGUAGE plpgsql
  SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF TG_TABLE_SCHEMA<>'elp210_candidate' OR TG_TABLE_NAME NOT IN ('leases','native_read_obligations') OR TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'C2_P5_TRIGGER_TARGET_INVALID'; END IF;
  PERFORM 1 FROM elp210_candidate.authority WHERE singleton FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'C2_P5_AUTHORITY_REQUIRED'; END IF;
  IF EXISTS(SELECT 1 FROM elp210_c2_revision_candidate.overflow WHERE singleton) THEN
    RAISE EXCEPTION 'C2_P5_REVISION_OVERFLOW_ISSUANCE_FENCED'; END IF;
  IF EXISTS(SELECT 1 FROM elp210_c2_revision_candidate.events WHERE reason_availability='NOT_RECORDED') THEN
    RAISE EXCEPTION 'C2_P5_REASON_NOT_RECORDED_ISSUANCE_FENCED'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER c2_p5_fence_issue BEFORE INSERT ON elp210_candidate.leases
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_revision_candidate.fence_issue();
CREATE TRIGGER c2_p5_fence_native_admission BEFORE INSERT ON elp210_candidate.native_read_obligations
  FOR EACH ROW EXECUTE FUNCTION elp210_c2_revision_candidate.fence_issue();
REVOKE ALL ON ALL TABLES IN SCHEMA elp210_c2_revision_candidate FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA elp210_c2_revision_candidate FROM PUBLIC;
COMMIT;
