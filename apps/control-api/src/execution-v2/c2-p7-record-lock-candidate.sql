-- TEST/CANDIDATE ONLY. No runtime grant or security definer is installed here.
-- The caller must independently revalidate the source, owner, session, intent
-- and revoke in this same transaction; this keyed lock is not authorization.
CREATE FUNCTION elp210_c2_p7_candidate.lock_record_by_cycle(p_cycle_sha256 text)
RETURNS SETOF elp210_c2_p7_candidate.records
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT r.* FROM elp210_c2_p7_candidate.records AS r
  WHERE p_cycle_sha256 ~ '^[0-9a-f]{64}$' AND r.cycle_sha256=p_cycle_sha256 FOR SHARE
$$;
REVOKE ALL ON FUNCTION elp210_c2_p7_candidate.lock_record_by_cycle(text) FROM PUBLIC;
