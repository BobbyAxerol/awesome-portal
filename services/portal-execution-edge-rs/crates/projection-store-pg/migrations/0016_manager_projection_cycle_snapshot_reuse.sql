-- A semantic snapshot may be reused by a later poll cycle when only another
-- entity kind changed. The commit evidence is therefore cycle membership,
-- while portal_projection.snapshots remains the unique semantic snapshot.
ALTER TABLE portal_projection.manager_projection_commits
  DROP CONSTRAINT manager_projection_commits_pkey;

ALTER TABLE portal_projection.manager_projection_commits
  ADD CONSTRAINT manager_projection_commits_pkey
  PRIMARY KEY (epoch_id, cycle_id, entity_kind);

CREATE INDEX idx_manager_projection_commits_snapshot
  ON portal_projection.manager_projection_commits (epoch_id, snapshot_id);

COMMENT ON TABLE portal_projection.manager_projection_commits IS
  'Immutable per-cycle entity-kind membership for semantic N24 snapshots; unchanged snapshots may be referenced by multiple cycles';
