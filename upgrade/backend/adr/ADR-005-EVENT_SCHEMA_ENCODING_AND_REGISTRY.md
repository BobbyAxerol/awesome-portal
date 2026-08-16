# ADR-005 — Durable event schema encoding and registry process

> **Status:** Proposed for owner confirmation (executed in U11)<br>
> **Date:** 2026-08-15<br>
> **Required by:** U09/U11 durable events

## Context

U11 introduces NATS JetStream for durable job/domain events. The canonical
envelope (§6.7) is already locked; the payload encoding and registry process
must be decided before any stream goes live.

## Decision

- **Encoding:** JSON payloads validated against versioned JSON Schemas in
  `packages/contracts` (Draft 2020-12). Protobuf is deferred until a measured
  hot path justifies it; the envelope stays compatible either way.
- **Registry process:** every event type registers
  `{event_type}.v{n}` schema + canonical fixture in `packages/contracts`
  before it may be published; schema digests ride the BAR-06 snapshot gate.
- **Compatibility:** additive changes bump the minor payload version only
  through a reviewed schema revision; breaking changes create a new
  `event_type.v{n+1}` with an explicit consumption window.

## Rejected alternatives

- Schemaless JSON: no breaking-change detection; conflicts with the contract
  CI gate.
- Protobuf-first: toolchain cost without measured benefit at U11 scale.

## Security/operations impact

- Payload schemas forbid secrets by convention; producers redact before
  publish, consumers never trust payload-only identity.

## Migration and rollback

- Event consumers are version-aware from the first publish; rollback =
  republish or replay within the version window.

## Acceptance evidence

- A registered fixture passes Python and TypeScript validation; publishing an
  unregistered event type fails CI.
