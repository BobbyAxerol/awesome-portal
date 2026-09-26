-- Research Loop P22 · server-owned R1 settlement reconciliation.
--
-- The publication receipt written by migration 070 is immutable and records
-- the R1 state observed when publication completed.  A later Governance
-- decision must therefore append a settlement rather than rewrite that
-- receipt.  This migration couples the append to the exact R1 transaction by
-- approval_version; no browser poll, public reconcile route or worker lease is
-- required.

CREATE TABLE research.p22_approval_settlements_v1 (
  workspace_id          text NOT NULL REFERENCES workspaces(workspace_id),
  release_candidate_id  text NOT NULL,
  approval_id           text NOT NULL REFERENCES governance_approval_requests(approval_id) ON DELETE RESTRICT,
  approval_version      integer NOT NULL CHECK (approval_version >= 1),
  approval_status       text NOT NULL CHECK (approval_status IN (
                          'PENDING','APPROVED','APPROVED_WITH_CONDITION',
                          'DENIED','CHANGES_REQUESTED','EXPIRED'
                        )),
  quorum_met            integer NOT NULL CHECK (quorum_met >= 0),
  quorum_required       integer NOT NULL CHECK (quorum_required BETWEEN 1 AND 8),
  evidence_set_hash     text NOT NULL CHECK (evidence_set_hash ~ '^sha256:[0-9a-f]{64}$'),
  source_fact_digest    text NOT NULL CHECK (source_fact_digest ~ '^[0-9a-f]{64}$'),
  settled_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, release_candidate_id, approval_version),
  UNIQUE (workspace_id, approval_id, approval_version),
  FOREIGN KEY (workspace_id, release_candidate_id)
    REFERENCES research.p22_promotion_pick_receipts_v1(workspace_id, release_candidate_id)
    ON DELETE RESTRICT,
  CHECK (quorum_met <= quorum_required)
);

CREATE TRIGGER research_p22_approval_settlements_v1_immutable_guard
BEFORE UPDATE OR DELETE ON research.p22_approval_settlements_v1
FOR EACH ROW EXECUTE FUNCTION research.prevent_immutable_log_mutation();

CREATE OR REPLACE FUNCTION research.p22_reconcile_approval(
  p_workspace_id text,
  p_approval_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  approval public.governance_approval_requests%ROWTYPE;
  receipt research.p22_promotion_pick_receipts_v1%ROWTYPE;
  existing research.p22_approval_settlements_v1%ROWTYPE;
  source_attempt_id text;
  delivery_approval_state text;
BEGIN
  SELECT * INTO approval
    FROM public.governance_approval_requests
   WHERE workspace_id = p_workspace_id AND approval_id = p_approval_id
     AND gate = 'R1';
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT * INTO receipt
    FROM research.p22_promotion_pick_receipts_v1
   WHERE workspace_id = p_workspace_id AND approval_id = p_approval_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF approval.evidence_set_hash IS DISTINCT FROM receipt.evidence_set_hash THEN
    RAISE EXCEPTION 'P22 settlement evidence changed after publication'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO research.p22_approval_settlements_v1
    (workspace_id, release_candidate_id, approval_id, approval_version,
     approval_status, quorum_met, quorum_required, evidence_set_hash,
     source_fact_digest, settled_at)
  VALUES
    (p_workspace_id, receipt.release_candidate_id, p_approval_id,
     approval.approval_version, approval.status, approval.quorum_met,
     approval.quorum_required, approval.evidence_set_hash,
     receipt.fact_digest, approval.updated_at)
  ON CONFLICT (workspace_id, release_candidate_id, approval_version) DO NOTHING;

  SELECT * INTO existing
    FROM research.p22_approval_settlements_v1
   WHERE workspace_id = p_workspace_id
     AND release_candidate_id = receipt.release_candidate_id
     AND approval_version = approval.approval_version;
  IF NOT FOUND
     OR existing.approval_id IS DISTINCT FROM p_approval_id
     OR existing.approval_status IS DISTINCT FROM approval.status
     OR existing.quorum_met IS DISTINCT FROM approval.quorum_met
     OR existing.quorum_required IS DISTINCT FROM approval.quorum_required
     OR existing.evidence_set_hash IS DISTINCT FROM approval.evidence_set_hash
     OR existing.source_fact_digest IS DISTINCT FROM receipt.fact_digest THEN
    RAISE EXCEPTION 'P22 approval version replay conflicts with immutable settlement'
      USING ERRCODE = '23514';
  END IF;

  delivery_approval_state := CASE
    WHEN approval.status IN ('APPROVED','APPROVED_WITH_CONDITION') THEN 'APPROVED'
    WHEN approval.status = 'PENDING' THEN 'PENDING'
    ELSE 'REJECTED'
  END;
  UPDATE research.release_candidate_delivery_states_v1
     SET approval_state = delivery_approval_state,
         downstream_updated_at = greatest(coalesce(downstream_updated_at, approval.updated_at), approval.updated_at)
   WHERE workspace_id = p_workspace_id
     AND release_candidate_id = receipt.release_candidate_id
     AND delivery_state = 'DELIVERED';

  IF approval.status IN ('APPROVED','APPROVED_WITH_CONDITION') THEN
    SELECT attempt_id INTO source_attempt_id
      FROM research.runs
     WHERE workspace_id = p_workspace_id AND run_id = receipt.run_id
       AND relationship_kind = 'AUDIT_OF_SELECTION' AND state = 'READY';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'P22 approved pick no longer names a READY audit child'
        USING ERRCODE = '23514';
    END IF;
    PERFORM research.p22_record_promotion_pick(
      p_workspace_id, receipt.release_candidate_id, p_approval_id,
      receipt.alpha_version_id, source_attempt_id, receipt.run_id,
      receipt.selection_id, receipt.selected_trial_id,
      receipt.selection_sequence, receipt.artifact_id,
      receipt.artifact_manifest_digest, receipt.pack_digest,
      receipt.evidence_set_hash, approval.status, receipt.fact_digest,
      receipt.actor_user_id
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION research.p22_reconcile_approval_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
BEGIN
  PERFORM research.p22_reconcile_approval(NEW.workspace_id, NEW.approval_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER research_p22_receipt_settlement_after_insert
AFTER INSERT ON research.p22_promotion_pick_receipts_v1
FOR EACH ROW
EXECUTE FUNCTION research.p22_reconcile_approval_trigger();

CREATE TRIGGER governance_r1_p22_settlement_after_update
AFTER UPDATE OF status, approval_version, quorum_met ON governance_approval_requests
FOR EACH ROW
WHEN (NEW.gate = 'R1' AND (
  OLD.status IS DISTINCT FROM NEW.status
  OR OLD.approval_version IS DISTINCT FROM NEW.approval_version
  OR OLD.quorum_met IS DISTINCT FROM NEW.quorum_met
))
EXECUTE FUNCTION research.p22_reconcile_approval_trigger();

-- Backfill the exact current approval version for publications that existed
-- before this trigger was installed.  This is idempotent and bounded to P22
-- receipts; it does not scan or mutate unrelated Governance records.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT workspace_id, approval_id
      FROM research.p22_promotion_pick_receipts_v1
  LOOP
    PERFORM research.p22_reconcile_approval(item.workspace_id, item.approval_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION research.p22_reconcile_approval(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION research.p22_reconcile_approval_trigger() FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON research.p22_approval_settlements_v1 FROM portal_research_runtime;
GRANT SELECT ON research.p22_approval_settlements_v1 TO portal_research_runtime;

COMMENT ON TABLE research.p22_approval_settlements_v1 IS
  'Append-only P22 R1 settlement ledger keyed by exact approval_version; the original publication receipt remains immutable.';
COMMENT ON FUNCTION research.p22_reconcile_approval IS
  'Server-owned idempotent P22 reconciliation. Reads the exact R1 version, advances delivery state and writes the P19 pick only after approval.';

-- Rollback is feature-dark only. Settlement and promotion facts are retained.
SELECT 1;
