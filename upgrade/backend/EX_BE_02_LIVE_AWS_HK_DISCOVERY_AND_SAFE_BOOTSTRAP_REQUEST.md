# EX-BE-02-LIVE — AWS-HK Discovery and Safe Bootstrap Request

> **Status:** `DISCOVERY_REQUESTED / NO_MUTATION_AUTHORIZED`
>
> **Phase placement:** live infrastructure gate between the completed
> `EX-BE-02` code foundation and `EX-BE-08a` source-ingestion/shadow rollout.
>
> **Target:** Execution Cell on AWS Hong Kong.
>
> **Owner:** Bobby. Portal backend authority: Codex. Trading System authority
> remains outside the Portal repository.

## 0. Instruction to the AWS-HK agent

Read this document completely, then perform **Discovery Gate D0 only**. Return
one sanitized Markdown response using the template in section 12.

The Linux account may be `bobby` and may have broad host privileges. That does
not widen this task's authority. During D0 you must not change the host or any
Trading System component. If a fact cannot be established safely, write
`UNKNOWN` or `OWNER_DECISION_REQUIRED`; do not infer it and do not work around
the boundary.

The response must contain no credential, private key, token, password, cookie,
full environment dump, customer/account payload, broker identifier, active
`alpha_id`, order/fill/position row, database row, or Redis value.

Stop after returning the D0 response. Sections 9–11 describe later gates so the
agent can assess feasibility; they are **not** authorization to execute them.

## 1. Objective

Collect the minimum current runtime and infrastructure facts required to:

1. close the live-evidence remainder of `EX-BE-02`;
2. deploy Portal-owned services adjacent to, but independent of, Trading
   System;
3. connect the SGP TypeScript Control API to an AWS-HK Rust Execution Edge over
   WireGuard + HTTP/2 TLS 1.3 mTLS + delegated RS256 JWT;
4. let a Portal-owned Rust ingestor call only the published, allowlisted,
   read-only Trading System HTTP contract;
5. build a Portal-owned PostgreSQL projection without querying Trading System
   PostgreSQL/Redis directly;
6. keep all execution feature flags dark until parity, replay, security, load
   and rollback evidence is accepted.

Target topology:

```text
Browser
  -> SGP Portal / TypeScript Control API
  -> WireGuard + reusable HTTP/2 mTLS + short delegated JWT
  -> AWS-HK portal-execution-edge-paper (Rust, read-only query/SSE)
  -> Portal-owned projection PostgreSQL (reader credential)

Trading System 127.0.0.1:8000
  <- host-local Portal source proxy (transport/allowlist only)
  <- portal-projection-ingestor-paper (Rust, GET-only adapter)
  -> Portal-owned projection PostgreSQL (writer credential)
```

SGP talks only to `portal-execution-edge-paper`. The source proxy is not an
external Portal endpoint and must never be reachable from the Internet or the
browser.

## 2. Authority and prohibited actions

### 2.1 D0 allowed actions

- inspect host identity, OS, CPU, memory, disk and time synchronization;
- list container names/status/image identities using output-filtered commands;
- inspect Docker/network/firewall capability without changing it;
- inspect listening address/port metadata without capturing traffic;
- call public, read-only loopback endpoints:
  `/v1/health`, `/v1/health/capabilities`, `/v1/contracts`, `/openapi.json`;
- calculate hashes and compare runtime identity with the committed contract
  pack;
- report whether prerequisites are available;
- propose exact commands for a later gate, but do not execute them.

### 2.2 Actions prohibited in D0

- no edit, package install, `systemctl` mutation or firewall/security-group
  mutation;
- no container create/stop/start/restart/recreate/exec and no Compose mutation;
- no `docker inspect` output that includes environment variables or secrets;
- no read of `.env`, secret mounts, SSH private keys, TLS private keys, API
  keys, tokens or broker credentials;
- no PostgreSQL connection, schema query, row read, migration or backup;
- no Redis connection, key listing, membership query, stream read or flush;
- no request using a real/active `alpha_id` or account/deployment identifier;
- no Trading System mutation, admin API, CLI, order submission or credential
  creation;
- no source code edit, checkout, pull, build or Git state change in Trading
  System;
- no packet capture, port scan beyond explicitly named local endpoints, or
  public exposure test;
- no upload of runtime evidence to a third-party service.

### 2.3 Permanent Portal boundary

Even in later approved gates, Portal work must not modify Trading System source,
database, Redis, containers, Compose files or execution authority. The Portal
connector consumes its published HTTP contract. Any Trading System credential
creation or auth repair is a separate owner-approved task for its authority.

## 3. Canonical material to read first

Read in this order:

1. [`EX_BE_02_MTLS_DELEGATED_AUTH_AND_PROBES.md`](./EX_BE_02_MTLS_DELEGATED_AUTH_AND_PROBES.md)
2. [`EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md`](./EX_BE_03_PROJECTION_REDUCER_REPLAY_FRESHNESS.md)
3. [`EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md`](./EX_BE_06_MULTIPLEXED_SSE_RESUME_BACKPRESSURE.md)
4. [`EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md`](./EX_BE_07B_SOURCE_BACKED_PROJECTION_REPOSITORIES_AND_SCREEN_APIS.md)
5. [`../upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/CONNECTOR-CONTRACT.md`](../upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/CONNECTOR-CONTRACT.md)
6. [`../upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/runtime-inventory.md`](../upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/runtime-inventory.md)
7. [`../upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/auth-contract.md`](../upgrade_frontend_plan_hifi/hifi_execution_loop/trading_system_portal_contract_pack/auth-contract.md)

The immutable pack manifest and current runtime hashes are evidence inputs.
Do not regenerate or overwrite the committed pack during D0.

## 4. Facts already known — verify drift, do not rediscover destructively

The 2026-08-21 sanitized contract pack reported:

- AWS host identity `ip-172-31-16-126`; region/AZ was not established in the
  sanitized response;
- Trading System gateway published on host loopback `127.0.0.1:8000`;
- gateway runtime image had drifted from the previous capture while the
  `/openapi.json` bytes remained unchanged;
- running image digest, not checked-out Git SHA, is the runtime authority;
- `/v1/health`, `/v1/health/capabilities`, `/v1/contracts`, `/openapi.json` are
  public within the loopback network boundary;
- the alpha-facing `X-API-Key` is optional in the current gateway path, so the
  Portal edge/source proxy is an essential identity boundary;
- there is no Trading System SSE/WebSocket API; Portal owns projection and SSE
  fan-out;
- Portal adapter/transport is exact-origin, GET-only, revision-pinned and
  bounded; direct Trading System DB/Redis/CLI access is forbidden;
- production feature flags remain false and no successful SGP↔AWS live probe
  has been claimed.

For every fact above report `MATCH`, `DRIFT`, or `NOT_VERIFIED`, including UTC
observation time and a safe evidence reference. Do not include secret-bearing
raw output.

## 5. Questions: host identity, access and capacity

Answer each item explicitly.

### 5.1 Identity and privilege

1. What are the sanitized hostname, UTC time, OS/version, kernel and CPU
   architecture?
2. What do `id` and `groups` report for the connected SSH account?
3. Does `sudo -n -l` work? Summarize allowed command classes; do not reproduce
   sensitive arguments or environment.
4. Can this account use Docker without sudo, with passwordless sudo, or neither?
5. Is this a production/shared host? Which change windows or restart
   restrictions apply?
6. Is another agent/operator actively changing the host? If yes, identify only
   the affected component and coordination window.

### 5.2 Capacity

7. Report logical CPU count, total/available memory and swap status.
8. Report filesystem type, total/free bytes and mount option summary for the
   candidate Portal runtime/data paths.
9. Is there enough reserved headroom for the following Paper pilot, without
   starving Trading System?

   - Rust edge: initial budget 0.5–1 vCPU, 256–512 MiB;
   - Rust ingestor: initial budget 0.5–1 vCPU, 256–512 MiB;
   - source proxy: 128 MiB class;
   - PostgreSQL: 1–2 vCPU, 1–2 GiB plus projection storage;
   - temporary deployment overhead and logs.

10. Are CPU, memory or disk pressure alerts already present?
11. Is the host clock synchronized? Report NTP implementation, sync state and
    observed UTC offset only.

## 6. Questions: network, AWS and WireGuard feasibility

Do not place exact public IPs in a Git-trackable response. Record them as
`PROVIDED_PRIVATELY` and give only the information needed to detect conflicts.

1. Does AWS-HK have a stable Elastic IP or other stable UDP-reachable endpoint?
2. Is the SGP public IP stable and allowlistable in an AWS Security Group?
3. Which sanitized VPC/subnet CIDR ranges, Docker CIDRs and host routes could
   conflict with a proposed WireGuard `/30`?
4. Is example range `10.70.0.0/30` conflict-free? If not, propose a private
   `/30` without applying it.
5. Is UDP `51820` available? If not, propose an unused UDP port.
6. Is `wireguard-tools` already installed? Is the kernel module available?
7. Which firewall manager is authoritative: AWS Security Group, `nftables`,
   `ufw`, raw iptables, or a combination?
8. Can TCP `8443` be bound only to the future WireGuard address and rejected on
   public/VPC interfaces?
9. Is private DNS available? If not, can a certificate with an IP SAN be used
   for the Paper pilot?
10. Are there outbound egress restrictions from AWS to an image registry or
    from SGP to AWS?
11. Report a proposed route/firewall matrix, but do not change routes or rules.

Required target matrix:

| From | To | Transport | Purpose | Publicly reachable? |
|---|---|---|---|---|
| SGP public IP | AWS stable IP | WireGuard UDP | tunnel bootstrap | AWS allowlist only |
| SGP WG IP | AWS WG IP:8443 | HTTP/2 TLS 1.3 mTLS | query/SSE | no |
| AWS ingestor network | local source proxy | TLS 1.3 mTLS | GET-only source | no |
| source proxy | 127.0.0.1:8000 | loopback HTTP | TS published gateway | no |
| AWS edge | Portal projection DB | PostgreSQL TLS/private | SELECT only | no |
| AWS ingestor | Portal projection DB | PostgreSQL TLS/private | projection write | no |

## 7. Questions: container and Trading System runtime compatibility

### 7.1 Container runtime

1. Report Docker Engine and Compose plugin versions.
2. Report container name, status, health and immutable image ID/digest for the
   Trading System gateway and related services using filtered output only.
3. Confirm whether the gateway host publication is still exactly
   `127.0.0.1:8000`.
4. Report existing Docker network names and CIDRs without container IPs or
   secret configuration.
5. Is there an unused Portal-owned Docker network CIDR available?
6. Is GHCR reachable for pulling an immutable private image digest? Report only
   `YES`, `NO` or `NOT_TESTED`; do not reveal registry credentials.
7. Does the host support Docker healthchecks, read-only root filesystems,
   `no-new-privileges`, capability drop and non-root UID/GID `65532`?

### 7.2 Runtime contract drift

Using public loopback GETs only:

1. Record HTTP status, response byte count, elapsed time and SHA-256 for:
   `/v1/health`, `/v1/health/capabilities`, `/v1/contracts`, `/openapi.json`.
2. Compare the OpenAPI digest and route count with the committed pack.
3. Compare API revision, authoritative contract revision, schema revision and
   supported contract revision with the `v1` adapter lock.
4. Report the current gateway immutable image digest and whether it matches the
   pack's most recent observed digest.
5. Report capability differences without including account, alpha, order or
   broker payloads.
6. Confirm that no authenticated alpha probe was attempted.

### 7.3 Safe local connector path

1. Can a Portal-owned host-network source proxy reach
   `127.0.0.1:8000` without changing Trading System?
2. Which private host or dedicated bridge address can the proxy expose to the
   Portal ingestor while remaining unreachable from public, VPC-wide and SGP
   networks?
3. Is an unused private TCP port such as `8444` available for the proxy?
4. Can host firewall rules restrict that listener to the Portal ingestor
   container subnet only?
5. Can the source proxy run as a separate non-root service/container with a
   read-only filesystem and mounted secrets?
6. Is any existing reverse proxy suitable, or should Portal deploy its own
   minimal proxy? Report evidence and recommendation; do not modify either.
7. Confirm that no direct Trading System DB, Redis or Unix socket access is
   required.

## 8. Questions: Portal projection placement and operations

1. Is a private RDS PostgreSQL instance already available for Portal? If not,
   is a dedicated Portal PostgreSQL container acceptable for the Paper pilot?
2. Which PostgreSQL major version is available or approved? Target is 16 unless
   an explicit compatibility decision says otherwise.
3. Which Portal-owned persistent path/volume can be used without sharing
   Trading System storage?
4. Estimate initial projection storage and available growth headroom; label
   assumptions.
5. Can three separate credentials be provisioned?

   - one-shot `projection_migrator` with DDL;
   - `projection_ingestor` with bounded writes;
   - `projection_reader` with `SELECT` only.

6. What backup, restore-test and PITR/snapshot mechanisms are available?
7. Where can redacted logs/metrics be sent? Is the currently inactive
   Loki/Promtail/Grafana stack owner-approved for Portal use, or should Portal
   keep separate local JSON logs initially?
8. What retention limit applies to Portal logs and projection epochs?
9. Can disk, DB pool, ingestion lag, poller liveness, active epoch and SSE
   connection metrics be alerted without reading Trading System internals?

## 9. Questions: PKI, secrets and rotation readiness

Do not generate keys during D0. Answer feasibility and ownership only.

1. Who owns the internal Portal CA and certificate issuance?
2. Is `openssl`, `step-ca`, AWS Private CA or another approved PKI mechanism
   available?
3. Can these identities be kept separate per environment?

   - AWS edge server certificate;
   - SGP Control API client certificate;
   - AWS ingestor/source-proxy client and server certificates;
   - RS256 delegated-read signing key/JWKS.

4. Which secret delivery mechanism is approved: root-owned files, AWS Secrets
   Manager, SSM Parameter Store, or another provider?
5. Can root-owned secret directories be made readable by the exact non-root
   service group without world-readable permissions?
6. Can certificate/JWKS rotation use an overlap window with old+new identities?
7. Where will expiry alerts be sent?
8. Confirm that SSH keys remain operator/deployment credentials and will not be
   reused as runtime API authentication.

## 10. Decisions the AWS agent must not make

Return these as `OWNER_DECISION_REQUIRED` with a recommendation:

1. exact WireGuard CIDR and UDP port;
2. private DNS name;
3. RDS versus local Portal PostgreSQL;
4. creation of a dedicated Trading System Portal read identity/API key;
5. use of an existing observability stack;
6. resource budgets that could constrain Trading System;
7. security-group/firewall mutation;
8. package installation or host service creation;
9. pulling or starting a Portal image;
10. enabling any Portal feature flag or source traffic.

## 11. Later safe-bootstrap gates — planning only

The owner must authorize each gate explicitly after reviewing D0.

### D1 — Portal infrastructure bootstrap

- install/enable WireGuard if needed;
- create Portal-only directories, Linux groups and secret mount boundaries;
- create a dedicated Portal Docker network;
- configure AWS Security Group and host firewall narrowly;
- create certificate/key material through the approved PKI;
- establish WireGuard only, with no application traffic.

Exit evidence: peer handshake, exact routes, public-interface denial, no
Trading System change.

### D2 — dark Portal services

- pull immutable Portal image digests;
- deploy source proxy, projection PostgreSQL/migrator and Execution Edge with
  source/realtime/analytics flags false;
- do not send Trading System alpha-scoped traffic;
- prove non-root/read-only/container limits and rollback.

Exit evidence: health endpoints, mTLS negative tests, DB-role tests and clean
rollback; all registry delivery profiles remain `fixture`.

### D3 — public contract probes

- run capability negotiation against public loopback Trading System endpoints;
- verify image digest/revision/route contract;
- run SGP↔AWS positive and negative mTLS/delegated-JWT probes;
- no alpha/account data and no projection ingestion.

Exit evidence: status/timing/snapshot ID only; no secrets or business payload.

### D4 — owner-approved Paper read identity and shadow ingestion

- use a dedicated service read credential provisioned by Trading System
  authority;
- activate GET-only ingestion into a `BUILDING` epoch;
- run replay/parity/gap/freshness and restart drills;
- never activate the epoch or registry profile until acceptance gates pass.

This is the beginning of `EX-BE-08a`, not part of D0.

## 12. Required response template

Return one Markdown document with this exact structure. A concise evidence
summary is preferred over raw command output.

```markdown
# AWS-HK EX-BE-02-LIVE Discovery Response

Observed at UTC: <timestamp>
SSH account: <name>
Host: <sanitized hostname>
Agent statement: D0 read-only only; no mutation performed: YES/NO

## A. Executive result

Overall: READY_FOR_OWNER_REVIEW | BLOCKED | PARTIAL
Blocking facts:
- ...

## B. Known-fact drift matrix

| Known fact | MATCH / DRIFT / NOT_VERIFIED | Safe evidence |
|---|---|---|
| gateway loopback 127.0.0.1:8000 | | |
| gateway immutable image digest | | |
| OpenAPI digest/route surface | | |
| contracts/capabilities revision | | |
| no TS SSE/WebSocket | | |
| no successful Portal live probe yet | | |

## C. Host and access

| Question | Answer | Confidence/evidence |
|---|---|---|
| OS/kernel/architecture | | |
| SSH user/groups | | |
| sudo mode | | |
| Docker permission/version | | |
| CPU/memory/disk headroom | | |
| NTP synchronized | | |
| shared-host/change constraints | | |

## D. Network and WireGuard

| Question | Answer | Confidence/evidence |
|---|---|---|
| stable AWS endpoint | PROVIDED_PRIVATELY / MISSING / UNKNOWN | |
| stable SGP allowlist source | PROVIDED_PRIVATELY / MISSING / UNKNOWN | |
| proposed /30 conflict-free | | |
| UDP port available | | |
| WireGuard available | | |
| firewall authority | | |
| 8443 can bind WG-only | | |
| registry egress | | |

Proposed route/firewall matrix:
...

## E. Runtime contract

| Endpoint | Status | Bytes | Elapsed ms | SHA-256 / comparison |
|---|---:|---:|---:|---|
| /v1/health | | | | |
| /v1/health/capabilities | | | | |
| /v1/contracts | | | | |
| /openapi.json | | | | |

Gateway image identity: ...
Contract compatibility: COMPATIBLE | INCOMPATIBLE | UNKNOWN
Authenticated alpha probe attempted: NO

## F. Connector feasibility

| Question | Answer | Confidence/evidence |
|---|---|---|
| host-local proxy can reach loopback gateway | | |
| private proxy listener candidate | | |
| candidate port available | | |
| ingestor-only firewall feasible | | |
| non-root/read-only feasible | | |
| direct TS DB/Redis unnecessary | | |

Recommended connector placement:
...

## G. Portal projection and observability

| Question | Answer | Confidence/evidence |
|---|---|---|
| RDS or local PostgreSQL option | | |
| PG major version | | |
| isolated persistent storage | | |
| migrator/writer/reader split | | |
| backup/restore option | | |
| log/metric destination | | |

## H. PKI and secrets readiness

| Question | Answer | Confidence/evidence |
|---|---|---|
| PKI option/owner | | |
| secret delivery option | | |
| non-root group permissions | | |
| rotation overlap feasible | | |
| expiry alerts | | |
| SSH separated from runtime auth | | |

## I. Owner decisions required

1. ...

## J. Proposed D1 commands

Commands only; DO NOT EXECUTE.
For each command state purpose, expected effect and rollback.

## K. Safety attestation

- Trading System files changed: NO
- Trading System containers changed/restarted: NO
- Trading System DB/Redis accessed: NO
- Secret/plaintext credential read or emitted: NO
- Authenticated business-data probe performed: NO
- Firewall/network/package state changed: NO
- Portal service deployed: NO
```

## 13. D0 acceptance criteria

D0 is acceptable only when:

- every section in the response template is present;
- unknowns and owner decisions are explicit;
- runtime drift is compared by immutable identity and contract digest;
- no secret or business payload is included;
- no prohibited action occurred;
- connector feasibility does not depend on direct database/Redis access;
- proposed D1 commands are reversible, scoped to Portal-owned paths/services
  and have a rollback note;
- the agent stopped without performing D1.

After review, Codex will reconcile the response into the hardening findings and
produce the smallest owner-approved D1 change set. No infrastructure or runtime
activation is implied by this document.
