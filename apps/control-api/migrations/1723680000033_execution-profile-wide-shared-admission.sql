-- Up Migration
-- R3-1: a profile budget is an AWS-HK Edge budget, not a per-operation
-- budget. Existing SOURCE state remains valid. The old PROFILE rows use the
-- retired `<source_id>:<profile_id>` key and only contain short-lived pacing
-- state; deleting them cannot remove a source row, Portal record, command,
-- projection, audit record, or cache payload.
DELETE FROM execution_shared_admission_state
WHERE scope_kind = 'PROFILE'
  AND scope_key ~ '^[a-z][a-z0-9.-]{1,127}:[A-Z][A-Z0-9_]{2,127}$';

-- Aggregate profile admission/counts now read by R3-1 diagnostics. The
-- existing `(source_id, profile_id, expires_at)` index serves operation
-- checks; this index serves the strict profile-wide cap without a table scan.
CREATE INDEX execution_shared_admission_leases_profile_expiry_idx
  ON execution_shared_admission_leases (profile_id, expires_at);

COMMENT ON TABLE execution_shared_admission_state IS
  'Portal shared source-operation and strict profile-wide pacing authority for horizontally scaled Control API replicas';

-- Down Migration
DROP INDEX IF EXISTS execution_shared_admission_leases_profile_expiry_idx;
-- Retired rows represented ephemeral throttle state only. An older binary
-- recreates its own old-format rows on its next request; they are intentionally
-- not reconstructed from a newer profile-wide token schedule.
