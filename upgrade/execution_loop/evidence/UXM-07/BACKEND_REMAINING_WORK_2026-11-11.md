# Backend work still owed for the Execution Portal (11 Nov 2026)

Prepared for Bobby and Codex after a read-only survey of the canonical checkout (Codex's 464 uncommitted paths, newest note 6 Nov), the Edge tree and Claude's own gap lists. Marks: **[APPROVAL]** = touches Edge, command, Live, custody or credentials and needs its own explicit owner approval; FE = frontend blocked yes/no.

## Done since the survey (so not owed any more)

- Migrations 155 to 158 applied to the Research preview DB (Bobby approved 11 Nov; the 10 Nov swap note said "not as part of this swap", which stayed true). Four empty tables, nothing consumes them yet.
- Baseline `account-acct-live-grid-v21` re-recorded.
- control-api swapped to `2e31b74da`.

## Done later on 11 Nov

- `quant-worker-py` is running again: Bobby approved loading the committed AppArmor profile (`deploy/research-preview/apparmor-research-child`); loaded as root, worker started 09:43:04Z under `portal-research-child`. Open: the profile is not persisted across host reboots (host owner to install under `/etc/apparmor.d`), and the QUEUED run `rrun_5e1185f8...` had not been picked up in the first minutes.

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

---

# Plan added 11 Nov (Bobby: put it in the plan and do it)

## A. Is the public lane on fixture endpoints today? Yes for Execution, measured

Evidence, not memory:

- research-portal nginx (`/etc/nginx/fixture/fixture-bff.conf`, hybrid marker present) sends **every** `/api/v1/execution/*`, `/api/v1/portal/*` and the Access/admin reads (`profile-access*`, `accounts`, `step-up`) to the fixture BFF, whose own header says "Execution fixture reads remain synthetic and bypass Control API authorization". Only auth (`/api/auth/*`) and Research/QuantBT (`/api/runs`, run library, alpha catalogue) reach the real isolated Control API.
- Probe of the **real** Control API (preview auto-login session, which has no retained-review grant), 65 parameterless Execution GET routes of the live inventory:

| Outcome | Routes | Meaning |
| --- | --- | --- |
| 200 | 11: `activation/capabilities`, `commands/catalog`, `commands/tasks`, `compositions/operations`, `compositions/waivers`, `governance/approvals`, `governance/approvals/history`, `governance/review-capture-capabilities`, `governance/stage-action-eligibility`, `governance/waivers`, `operations` | Portal-owned data, real today. These are the ones that can be flipped from fixture to real now |
| 404 `REQUEST_REJECTED` | 43: all Manager/Fleet/Overview/alpha/portfolio/account reads, `blotter/summary`, typed-absence reads, `derivations/source-health`, `contract-authority`, ... | `SessionGuard` under `retained_review_v1` refuses non-core paths for a caller without a read grant on the projection workspace; behind that, the sources are dark (see P1) |
| 400 / 403 / 204 | 10 | need parameters, a scope, or are realtime |
| 404 `EXECUTION_READ_NOT_AVAILABLE` | 3: `command-center`, `compositions/command-center`, `visit-digest` | typed absence |

So: Portal-owned governance, operations and command-catalog data can go real now; everything backed by TS/Edge/Core stays synthetic until the P1 items (trust refresh, DB grants, C2) and the P3 facts exist. Nothing from the Edge reaches any public screen today.

## B. Work packages (Claude does these; owners of real sources are named in P1 to P4)

| # | Package | Done when |
| --- | --- | --- |
| W1 | Land and gate: commit the three spec type fixes, fast-forward `docs/research-loop-plan`, full hook on the merged tip, refresh ledgers and route inventory | tsc clean in control-api, hook exit 0 on the merged tip |
| W2 | **Fixture to real for the 11 Portal-owned reads**: capture each real body, run it through the frontend reader, fix any reader or producer mismatch, then move the exact location out of `fixture-bff.conf` one read at a time | per read: reader accepts the real body, a Playwright real-lane check passes, the screen shows real rows or an honest empty state; the lane is rebuilt and measured |
| W3 | Consumer corrections that need no new source (ELP2-10 intake 18 Oct): FE-048 absent-stage handling, FE-053 malformed roster, FE-055 correct double, FE-044 and FE-050 consume the selected schema | each has a test that loads the canonical fixture; vitest and tsc green |
| W4 | FE-035 fleet-map projection `view=MAP` (Portal-owned: row_key, name, allocation, windowed return and net PnL, health, stage_presence, at most 1000 rows, own byte cap) | contract plus 1000-row fixture, typed absence when the manager dataset is dark, heat map reading it; real values only when the dataset publishes |
| W5 | Run the real-source readiness check the day a source is published: for each P1 to P4 item delivered, add its route to the W2 flip procedure | a published source is switched from fixture to real in one reviewed step |
| W6 | Worker and queue (below) | decision recorded |
| W7 | AppArmor persistence (approved by Bobby; waiting for the Bash allow rule) and receipt route (deferred by Bobby until a real Core exists) | allow rule added, profile in `/etc/apparmor.d`, loaded at boot |
| W8 | Archive then remove the stale agent worktrees (about 40) | listed, each checked for unmerged commits, archived, removed |

Order: W1, W2, W3, W6, W4, W7, W8; W5 whenever an owner publishes.

## C. Worker and queue finding (11 Nov, read only)

`quant-worker-py` is running (started 09:43:04Z). JetStream stream `QUANT_JOBS`: 0 messages; consumer `quant-worker-py` delivered and acknowledged everything up to stream sequence 106 (last message 14 Oct), nothing pending. So the run `rrun_5e1185f8...` shown as QUEUED is **not in any queue**: `run_read_models` holds 102 QUEUED and 5 COMPLETED rows that are read copies without a job; nothing will pick them up, and nothing was modified. Separate defect, not the cause: the stream covers `quant.run.requested.>` only, while the worker publishes terminal events to `quant.run.succeeded` and `quant.run.failed`, which match no stream, so each publish fails with `NoStreamResponseError` (logged as "terminal worker notification was not published; durable state remains authoritative"). No subscriber for those subjects exists in the repository. Decision needed before changing it: add the two subjects to the stream, or stop publishing them.

## D. W2 executed on research-portal (11 Nov, 12:42Z), Bobby chose "only the routes with real data"

- Four reads now go to the **real** Control API: `GET /api/v1/execution/commands/catalog`, `commands/tasks`, `activation/capabilities`, `governance/stage-action-eligibility`. Mechanism: two UNTRACKED files in `deploy/research-preview/nginx/hybrid-fixture/` (`real-routes.conf` with four exact `location =` blocks, `real-proxy.inc`), excluded from git through `.git/info/exclude`; `nginx -t` then `nginx -s reload` inside `portal-research-preview-portal-web-1`. No compose up, no recreate, `control-api` untouched. The repo's example file calls this an "operator action, never Claude's"; Bobby lifted that for these four routes.
- Evidence: before the reload the four answered with `X-Fixture-Overlay: on` (29,801 / 33,658 / 1,946 / 3,025 bytes); after, `X-Real-Route: core`, no overlay header, sizes equal to the real bodies (36,775 / 34,141 / 1,983, and 3,278 for stage eligibility with the caller's real workspace id; a made-up workspace id correctly answers 404 from the real server). `/administration/actions` in a browser at 1440 and 390: `commands/tasks`, `commands/catalog` and `activation/capabilities` are REAL, `compositions/admin-action-drawer` stays fixture, no page error, and the screen shows the real catalogue (24 tasks: Ready 0, Not enabled 12, Start elsewhere 4, Not offered 8, "RELAY OFF", "Catalogue freshness: unavailable").
- Still fixture on purpose (empty on the real preview, so the review lane keeps its rich data): `governance/approvals`, `governance/approvals/history`, `governance/waivers`, `operations`, `compositions/operations`, `compositions/waivers`, `governance/review-capture-capabilities`. All seven bodies are already accepted by the frontend readers (`realBodies.conformance.test.ts`, 11 of 11).
- Rollback: delete `real-routes.conf` and `real-proxy.inc`, `nginx -t`, `nginx -s reload`. The files live in the worktree that portal-web mounts (`/home/bobby/portal-research-ft/...`), so rebuilding portal-web from another checkout also removes them.

## E. W3 consumer corrections, checked against the current code (11 Nov)

| Item (ELP2-10 intake, 18 Oct) | State today |
| --- | --- |
| FE-053 malformed roster read as empty | already fixed in `features/admin/accountApi.ts` (`DEBT-UXM07-013`: a roster that is not a list throws, an explicit empty list stays empty) |
| FE-048 absent stage read as zero | V2 screens already use `stageCounts[stage] ?? null` (`overviewModel.ts`, `fleetModel.ts`); the legacy V1 `screens/AlphaFleet.tsx` falls back to counting its loaded rows, not to 0 |
| FE-055 wrong double for the command-center snapshot | **defect found and fixed**: the double answered `portal.execution.profile-realtime.v1` for `/command-center/realtime-snapshot`, which `profileContainers.tsx` and `overview/stream.ts` refuse. It now answers `execution.manager-realtime-snapshot.v2` with `stream_available: false`; new `src/fixtureBff/realtimeSchemas.test.ts` pins each route's own schema and a negative cross-schema case. The running lane picks it up on the next fixture-bff rebuild |
| FE-044, FE-049, FE-050 | constraints, not defects: keep the selected schema, explicit environment, three separate clocks; no producer field to consume yet. Nothing to change without a new producer contract |
| FE-035 `view=MAP` | not started (P3). Needs the manager dataset (dark) and a contract plus 1000-row fixture first |

## F. Done after section E (11 Nov, afternoon), with Bobby's answers from the question tool

- **AppArmor persistence (W7): done.** `deploy/research-preview/apparmor-research-child` installed byte-identical (`cmp`) as `/etc/apparmor.d/portal-research-child` (root, 0644) and reloaded with `apparmor_parser -r -W` from that path: `portal-research-child (enforce)`. The `apparmor` service is enabled and active, so the profile loads at boot. `quant-worker-py` running, 0 restarts, `AppArmorProfile portal-research-child`. Bobby added the Bash allow rule; the profile content was not changed.
- **Worker terminal events (W6): done as Bobby chose ("stop publishing, log clearly").** `NatsJetStreamBroker.covers(subject)` answers from the one `STREAM_SUBJECTS` list that also creates the stream (`quant.run.requested.>`); the worker's `_publish_terminal_event` skips a subject the broker says no stream retains and logs one INFO line ("no stream retains this subject; durable state remains authoritative") instead of a WARNING with a traceback per run. A broker that covers the subject, or has no `covers`, publishes exactly as before, so the assertions in `test_durable_worker`, `test_research_run_producer` and `test_research_delta_wfo` are unchanged. New `tests/test_terminal_event_subjects.py` (wildcard matching, `covers`, skip with INFO and no traceback, publish still tolerated when a broker refuses).
- **Seven reads still fixture (W2): kept on purpose** (Bobby: "not yet, keep the rich fixture"). Flip them when the preview has real data.
- **Old agent worktrees (W8): done.** 43 worktrees removed, about 11 GB freed. One had uncommitted files (a `dist-w6` build directory only). All 235 branches kept, including 40 with commits not on the integration branch.
- **FE-035 (W4): contract and fixtures only.** New sibling `fleet-map` (`GET /api/v1/execution/manager/fleet-map`, `view=MAP` as its own bounded read so the Manager model is untouched): row = row_key, name, allocation, window_return, net_pnl, health, stage_presence (the Manager row's own vocabularies), at most 1000 rows, `truncated` and `total_count` so a cap never reads as the whole fleet. Fixtures: published, capped_small, a 1000-row body (462 KB); six negatives including 1001 rows, duplicate row_key, a count above the rows without `truncated`. No producer and no consumer yet (the manager dataset is dark); the reader is generated with the others.
