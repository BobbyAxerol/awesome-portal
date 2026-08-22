ALTER TABLE portal_projection.analytics_source_snapshots
    ADD COLUMN venue_session_state TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (venue_session_state IN ('OPEN', 'PAUSED', 'UNKNOWN'));

ALTER TABLE portal_projection.analytics_source_snapshots
    ADD CONSTRAINT analytics_snapshot_fact_count_bounded
      CHECK (expected_fact_count <= 20000) NOT VALID,
    ADD CONSTRAINT analytics_snapshot_resource_id_bounded
      CHECK (octet_length(resource_id) BETWEEN 1 AND 128) NOT VALID,
    ADD CONSTRAINT analytics_snapshot_context_key_bounded
      CHECK (octet_length(context_key) <= 32) NOT VALID,
    ADD CONSTRAINT analytics_snapshot_policy_version_bounded
      CHECK (octet_length(freshness_policy_version) BETWEEN 1 AND 128) NOT VALID,
    ADD CONSTRAINT analytics_snapshot_adapter_version_bounded
      CHECK (octet_length(adapter_version) BETWEEN 1 AND 128) NOT VALID,
    ADD CONSTRAINT analytics_snapshot_capability_id_bounded
      CHECK (octet_length(capability_snapshot_id) BETWEEN 1 AND 128) NOT VALID,
    ADD CONSTRAINT analytics_snapshot_payload_digest_canonical
      CHECK (payload_digest ~ '^sha256:[0-9a-f]{64}$') NOT VALID;

ALTER TABLE portal_projection.analytics_source_facts
    ADD CONSTRAINT analytics_fact_id_bounded
      CHECK (octet_length(fact_id) BETWEEN 1 AND 128) NOT VALID,
    ADD CONSTRAINT analytics_fact_payload_bounded
      CHECK (octet_length(payload::text) <= 65536) NOT VALID;
