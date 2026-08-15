# BAR-04 — Thin Identity BFF (first Control API slice)

> **Version:** 0.1<br>
> **Status:** BAR-04-BE1/BE2/BE3 complete<br>
> **Updated:** 2026-08-15<br>
> **Unified phase:** U07 Identity, Local Login, Session & RBAC<br>
> **Guide authority:** v0.4 P0.25A addendum (M-1B) and §40.11–40.17

## 1. Goal and scope

BAR-04 scaffolds `apps/control-api/`, a NestJS/Fastify modular monolith that
is the **thin auth BFF for M-1B** and later expands into the U10 Control API.
It delivers:

- PostgreSQL migrations for users, external bindings, password credentials,
  activation credentials, sessions and auth audit (ADR-003).
- Cloudflare Access JWT/JWKS verification (signature, `kid` rotation cache,
  `iss`, `aud`, times, `@azdag.com` policy) — never raw email headers.
- `AUTH_MODE` dev / cloudflare_access / cloudflare_access_local_password with
  the full auth state machine (`ACCESS_REQUIRED → APP_LOGIN_REQUIRED →
  PASSWORD_CHANGE_REQUIRED → AUTHENTICATED`, plus `ACCOUNT_DISABLED` /
  `IDENTITY_BINDING_CONFLICT`).
- Argon2id credentials (≥19 MiB/2/1), 192-bit single-use activation
  credentials, forced first-password change, blocklist + NFC policy.
- Opaque server-side sessions (`__Host-portal_session`, Secure/HttpOnly/
  SameSite=Lax, 30 min idle / 8 h absolute), CSRF token + Origin checks,
  rotation and revocation.
- Login throttling (5/15 min delay, 10/30 min lock), generic login errors.
- Signed internal principal context; raw JWT/password/session never reach
  Python services.
- Idempotent bootstrap of `bobby/ADMIN`, `stan/USER`, `thanhvuong/USER`
  (INVITED, one-time credentials generated at runtime, never committed).
- ADMIN user/session administration APIs and the security test matrix.

Non-goals: no run/data/alpha authority in the BFF; no gateway rewiring to the
BFF (U10 façade); no SCIM/MFA/passkey (U15/U16); no frontend login screens
(frontend slice).

## 2. Locked implementation decisions

1. **Boundary:** `apps/control-api/` with its own lockfile and CI job; it
   joins the Compose stack as private services (`control-api`, `portal-postgres`)
   with no public port. The web gateway keeps routing to the Python services
   until U10.
2. **Verification authority:** `Cf-Access-Jwt-Assertion` header only. The JWKS
   verifier fetches `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`,
   caches by `kid` with TTL, refreshes on unknown `kid` and keeps a short
   last-known-good window — never bypassing signature checks.
3. **Credentials:** Argon2id with the guide baseline; activation credentials
   are single-use, ≤24 h, hashed at rest (sha256), 192-bit CSPRNG.
4. **Sessions:** opaque 256-bit tokens, sha256 at rest, `session_version`
   rotation on login/change/role change; revocation is server-side.
5. **Principal:** HMAC-SHA256 signed JSON principal with `policy_version:
   auth-policy-v1`; downstream services verify the signature and the `exp`.
6. **Errors:** RFC7807-shaped `{error: {code, message}, request_id}` matching
   the BAR-03 convention; login responses are always generic.
7. **Dev mode:** `AUTH_MODE=dev` injects a fixed dev identity only when
   `PORTAL_ENV` is local/test; it refuses to start when `PORTAL_ENV`
   production-like and no Access config exists.

## 3. API contract (P0.25A.13)

```text
GET  /api/auth/context          POST /api/auth/login
POST /api/auth/change-password  POST /api/auth/logout
GET  /api/auth/csrf
GET  /api/admin/users           POST /api/admin/users
PATCH /api/admin/users/{user_id}
POST /api/admin/users/{user_id}/reset-credential
POST /api/admin/users/{user_id}/revoke-sessions
POST /api/admin/users/{user_id}/disable
GET  /api/control/healthz       GET /api/control/readyz
```

All `/api/admin/*` routes require an ADMIN session; `/api/auth/*` are
session/CSRF aware; `context` reports the state machine state.

## 4. Test matrix (gate)

- Forged `CF-Access-Authenticated-User-Email` without valid JWT → `ACCESS_REQUIRED`.
- Cross-user: session of USER cannot call admin APIs or read another user's data.
- Expiry: expired Access JWT and expired/revoked sessions fail closed.
- Key rotation: unknown `kid` refetches JWKS; last-known-good cache window.
- Session revocation and forced password change rotate sessions.
- No account enumeration: identical generic error for unknown user/wrong
  password/binding mismatch/disabled.
- No raw token/cookie/password/hash/secret in logs or responses.
- Idempotent bootstrap; one-time credentials single-use and expiring.
- Rate limit lock after 10 failures; unlock resets counters.

## 5. Implementation slices

- **BAR-04-BE1:** scaffold + config + health/ready + migrations + repositories
  + dockerized PostgreSQL test harness + ADR-003.
- **BAR-04-BE2:** Argon2id/policy, Cloudflare verifier, sessions, principal
  signing, auth endpoints, throttling, CSRF, RBAC guard, audit.
- **BAR-04-BE3:** admin APIs, bootstrap CLI, Compose/Dockerfile wiring and the
  full security matrix.

Implementation evidence — 2026-08-15:

- [x] Scaffolded `apps/control-api/` (NestJS 11 + Fastify 5) with its own
  lockfile, strict TypeScript, health/ready endpoints and a dynamic
  `AppModule.register(config, pool)` so tests inject the same wiring as
  production.
- [x] ADR-003 written (node-pg-migrate + typed `pg` repositories, no ORM,
  CHECK-constrained text statuses, `usr_/ses_/evt_` opaque IDs) — status
  Proposed for owner confirmation.
- [x] Six locked identity tables (portal_users, external_identity_bindings,
  password_credentials, activation_credentials, auth_sessions,
  auth_audit_events) as idempotent SQL migrations verified against a real
  `postgres:16` container.
- [x] Auth core: Argon2id (19 MiB/2/1 baseline) hashing, NFC + blocklist
  password policy, 192-bit single-use 24 h activation credentials (hashed at
  rest), opaque 256-bit session tokens (sha256 at rest) with
  `__Host-portal_session` cookies (Secure/HttpOnly/SameSite=Lax), 30 min idle
  / 8 h absolute TTL, CSRF double-submit + Origin checks, login throttling
  (5/15 min delay, 10/30 min 15-minute lock), generic login errors.
- [x] Cloudflare Access verification via `jose` remote JWKS: signature, `kid`
  resolution with TTL cache + unknown-kid refetch (rotation tested), `iss`,
  `aud`, `exp`/`nbf` (clock-skew 30 s), `@azdag.com` email policy; raw email
  headers never trusted.
- [x] Auth API: `/api/auth/{context,login,change-password,logout,csrf}` with
  the full state machine; admin API `/api/admin/users*` with reset-credential,
  revoke-sessions and disable behind an ADMIN guard; HMAC-signed internal
  principal (`auth-policy-v1`) with tamper/expiry rejection.
- [x] `AUTH_MODE` dev / cloudflare_access / cloudflare_access_local_password
  with fail-closed startup guards (dev only with `PORTAL_ENV=local`; non-dev
  requires the full Cloudflare config).
- [x] Bootstrap CLI (`dist/cli/bootstrap.js`) seeds `bobby/ADMIN`,
  `stan/USER`, `thanhvuong/USER` idempotently and prints one-time credentials
  exactly once; nothing secret is committed or logged.
- [x] Compose gains private `control-api` + `portal-postgres` services (no
  public ports) with healthchecks; `.env.example` documents the Cloudflare
  runtime secrets without values; `scripts/control-api-test.sh` runs the
  suite against a real PostgreSQL container with node:22.
- [x] Test matrix: `24` Control API tests pass (repositories 5, auth flows 9,
  security matrix 10) covering forged headers, invalid signature/audience/
  issuer/domain, expired JWT, JWKS rotation, identity binding conflicts,
  cross-user admin denial without data leak, expiry, session revocation,
  forced password change, no account enumeration, CSRF/origin, lockout and
  secret-free responses. `tsc --noEmit` passes.
- [x] Built `local/portal-control-api:dev`; container probe: healthz/readyz/
  context, idempotent bootstrap with one-time credentials printed once and
  skipped on re-run.
- [x] Full Portal backend regression `292 passed, 1 skipped` and full Planning
  backend `18 passed` remain green; workspace verification passes including
  the protected strategy hash. The gateway still routes to the Python
  services (U10 façade owns the cutover); the BFF owns no run/data/alpha
  authority.

Technical debt and rollback:

- The BFF is not yet wired into the web gateway or nginx strip-list; that is
  U10/U06-owner work. Step-up MFA, SCIM, passkey and self-service reset wait
  for U15/U16.
- Session idle/absolute TTLs are config-driven; SLI/monitoring arrives with
  U10 observability.
- Rollback: remove the `control-api`/`portal-postgres` compose services or
  redeploy the previous images; existing Python endpoints are untouched. No
  change was pushed or deployed.
