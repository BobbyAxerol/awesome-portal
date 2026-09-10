-- Up Migration
--
-- PHASE 4 (round 2): the pin feature was advertised and could not be used.
--
-- The Command Center rendered a "Pinned watchlist" panel whose empty state read
-- "Nothing pinned. Pin from any workbench." There was no pin control in any
-- workbench, no POST route, and nothing in the service code that could write a
-- row here — the table's only INSERT lived in a spec file, which is why a green
-- suite never noticed. The screen instructed the reader to perform an action
-- that did not exist.
--
-- The table is empty on dev and on stable, and nothing has ever written to it
-- in production. The read path, the panel and its tests are removed in the same
-- commit as this migration.
DROP TABLE IF EXISTS execution_command_center_pins;

-- Down Migration
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
