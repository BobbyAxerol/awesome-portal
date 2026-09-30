# B1 P07 backend receipt

- `S14-RW-BR-01`: re-registering the same ACTIVE `av_` now proposes a null predecessor; the immutable original row is replayed rather than hitting the self-supersession check. Disposable PostgreSQL P07: 9/9; attestation: 4/4; Control API build passed. Code commit `8f09bd9d`.
- `S14-RW-BR-02`: analyser mirror verdicts are field-specific; an invalid warmup does not mark a valid version row as failed. Focused Python tests: 14/14.
- `CG-S00-AV-01`: immutable Journey revision 4 adds `requires_alpha: true` only to the Alpha Version card; previous registry rows are retained. Disposable PostgreSQL P09: 7/7; contracts: 197/197; Control API build passed. `JourneyCard.requires_alpha?` is additive so older revision-3 clients still parse. Claude should consume the v4 flag for S00; no frontend file was changed here.

No production runtime, frontend code, or source data changed.
