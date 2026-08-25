# EX-BE-02 / N01 — D4 Dormant Closeout Discipline

Status: `OFFLINE_IMPLEMENTATION_ACCEPTED / LIVE_CLOSEOUT_EVIDENCE_PENDING / D4_READER_DARK`

Date: 2026-08-25  
Scope owner: Portal backend  
Trading System mutation authority: **none**

## 1. Goal and outcome

N01 closes the lifecycle gap found after D4 qualification: a finite qualifier
must not leave the dedicated compatibility facade doing full-scope source scans
when Portal has no consumer.

The implementation adds a host-side, fail-closed controller that:

1. accepts only one Portal Compose project and two D4 services;
2. verifies the exact dedicated source-facade Compose identity before stopping
   it;
3. closes automatically when qualification finishes, misses its start deadline,
   the owner window expires or authorization is revoked;
4. recreates only Portal's Source Proxy from the accepted D2 dark runtime;
5. removes only an already-stopped, ephemeral qualifier container;
6. records redacted mode-0600 evidence; and
7. requires Trading System owner evidence proving zero session/select/byte
   movement after closeout.

No Source Proxy, facade, owner window, systemd unit, registry profile or
projection epoch was activated while implementing N01.

## 2. Boundary and authority

```text
host systemd guard (finite owner window)
  └─ execution-d4-dormant-closeout.py
       ├─ may stop: portal-execution-edge / paper-read-qualifier
       ├─ may recreate: portal-execution-edge / source-proxy as D2 dark
       └─ may stop: ts_d4_source_read / portal_paper_read
                    only after exact name + Compose-label match
```

The controller cannot:

- start the Trading System facade or any Trading System business service;
- access a Trading System database, Redis, CLI or broker;
- remove PostgreSQL, an EBS mount, a Docker volume or retained BUILDING epoch;
- enable Query, analytics, SSE, commands, activation or a non-fixture delivery
  profile;
- use a Docker-socket sidecar or grant Docker authority to Portal containers;
- pull a replacement image during emergency closeout.

The D2 restore uses `--pull never`; a missing accepted image is therefore a
visible failure instead of an implicit deployment drift.

## 3. Lifecycle states

| State | Required truth | Allowed transition |
|---|---|---|
| `D4_DORMANT` | no running D4-labelled Portal service; facade absent/stopped | owner-approved guard may observe a future finite window |
| `D4_WINDOW_GUARDED` | owner v2 input valid; <=2h window; guard active | owner starts already-approved source facade and finite qualifier |
| `D4_QUALIFYING` | qualifier observed; all permanent authority flags false | qualifier completion or any abort condition |
| `D4_CLOSEOUT` | stop allowlisted D4 services/facade; restore D2 proxy | source-owner idle observation |
| `D4_DORMANT_VERIFIED` | D2 proxy healthy/dark; zero source session/select/byte deltas | remain dark; no implicit promotion |

If the qualifier is not observed within `START_DEADLINE_SECONDS`, the guard
closes the path. If it was observed and disappears, closeout starts immediately
rather than waiting for the window end. Window expiry and revoked authorization
are unconditional aborts.

## 4. Assets

- controller: `scripts/execution-d4-dormant-closeout.py`;
- offline tests: `scripts/test_execution_d4_dormant_closeout.py`;
- strict config template: `deploy/execution-d4/dormant-closeout.env.example`;
- sanitized owner evidence template:
  `deploy/execution-d4/source-idle-evidence.json.example`;
- non-enabled systemd template:
  `deploy/execution-d4/systemd/portal-execution-d4-window-guard.service.example`;
- operator flow:
  `deploy/runbooks/execution-d4-paper-shadow-and-rollback.md`.

All live configuration, owner input and evidence inputs are non-symlink
mode-0600 files. Evidence contains hashes, state and zero-valued counters only;
it contains no credential, DSN, account, alpha, order, fill, position or event.

## 5. Live operation gate

N01 code completion is not a live D4 authorization. A future owner window must:

1. install and review the systemd template without enabling it permanently;
2. fill the private closeout config with the exact accepted D2 runtime path;
3. run `template` and `audit` before the window;
4. start the guard before the Trading System owner starts the source facade;
5. execute the existing one-shot qualification;
6. let the guard close the path and restore D2 dark;
7. let the Trading System owner observe the bounded idle interval and publish
   the sanitized JSON; and
8. pass `verify` before the window is declared closed.

Any `D4_DORMANT_VIOLATION`, identity mismatch, D2 preflight failure, unhealthy
dark proxy or non-zero owner counter is a hard rejection.

## 6. Verification evidence

Offline acceptance covers:

- exact config schema, permissions and path validation;
- in-window versus expired-window audit behavior;
- qualifier → proxy → dedicated-facade stop order;
- exact Compose label allowlist and fail-before-mutation behavior;
- missed-start and qualifier-finished automatic closeout;
- D2 dark restore and immutable local-image constraint;
- exact sanitized owner evidence schema;
- rejection of non-zero sessions/selects/bytes and stale observation; and
- mode-0600 redacted closeout evidence.

Live zero-idle-traffic evidence remains intentionally pending until Bobby opens
another finite owner window. This phase does not claim a live drill that was
not run.

## 7. Next backend phase

N02 requests an owner-published incremental source contract. Until that
external contract exists, source-independent work may continue on N09/N10,
while Claude keeps Lane B on typed fixtures/unavailable states.
