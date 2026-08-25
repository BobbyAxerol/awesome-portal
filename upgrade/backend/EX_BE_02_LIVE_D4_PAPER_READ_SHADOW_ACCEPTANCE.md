# EX-BE-02-LIVE — D4 Paper read-shadow acceptance

Date: 2026-08-25  
Owner: Bobby  
Scope: finite Paper read-only projection qualification  
Status: `D4_PAPER_READ_SHADOW_ACCEPTED / BUILDING_ONLY / D2_DARK_RESTORED / BUSINESS_READER_STILL_DARK`

## 1. Decision

D4 is accepted for its intended scope: a finite, owner-authorized Paper
read-only qualification through the Portal-owned AWS-HK Source Proxy into a
separately encrypted PostgreSQL `BUILDING` epoch.

This acceptance does **not** activate the epoch or expose Trading System data
to Portal screens. Registry delivery remains `fixture`; Query, analytics,
SSE, commands and activation remain disabled. The AWS-HK runtime was restored
to the previously accepted D2 dark profile after evidence capture.

The predecessor remains
`D3_TRANSPORT_ACCEPTED / BUSINESS_SOURCE_DARK / D2_RUNTIME_RESTORED`.

## 2. Qualified path

```text
Trading System dedicated Paper read facade (loopback, mandatory key)
  -> Portal Source Proxy (mTLS boundary, exact four GET routes)
  -> Rust bounded Paper source transport/adapter
  -> Rust BUILDING-only coordinator and mapper
  -> Portal-owned PostgreSQL on encrypted gp3-backed D4 storage
```

The exact source scope was `PAPER_BINANCE_USDM`; the only business resources
were orders, fills, positions and events. The Edge never possessed the source
read key. No direct Trading System database, Redis, CLI, broker or command
access was used, and no Trading System code or state was changed.

## 3. Immutable deployment evidence

- protected-main source: `c98385538ebad509d3506dc5bb165dccf54631e1`
- signed Execution Edge image:
  `sha256:49efa91a46d8610e8c45062cd7c3bb86f02322984ecb0ce48d2cbb1d270eae75`
- signed Source Proxy image:
  `sha256:08806c9a5d10f3f84ff786a5931a5b352c2ba07198739e3dd2443d4b65e33ad8`
- owner window: `d4-paper-read-qualification-20260825-03`
- fresh epoch: `69b255ba-a1de-406c-92f5-88199397adf7`, status retained as
  `BUILDING`
- sanitized live-evidence manifest SHA-256:
  `4b8c15cffba27e23ca41c416bc7506e219e3632a49393c960d6cdfe3183e5e9a`
- repository acceptance-evidence SHA-256:
  `e91fb18ba72009e8be48caaa34f244344ece4b64707900778fbe710d6d2f045b`

The signed images were verified against the protected-main GitHub Actions
identity. Evidence contains only bounded counts, timings, hashes and status;
it contains no credential, certificate body, DSN, opaque cursor or business
row.

## 4. Qualification results

The finite initial run completed without retry or blocker:

| Signal | Result |
|---|---:|
| Source requests | 33 |
| Retries | 0 |
| Baseline observations | 7,273 |
| Event observations during the bounded window | 0 |
| Elapsed time | 17,456 ms |
| Final freshness age | 619 ms |
| Replay parity | pass |
| Durable epoch | `BUILDING` |
| Activation authorized | false |

Operational drills also passed:

- Source loss failed closed, then a one-request recovery resumed from durable
  state with replay parity.
- PostgreSQL restart recovery resumed from the durable checkpoint with replay
  parity.
- Repeating `prepare` was idempotent (`ALREADY_DURABLE`) and did not widen
  authority.
- Twelve bounded follow-up runs completed with 12 requests, zero retries,
  maximum elapsed time 599 ms and maximum freshness age 671 ms.
- Encrypted dump/restore reproduced the D4 checkpoint/failure signature
  exactly.
- Offline gap and cursor-expiry tests proved that a global gap or expired
  cursor requires a fresh BUILDING epoch; the old cursor is not advanced and
  no bad event is committed.

## 5. Regression and hardening gates

The exact accepted source passed:

- `./scripts/execution-edge-test.sh`: 143 Rust/PostgreSQL tests, fresh
  migrations, replay, idempotency, gap, restart, bounded-load and
  dump/restore gates, plus rustfmt and strict Clippy.
- `./scripts/execution-d4-source-proxy-test.sh`: render, syntax, exact-route,
  mandatory-auth boundary and negative route/method gates.
- `./scripts/execution-d4-qualification-preflight-test.sh`: owner-window,
  evidence-drift and fail-closed qualification admission.
- `./scripts/execution-tracking-test.sh`: backend/shared-board reconciliation.

The earlier pagination-burst and scientific-decimal compatibility findings
remain covered by regression tests. Sustained source rate remains 120/minute;
only the finite one-minute burst is bounded to 120 requests. Scientific
decimal strings are normalized exactly without binary floating-point.

## 6. Rollback and retained evidence

Rollback evidence SHA-256 is
`cdd62e818dfa98f98b37b0dd95ce8cf86096399f710e0b3dea76e1d0494771d2`.
After rollback:

- Edge, D2 PostgreSQL, Source Proxy and Trading System facade were healthy.
- OOM flags were false and all restart counts were zero.
- D2 again used `portal-execution-projection-pgdata-v1`.
- The encrypted D4 volume `portal-execution-projection-pgdata-v2`, BUILDING
  epoch, sanitized evidence and encrypted backup were retained for audit.
- Paper source routes and all business reader/authority flags were disabled.

## 7. What this unlocks—and what it does not

D4 removes the Paper-source compatibility and finite shadow-qualification
blocker. The next backend phase may perform the source-backed operational
qualification portion of `EX-BE-08a`, still behind a new owner window and a
separate delivery-profile decision.

It does not by itself authorize:

- an `ACTIVE` projection epoch;
- registry promotion from `fixture` to `source`;
- frontend Lane B data consumption;
- long-running ingestion, Query/analytics/SSE exposure;
- any command, Paper execution or Trading System mutation.

Claude may now prepare and test the Lane B consumer against sanitized
contracts/evidence, but must keep production source selection unavailable
until `EX-BE-08a` and an explicit registry delivery-profile promotion are
accepted.
