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
| Flags on | run producer, progress, run library, evidence, split, search, freeze, current source |
| Flags off | P17–P21 (replay, reports, lineage, compare, release candidates) |
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

With the public origin set, harness calls must use that origin too; a write
from `http://localhost:8095` is refused by the Origin check.

## Rules

- Never point this stack at another project's volumes or ports, and never run
  the base compose file without the script.
- Evidence taken here is `REAL_API_E2E_RECEIPT` only when `identity.json`
  matches the commit under review. Fixture-lane receipts stay separate.
- When the review is over, record the decision in the RF-02 packet: keep
  (running, for Bobby) or teardown (with the command output).
