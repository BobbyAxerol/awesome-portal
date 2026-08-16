# ADR-002 — Physical opaque ID format and generation ownership

> **Status:** Proposed for owner confirmation (BAR-06 prerequisite)<br>
> **Date:** 2026-08-15<br>
> **Required by:** U09 canonical contracts; executed by U10/U11 aggregates

## Context

The guide requires opaque IDs at public boundaries (clients never parse
prefixes or timestamps) and leaves the physical format to U09. Existing
services already emit prefixed IDs (`usr_<32hex>` in control-api,
`run_<16hex>` in the prototype worker).

## Decision

- Canonical physical format for **new durable aggregates**:
  `{kind}_{26-char ULID}` — lowercase kind prefix (`[a-z][a-z0-9_]{1,15}`)
  plus a Crockford-base32 monotonic ULID (sortable, timestamp-embedding but
  never parsed by clients).
- Existing `{kind}_<32hex-uuid>` IDs (control-api identity tables, prototype
  runs) remain valid under a documented compatibility window; new writes in
  U10/U11 use the ULID shape. Both shapes are accepted by
  `common.v1.schema.json#/$defs/opaqueId`.
- Generation ownership: the owning aggregate's repository layer generates the
  ID with the workspace-local `contracts` codec; no service imports another
  service's ID generator.

## Rejected alternatives

- UUIDv4 hex only: no monotonic sort for hot aggregates; the guide's
  `evt_01…`/`ra_01…` examples already use ULID-like values.
- Public timestamps/sequence IDs: leak cardinality/order; rejected by the
  opaque-ID rule.

## Security/operations impact

- Kind prefixes reveal only the aggregate type by design; no secret or PII
  enters IDs.

## Migration and rollback

- Additive: old IDs keep validating; new aggregates adopt ULIDs slice by
  slice; no data rewrite is required.

## Acceptance evidence

- Both shapes validate against `opaqueId` in Python and TypeScript fixtures;
  control-api regression tests stay green.
