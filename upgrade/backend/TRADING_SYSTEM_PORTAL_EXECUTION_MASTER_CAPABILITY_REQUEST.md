# Official Trading System Owner Request — Portal Execution Capability Campaign

Status: `OFFICIAL_SINGLE_OWNER_REQUEST / PORTAL_TEMPLATES_READY / OWNER_CAMPAIGN_PENDING / NO_RUNTIME_AUTHORITY`

Request revision: `portal.execution.trading-system-owner-request.v1`  
Date: 2026-08-26  
Requested by: Bobby / Portal  
Portal implementation owner: Portal backend  
Source and execution authority owner: Trading System

> **This is the only active document to send to the Trading System owner.**
> Do not send N02, N03, N11, N12 or older D4/Claude request files as separate
> change requests. Those files are machine-readable annexes and historical
> evidence referenced by this master request.

## 1. Requested outcome

Run one coordinated Trading System implementation/publication campaign that
closes every currently known Portal dependency through N17:

1. publish and implement the incremental source boundary requested by N02/N03;
2. publish the 24 bounded read capabilities requested by N11;
3. publish the nine independently governed command capabilities requested by N12;
4. settle the Event and Artifact portions of the N15 inter-cell contract now,
   rather than opening another owner request later;
5. return the immutable, sanitized evidence needed to promote Paper, Sandbox,
   Live Canary and Live Full in separate Portal delivery profiles;
6. preserve Trading System authority and keep all Portal production flags off
   until each environment-specific acceptance gate passes.

This is one owner campaign and one return root. It may have reviewed milestones
and separate commits, but it must not become one new request per Portal screen or
N-phase.

## 2. Authority boundary

```text
Trading System source/command truth
        |
        | owner-published contracts and bounded interfaces
        v
AWS-HK Source Proxy + Portal Rust Execution Edge
        |
        | Portal-owned projection/query/SSE/command journal
        v
SGP TypeScript Control Plane/BFF
        |
        v
same-origin Portal UI
```

The request authorizes the Trading System owner to design, implement and test
the exact owner-side contracts below under the Trading System repository's own
review rules. It does **not** authorize the Portal agent to edit Trading System,
read its PostgreSQL/Redis/CLI directly, receive broker credentials, open public
listeners, enable production traffic or promote a Portal delivery profile.

SSH remains an operator/bootstrap channel and is never a product data path.
Runtime communication remains TLS 1.3 mTLS plus purpose- and resource-scoped
delegated identity. Read and command identities must be different.

## 3. One consolidated capability scope

### 3.1 Incremental source and event foundation — N02/N03/N06–N08

Publish `d4.paper-read.v2` and implement one bounded, demand-driven incremental
source contract. The first accepted scope is `PAPER_BINANCE_USDM`; the contract
must use an owner-controlled environment/scope allowlist so later Sandbox/Live
promotion does not require a new protocol or a rewritten endpoint.

Required semantics:

- immutable contract revision/capability digest and exact source commit/image;
- active lease, lease expiry and zero recurring scan after demand disappears;
- baseline watermark plus ordered opaque delta cursor;
- full-record `UPSERT`, explicit `DELETE` tombstone and stable event identity;
- deterministic duplicate/replay behavior;
- typed gap, cursor-ahead, cursor-expired, retention-floor and resync responses;
- per-entity `EVENT_SOURCED`, `POLL_BOUNDED` or `UNKNOWN` completeness;
- bounded page/body/rate/concurrency/queue/RSS/query amplification;
- source-load metrics and sanitized query-plan evidence;
- restart, source-loss, rollback and dormant-closeout evidence.

This feed is the N15 source-to-edge Event interface when its entity coverage is
explicit. The owner must publish coverage for orders, fills, positions,
sessions, accounts/bindings, reconciliation, risk/findings and command terminal
events. Unsupported classes remain `POLL_BOUNDED` or `UNKNOWN`; Portal will not
invent event completeness.

Machine annexes:

- `services/portal-execution-edge-rs/contracts/d4-paper-read-v2-request/`
- `services/portal-execution-edge-rs/contracts/d4-paper-read-v2-implementation-request/`

### 3.2 Supplemental bounded Query capabilities — N11

Publish the complete known 24-capability GET catalogue, or an explicit partial
publication where every missing capability remains unavailable:

- orders: list, trace, group legs and fills;
- deployments: positions, execution quality and contribution;
- bindings/portfolio: snapshot, full-population exposure verdict and packed
  correlation sample counts;
- venue/market: authoritative calendar/session/order types, ticks and candles;
- current state: account, execution session and reconciliation;
- operations: command journal, findings, alerts, dead letters, trace order,
  streams, alpha activity and bounded Redis-retention facts.

Each published route needs an exact GET path, scope, keyset/bounds, response
schema, positive fixture, common authority/freshness/completeness envelope,
mTLS plus exact-resource delegated read JWT and negative evidence. Generic SQL,
Redis get/scan, CLI/shell, broker credentials and caller-selectable source scope
are forbidden substitutes.

This catalogue already covers the currently known backend dependencies from
BR-EX-24 through BR-EX-59: Full Blotter, stage analytics, Trade Replay,
Account/Binding screens, incident/operations panels, Alpha/Portfolio views and
Live overview. New display composition remains Portal-owned and is not another
Trading System request.

Machine annex:

- `services/portal-execution-edge-rs/contracts/n11-external-read-v1-request/`

### 3.3 Command interface — N12/N13/N16

Publish nine exact commands using a dedicated command identity:

| Capability | Environment | Lane | Effect |
|---|---|---|---|
| `paper.halt` | Paper | R1 | protective, monotonic |
| `paper.cancel-open-orders` | Paper | R1 | protective |
| `sandbox.halt` | Sandbox | R2 | protective, monotonic |
| `sandbox.cancel-open-orders` | Sandbox | R2 | protective |
| `live.halt` | Live Canary/Full | R3 | protective, monotonic |
| `live.reduce` | Live Canary/Full | R3 | protective, bounded |
| `live.emergency-close` | Live Canary/Full | R3 | protective, no blind retry |
| `live.resume` | Live Canary/Full | R4 | risk-increasing |
| `live.scale` | Live Canary/Full | R4 | risk-increasing |

Each entry must publish an exact POST apply route and bounded GET verification
route, request/receipt schemas, accepted and terminal fixtures, target/version
binding, immutable payload hash, idempotency policy and a one-operation
delegated JWT over mTLS. `202` means accepted but non-terminal. Terminal truth
is `SUCCEEDED`, `FAILED`, `DENIED` or `PARTIAL`; timeout/disconnect/unknown is
`UNCERTAIN` and must never trigger blind retry.

R3 requires phishing-resistant step-up. R4 additionally requires distinct
approvers and can never inherit a protective/emergency bypass. The N16
emergency path uses the same R3 owner contract, terminal observation and audit;
it does not create a second hidden command API.

Machine annex:

- `services/portal-execution-edge-rs/contracts/n12-command-relay-v1-request/`

### 3.4 Artifact interface — N15

Settle the owner-side Artifact contract in this campaign. The minimum contract
is metadata/reference based:

```text
artifact_id, kind, sha256, size_bytes, media_type, schema_version,
source_authority, created_at, retention_class, access_policy,
signed_read_url_expiry
```

The owner must decide and publish:

- which deployment/strategy artifacts Trading System consumes;
- exact accepted kinds/schema versions and maximum sizes;
- digest/signature verification before use;
- idempotent retrieve/acknowledge behavior, if a retrieve endpoint is needed;
- short-lived actor/workload-scoped access with no permanent object-store key;
- rejection and audit semantics for missing, expired, digest-mismatched or
  incompatible artifacts;
- which Trading System evidence is reference-only by source ID/hash.

If Trading System needs no artifact transport because it already consumes an
immutable owner-approved location, publish that ruling and its verification
contract. Do not invent an upload API merely to satisfy the document.

## 4. Single owner return root

Return one sanitized tree, not separate chat replies:

```text
/home/bobby/portal-trading-system-owner-return-v1/
  MASTER_RESPONSE.md
  master-publication.manifest.json
  n02-incremental-contract/
    owner-pack.manifest.json
    incremental-contract.json
    compatibility-fixtures.json
    error-corpus.json
  n03-source-implementation/
    owner-implementation.manifest.json
    implementation-profile.json
    source-metrics.json
    query-plan-evidence.json
    acceptance-results.json
  n11-external-read/
    capability-catalogue.json
    semantic-rulings.json
    golden-corpus-index.json
    acceptance-results.json
    owner-publication.manifest.json
    schemas/
    fixtures/
  n12-command/
    command-capability-catalogue.json
    terminal-corpus-index.json
    acceptance-results.json
    owner-publication.manifest.json
    schemas/
    fixtures/
  n15-event-artifact/
    gateway-rulings.json
    event-coverage.json
    artifact-contract.json
    schemas/
    fixtures/
  operational-evidence/
    dormant-closeout.json
    paper-fast-qualification.json
    sandbox-certification.json
    live-canary-certification.json
    release-compatibility.json
    slo-dr-rotation.json
```

`master-publication.manifest.json` must bind every returned regular file by
SHA-256 plus source commit/image/config/contract revisions. A partial milestone
may omit later evidence files, but must list them as `PENDING`, never fabricate
zero/green truth. Portal activation must remain false in all publication packs.

Never place credentials, API keys, private keys, certificates, DSNs, SQL,
business rows, account/strategy/instrument identifiers or customer data in the
return root.

## 5. One campaign, staged delivery

The owner should implement in this order under one feature programme:

1. freeze semantic rulings and the N02/N11/N12/N15 contract revisions;
2. implement and test the incremental source plus explicit event coverage;
3. implement the 24 exact read capabilities, reusing shared typed schemas and
   authentication middleware;
4. implement command routes and journal/terminal truth, starting with Paper R1
   but keeping all nine capabilities in the same versioned catalogue;
5. publish Artifact compatibility/rulings;
6. return the single manifest-bound tree;
7. support separate Portal qualification windows without changing the
   published protocol per environment.

Partial implementation is acceptable and remains typed unavailable. It does
not justify a separate request document or a global activation switch.

## 6. N01–N17 dependency audit

| Phase | Trading System dependency | Covered here | Later new TS feature request expected? |
|---|---|---|---|
| N01 | finite dormant closeout and zero-idle evidence | operational evidence | No |
| N02 | incremental source contract | §3.1 + N02 annex | No |
| N03 | owner implementation/image/evidence | §3.1 + N03 annex | No |
| N04 | Portal Rust consumer | consumes N02/N03 | No |
| N05 | Portal retention/recovery | source retention floor from N02 | No |
| N06 | real Paper qualification window and source metrics | §3.1 + operational evidence | No |
| N07 | Portal projection/query shadow | consumes accepted source/read contracts | No |
| N08 | Portal SSE | consumes incremental events; no browser-to-TS stream | No |
| N09 | Portal governance/workflow | Portal-owned | No |
| N10 | Portal analytics contracts | consumes N11 facts | No |
| N11 | 24 external GET capabilities | §3.2 + N11 annex | No |
| N12 | nine command capabilities | §3.3 + N12 annex | No |
| N13A | Portal staged-activation state machine, source-dark | none; Portal works now | No |
| N13B | Paper→Sandbox→Canary→Live promotion | same contracts, new evidence/profile only | No |
| N14A | Portal release manifest/isolation/rollback | none; Portal works source-dark | No |
| N14B | joint release compatibility and immutable identities | operational evidence | No |
| N15A | four-interface contracts and transport doubles | none; Portal works source-dark | No |
| N15B | real Query/Command/Event/Artifact acceptance | §§3.1–3.4 | No |
| N16A | same-domain/emergency policy and simulated failover | none; Portal works source-dark | No |
| N16B | real emergency protective operation and observed ack | N12 R3 + N11 ops facts | No |
| N17A | Portal SLO/DR/rotation tooling and dry-runs | none; Portal works source-dark | No |
| N17B | joint production SLO, DR, restore, rotation and game day | operational evidence | No |

On current knowledge, no additional Trading System feature request is needed
after this one. A new request is legal only when a genuinely new product
requirement appears or the owner publishes an incompatible contract change; it
must amend this master revision instead of creating a free-standing phase file.

The Portal team will continue every `A` lane while the owner campaign runs.
Trading System completion is a hard prerequisite only for the matching `B`
lane; no A-lane completion can be cited as runtime or activation evidence.

## 7. Acceptance and activation discipline

Portal validates owner bytes with the existing template/candidate/acceptance
verifiers:

```bash
python3 scripts/execution-n02-contract-verify.py --mode acceptance \
  --pack-dir /PRIVATE/RETURN/n02-incremental-contract

python3 scripts/execution-n03-implementation-verify.py --mode acceptance \
  --pack-dir /PRIVATE/RETURN/n03-source-implementation \
  --n02-pack-dir /PRIVATE/RETURN/n02-incremental-contract

python3 scripts/execution-n11-external-read-verify.py --mode acceptance \
  --pack-dir /PRIVATE/RETURN/n11-external-read

python3 scripts/execution-n12-command-publication-verify.py --mode acceptance \
  --pack-dir /PRIVATE/RETURN/n12-command
```

Publication proves contract/evidence bytes only. Activation remains independent:

```text
fixture -> shadow -> paper -> sandbox -> live_canary -> live_full
```

Query, SSE and R1/R2/R3/R4 command flags are separate. One successful read
cannot enable a command. One environment cannot promote another. Rollback
disables only the affected capability/profile and retains operator visibility.

## 8. Required negative and operational evidence

The single campaign must cover, in proportion to each interface:

- missing/wrong/revoked mTLS and delegated identities;
- wrong audience, issuer, resource, workspace, environment, role and expiry;
- duplicate/replay/out-of-order/gap/cursor-expired/tombstone behavior;
- source loss/recovery, restart, lease loss and zero-idle-source behavior;
- response/request/schema/enum drift and body/page/rate limits;
- HTTP 202 non-terminal, duplicate/conflict and `UNCERTAIN` command handling;
- stale target version, WebAuthn/SoD/dual-approval and command kill switch;
- broker/source/network loss, WAN partition and bounded recovery;
- immutable image/config/contract digests, rollback and dormant closeout;
- backup/restore, credential/certificate rotation and measured SLO evidence.

## 9. Owner response

`MASTER_RESPONSE.md` should state:

```text
Trading System branch and source commit:
Immutable image/config digests:
Implemented milestone(s): N02/N03/N11/N12/N15
Published and unavailable capabilities:
First accepted scope:
Read identity and command identity are distinct: YES/NO
Direct Portal DB/Redis/CLI/broker authority granted: NO
Event coverage by entity:
Artifact compatibility ruling:
Paper/Sandbox/Live runtime flags changed: NO
Sanitized return-root path:
Verifier/test commands and results:
Known gaps:
Rollback commit/image/config:
Owner/SRE sign-off:
```

The Portal team will import only accepted non-secret bytes in a reviewed commit,
then run its own shadow/qualification gates. This master request alone changes
no runtime state.
