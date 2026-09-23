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

## Rules

- Never point this stack at another project's volumes or ports, and never run
  the base compose file without the script.
- Evidence taken here is `REAL_API_E2E_RECEIPT` only when `identity.json`
  matches the commit under review. Fixture-lane receipts stay separate.
- When the review is over, record the decision in the RF-02 packet: keep
  (running, for Bobby) or teardown (with the command output).
