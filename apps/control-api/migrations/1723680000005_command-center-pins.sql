-- Up Migration
-- User-owned Command Center watchlist preferences live in the Portal control
-- plane. Execution facts are deliberately not copied into this table.
CREATE TABLE execution_command_center_pins (
    workspace_id text NOT NULL,
    user_id      text NOT NULL,
    slot         smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
    entity_type  text NOT NULL CHECK (entity_type = 'DEPLOYMENT'),
    entity_id    text NOT NULL CHECK (entity_id ~ '^[A-Za-z0-9._-]{1,128}$'),
    label        text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 160),
    href         text NOT NULL CHECK (href ~ '^/deployments/[A-Za-z0-9_./?=&-]{1,240}$'),
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id, slot),
    UNIQUE (workspace_id, user_id, entity_type, entity_id),
    FOREIGN KEY (workspace_id, user_id)
      REFERENCES workspace_members(workspace_id, user_id) ON DELETE CASCADE
);

CREATE INDEX execution_command_center_pins_actor_idx
    ON execution_command_center_pins (workspace_id, user_id, slot);

-- Down Migration
DROP TABLE execution_command_center_pins;
