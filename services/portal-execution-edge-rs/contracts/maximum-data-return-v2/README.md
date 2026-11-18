# Maximum data return v2 (E1 subset, metadata only)

Subset of the owner E1 census of 2026-11-16 (`trading_system`, collector
`portal-source-census-v1`) limited to the 109 relations of
`../manager-surface-census-v2`. Nothing about the other relations of the
owner export is copied; the six secret-bearing relations are
`SOURCE_IDENTITY_SCOPE_GAP` by design and are absent. No business rows.

Files (same CSV dialect and columns as `../maximum-data-return-v1`, written with
`\n` line endings):

- `DATABASE_RELATION_CENSUS.csv` - 109 rows.
- `COLUMN_SEMANTICS_CATALOG.csv` - columns of those relations.
- `E1_CAPTURE_PROVENANCE.json` - capture time, collector contract digest,
  classification gate, hashes of the owner export files, subset hashes.

Shape differences against the v1 CSVs are listed in the commit message and in
the report of the change that introduced this directory. Derive with
`scripts/execution-n18-census.py --census-version 2 --write-e1-subset <dir>`.
