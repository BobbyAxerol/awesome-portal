# Backend work still owed for the Execution Portal (11 Nov 2026)

Prepared for Bobby and Codex after a read-only survey of the canonical checkout (Codex's 464 uncommitted paths, newest note 6 Nov), the Edge tree and Claude's own gap lists. Marks: **[APPROVAL]** = touches Edge, command, Live, custody or credentials and needs its own explicit owner approval; FE = frontend blocked yes/no.

## Done since the survey (so not owed any more)

- Migrations 155 to 158 applied to the Research preview DB (Bobby approved 11 Nov; the 10 Nov swap note said "not as part of this swap", which stayed true). Four empty tables, nothing consumes them yet.
- Baseline `account-acct-live-grid-v21` re-recorded.
- control-api swapped to `2e31b74da`.

## Blocked on a root action (new)

- **`quant-worker-py` cannot start**: host AppArmor profile `portal-research-child` (CG-RF02-01) was loaded by hand and lost at the host reboot of 10 Nov 14:11Z; no profile file exists on disk. Needs the profile recreated from the 25 Sep decision and loaded as root, then a worker start. The QUEUED run `rrun_5e1185f8...` will be picked up when the worker runs.

## P1. Real source authority (blocks every real-data screen)

1. Fresh Research reader binding and trust: binding expired 28 Oct, certificates 23 Oct, zero Paper heads or receipts. Owner/PM with Codex and Edge. **[APPROVAL]**
2. C2 A2/B2 and P7: owner acceptance and delegation, P8 signing custody, issuer/listener registration. A2 NOT_READY, B2 NOT_SIGNED (6 Nov). Codex with Edge/TS. **[APPROVAL]**
3. V2 recovery and anti-rollback (checkpoint authority, old-holder fencing, restore, single HTTP egress, real Edge ACK). Codex; precondition of 2. **[APPROVAL]**
4. Command STATUS original and PM recovery transport (FE-032 receipt state). Schema now applied; still needs a commissioned original, the PM transport, and landing of the Edge custody migration `0025` (staged, uncommitted in `/home/bobby/portal-edge-status-git-20261103`). FE yes. **[APPROVAL]**
5. Financial source carrier and S6A budget (PM carrier is AS_PUBLISHED_NOT_CURRENT/PARTIAL). FE yes: capital statements and Overview capital. **[APPROVAL]**

## P2. Portal-owned or contract work (Codex)

6. `GET /commands/{operation_id}/receipt`: needs the joined command/state/receipt record from the STATUS work; stays 404 until then. FE yes. **[APPROVAL]** (command path)
7. `GET /readiness`: make `items` nullable and regenerate, or give it a producer (`{met,total}`, `archive_state`). FE yes: Fleet KPIs, 7-segment stage, Archived lens.
8. `GET /search` (FE-023): decide a per-group "not commissioned" state or a published 404; Claude builds after the decision. FE no.
9. Landing: reconcile `app.module.ts` and `main.ts` and `git merge --ff-only claude/slice-followthrough`. The survey expects `app.module.ts` to merge cleanly and `main.ts` to conflict in two places (the import line and the `dependencies` spread); resolution is to keep both imports and both spread entries. Then re-run `scripts/refresh-release-integrity-ledgers.sh`.
10. Preview routing: nginx sends all `/api/v1/execution/` to the fixture BFF, and the preview auto-login session has no retained-review grant, so typed-absence 200 bodies are proven only in the Postgres cell. Decide routing and the grant. FE yes (for any real-API demo).
11. R-MAN (decision): is the V1 runtime-manifest catalogue part answered for callers without a source-workspace grant.
12. R-EVD and R-EQS: real sections and field authority for approval evidence; retained per-deployment equity series and immutable band. Both routes are mounted dark and deny-all. FE yes. **[APPROVAL]**
13. R-A (`view_of_deployment_id`) and R-B (`blocker_summary`/`blocker_count`) contract decisions.
14. Contract hygiene: add `EXECUTION_READ_QUERY_INVALID` to `AlphaLifecycleProblem`; two Research fixtures rejected by their own contract (`research-preflight.response`, `research-run-create.reproduction`).

## P3. Real-source facts (PM, TS, Edge publish)

15. R-WIN `win_rate_pct` (closed-trade denominator, window, methodology, `NO_CLOSED_TRADES`). FE yes: the Winrate Fleet column.
16. R-MDD `max_drawdown_pct` (percent at or below 0, window, equity basis). FE yes: the MDD Fleet column.
17. S-1 `manager/series` live values. 18. S-4/S-5/S-7 capital statement naming, capability text, capital-flow ledger (`seq`, `command_id`, `receipt_ref`, `state`, cursor). 19. S-6 audit source and subject event feed. 20. S-8 stage facts (runtime state, reconciliation verdict, sessions, VN calendar, canary envelope, rollback dates). 21. S-9 archived list and archive commands **[APPROVAL]** (command). 22. FE-044 to FE-055 not re-verified.

## P4. Edge side

23. Wire drift (six items, Rust line numbers in EDGE_CONSUMER_GAP_ANALYSIS): ask for a runtime schema generated from the Rust DTOs and a golden projection fixture. **[APPROVAL]**
24. Compose the Edge Manager read port (`EDGE_MANAGER_READ_PORT`): consumer built and tested (59 tests), not mounted; needs an owner-prepared private reference, a field-grant decision (default deny-all) and an Edge-owner schema for `/internal/v1/compatibility`. FE yes: FE-052, FE-067, FE-072. **[APPROVAL]**
25. Edge flags default-off (current-source, market context and candles, analytics, realtime SSE with the projection PostgreSQL placement). **[APPROVAL]**
26. Command relay: library only, no Edge route, `config.ts` throws if the flag is on, N12 annex `PRODUCTION_INACTIVE`. Gated on C2. **[APPROVAL, hard stop]**
27. N28 typed external gaps (9 capabilities, owner response still the pending example). 28. N29-REL-01 waits for the protected main release ref. 29. EDS-12 deployed evidence pending (signed image set, deployed browser run, runtime markers). **[APPROVAL]** (deploy)

## Order that unblocks the most frontend value

1 trust refresh, 2 C2 A2/B2, 9 landing, 10 preview routing and grant, 15 and 16 (fill the new Fleet columns), 7 readiness, 24 Edge Manager port, 6 and 4 receipt and STATUS, 12 evidence and equity, 18 and 17 capital flow and series.

## Decisions, not work

R-MAN; `/readiness` contract shape; `/search` not-commissioned state; R-A/R-B shapes; field-grant policy for Edge projections; mounting `EDGE_MANAGER_READ_PORT`; preview routing and a retained-review grant for the preview session; realtime SSE placement; win-rate definition and fee treatment and the drawdown equity basis; the real P7 owner acceptance. Expired Research binding or certificates must not be reused: a new window needs owner action.

## What "connect live" would mean here

Everything marked **[APPROVAL]** above. Claude did none of it and will not touch Edge, command, credentials or Live paths without a separate explicit approval per item.
