-- Up Migration
ALTER TABLE auth_sessions
  ADD COLUMN activation_id text REFERENCES activation_credentials(activation_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX auth_sessions_activation_id_idx
  ON auth_sessions (activation_id)
  WHERE activation_id IS NOT NULL;

-- Down Migration
DROP INDEX auth_sessions_activation_id_idx;

ALTER TABLE auth_sessions
  DROP COLUMN activation_id;
