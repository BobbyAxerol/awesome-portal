# Portal Registry

`registry.json` is the source-controlled product metadata authority introduced
by BAR-01. It describes feature maturity, screen contracts, lifecycle metadata
and tracked concerns; it does not contain runtime health or grant permission.

Contracts:

- `schemas/portal-registry-source.v1.schema.json` validates the authored file.
- `schemas/portal-registry.v1.schema.json` validates the public API response
  after filtering and addition of its computed content digest.
- `schemas/portal-summary.v1.schema.json` validates the future read-only Command
  Center summary response.

The Portal API loads this directory once, fails startup when its schema or
cross-references are invalid, removes `HIDDEN` metadata and serves the immutable
public projection at `GET /api/v1/portal/registry`. The response digest is its
strong ETag; clients must revalidate rather than treat cache time as source
time.

Do not add a second TypeScript feature list. The frontend consumes this
validated endpoint in BAR-01-BE6. Runtime availability, authorization
enforcement and dynamic summaries remain backend responsibilities.

The architecture and validation invariants are defined in
[`upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md`](../../../upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md).
