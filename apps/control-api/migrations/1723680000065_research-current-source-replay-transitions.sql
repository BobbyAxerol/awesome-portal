-- W5b (P17): keyset index for the retained close-target transition ledger.
--
-- Observations sealed with the W5b bar ledger carry `payload.bar.transition`.
-- `GET .../current-source/replay/transitions` pages exactly those rows by the
-- original observation ordinal; this partial index keeps that read bounded
-- to the transitions instead of scanning every retained bar. It changes no
-- row, no constraint and no grant; older seals simply have no indexed rows.

CREATE INDEX current_source_rows_v1_transition_idx
  ON research.current_source_rows_v1 (workspace_id, run_id, artifact_revision, source_ordinal)
  WHERE table_kind = 'OBSERVATION' AND (payload->'bar'->>'transition') = 'true';

COMMENT ON INDEX research.current_source_rows_v1_transition_idx IS
  'W5b P17 transition ledger keyset: OBSERVATION rows whose retained bar block records a target transition.';

SELECT 1;
