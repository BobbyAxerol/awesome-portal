ALTER TABLE portal_projection.entities
    ADD COLUMN source_sequence_semantics TEXT NOT NULL
      DEFAULT 'PER_ENTITY_CONTIGUOUS'
      CHECK (source_sequence_semantics IN (
        'PER_ENTITY_CONTIGUOUS', 'GLOBAL_STREAM_MONOTONIC'
      ));

ALTER TABLE portal_projection.event_journal
    ADD COLUMN projection_operation TEXT NOT NULL
      DEFAULT 'UPSERT'
      CHECK (projection_operation IN ('UPSERT', 'DELETE')),
    ADD COLUMN source_sequence_semantics TEXT NOT NULL
      DEFAULT 'PER_ENTITY_CONTIGUOUS'
      CHECK (source_sequence_semantics IN (
        'PER_ENTITY_CONTIGUOUS', 'GLOBAL_STREAM_MONOTONIC'
      ));

ALTER TABLE portal_projection.checkpoints
    ADD COLUMN source_sequence_semantics TEXT NOT NULL
      DEFAULT 'PER_ENTITY_CONTIGUOUS'
      CHECK (source_sequence_semantics IN (
        'PER_ENTITY_CONTIGUOUS', 'GLOBAL_STREAM_MONOTONIC'
      ));
