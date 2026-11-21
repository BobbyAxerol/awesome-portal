-- G-25 · keep the safe search projection aligned with the canonical ordinal.
-- P10 creates run+producer atomically, but transaction-start created_at can
-- commit out of order, and an existing unbound run can acquire its producer
-- later. The ordinal is therefore not guaranteed to be append-only. Repair
-- only the affected newer indexed PRIMARY rows on this exceptional write;
-- ordinary latest insertion still refreshes only its own document.
-- No GET writes, new runtime service, source/business rewrite or global scan.

CREATE FUNCTION research.run_library_display_label_insert_trigger()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, research, public
AS $$
DECLARE
  display_kind text;
  accepted_at timestamptz;
  relation_kind text;
  affected_run_ids text[];
  affected_run_id text;
  -- Hard write-side fanout bound. An extraordinary historical append beyond
  -- 256 newer documents fails atomically instead of leaving a partial index
  -- or turning one create request into an unbounded maintenance operation.
  max_affected_documents CONSTANT integer := 256;
BEGIN
  display_kind := research.run_library_display_kind(NEW.execution_profile_id);
  IF display_kind IS NULL THEN RETURN NEW; END IF;
  SELECT durable.created_at, durable.relationship_kind
    INTO accepted_at, relation_kind
    FROM research.runs durable
   WHERE durable.workspace_id = NEW.workspace_id AND durable.run_id = NEW.run_id;
  IF NOT FOUND OR relation_kind <> 'PRIMARY' THEN RETURN NEW; END IF;

  IF TG_WHEN = 'BEFORE' THEN
    -- Take this BEFORE the existing AFTER search-document trigger can lock
    -- any row. Families/workspaces are independent, including WFO v1/v2/
    -- causal sharing one family. The transaction releases the lock on both
    -- commit and rollback. VOLATILE statements after this wait see the prior
    -- writer's commit under P10's READ COMMITTED transaction semantics.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.workspace_id),
                                 hashtext('research.display-label:' || display_kind));
    RETURN NEW;
  END IF;

  SELECT array_agg(affected.run_id ORDER BY affected.created_at, affected.run_id)
    INTO affected_run_ids
    FROM (
      SELECT newer.run_id, newer.created_at
        FROM research.runs newer
        JOIN research.run_producers producer
          ON producer.workspace_id = newer.workspace_id AND producer.run_id = newer.run_id
        JOIN research.run_library_search_documents document
          ON document.workspace_id = newer.workspace_id AND document.run_id = newer.run_id
         AND document.source_kind = 'RESEARCH_DURABLE'
       WHERE newer.workspace_id = NEW.workspace_id
         AND newer.relationship_kind = 'PRIMARY'
         AND (newer.created_at, newer.run_id) > (accepted_at, NEW.run_id)
         AND research.run_library_display_kind(producer.execution_profile_id) = display_kind
       ORDER BY newer.created_at, newer.run_id
       LIMIT max_affected_documents + 1
    ) affected;
  IF cardinality(affected_run_ids) > max_affected_documents THEN
    RAISE EXCEPTION 'research display label historical insert exceeds 256-document refresh bound'
      USING ERRCODE = '23514';
  END IF;
  IF affected_run_ids IS NOT NULL THEN
    FOREACH affected_run_id IN ARRAY affected_run_ids LOOP
      PERFORM research.refresh_run_library_durable_search_document(NEW.workspace_id, affected_run_id);
    END LOOP;
  END IF;
  -- The existing producer INSERT trigger refreshes NEW.run_id exactly once.
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION research.run_library_display_label_insert_trigger() FROM PUBLIC;

CREATE TRIGGER research_run_library_display_label_insert_lock
BEFORE INSERT ON research.run_producers
FOR EACH ROW EXECUTE FUNCTION research.run_library_display_label_insert_trigger();

CREATE TRIGGER research_run_library_display_label_insert_refresh
AFTER INSERT ON research.run_producers
FOR EACH ROW EXECUTE FUNCTION research.run_library_display_label_insert_trigger();

SELECT 1;
