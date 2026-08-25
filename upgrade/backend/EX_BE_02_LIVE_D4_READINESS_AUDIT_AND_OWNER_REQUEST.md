# EX-BE-02-LIVE — D4 Readiness Audit and Trading System Owner Request

Date: 2026-08-24  
Status: `D4_READINESS_AUDITED / LIVE_D4_INPUTS_BLOCKED / NO_SOURCE_READ`

## Outcome

D2 dark and D3 transport predecessors are accepted, but D4 is not ready to
enter a live window. The current blocker is not Portal transport performance.
It is the absence of a hardened Paper read contract and an encrypted projection
store.

This audit was read-only. It did not call orders, fills, positions or events,
did not create an epoch and did not modify Trading System, AWS networking or
storage.

## Accepted predecessors

- D2: `D2_DARK_ACCEPTED`;
- D3: `D3_TRANSPORT_ACCEPTED` at protected-main commit
  `5ec282ec8c00c60696f66a70186ffd80b051d8a0`;
- runtime exit: accepted D2 source-dark images, no business source calls;
- cross-cell transport: HTTP/2, TLS 1.3 mTLS and delegated JWT accepted; and
- registry, Query, analytics, SSE, commands and activation remain off.

A private mode-0600 owner-input file now carries these accepted predecessor
values with `D4_AUTHORIZED=false`. Template validation passes and changes no
state. Credentials and business identifiers are deliberately absent.

## Contract audit

The existing sanitized Trading System contract pack passes its complete
`MANIFEST.sha256` verification. It is still insufficient for D4:

1. `X-API-Key` is optional on alpha reads. Omission can bypass key verification,
   so the current source contract cannot prove a dedicated read identity.
2. Orders, fills and positions expose only bounded `limit` reads ordered by
   mutable timestamps; they have neither offset nor stable keyset cursor.
3. Events have a composite time cursor, but the observed event population is
   incomplete and lacks an owner-published completeness/watermark contract.
4. The resync/replay surface does not yet publish one cross-resource recovery
   rule suitable for a deterministic projection epoch.
5. The pack's old gateway image identity is superseded. Current runtime is
   `sha256:8a81f121f068bec80821c5f3be38c8865682e248147f1ca808800a18ea8c1fde`
   (`tradingsystem-image:sha-b39349d`). D3 proved public compatibility only; D4
   still needs a fresh, owner-published business-read contract revision.

Portal will not compensate through direct Trading System database, Redis, CLI
or broker access.

## Storage audit

AWS-HK currently exposes one 150 GiB EBS block device. Docker and the D2
projection volume are on its root ext4 filesystem. The accepted infrastructure
evidence identifies that root volume as unencrypted; D2 may keep only its dark,
empty schema there.

No separate D4 encrypted block device/mount or approved encrypted PostgreSQL
boundary exists. The current Docker volume
`portal-execution-projection-pgdata-v1` is therefore prohibited for Paper
business projections.

The preferred bounded placement is an encrypted gp3 EBS volume attached to the
existing AWS-HK instance, with a dedicated mount and a new D4 PostgreSQL data
volume. This is not a new EC2 or RDS service. It still requires an explicit
owner storage decision, capacity/I/O limits and backup/restore evidence.

## Request to the Trading System owner/agent

Return a sanitized Markdown response and machine-readable digest manifest. Do
not return a credential, certificate key, API key, account/alpha value, order,
fill, position or event payload. Do not change Trading System unless Bobby opens
a separate owner-approved change.

### A. Identity boundary

Publish one versioned Paper read identity contract for scope
`PAPER_BINANCE_USDM` and state where it is enforced. The accepted boundary must:

- require the credential rather than treating it as optional;
- reject missing and wrong credentials;
- allow only the four exact GET resources below;
- deny POST, PUT, PATCH, DELETE and all admin/command routes;
- have a named issuer, verifier, rotation owner and revocation procedure; and
- remain distinct from broker, Portal user/session and command identities.

If hardening the existing gateway is not currently planned, the owner may
propose a dedicated read facade in front of its loopback API. That facade must
be owner-published, mandatory-auth and fail closed. Merely relying on the
optional upstream `X-API-Key` is not accepted.

Return only:

- contract revision;
- SHA-256 of the opaque identity identifier;
- SHA-256 of missing/wrong credential and mutation-denial evidence; and
- a statement that no direct DB/Redis/CLI/broker authority is granted.

### B. Exact bounded read surface

Publish the exact query contract for:

- `GET /v1/orders`;
- `GET /v1/fills`;
- `GET /v1/positions`; and
- `GET /v1/events`.

For each route provide typed parameters, ordering, maximum page size, exact
decimal serialization, stable cursor/watermark, population completeness,
dedupe key, retention boundary and error/retry behavior. Return SHA-256 digests
for the route allowlist, source schema/OpenAPI and capability snapshot.

### C. Snapshot, cursor and resync semantics

Define one consistent initial snapshot plus incremental event rule:

- how the snapshot watermark is obtained;
- how events after that watermark are read without a race;
- how duplicate/tied timestamps are ordered;
- what proves end-of-page and population completeness;
- how retention or cursor expiry is reported;
- how a detected gap is repaired; and
- what state requires a full rebuild rather than incremental resume.

Return separate SHA-256 digests for cursor, completeness and resync contracts.

### D. Runtime identity and health guard

Re-capture the gateway immutable image digest, source revision, route-surface
digest and public capability digest. Confirm all existing Trading System health
checks that Portal must monitor during the future D4 load drill. Do not include
topology bodies or sensitive configuration.

## Portal work after the owner response

1. Reconcile the new contract pack and regenerate typed Rust adapters.
2. Add a source credential presence/shape preflight without logging its value.
3. Build and sign the mapper at the exact accepted deployment commit.
4. Seal a payload-free replay corpus and prove pure reducer determinism offline.
5. Provision/approve the encrypted D4 store and pass backup/restore.
6. Fill the private D4 manifest with identifiers and evidence digests only.
7. Open a new owner window and run validator `readiness` before the first source
   call.
8. Create only a `BUILDING` epoch, then execute parity, freshness, gap/resync,
   restart, load, restore and rollback drills.

Passing D4 qualification still cannot activate the epoch, registry profile,
Query, analytics, SSE or commands. Those remain separate owner decisions.

## Frontend coordination

Claude continues fixture/dark/unavailable and recovery states. D3 transport
acceptance is not permission to label a panel live or connect EventSource. A
future D4 `BUILDING` epoch is also non-queryable until a separate activation
decision changes the delivery profile.
