ALTER TABLE portal_projection.entities
    DROP CONSTRAINT entities_entity_kind_check;

ALTER TABLE portal_projection.entities
    ADD CONSTRAINT entities_entity_kind_check CHECK (entity_kind IN (
        'ORDER', 'FILL', 'POSITION', 'EVENT', 'RUNTIME', 'ACCOUNT',
        'BROKER_BINDING', 'RECONCILIATION', 'PERFORMANCE', 'OPERATION'
    ));
