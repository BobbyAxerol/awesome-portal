# BAR-07 — Control API Façade (U10, first vertical slices)

> **Version:** 0.1<br>
> **Status:** BAR-07 complete (foundation + first vertical slices)<br>
> **Updated:** 2026-08-16<br>
> **Unified phase:** U10 TypeScript Control API Façade<br>
> **Guide authority:** v0.4 §5.3 module boundaries, §6.2 Control API, §29.4 M2

## 1. Goal and scope

BAR-07 expands the U07 thin BFF into the Control API façade foundation:

- Modular boundaries: workspaces (+ memberships), run read models, product
  audit and transactional outbox (migration `1723680000001_control-facade`).
- Proxy current services first: session-authenticated passthrough to the
  portal-api with a signed `X-Portal-Principal`; route authority migrates one
  vertical slice at a time behind the `FEATURE_PROXY_PORTAL` feature flag.
- Every write records actor, workspace, request, idempotency key and
  aggregate context; identical key + payload replays the stored outcome,
  different payload conflicts (409) — no upstream double-fire.
- Command Center summary is proxied with freshness passthrough
  (`checked_at`/`as_of` preserved verbatim); the first native vertical slice
  is the workspace run read model endpoint.
- Rollback: disabling the flag returns every proxied route to a typed
  `FAÇADE_PROXY_DISABLED` and the legacy gateway path keeps working.

Non-goals: organizations/projects hierarchy, planning proxy, SSE through the
façade, NATS/outbox publishing (U11), per-route native migrations beyond the
workspace read model.

## 2. Locked decisions

1. **Proxy is ADMIN-first.** Read-only metadata paths (health/ready,
   strategies, datasets, registry/summary/links) are session-authenticated
   for both roles; runs read paths and writes through the proxy require
   ADMIN until their native slices migrate. USER sessions read runs through
   the workspace read model — cross-workspace access fails closed (404).
2. **Writes are idempotent by contract.** POST writes accept
   `X-Portal-Idempotency-Key` (auto-derived from method+path+payload hash
   when absent); replay returns the stored response without an upstream
   call; key reuse with a different payload is a typed 409.
3. **The principal header is signed.** Downstream services verify the HMAC
   principal (`auth-policy-v1`); the browser never supplies it.
4. **Flags gate the cutover.** `FEATURE_PROXY_PORTAL` (default true) enables
   the passthrough; turning it off restores the legacy gateway path without
   code rollback.

## 3. Implementation evidence

- [x] Added façade migration (workspaces, workspace_members, run_read_models,
  product_audit_events, outbox_messages) and typed repositories; ADR-002 ULID
  generator (`ws_`/`out_`/`req_` Crockford-26) in `src/id.ts`.
- [x] `PortalProxyService` forwards with `X-Request-ID`/`traceparent`/
  signed `X-Portal-Principal`, passes through cache/ETag/vary headers and
  enforces the write path (outbox + audit + run read model upsert).
- [x] `FacadeController` + `SessionGuard`: authenticated sessions, personal
  workspace auto-provisioning, RBAC matrix and native
  `GET /api/workspaces` + `GET /api/workspaces/:id/runs` endpoints.
- [x] Façade suite passes `7` tests (parity + freshness passthrough, signed
  principal verification, USER run-read denial, cross-workspace 404,
  idempotent replay + conflict + single upstream call, audit/outbox/read
  model rows, flag rollback). Control API total passes `31` tests against a
  real PostgreSQL container; `tsc --noEmit` passes.
- [x] Compose wires `PORTAL_API_BASE_URL` and `FEATURE_PROXY_PORTAL`; the
  gateway keeps routing the legacy paths until the cutover is exercised.
- [x] Full Portal backend regression `308 passed, 1 skipped`; full Planning
  backend `18 passed`; workspace verification passes including the protected
  strategy hash. No change was pushed or deployed.

Technical debt and rollback:

- Planning proxy, SSE and organizations/projects are later vertical slices;
  FastAPI compatibility endpoints remain until U11/U12 cutovers.
- Outbox rows are stored but not yet published to a broker (U11); the
  idempotency/replay semantics are already enforced.
- Rollback: set `FEATURE_PROXY_PORTAL=false` (or redeploy the previous
  control-api image); legacy gateway routes are untouched.
