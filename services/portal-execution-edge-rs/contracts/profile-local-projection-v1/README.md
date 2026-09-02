# Profile local projection v1

Phase 1 consumes the existing Rust Manager-v2 compatibility boundary and
makes SGP PostgreSQL the Portal product read/replay authority. This contract
does not grant a new AWS-HK route, browser source access or mutation.

- `realtime-envelope.v1.schema.json` freezes the single five-kind SSE
  envelope consumed by every Execution screen.
- `adapter-activation.v1.json` lists the only existing-source alternative
  adapters activated in this phase. All read from committed, sanitized local
  relations; market data and mutation candidates remain dark.
- `MANIFEST.sha256` binds this pack byte-for-byte.
