-- C-P3-3 candidate-only additive installer. Apply after the unmounted
-- current-human-candidate.sql in a disposable correctness DB only.
-- NOT a numbered production migration; no runtime installation is authorized.
BEGIN;
CREATE OR REPLACE FUNCTION elp210_candidate.lease_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE elp210_candidate.authority SET lease_epoch=lease_epoch+1 WHERE singleton;
  IF TG_OP='INSERT' AND EXISTS(SELECT 1 FROM elp210_candidate.native_read_obligations WHERE lease_id=NEW.lease_id)
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_CROSS_FAMILY_ID_CONFLICT'; END IF;
  IF TG_OP='UPDATE' THEN
    IF (to_jsonb(NEW)-ARRAY['phase','attempt_id','terminal_receipt_digest']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['phase','attempt_id','terminal_receipt_digest'])
      OR NOT ((OLD.phase='ISSUED' AND NEW.phase IN ('ENTERED','RETIRED','UNKNOWN'))
        OR (OLD.phase='RETIRED' AND NEW.phase='UNKNOWN' AND NOT EXISTS
          (SELECT 1 FROM elp210_candidate.events WHERE lease_id=OLD.lease_id AND phase='SOURCE_ROLLED_BACK_UNENTERED'))
        OR (OLD.phase='ENTERED' AND NEW.phase IN ('UNKNOWN','COMMITTED','ROLLED_BACK'))
        OR (OLD.phase='UNKNOWN' AND NEW.phase IN ('COMMITTED','ROLLED_BACK')))
      OR (OLD.attempt_id IS NOT NULL AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id)
      OR (OLD.phase='UNKNOWN' AND NEW.phase='COMMITTED' AND NOT EXISTS
        (SELECT 1 FROM elp210_candidate.events WHERE lease_id=OLD.lease_id AND phase='ENTERED' AND attempt_id=OLD.attempt_id))
    THEN RAISE EXCEPTION 'CURRENT_HUMAN_TRANSITION_INVALID'; END IF;
  END IF;
  INSERT INTO elp210_candidate.events(lease_id,phase,attempt_id,terminal_receipt_digest)
    VALUES(NEW.lease_id,NEW.phase,NEW.attempt_id,NEW.terminal_receipt_digest);
  RETURN NEW;
END $$;
COMMIT;
