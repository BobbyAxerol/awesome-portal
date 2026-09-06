-- EDS-11R3: retain the exact accepted Manager catalogue identity beside the
-- Portal-local observation document and revision journal.  This is contract
-- provenance only; it does not turn a bounded current-page observation into
-- an authoritative Trading System event/replay record.

ALTER TABLE execution_profile_projection_snapshots
  ADD COLUMN source_catalogue_sha256 text
    CHECK (source_catalogue_sha256 IS NULL OR source_catalogue_sha256 ~ '^sha256:[0-9a-f]{64}$');

ALTER TABLE execution_profile_projection_journal
  ADD COLUMN source_catalogue_sha256 text
    CHECK (source_catalogue_sha256 IS NULL OR source_catalogue_sha256 ~ '^sha256:[0-9a-f]{64}$');

-- Existing rows predate the R3 provenance column.  Keep them NULL rather
-- than inferring today's catalogue digest from a newer release image.
