-- EDS-11R3: a durable current/range batch must retain the catalogue identity
-- which governed the source page.  Range rows already reference their first
-- observed batch, so this additive batch-level field provides exact durable
-- provenance without duplicating a value on every financial point.

ALTER TABLE execution_durable_mirror_batches
  ADD COLUMN source_catalogue_sha256 text
    CHECK (source_catalogue_sha256 IS NULL OR source_catalogue_sha256 ~ '^sha256:[0-9a-f]{64}$');

-- Historic mirror batches remain NULL.  They are not relabelled from a newer
-- snapshot or release image.
