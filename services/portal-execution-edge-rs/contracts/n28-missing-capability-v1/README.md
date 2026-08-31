# N28 Genuine Missing-Capability Contract

This directory is the machine-readable authority for N28.

- `missing-capability-registry.v1.json` separates 13 existing-source adapters,
  nine genuine owner gaps and three intentional exclusions.
- `owner-request.v3.json` is the one active Trading System owner request.
- `owner-response.v1.schema.json` validates the sanitized return publication.
- `owner-response.pending.example.json` is a negative/pending template only;
  it is not owner evidence and cannot activate anything.
- `fixtures/` contains synthetic current-source response samples used by the
  Rust semantic adapter tests. It contains no business data.

All adapters are `SOURCE_DARK`. The Rust crate constructs relative bounded
requests and validates response bytes but contains no HTTP client. N29 owns
network binding, returned-owner compatibility and product promotion.
