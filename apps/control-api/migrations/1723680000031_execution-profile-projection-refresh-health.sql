-- Up Migration
--
-- BE-R2-5 keeps this deliberately small operational record beside the
-- committed local projection.  It is *not* a Trading System Event ledger,
-- source cursor store, or browser-facing data model.  Its only purpose is to
-- make a bounded source-recovery decision survive a Control API restart so a
-- restart cannot turn a 429/502/503 incident into an immediate retry burst.
CREATE TABLE execution_profile_projection_refresh_health (
  workspace_id text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('paper', 'sandbox', 'live')),
  profile_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('HEALTHY', 'RECOVERING')),
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  last_failure_code text,
  last_failure_at timestamptz,
  retry_not_before timestamptz,
  last_recovered_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, environment, profile_id),
  CHECK (profile_id LIKE upper(environment) || '\_%' ESCAPE '\'),
  CHECK (
    (state = 'HEALTHY' AND retry_not_before IS NULL)
    OR
    (state = 'RECOVERING' AND retry_not_before IS NOT NULL AND last_failure_at IS NOT NULL)
  )
);

CREATE INDEX execution_profile_projection_refresh_health_retry_idx
  ON execution_profile_projection_refresh_health (state, retry_not_before)
  WHERE state = 'RECOVERING';

-- Down Migration
DROP TABLE IF EXISTS execution_profile_projection_refresh_health;
