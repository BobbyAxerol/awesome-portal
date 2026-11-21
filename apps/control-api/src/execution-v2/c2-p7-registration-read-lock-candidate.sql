-- ISOLATED CANDIDATE. Caller must revalidate authority, owner, source and
-- record in the same transaction; this keyed lock does not authorize access.
CREATE FUNCTION elp210_c2_p7_candidate.lock_registration_for_read(p_registration_key text)
RETURNS SETOF elp210_c2_p7_candidate.registrations
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=pg_catalog AS $$
  SELECT r.* FROM elp210_c2_p7_candidate.registrations AS r
  WHERE length(p_registration_key) BETWEEN 1 AND 128 AND r.registration_key=p_registration_key FOR SHARE
$$;
REVOKE ALL ON FUNCTION elp210_c2_p7_candidate.lock_registration_for_read(text) FROM PUBLIC;
