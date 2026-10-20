-- Portal-only custody, not a TS command, permission or financial ledger.
-- One bounded latest envelope per already quota-admitted command. No TTL,
-- historical backfill, operational migration or native authority is implied.
CREATE TABLE portal_projection.command_pm_custody (
    command_id uuid PRIMARY KEY REFERENCES portal_projection.command_relay(command_id),
    original_reference text NOT NULL CHECK (octet_length(original_reference) BETWEEN 1 AND 512),
    source_intent_digest text NOT NULL CHECK (source_intent_digest ~ '^[a-f0-9]{64}$'),
    target_ref text NOT NULL CHECK (octet_length(target_ref) BETWEEN 1 AND 512),
    binding_digest text NOT NULL CHECK (binding_digest ~ '^sha256:[a-f0-9]{64}$'),
    outcome_json text CHECK (octet_length(outcome_json) BETWEEN 1 AND 32768),
    outcome_digest text CHECK (outcome_digest ~ '^sha256:[a-f0-9]{64}$'),
    CHECK ((outcome_json IS NULL) = (outcome_digest IS NULL))
);
