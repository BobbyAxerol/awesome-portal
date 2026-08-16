# BAR-03 — Operational Ingress Boundary

> **Version:** 0.1<br>
> **Status:** BAR-03 complete<br>
> **Updated:** 2026-08-15<br>
> **Unified phase:** U06 Secure Edge & Loopback Origin Topology<br>
> **Runtime authority:** current FastAPI services remain authoritative

## 1. Goal and scope

BAR-03 turns the current one-gateway deployment into a diagnosable,
correlatable ingress boundary **without changing the edge topology**. It
delivers the U06 backend slice:

- Distinct liveness (`/api/health`), readiness (`/api/ready`) and dependency
  diagnostics (`/api/diagnostics`).
- `X-Request-ID` + W3C `traceparent` creation/propagation through the gateway
  and every Portal API response.
- SSE streaming preservation through the nginx proxy.
- Redaction of topology, filesystem paths, tokens and identity assertions
  from health/diagnostics/error responses.

It does not publish the edge, install certs/tunnels, enforce identity/AUD or
change the gateway to loopback-only — those remain owner-operational U06
steps and U07 backend work.

## 2. Decisions locked by this deep dive

1. **Correlation convention matches the existing Planning service.**
   Header `X-Request-ID`; every error envelope is
   `{"error": {...}, "request_id": "<id>"}`; the response always carries
   `X-Request-ID` and `traceparent` headers. Portal API accepts valid
   incoming values (nginx `$request_id` hex qualifies) and replaces unsafe
   ones instead of echoing them.
2. **Request IDs are opaque correlation, never identity.** Safe pattern
   `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`; W3C traceparent pattern
   `^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$`. Before U07 they
   grant nothing; after U07 identity is created only by the trusted BFF.
3. **Diagnostics are safe-for-future-users metadata.** `/api/diagnostics`
   reports registry digest, artifact-store presence (no path), historical
   mode/count, QuantBT engine reachability, Planning summary mode and worker
   pool size — plus the current request's correlation. No hostname,
   filesystem path, credential, upstream URL or identity assertion may ever
   appear.
4. **SSE must stream unbuffered.** The events route sends
   `text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`;
   nginx disables buffering/cache for `/api/` and the dedicated
   `/api/runs/*/events` location with long read/send timeouts. The ingress
   middleware is pure ASGI and never intercepts response bodies.
5. **Redaction is tested, not promised.** Health/ready/diagnostics/error
   snapshots are asserted free of `/srv/`, `/home/`, `/var/lib/`, tokens,
   secrets and internal service URLs.
6. **Fail-closed edge stays owner-operational.** Wrong origin/AUD/certificate
   enforcement and the tunnel checklist (§40.16 of the v0.4 guide) are
   deployed by the owner; this slice adds no edge config beyond the gateway
   correlation/SSE directives and documents the expected strip-list for U07.

## 3. Ingress contract

### 3.1 Headers the gateway forwards

```text
Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto, X-Request-ID ($request_id)
```

### 3.2 Strip-list (U07, documented now)

`X-Portal-Actor`, `Authorization`, Cloudflare Access JWT headers and any
client-supplied identity assertion must be stripped at the gateway once U07
identity exists. Today `X-Portal-Actor` still reaches the private Planning
API because the composed smoke test uses it as a test actor; that exception
disappears with U07.

### 3.3 Correlation semantics

- Accept valid incoming `X-Request-ID`/`traceparent`; otherwise generate.
- Echo both on every response; include `request_id` in every error body.
- Never echo an unsafe value: regex-validated, then used.

## 4. Diagnostics contract

`GET /api/diagnostics` → `DiagnosticsResponse` (OpenAPI-modeled):

```text
status, service, version, checked_at, request_id, traceparent,
ingress {forwarded_proto, forwarded_for_present},
dependencies {registry, artifact_store, historical_data,
              quantbt_engine, planning_summary, run_worker}
```

States: `ready | available | unavailable | disabled` with safe `detail` only.

## 5. Non-goals

- No loopback/Tunnel/Access configuration, no certs, no firewall changes.
- No identity, actor enforcement, rate limiting or RBAC (U07).
- No per-request log records (the Planning JSON log formatter remains the
  template for a later Portal structured access log).

## 6. Exit evidence

BAR-03 is complete when: correlation propagates and sanitizes through the
ASGI boundary and the gateway config; diagnostics report truthful safe
dependency states; SSE headers and nginx directives preserve streaming;
health/ready/diagnostics/error snapshots pass redaction assertions; the
protected hash, Planning state and every existing suite stay green; and each
coherent slice is committed.

Implementation evidence — 2026-08-15:

- [x] Added pure-ASGI `IngressContextMiddleware` (`portal_api/api/ingress.py`)
  with pattern-validated `X-Request-ID`/`traceparent` creation/propagation
  and response header echoing; unsafe incoming values are replaced.
- [x] Added `/api/diagnostics` with typed `DiagnosticsResponse` covering
  registry digest, artifact-store presence, historical mode/datasets, engine
  reachability, Planning summary mode and worker pool size plus the current
  request correlation — no path/hostname/secret values.
- [x] Every Portal error envelope now carries `request_id` matching the
  `X-Request-ID` header (domain 422, summary 500, HTTPException, validation
  errors); the `PortalErrorResponse` OpenAPI model documents the shape.
- [x] SSE events route sends `Cache-Control: no-cache` and
  `X-Accel-Buffering: no`; the nginx gateway forwards `X-Request-ID
  $request_id` to both APIs, disables buffering/cache and adds a dedicated
  `/api/runs/*/events` location with long timeouts.
- [x] BAR-03 suite passes `12` tests; full Portal backend regression passes
  `292 passed, 1 skipped`; full Planning backend regression passes
  `18 passed`. The skip is the explicit opt-in external Historical real-data
  smoke.
- [x] OpenAPI/fixtures and BAR-02 snapshots regenerated; workspace
  verification passes including the protected strategy hash; Planning state
  unchanged.

Technical debt and rollback:

- Portal structured per-request access logging is deferred (noise until
  U07/U10 SLI work).
- Rollback: revert the BAR-03 commits; gateway config and endpoints are
  backward compatible. No change was pushed or deployed.
