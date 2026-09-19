# P03 evidence — Research schema, identities and authorization

Status: `BACKEND_FOUNDATION_COMPLETE — 2026-09-19`.

This packet proves only the P03 durable metadata boundary. It adds an additive
`research` PostgreSQL schema and a server-internal repository; it does **not**
start a Research worker, expose a Research HTTP route, create a browser client,
modify Execution tables, activate a feature flag, contact the Execution Edge,
or deploy anything.

Read in this order:

1. [phase-report.md](./phase-report.md)
2. [schema-and-authorization.md](./schema-and-authorization.md)
3. [test-results.json](./test-results.json)
4. [frontend-handoff-claude.md](./frontend-handoff-claude.md)
5. [rollback.md](./rollback.md), [resource-cleanup.json](./resource-cleanup.json)
   and [debt-register.json](./debt-register.json)

The next owner may use the durable identities from P03, but must not infer a
producer, scheduler, engine computation, artifact writer, browser endpoint or
Execution authority from their existence.
