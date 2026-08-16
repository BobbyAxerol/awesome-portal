# ADR-003 — PostgreSQL migration and query approach for the Control API

> **Status:** Proposed for owner confirmation (BAR-04 prerequisite)<br>
> **Date:** 2026-08-15<br>
> **Required by:** U07 thin identity BFF (BAR-04)

## Context

The Control API (NestJS/Fastify TypeScript modular monolith) needs its first
durable datastore in U07: identity tables for users, external bindings,
password/activation credentials, sessions and auth audit. The locked decision
table requires **PostgreSQL with SQL-first access and migrations**. ADR-001
(npm-to-pnpm) and ADR-002 (opaque ID format) belong to U09 and are not decided
here; U07 must not force them early.

## Decision

- **Migrations:** `node-pg-migrate` with plain SQL migration files under
  `apps/control-api/migrations/`. Migrations are versioned, applied
  sequentially inside a transaction, and reversible via `down` scripts where
  destructive behavior is explicit.
- **Queries:** the `pg` driver with small hand-typed repository modules per
  aggregate. No ORM, no query builder, no code-first schema generator.
- **Identifiers:** internally generated with `crypto.randomUUID()` and
  prefixed opaque strings (`usr_`, `ses_`, `evt_`…) — a U09-compatible
  placeholder that never leaks sequence IDs and does not commit the final U09
  ADR-002 format.
- **Enums:** plain `text` columns with `CHECK` constraints, not PostgreSQL
  enums, so later policy changes are additive migrations rather than enum
  surgery.
- **Timestamps:** `timestamptz` stored as UTC.

## Rejected alternatives

- Prisma/Drizzle/Knex ORMs: schema authority moves into code generators;
  conflicts with the SQL-first lock and adds a toolchain migration burden.
- PostgreSQL enums: role/status changes would need enum alterations; CHECK
  constraints keep change reviews visible in migrations.
- Storing sessions/JWT in Redis: U07 introduces no Redis; opaque sessions in
  PostgreSQL are sufficient at prototype scale and keep one durable authority.

## Security/operations impact

- Credential tables are never exposed through generic CRUD endpoints.
- Secrets (pepper/activation plaintext) never touch the database; only hashes
  are stored.
- `DATABASE_URL` is provisioned as a runtime secret, never in images/repo.

## Migration and rollback

- Forward-only upgrades in this phase; destructive `down` steps exist only for
  the scaffold window and are removed once the first user is activated.
- Rollback = redeploy previous control-api image; migrations are additive
  until the first activation.

## Acceptance evidence

- Migrations apply cleanly on an empty `postgres:16` database and are
  idempotent under re-run.
- All six U07 tables match the locked minimum data model (§P0.25A.14).
- Repository tests run against a real PostgreSQL container, not an in-memory
  substitute.
