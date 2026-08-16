# BAR-10 — Data Catalog & Immutable Snapshots

> **Version:** 0.1<br>
> **Status:** BAR-10 complete (catalog + snapshot authority + query contract)<br>
> **Updated:** 2026-08-16<br>
> **Unified phase:** U13 Data Catalog, Immutable Snapshots & Query Foundation<br>
> **Guide authority:** v0.4 P0.24A HMD consumer contract, §8.10 reader boundary

## 1. Goal and scope

BAR-10 replaces host-path/latest-data assumptions with identities, a quality
gate and a chart-ready query contract:

- `registry/data-catalog.v1.json` (+ JSON Schema) lists all U13 families
  (Binance perpetual/quarterly/spot 1m, daily matrix, futures metrics 5m,
  order-book 1h, VN equity daily, VN daily matrix, VN30F1M continuous) plus
  the fail-closed ones (Deribit options, VN raw 1m). Every family declares
  kind (candle/matrix/metrics/orderbook), schema version, release-manifest
  provenance and a quality profile.
- **No family is activated until its accepted release-manifest digest is
  confirmed during real-data activation** (placeholder digests are explicit;
  real activation requires the separate smoke per the U13 exit gate).
- `services/data_catalog.py`: catalog loader (fail-closed at startup),
  `SnapshotStore` with digest-addressed immutable snapshots (register →
  quality block → open-by-digest with tamper detection → query with range/
  downsampling metadata), per-kind schemas and repair-as-new-snapshot.
- `GET /api/v1/data/{catalog,snapshots,snapshots/{id}/quality,snapshots/{id}/series}`
  read-only endpoints; quality preflight blocks crafted and historical run
  submissions (source_class `historical_market_data` only).

Non-goals: PostgreSQL catalog tables, object-store ingestion, realtime
availability, Timescale/ClickHouse/Rust query (evidence-gated later).

## 2. Locked decisions

1. **The approved reader wheel stays the ingestion boundary.** Nothing scans
   the filesystem; snapshots register only from typed frames with lineage.
2. **Snapshots are addressed by digest, never `latest`.** Repair creates a
   new snapshot identity; the old one stays immutable and reopenable.
3. **Quality is blocking.** gap/duplicate violations reject registration
   and historical run preflight with typed reason codes.

## 3. Implementation evidence

- [x] Catalog with 11 families, kinds, schema versions, quality profiles
  and manifest provenance; loader fail-closed matrix (invalid kind, duplicate
  family, wrong schema major, invalid quality bound).
- [x] Snapshot authority: digest-addressed identity, lineage, bounds,
  row count; open-by-digest with corrupt/tamper detection; repair-new-
  snapshot immutability; crafted duplicate-submission blocked by quality.
- [x] Query contract: range slicing, column projection, `max_points`
  downsampling with `original_points`/`returned_points`/`downsample_stride`
  metadata; content hash and quality block ride along.
- [x] Quality preflight for historical data sources inside PreflightService.
- [x] Read-only data endpoints (405 on mutation, 404 for unknown snapshots).
- [x] BE suite: `12` tests; full Portal backend regression `341 passed,
  1 skipped`; full Planning backend `18 passed`; contracts sync regenerated;
  workspace verification passes including the protected strategy hash.
  No change was pushed or deployed.

Technical debt and rollback:

- Catalog PostgreSQL tables, ingestion jobs and object-store snapshots are
  later U13 slices; real-data family activation requires the separate
  real-reader smoke and confirmed release-manifest digests.
- Rollback: revert the BAR-10 commits; existing data paths are unchanged.

## 4. Next slice after BAR-10

BAR-11 and beyond cover the remaining runway (Alpha registry U14, paper/
sandbox/live U15, webhooks/notifications U16, Rust fast paths U17, Planning
migration U18) — the next backend task per the guide is BAR-11: Alpha
Registry, Import & Research Platform foundations.
