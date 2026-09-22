-- Research Loop P21 · Release Candidate composer and immutable local evidence
-- pack.  P21 creates no Execution/Approval request: a local seal is an
-- immutable Portal fact, with delivery/approval state explicitly separate for
-- P22 to own later.

CREATE TABLE research.release_candidate_drafts_v1 (
  workspace_id                text NOT NULL REFERENCES workspaces(workspace_id),
  run_id                      text NOT NULL,
  actor_user_id               text NOT NULL REFERENCES portal_users(user_id),
  draft_id                    text NOT NULL CHECK (draft_id ~ '^rcd_[0-9A-HJKMNP-TV-Z]{26}$'),
  source_fingerprint          text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  known_limitations           text NULL CHECK (known_limitations IS NULL OR octet_length(known_limitations) BETWEEN 1 AND 4096),
  proposed_use_restrictions   text NULL CHECK (proposed_use_restrictions IS NULL OR octet_length(proposed_use_restrictions) BETWEEN 1 AND 4096),
  revision                    bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, run_id, actor_user_id),
  UNIQUE (workspace_id, draft_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id),
  CHECK (known_limitations IS NOT NULL OR proposed_use_restrictions IS NOT NULL)
);

CREATE INDEX research_release_candidate_drafts_v1_actor_idx
  ON research.release_candidate_drafts_v1 (workspace_id, actor_user_id, updated_at DESC);

CREATE FUNCTION research.guard_release_candidate_draft_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'release candidate draft is retained for audit' USING ERRCODE = '55000';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.run_id IS DISTINCT FROM OLD.run_id
     OR NEW.actor_user_id IS DISTINCT FROM OLD.actor_user_id
     OR NEW.draft_id IS DISTINCT FROM OLD.draft_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'release candidate draft identity is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'release candidate draft revision must advance exactly once' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_release_candidate_drafts_v1_guard
BEFORE UPDATE OR DELETE ON research.release_candidate_drafts_v1
FOR EACH ROW EXECUTE FUNCTION research.guard_release_candidate_draft_v1();

CREATE TABLE research.release_candidate_packs_v1 (
  workspace_id              text NOT NULL,
  release_candidate_id      text NOT NULL,
  run_id                    text NOT NULL,
  draft_id                  text NOT NULL,
  pack_digest               text NOT NULL CHECK (pack_digest ~ '^[0-9a-f]{64}$'),
  source_fingerprint        text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  schema_version            text NOT NULL CHECK (schema_version = 'research.release-candidate-pack.v1'),
  frozen_core               jsonb NOT NULL CHECK (jsonb_typeof(frozen_core) = 'object' AND octet_length(frozen_core::text) <= 262144),
  sealed_by_user_id         text NOT NULL REFERENCES portal_users(user_id),
  sealed_at                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, release_candidate_id),
  UNIQUE (workspace_id, pack_digest),
  -- A lost response or client retry must return the same locally sealed
  -- record. Different actors can still compose independent declarations.
  UNIQUE (workspace_id, draft_id, source_fingerprint),
  FOREIGN KEY (workspace_id, release_candidate_id)
    REFERENCES research.release_candidates(workspace_id, release_candidate_id),
  FOREIGN KEY (workspace_id, draft_id)
    REFERENCES research.release_candidate_drafts_v1(workspace_id, draft_id),
  FOREIGN KEY (workspace_id, run_id)
    REFERENCES research.runs(workspace_id, run_id)
);

CREATE INDEX research_release_candidate_packs_v1_run_idx
  ON research.release_candidate_packs_v1 (workspace_id, run_id, sealed_at DESC, release_candidate_id DESC);

CREATE TRIGGER research_release_candidate_packs_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.release_candidate_packs_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

-- This is deliberately a separate lifecycle plane.  P21 writes only the
-- first row (`NOT_DELIVERED` / `NOT_APPROVED`); P22 receives a narrow,
-- reviewed transition grant later.  A pack digest cannot be altered by an
-- acknowledgement or an integrity warning.
CREATE TABLE research.release_candidate_delivery_states_v1 (
  workspace_id              text NOT NULL,
  release_candidate_id      text NOT NULL,
  delivery_state            text NOT NULL CHECK (delivery_state IN ('NOT_DELIVERED', 'PENDING', 'DELIVERED', 'UNKNOWN')),
  approval_state            text NOT NULL CHECK (approval_state IN ('NOT_APPROVED', 'PENDING', 'APPROVED', 'REJECTED', 'UNKNOWN')),
  downstream_receipt_digest text NULL CHECK (downstream_receipt_digest IS NULL OR downstream_receipt_digest ~ '^[0-9a-f]{64}$'),
  downstream_updated_at     timestamptz NULL,
  PRIMARY KEY (workspace_id, release_candidate_id),
  FOREIGN KEY (workspace_id, release_candidate_id)
    REFERENCES research.release_candidate_packs_v1(workspace_id, release_candidate_id),
  CHECK ((delivery_state = 'NOT_DELIVERED') = (downstream_receipt_digest IS NULL)),
  CHECK ((delivery_state = 'NOT_DELIVERED') = (downstream_updated_at IS NULL))
);

CREATE FUNCTION research.guard_release_candidate_delivery_state_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'release candidate delivery state is retained for audit' USING ERRCODE = '55000';
  END IF;
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.release_candidate_id IS DISTINCT FROM OLD.release_candidate_id THEN
    RAISE EXCEPTION 'release candidate delivery identity is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_release_candidate_delivery_states_v1_guard
BEFORE UPDATE OR DELETE ON research.release_candidate_delivery_states_v1
FOR EACH ROW EXECUTE FUNCTION research.guard_release_candidate_delivery_state_v1();

-- Generic metadata pins make the entire source relationship inspectable even
-- when a source is a bounded Portal projection rather than a P05 artifact.
-- P05 artifacts additionally receive their established RELEASE_CANDIDATE pin.
CREATE TABLE research.release_candidate_retention_pins_v1 (
  workspace_id              text NOT NULL,
  release_candidate_id      text NOT NULL,
  pin_kind                  text NOT NULL CHECK (pin_kind IN (
                              'ALPHA_VERSION', 'RUN', 'REPORT', 'EVIDENCE',
                              'SPLIT', 'SELECTION', 'CURRENT_SOURCE', 'ARTIFACT'
                            )),
  source_ref                text NOT NULL CHECK (length(trim(source_ref)) BETWEEN 1 AND 256),
  source_digest             text NULL CHECK (source_digest IS NULL OR source_digest ~ '^[0-9a-f]{64}$'),
  created_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, release_candidate_id, pin_kind, source_ref),
  FOREIGN KEY (workspace_id, release_candidate_id)
    REFERENCES research.release_candidate_packs_v1(workspace_id, release_candidate_id)
);

CREATE TRIGGER research_release_candidate_retention_pins_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.release_candidate_retention_pins_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

REVOKE ALL ON FUNCTION research.guard_release_candidate_draft_v1() FROM PUBLIC;
REVOKE ALL ON FUNCTION research.guard_release_candidate_delivery_state_v1() FROM PUBLIC;
REVOKE ALL ON research.release_candidate_drafts_v1,
  research.release_candidate_packs_v1,
  research.release_candidate_delivery_states_v1,
  research.release_candidate_retention_pins_v1 FROM PUBLIC;

-- P21 can create/read immutable drafts and packs.  It may edit only its own
-- draft's explicit declaration/revision fields; it deliberately receives no
-- UPDATE grant on local-seal delivery/approval state.
GRANT SELECT, INSERT ON research.release_candidate_drafts_v1 TO portal_research_runtime;
GRANT UPDATE (source_fingerprint, known_limitations, proposed_use_restrictions, revision, updated_at)
  ON research.release_candidate_drafts_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.release_candidate_packs_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.release_candidate_delivery_states_v1 TO portal_research_runtime;
GRANT SELECT, INSERT ON research.release_candidate_retention_pins_v1 TO portal_research_runtime;
GRANT INSERT ON research.release_candidates TO portal_research_runtime;

COMMENT ON TABLE research.release_candidate_drafts_v1 IS
  'P21 actor-local CAS declarations for Screen 11. Reads create no row; a source-fingerprint mismatch never overwrites a newer source pack.';
COMMENT ON TABLE research.release_candidate_packs_v1 IS
  'P21 immutable Portal-local 17-field/12-item release-candidate evidence pack. A local seal is not downstream delivery or approval.';
COMMENT ON TABLE research.release_candidate_delivery_states_v1 IS
  'P21/P22 separate delivery/approval lifecycle. P21 inserts NOT_DELIVERED/NOT_APPROVED only; P22 owns later transitions.';
COMMENT ON TABLE research.release_candidate_retention_pins_v1 IS
  'P21 immutable inspectable metadata pins for all source relations used by a sealed Release Candidate.';

-- Rollback is feature-dark only. Local evidence packs, pins and local seal
-- state are audit facts and must remain available to later recovery/P22.
SELECT 1;
