-- ISOLATED CANDIDATE ONLY. These are INVOKER functions until an independently
-- reviewed installer qualifies a NOLOGIN owner, its least-privilege row-lock
-- grants and membership boundary. Never install/grant these on a product DB
-- from application startup. Caller still has to validate all returned fields,
-- authority/session, source and revoke in the SAME transaction.
CREATE FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(p_intent_id uuid)
RETURNS SETOF elp210_c2_p7_candidate.owner_intents
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT i.* FROM elp210_c2_p7_candidate.owner_intents AS i
  WHERE i.intent_id=p_intent_id FOR UPDATE
$$;
CREATE FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_proof(p_proof_sha256 text)
RETURNS SETOF elp210_c2_p7_candidate.owner_intents
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT i.* FROM elp210_c2_p7_candidate.owner_intents AS i
  WHERE p_proof_sha256 ~ '^[0-9a-f]{64}$' AND i.proof_sha256=p_proof_sha256 FOR UPDATE
$$;
REVOKE ALL ON FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION elp210_c2_p7_candidate.lock_owner_intent_by_proof(text) FROM PUBLIC;
