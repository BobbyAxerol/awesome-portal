# U10 — QuantBT Run SSE Façade Cutover

**Accepted scope:** SGP Research Portal only  
**Status:** `U10_SSE_CUTOVER_COMPLETE / U11_DURABLE_EVENT_SOURCE_PENDING`  
**Date:** 2026-08-24

## 1. Goal and boundary

Move `GET /api/runs/{run_id}/events` from the unauthenticated Nginx-to-Python
exception into the same TypeScript Control API boundary as the rest of the
browser product API. This is the QuantBT Research run-progress stream. It does
not activate the AWS-HK Execution Edge, EX-BE-06 realtime, source ingestion,
Paper/Live data or a command path.

The accepted request path is now:

```text
browser EventSource
  -> SGP portal-web / Nginx
  -> SGP TypeScript Control API SessionGuard
  -> signed internal Portal principal
  -> private Python portal-api run-event stream
```

Health and readiness probes remain deliberate infrastructure exceptions.
Setting `PORTAL_WEB_UPSTREAM=portal-api:8000` keeps the existing one-line
gateway rollback and returns the SSE route to the legacy direct path.

## 2. Security and streaming contract

- A valid active Portal session is required before any upstream connection.
- The run identifier uses the canonical backend grammar:
  `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`; encoded separators, traversal and
  non-canonical encodings fail closed.
- The upstream origin remains the configured origin-only
  `PORTAL_API_BASE_URL`; redirects are not followed.
- The Control API signs the same bounded internal principal used by other
  façade reads. No browser-supplied principal is forwarded.
- `Accept: text/event-stream`, request ID and trace context are propagated.
- The connect/header deadline defaults to 3 seconds and is configurable by
  `CONTROL_API_PORTAL_SSE_CONNECT_TIMEOUT_MS`. It is cleared as soon as headers
  arrive; it never becomes a lifetime limit for a valid long-running stream.
- A non-SSE upstream response is rejected as
  `SSE_UPSTREAM_INVALID_RESPONSE`; it is not buffered or re-labelled.
- Fastify pipes the web stream as a native Node readable, retaining
  backpressure. Client disconnect closes the upstream fetch.
- `Cache-Control: no-cache`, `X-Accel-Buffering: no` and request correlation are
  preserved through both TypeScript and Nginx.
- SSE remains an accelerator. The React hook keeps the slower polling floor
  and invalidates authoritative queries instead of inventing run state from a
  partial event frame.

## 3. Evidence

Command:

```bash
./scripts/control-api-test.sh
```

Accepted evidence on 2026-08-24:

- TypeScript production build passed.
- Control API: 20 suites, 173 tests passed.
- `facade.spec.ts`: 37 tests passed, including authenticated streaming,
  internal-principal verification, SSE header parity, unauthenticated denial,
  canonical path rejection and non-SSE fail-closed behavior.
- Fresh PostgreSQL migrations and restore drill passed.

Root workspace verification and composed gateway smoke are recorded in the
same-tree handoff below.

Additional accepted evidence on 2026-08-24:

- `./scripts/portal verify`: protected strategy, source-boundary, JSON,
  shell, D1/D2/D3 offline and rendered-Compose gates passed.
- targeted Portal backend regression: 50 passed, 351 deselected, covering the
  M0 freeze, release report, compatibility parity, ingress boundary and
  frontend handoff contracts.
- `sudo -n ./scripts/portal smoke`: all images built; fresh PostgreSQL
  migration/bootstrap completed; unauthenticated SSE was denied; an
  authenticated run stream traversed Nginx and the TypeScript façade with
  `text/event-stream`; Approval plan/apply/poll and Roadmap create/transition/
  audit/delete flows passed.
- the isolated smoke project removed its containers, network and named
  volumes after completion.

## 4. Rollback and residual work

Rollback remains:

```bash
PORTAL_WEB_UPSTREAM=portal-api:8000 ./scripts/portal up
```

This slice closes the U10 run-SSE browser cutover, not the durable event-source
objective. Python's current stream still observes the compatibility run
manager. U11 must relay committed progress from the durable run/attempt event
authority and prove restart/replay/cancel behavior before the compatibility
source can retire. U10 also retains the separate authoritative Command Center
history/cross-filter read-model and workspace-product UX slices.
