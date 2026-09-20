-- Research Loop P07 · single-file Alpha import and immutable version binding.
--
-- This migration extends the P03 Research schema only.  The Control API owns
-- source-byte custody, gate receipts, version identity and activation CAS;
-- Python is a private AST/definition-analysis adapter and receives no
-- database credential.  No Execution-owned relation, broker, CLI, or
-- QuantBT runtime process is changed here.

-- `source_file_ref` is an opaque, workspace-scoped temporary capability. The
-- source bytes are retained only when an immutable alpha version references
-- them; unbound expired sources are eligible for the bounded P07 cleanup.
CREATE TABLE research.import_sources (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  source_file_ref       text NOT NULL
                        CHECK (source_file_ref ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$'),
  actor_user_id         text NOT NULL REFERENCES portal_users(user_id),
  original_filename     text NOT NULL
                        CHECK (original_filename ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}[.]py$'),
  source_bytes          bytea NOT NULL
                        CHECK (octet_length(source_bytes) BETWEEN 1 AND 262144),
  source_digest         text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  source_schema_version text NOT NULL CHECK (source_schema_version = 'research.alpha-source.v1'),
  analysis_digest       text NOT NULL CHECK (analysis_digest ~ '^[0-9a-f]{64}$'),
  declared_contract     jsonb NOT NULL CHECK (jsonb_typeof(declared_contract) = 'object'),
  parsed_mirror         jsonb NOT NULL CHECK (jsonb_typeof(parsed_mirror) = 'array'),
  expires_at            timestamptz NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_file_ref),
  UNIQUE (workspace_id, source_file_ref, actor_user_id),
  CHECK (expires_at > created_at),
  CHECK (octet_length(declared_contract::text) <= 65536),
  CHECK (octet_length(parsed_mirror::text) <= 32768)
);

CREATE INDEX research_import_sources_expiry_idx
  ON research.import_sources (workspace_id, expires_at, source_file_ref);

-- P03 created this table as a forward-compatible placeholder.  P07 records
-- the analyzer-result identity as well so a receipt cannot be reused after a
-- parser/contract revision changes its meaning.
ALTER TABLE research.import_sessions
  ADD COLUMN IF NOT EXISTS source_analysis_digest text
    CHECK (source_analysis_digest IS NULL OR source_analysis_digest ~ '^[0-9a-f]{64}$');

CREATE INDEX research_import_sessions_p07_lookup_idx
  ON research.import_sessions (workspace_id, actor_user_id, source_file_ref, expires_at DESC);

ALTER TABLE research.alpha_versions
  ADD COLUMN IF NOT EXISTS source_file_ref text;

ALTER TABLE research.alpha_versions
  ADD CONSTRAINT research_alpha_versions_p07_source_file_ref_check
  CHECK (
    source_file_ref IS NULL OR
    source_file_ref ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$'
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'research_alpha_versions_p07_source_fkey'
  ) THEN
    ALTER TABLE research.alpha_versions
      ADD CONSTRAINT research_alpha_versions_p07_source_fkey
      FOREIGN KEY (workspace_id, source_file_ref)
      REFERENCES research.import_sources(workspace_id, source_file_ref)
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- One exact source digest may become one AlphaVersion in one workspace.  The
-- claim is a database fact, not merely a preflight query, so concurrent
-- registrations cannot attach identical bytes to different alpha identities.
CREATE TABLE research.alpha_digest_claims (
  workspace_id      text NOT NULL REFERENCES workspaces(workspace_id),
  source_digest     text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
  alpha_id          text NOT NULL,
  alpha_version_id  text NOT NULL,
  claimed_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, source_digest),
  FOREIGN KEY (workspace_id, alpha_id)
    REFERENCES research.alphas(workspace_id, alpha_id),
  FOREIGN KEY (workspace_id, alpha_version_id)
    REFERENCES research.alpha_versions(workspace_id, alpha_version_id)
);

-- Add the P07 source ref to P03's existing immutable-version trigger.  NULL
-- remains valid for legacy P03 registrations; P07 always supplies a non-NULL
-- value and can therefore never rebind bytes after registration.
CREATE OR REPLACE FUNCTION research.protect_alpha_version_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.alpha_version_id IS DISTINCT FROM OLD.alpha_version_id
     OR NEW.alpha_id IS DISTINCT FROM OLD.alpha_id
     OR NEW.code_digest IS DISTINCT FROM OLD.code_digest
     OR NEW.entrypoint IS DISTINCT FROM OLD.entrypoint
     OR NEW.dependency_ref IS DISTINCT FROM OLD.dependency_ref
     OR NEW.declared_contract IS DISTINCT FROM OLD.declared_contract
     OR NEW.source_file_ref IS DISTINCT FROM OLD.source_file_ref THEN
    RAISE EXCEPTION 'alpha version identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION research.protect_import_source_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'research import source is immutable' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER research_import_sources_immutable_guard
BEFORE UPDATE ON research.import_sources
FOR EACH ROW EXECUTE FUNCTION research.protect_import_source_identity();

REVOKE ALL ON FUNCTION research.protect_import_source_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION research.protect_alpha_version_identity() FROM PUBLIC;

-- P07 keeps the runtime role least-privilege.  It can create/read bounded
-- source and receipt records, delete only expired unbound temporary source
-- rows through the fixed repository query, and perform the two reviewed
-- lifecycle CAS updates. It still has no DELETE on alpha/audit/evidence rows,
-- no DDL, and no Execution-table authority.
GRANT SELECT, INSERT, DELETE ON research.import_sources TO portal_research_runtime;
GRANT SELECT, INSERT, DELETE ON research.import_sessions TO portal_research_runtime;
GRANT SELECT, INSERT ON research.alpha_digest_claims TO portal_research_runtime;
GRANT UPDATE (active_version_id, revision, updated_at)
  ON research.alphas TO portal_research_runtime;
GRANT UPDATE (lifecycle_state, metadata_revision)
  ON research.alpha_versions TO portal_research_runtime;

COMMENT ON TABLE research.import_sources IS
  'P07 immutable single-file Python source custody. Browser never receives a raw path; unbound expired bytes are purgeable.';
COMMENT ON TABLE research.alpha_digest_claims IS
  'P07 workspace-scoped exact source-digest uniqueness claim for immutable Research AlphaVersion identity.';
COMMENT ON COLUMN research.alpha_versions.source_file_ref IS
  'P07 immutable reference to the exact retained single-file source bytes; NULL only for pre-P07 compatibility rows.';

-- Down Migration
-- Import receipts and code/version provenance are audit evidence. Reader/image
-- rollback disables the P07 routes; it never deletes durable Research facts.
SELECT 1;
