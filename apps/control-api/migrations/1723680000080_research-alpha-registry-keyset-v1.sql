-- B3 CG-FG-S14-04: one workspace-scoped descending index for the
-- 200-row Alpha registry keyset. Existing Alpha, source and binding rows
-- remain untouched; this is an additive read-path index only.
CREATE INDEX IF NOT EXISTS research_alpha_versions_registry_keyset_idx
  ON research.alpha_versions (workspace_id, registered_at DESC, alpha_version_id DESC)
  INCLUDE (alpha_id, source_file_ref);
