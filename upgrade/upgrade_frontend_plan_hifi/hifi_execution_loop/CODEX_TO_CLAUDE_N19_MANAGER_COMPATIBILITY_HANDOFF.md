# Codex → Claude: N19 Rust Manager Compatibility Handoff

**Backend state:** `N19_COMPLETE / SOURCE_DARK / N20_READY_NOT_STARTED`  
**Date:** 2026-08-30

N19 is backend-only and adds no new browser payload or route. Rust Edge now
owns the complete versioned compatibility boundary for the frozen 96-relation
Manager catalogue and all five published Manager GET primitives.

## What frontend may rely on

- Current source revision, exact environment/profile and relation catalogue
  are now checked by Rust before transport.
- Paper is the only transport-qualified profile in N19. Sandbox and Live are
  exact but dormant bindings; frontend must render typed unavailable rather
  than imply that they are active.
- Missing/extra relations, wrong revision/profile/resource and cursor/key
  drift fail closed with typed Edge errors.
- A future owner adapter can be qualified and rolled back without changing the
  future stable screen contract.
- Exact decimals remain strings; browser code must not convert execution money
  or quantities to JavaScript floating point.

## What frontend must not do

- Do not call `/internal/v2/manager/**` from the browser.
- Do not introduce relation names, raw Manager envelopes, generic query
  controls, source URLs or upstream fields into UI policy.
- Do not infer availability from an empty array and do not treat a raw source
  response as a commissioned screen payload.
- Do not remove smoke/fixture data merely because N19 is complete.

## Parallel frontend work

Claude may keep refining approved UI/UX and seven-state rendering using the
frozen request ledger. The next backend consumer surface is N20, which will
provide workspace/resource-scoped, narrow TypeScript BFF contracts and one
fixture/error/state handoff per screen slice. Raw Manager compatibility remains
an implementation detail below that boundary.

Canonical backend evidence:
[`EX_BE_22_N19_RUST_MANAGER_V2_COMPATIBILITY_AUTHORITY.md`](../../backend/EX_BE_22_N19_RUST_MANAGER_V2_COMPATIBILITY_AUTHORITY.md).
