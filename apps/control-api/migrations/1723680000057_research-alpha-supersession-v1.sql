-- RF-03 / CG-P07-05: capture the predecessor at registration, not read time.
-- Historical versions predate this fact; NULL cannot distinguish unknown from none.
ALTER TABLE research.alpha_versions
  ADD COLUMN supersedes_alpha_version_id text,
  ADD COLUMN supersedes_recorded boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT research_alpha_supersedes_known_check
    CHECK (supersedes_recorded OR supersedes_alpha_version_id IS NULL),
  ADD CONSTRAINT research_alpha_supersedes_not_self_check
    CHECK (supersedes_alpha_version_id IS DISTINCT FROM alpha_version_id),
  ADD CONSTRAINT research_alpha_supersedes_same_alpha_fkey
    FOREIGN KEY (workspace_id, alpha_id, supersedes_alpha_version_id)
    REFERENCES research.alpha_versions(workspace_id, alpha_id, alpha_version_id)
    ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION research.protect_alpha_version_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.alpha_version_id IS DISTINCT FROM OLD.alpha_version_id
     OR NEW.alpha_id IS DISTINCT FROM OLD.alpha_id
     OR NEW.code_digest IS DISTINCT FROM OLD.code_digest
     OR NEW.entrypoint IS DISTINCT FROM OLD.entrypoint
     OR NEW.dependency_ref IS DISTINCT FROM OLD.dependency_ref
     OR NEW.declared_contract IS DISTINCT FROM OLD.declared_contract
     OR NEW.source_file_ref IS DISTINCT FROM OLD.source_file_ref
     OR NEW.supersedes_alpha_version_id IS DISTINCT FROM OLD.supersedes_alpha_version_id
     OR NEW.supersedes_recorded IS DISTINCT FROM OLD.supersedes_recorded THEN
    RAISE EXCEPTION 'alpha version identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION research.protect_alpha_version_identity() FROM PUBLIC;
COMMENT ON COLUMN research.alpha_versions.supersedes_alpha_version_id IS
  'Immutable active predecessor captured in registration transaction.';
COMMENT ON COLUMN research.alpha_versions.supersedes_recorded IS
  'False for historical versions whose predecessor was not recorded.';
