-- SOURCE/TEST ONLY. Independent key custody and external anti-rollback are
-- not provided by this table. No historical row is synthesized or signed.
CREATE TABLE portal_restore_original_custody.event_authentication (
  custody_id uuid NOT NULL, operation_id uuid NOT NULL,
  key_id text NOT NULL CHECK (key_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  event_mac text NOT NULL CHECK (event_mac ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY(custody_id,operation_id),
  FOREIGN KEY(custody_id,operation_id) REFERENCES portal_restore_original_custody.events(custody_id,operation_id)
);
CREATE FUNCTION portal_restore_original_custody.immutable_event_authentication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'RESTORE_CUSTODY_EVENT_AUTH_IMMUTABLE'; END $$;
CREATE TRIGGER event_authentication_immutable BEFORE UPDATE OR DELETE OR TRUNCATE
  ON portal_restore_original_custody.event_authentication FOR EACH STATEMENT
  EXECUTE FUNCTION portal_restore_original_custody.immutable_event_authentication();
REVOKE ALL ON portal_restore_original_custody.event_authentication FROM PUBLIC;
