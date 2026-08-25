# EX-BE-02-LIVE — D2 dark execution evidence

> Status: `D2_DARK_ACCEPTED / SOURCE_INACTIVE`  
> Acceptance time: 2026-08-24T11:13:21Z  
> Change window: `d2-live-20260824-02`  
> Deployment/image source commit: `501d27a3702f82cc8d7792ffa6e870485a5dbc09`

## 1. Accepted scope

D2 now runs the minimal Portal-owned Execution boundary on the existing AWS-HK
host. The full Portal, browser ingress and TypeScript Control API remain on SGP.
No Trading System code, container, database, Redis, CLI, broker path, Security
Group rule or business endpoint was changed.

The accepted D2 runtime is deliberately source-dark:

- source probes, projection ingestion, Query, analytics, SSE and command relay
  are all `false`;
- analytics remains `fixture` and no registry delivery profile changed;
- all seven Source Proxy routes retain an exact `return 503` guard;
- no Trading System read identity is mounted; and
- Source Proxy recorded zero HTTP access lines throughout deployment, soak and
  rollback/redeploy.

## 2. Authorization and isolation

- The private owner input authorized only the bounded D2 dark window from
  `2026-08-24T10:45:55Z` to `2026-08-24T12:15:55Z`.
- The fresh same-boot host baseline was accepted at
  `2026-08-24T10:46:10Z`; its SHA-256 is
  `93f582e31c54c9257ede6a48d88d986065701e68b1611443446dd14253c5be97`.
- The exact IAM DryRun passed before activation. The operator then set IMDSv2
  hop limit one, detached only association `iip-assoc-080fb4d501260d3da`, and
  proved the IMDS role-credential path absent before any image pull or
  container creation.
- SSH rollback access remained available. The temporary D1 role is retained
  for audit, but its instance profile is not attached to the workload host.
- Bobby accepted `CVE-2026-14456` temporarily for D2 dark with QUIC/HTTP3
  prohibited. Runtime validation proved one TCP/TLS Source Proxy listener and
  no QUIC, HTTP3, Alt-Svc or UDP listener.

## 3. Immutable runtime and least privilege

| Component | Immutable digest | Accepted state |
|---|---|---|
| Rust Execution Edge | `sha256:c67dc1dcb938fc1fa64070ac72d4e1dcc5cace2355ce813e2a3dfc89ba7a480b` | UID/GID `65532:65532`, read-only root, all capabilities dropped, no-new-privileges, 2 GiB/2 CPU/128 PID ceiling |
| Nginx Source Proxy | `sha256:dafa9e70a3d90cd079147d149dbbaa8ac8a3a9db079b0cf8099892a7f1d5fbe7` | UID/GID `101:101`, read-only root, all capabilities dropped, no-new-privileges, 512 MiB/0.5 CPU/64 PID ceiling |
| PostgreSQL 16 | `sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` | private bridge only, no published 5432, read-only root, TLS/SCRAM, 2 GiB/1.5 CPU/128 PID ceiling |

The one-shot Rust migrator exited zero. `projection-check` passed. Four embedded
migrations were present before and after rollback. Both
`portal_projection_owner` and `portal_projection_runtime` are login roles but
not superuser/createdb/createrole; the runtime role has neither schema-create
nor database-create authority.

Only two protected TCP listeners exist:

- `10.70.0.2:8443` — Edge on the AWS WireGuard address;
- `172.23.0.1:8444` — Source Proxy on the Portal-only bridge gateway.

There is no host listener on 5432 and no protected UDP listener. Public 8443
and 8444 are denied. SGP reaches the private listener over WireGuard, and a
client without the required certificate is rejected during the TLS 1.3
handshake.

## 4. Live soak

Three accepted observations span more than 15 minutes; a fourth observation
passed after rollback/redeploy. Every sample used the same boot-bound baseline
and required exactly three long-running Portal containers plus the exact two
private listeners.

| UTC | Available memory | CPU avg60 delta | I/O full avg60 delta | Memory full avg60 delta | Result |
|---|---:|---:|---:|---:|---|
| 10:53:51 | 9,201,033,216 B | +0.07 | +0.00 | +0.00 | accepted |
| 10:59:27 | 9,180,532,736 B | +0.00 | +0.12 | +0.00 | accepted |
| 11:09:25 | 9,321,500,672 B | +0.00 | +0.03 | +0.00 | accepted |
| 11:11:48 | 8,910,204,928 B | +0.11 | +0.08 | +0.00 | accepted after redeploy |

All values remain well inside the approved floor/ceilings: at least 4 GiB
available memory, no memory-full pressure, at most +1.0 I/O full avg60 and at
most +15 CPU avg60. Edge, Proxy and PostgreSQL had zero restart and zero OOM
events. A transient unrelated shared-host container briefly changed the global
Docker count; the exact Portal count stayed three and the non-Portal container
was removed independently.

Trading System `/v1/health` remained HTTP 200 before deploy, during every
sample, while D2 was absent in rollback, and after redeploy. Observed local
latency remained between 8.952 ms and 12.343 ms.

## 5. Rollback and recovery rehearsal

The accepted Compose stack was brought down with `down --remove-orphans`
without `-v`. Evidence then proved:

- every D2 container and the Portal bridge were absent;
- both 8443 and 8444 listeners were absent;
- the named `portal-execution-projection-pgdata-v1` volume remained present;
- Trading System health remained HTTP 200 at 8.952 ms.

The same dark config and exact immutable digests were reapplied. PostgreSQL
reused the preserved volume, the migrator again exited zero, migration state
remained `4/4`, `projection-check` passed, the exact private listeners returned
and all three services became healthy with zero restart/OOM. Source Proxy
access remained zero and Trading System health remained HTTP 200.

## 6. Executable regression evidence

- host-admission unit tests: 12/12;
- D2 manifest/preflight/rollback gate: pass;
- D3 probe-only offline gate: pass, with no D3 activation;
- image publication trust-chain gate: pass;
- monorepo verification: pass;
- TypeScript Control API on fresh PostgreSQL: 20/20 files, 173/173 tests plus
  migration/restore drill;
- canonical Rust Execution Edge gate: 81/81 unit/integration tests, strict
  Clippy/rustfmt, real PostgreSQL replay/query/analytics/restore evidence.

The observation gate was corrected before live acceptance so post-start
listeners are no longer misclassified as preflight collisions. Observation now
requires the exact two private IPv4 endpoints and rejects wildcard, missing,
duplicate or wrong-port listeners.

Private mode-0600 evidence is stored outside Git at
`/home/bobby/secure/portal-execution-d2-live-evidence.env`; SHA-256:
`3e96950c44f4c073b7d38240cafc8de08b9303a75e3269141295a80ccaa38ef2`.

## 7. Next gate

The next backend phase is **D3 live transport acceptance**, not D4 and not
source activation. D3 must use a new owner window to open only contracts,
health and capabilities, then prove SGP→AWS HTTP/2 + TLS 1.3 mTLS, the complete
delegated-JWT positive/negative matrix, bounded latency and Source Proxy
loss/recovery. Orders, fills, positions and events remain guarded; projection
ingestion, Query, analytics, SSE, commands and delivery-profile activation stay
off.

Claude may consume the accepted D2 runtime state for honest dark/health UX, but
must keep all business data on fixtures and must not open EventSource or bind a
live Execution delivery profile until later handoffs explicitly authorize it.
