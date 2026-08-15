# Portal Registry

`registry.json` is the source-controlled product metadata authority introduced
by BAR-01. It describes feature maturity, screen contracts, lifecycle metadata
and tracked concerns; it does not contain runtime health or grant permission.

Contracts:

- `schemas/portal-registry-source.v1.schema.json` validates the authored file.
- `schemas/portal-registry.v1.schema.json` validates the future public response
  after filtering and addition of its computed content digest.
- `schemas/portal-summary.v1.schema.json` validates the future read-only Command
  Center summary response.

Do not add a second TypeScript feature list. The frontend will consume the
validated registry through the Portal API in BAR-01-BE2/BE6. `HIDDEN` content,
runtime availability, authorization enforcement and dynamic summaries remain
backend responsibilities.

The architecture and validation invariants are defined in
[`upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md`](../../../upgrade/backend/BAR_01_FEATURE_REGISTRY_AND_SUMMARY_CONTRACT.md).
