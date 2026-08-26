# Codex → Claude — N11 External Read Handoff

Backend status: `PORTAL_ADAPTER_GATE_COMPLETE / OWNER_PUBLICATION_PENDING / PRODUCTION_INACTIVE`.

N11 now gives frontend a stable availability boundary for 24 external reads,
but it does not provide real source data. Until an owner pack is accepted:

1. Full Blotter order list/legs/fills and five-hop lineage stay unavailable or
   explicitly fixture-labelled; never compute totals from the visible page.
2. Binding exposure verdict stays `UNKNOWN`/unavailable; never sum visible
   virtual accounts against physical equity in the browser.
3. Correlation cells without owner `sample_counts` remain insufficient, not
   zero-sample or valid by inference.
4. VNM sessions and `LO/ATO/ATC/MP` remain verbatim; do not alias unsupported
   order types or synthesize a venue calendar.
5. Stage positions/quality/contribution, market ticks/candles and all eight ops
   panels keep their current honest unavailable state.
6. Distinguish unpublished, denied, incompatible, retryable and unavailable;
   none becomes an empty successful collection.

Canonical backend references:

- `services/portal-execution-edge-rs/contracts/n11-external-read-v1-request/README.md`;
- `services/portal-execution-edge-rs/crates/external-read-adapter/src/lib.rs`;
- `upgrade/backend/EX_BE_01_N11_EXTERNAL_READ_CAPABILITIES_AND_ADAPTERS.md`.

Recommended parallel frontend work: centralize a typed panel-availability
mapper and add fixture tests for the five states above. Do not call
`/portal/execution/v1/*`, remove fixture banners, retire screen smoke, or label
anything live until Codex imports an accepted owner schema/fixture pack and the
separate activation phase passes.
