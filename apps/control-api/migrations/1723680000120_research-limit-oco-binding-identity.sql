-- Preserve legacy uniqueness; permit only the new server-owned immutable native edition.
DO $binding$ DECLARE predicate text; BEGIN
 SELECT pg_get_expr(indpred,indrelid) INTO STRICT predicate FROM pg_index
 WHERE indexrelid='research.alpha_versions_legacy_code_entrypoint_unique'::regclass;
 IF predicate IS NULL THEN RAISE EXCEPTION 'legacy identity index must retain a partial predicate'; END IF;
 DROP INDEX research.alpha_versions_legacy_code_entrypoint_unique;
 EXECUTE format('CREATE UNIQUE INDEX alpha_versions_legacy_code_entrypoint_unique ON research.alpha_versions(workspace_id,alpha_id,code_digest,entrypoint) WHERE (%s) AND alpha_version_id <> %L',predicate,'av_delta_rsi_polynomial_alpha_1_0_12');
END $binding$;
