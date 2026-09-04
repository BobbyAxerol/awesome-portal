# Schema index

The `schemas/` directory is a portable index over the frozen E4 schemas:

- `source-catalog.v1.schema.json` → E4 source catalogue.
- `relation-history.v1.schema.json` → E4 opaque continuation boundary.
- `source-health.v1.schema.json` → E4 source-health envelope.
- `domain-capability.v1.schema.json` → E4 domain capability ruling.
- `incremental-events.v2.schema.json` is deliberately a future
  `OWNER_ACTION_REQUIRED` declaration. It is not a claim that the current
  Manager page has event/replay semantics.

Wire timestamps are UTC epoch milliseconds; financial quantities remain exact
decimal strings. The source-issued cursor is opaque and never appears in this
return pack.
