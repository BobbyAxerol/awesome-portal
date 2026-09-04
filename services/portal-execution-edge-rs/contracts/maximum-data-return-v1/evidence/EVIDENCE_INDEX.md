# E7 evidence index

All evidence here is sanitized: no business row, source cursor, trace ID,
credential, certificate, runtime configuration path or connection string is
committed.

| Evidence | Authority | What it proves | What it does not prove |
| --- | --- | --- | --- |
| `DEPLOYED_RUNTIME_MANIFEST.json` | E1 selected runtime tuple + E7 redaction | image/config digest identity, P/S/L profile presence, 96-relation catalogue boundary | source event journal or production deployment by E7 |
| E1 census artifacts | read-only metadata census | 99 relations, 1,387 columns, lineage and profile metadata | row-level semantics, history retention or raw data |
| `SOURCE_OWNER_GAPS.json` | E2 semantic audit | 18 genuine producer/source gaps | Portal adapter work is not a source gap |
| E3–E6 manifests | frozen contract/adapters/qualification | field/action trace, named E5 mapping, three-profile same-host source qualification | generic source access or replay |
| `e7-resilience-capacity.v1.json` | narrow existing mTLS probe | bounded current-page metrics and typed 503 behavior | SLO, cross-cell or failure-duration certification |
| benchmark files | E7 static summaries | capacity/recovery boundaries and external tests still required | raw source payloads |

Run `tools/validate_maximum_data_e7.py` and the `maximum-data-return` Rust
tests before accepting a transfer. `MANIFEST.sha256` is the complete portable
file integrity index; it intentionally contains only digests and relative
paths.
