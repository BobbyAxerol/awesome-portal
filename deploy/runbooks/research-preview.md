# Research preview stack (RF02-B3)

An isolated stack for reviewing Research screens against real reads — S01–S07,
S02 and S12 — without touching `dev-portal`, stable or the Execution probe.
Approved by Bobby as Q6 on 2026-09-23. Tracked in Unified §13 RF-02.

| Property | Value |
|---|---|
| Compose project | `portal-research-preview` (fixed by the script) |
| Web | `http://localhost:8095` — loopback only |
| Files | `compose.yaml` + `deploy/compose.research-progress.yaml` + `deploy/research-preview/compose.research-preview.yaml` |
| Env / secrets | `~/.config/portal-research-preview/preview.env` (mode 0600, outside the checkout) |
| Data | `/srv/primus/historical-market-data/storage`, read-only, group `primus-market-data-readers` |
| State | its own PostgreSQL, NATS, MinIO and artifact volumes (`portal-research-preview_*`) |
| Research flags | Host-bound qualified profile: producer/progress, library, evidence, split/search/freeze, retained/current-source, replay/reports/lineage/compare, RC/publication and qualified recipes; preserved by scoped rollouts. |
| Execution preview | Existing product routes compiled; local Command Center snapshot and governance reads enabled (Bobby, 2026-10-10). |
| Execution external flags | Source/profile reads, projection/mirror writers/reads, Execution SSE, upstream analytics/market feeds and commands/R0 remain explicitly off in the preview overlay. |
| Accounts | `bobby` (owner, ADMIN) and `claude-preview` (ADMIN, for the automated receipt) |

## Commands

```bash
scripts/research-preview/preview.sh init       # once: writes the env file with a fresh internal secret
scripts/research-preview/preview.sh build      # images from this checkout, stamped with the commit
scripts/research-preview/preview.sh up         # migrate + bootstrap + start; writes identity.json
scripts/research-preview/preview.sh activate   # one-time activation credentials, stdout only
scripts/research-preview/preview.sh status     # services, image IDs, commit, web health
scripts/research-preview/preview.sh down       # stop, keep data
scripts/research-preview/preview.sh teardown   # stop and delete only this project's volumes
```

Seeding a real run (after `activate` and one sign-in as `claude-preview`, whose
new password is kept in `claude-preview.password` beside the env file):

```bash
node scripts/research-preview/seed-run.mjs   # install P04 binding → preflight → run → follow progress
```

`preview.sh activate` re-issues one-time credentials for **every** listed user,
so it also resets an account already activated (claude-preview included);
re-activate the ones you need afterwards.

It uses only published same-origin routes and prints identifiers and states,
never a credential. Build notes: the approved Historical Market Data reader
wheel must be staged at `vendor/hmd-reader/` (ignored); `AUTH_MODE=dev` is only
accepted with `PORTAL_ENV=local`, so the preview is `local` with its own
query-cursor and governance keyrings.

The script refuses ports 8080, 8081, 8090 and 18081, and never prints the env
file. `identity.json` beside it records the git commit, the image ID of every
running service and the last migration, so a receipt can name exactly what it
looked at.

## Looking at it

- From this host: open `http://localhost:8095`. `AUTH_MODE=dev` stands in for
  Cloudflare Access (the identity is `dev@azdag.com` unless the harness sends
  `x-dev-access-email`); the Portal login itself is real.
- From elsewhere (Bobby, optional): a one-label hostname behind Cloudflare
  Access pointing at `127.0.0.1:8095` through the existing tunnel, e.g.
  `research-preview.primusspark.com` — the Origin CA wildcard covers one label.
  That is a Cloudflare change only Bobby makes (DNS + Access application); it
  needs nothing from this repository and is removed the same way. Until then
  an SSH tunnel works: `ssh -L 8095:127.0.0.1:8095 <host>`.

## Public hostname — research-portal.primusspark.com

Requested by Bobby on 2026-09-23 ("rebuild … trên research-portal.primusspark.com,
không đụng dev hay main"). Same shape as `dev-portal`:

1. `preview.env`: `PORTAL_PUBLIC_ORIGIN=https://research-portal.primusspark.com`
   (the Control API checks the Origin of every write against it), then
   `preview.sh build && preview.sh up`.
2. Loopback nginx: the `research-portal.primusspark.com` server block in
   `deploy/nginx/portal-loopback.conf` → upstream `127.0.0.1:8095`, identity
   headers stripped. Installed on the host 2026-09-23 (backup
   `portal-loopback.conf.pre-research-routing-20260923`), `nginx -t` + reload.
3. Cloudflare Tunnel: the `research-portal.primusspark.com` rule in
   `deploy/cloudflared/config.example.yml`, placed before the 404 catch-all in
   `/etc/cloudflared/config.yml`, then `systemctl restart cloudflared`. This
   step is Bobby's (tunnel/DNS changes); restarting the tunnel briefly
   reconnects every hostname on it.
4. Check: `https://research-portal.primusspark.com` → 200, and
   `RESEARCH_PREVIEW_ORIGIN=https://research-portal.primusspark.com npx playwright test -c playwright.research-preview.config.ts`.

**Current owner exception (2026-10-10):** `research-portal` is a public review
preview without Cloudflare Access and with the existing preview auto-login.
Do not infer production security from this exception or expose execution
source credentials, reconnect AWS, enable broker commands or renew TLS/SLA.
Research-local writes remain constrained by the existing workspace/session,
Origin/CSRF and admission contracts; review data must not contain production
secrets. Cloudflare/security/source/release qualification belongs to an
explicit later dev/main promotion, not this preview build.

With the public origin set, harness calls must use that origin too; a write
from `http://localhost:8095` is refused by the Origin check.

## Rules

- Never point this stack at another project's volumes or ports, and never run
  the base compose file without the script.
- Evidence taken here is `REAL_API_E2E_RECEIPT` only when `identity.json`
  matches the commit under review. Fixture-lane receipts stay separate.
- When the review is over, record the decision in the RF-02 packet: keep
  (running, for Bobby) or teardown (with the command output).

## Unified Research + Execution review — 2026-10-10

The tracked preview overlay, not an edit in a release directory, enables
`EXECUTION_PREVIEW_ENABLED=true` **at web build time**. Merely changing a
runtime env value cannot mount the router in an already-built bundle. The
Control API already contains the Execution BFFs; the overlay enables only
the local Command Center snapshot, alongside existing local governance.

Use the narrow existing helper from the reviewed Research checkout:

```bash
node --test scripts/research-preview/unified-preview-config.test.mjs scripts/research-preview/preview-source-stamps.test.mjs
scripts/research-preview/preview.sh build control-api portal-web
scripts/research-preview/preview.sh up control-api portal-web
```

The scoped `up` path excludes DB/NATS/worker, migrations and bootstrap. Never
run `activate` just to rebuild: it rotates already-issued user credentials.
Preserve all host env Research recipe flags and private keys. Record both
source commit and actual image IDs; unchanged private services retain their
previous images. Keep the prior web/Control API images for rollback.

Review `/research/quantbt/runs`, `/execution`, `/execution/operations`,
`/governance/approvals`, `/governance/waivers`, `/deployments/alphas`,
`/deployments/portfolios`, `/deployments/accounts`, `/deployments/paper`,
`/deployments/sandbox`, `/deployments/live`, `/deployments/blotter` and
`/administration/actions`. An existing published Research RC's actual R1
link is the integration proof; do not manufacture an approval or promote it
through R2/Canary/Live just for screenshots.

**Data truth:** this independent preview was measured with zero Execution
projection snapshots. Source-disabled panels are expected and remain typed;
they are not authoritative empty Trading System records. Product routes use
same-origin BFF consumers, never `createFixtureApi`. Existing
`/execution/_fixtures` is a separate labelled design lab, not product data.
No claim of live freshness, streaming or operational gate activation follows
from opening the UI. The expired upstream Manager TLS chain remains a
separate inter-cell qualification issue.

[Owner approval, scope and exit gate](../../upgrade/UNIFIED_IMPLEMENTATION_PLAN.md#2026-10-10-owner-addendum--unified-research--execution-review-preview) ·
[Actual browser/runtime receipt](../../upgrade/research_loop/evidence/P24/UNIFIED_RESEARCH_EXECUTION_PREVIEW_2026-10-10.md).
