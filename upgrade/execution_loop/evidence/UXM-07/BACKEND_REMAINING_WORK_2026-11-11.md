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

## G. Verification at the tip (11 Nov, evening)

| Gate | Result |
| --- | --- |
| Full pre-commit hook on the merged tip `b2ad87aca` (13:57 to 14:59Z) | exit 0, "Portal monorepo verification passed". The first merged-tip run (`8af0a2ce0`) failed: 18 tests in 14 files, all Codex's new C2 specs (missing mock for `c2-p7-review-runtime`, two census queries the fake pool did not answer, nine PG specs without the dedicated-cell guard their siblings use, three needing `openssl` or `python3`), plus a stale N29 ledger. Fixed in `02fc09978` and `b2ad87aca`; the pin `CURRENT_HUMAN_RESEARCH_SCHEMA_SHA256` was re-pinned with Bobby's approval |
| Contracts cell (`scripts/contracts-test.sh`, whole suite) | 113 files, 1,962 tests, exit 0 (includes the 15 siblings and the flattened preflight schemas); snapshot 729 files |
| Frontend readers | 51 files, 66,952 tests passed (5 expected fail unchanged) |
| Frontend `src/fixtureBff`, Overview, Command Center consumers (FE-055) | 71 files, 1,163 tests passed; golden changed in exactly the four command-center entries |
| `tsc --noEmit` | clean in `apps/control-api` (merged tree) and `apps/portal/frontend` |
| V2 Playwright plus pixel suite (`chromium-v2`, pinned image) on the tip | 412 tests: 411 passed, 1 skipped, exit 0 (22.9 min) |
| Python backend (Python 3.12 image, pytest installed into a temporary directory) | `test_terminal_event_subjects` plus `test_durable_worker`: 23 passed. Six real-child tests in `test_research_run_producer` and `test_research_delta_wfo` fail the same way on the untouched `2faa8968f`: the trial container has no child sandbox (seccomp and the AppArmor profile of the worker); not caused by the worker change |
| Lane (research-portal, rebuilt at the tip) | Fleet table 1128 of 1128 at 1440 with MDD and Winrate; capital flow `pf_scale_006` Initial funds 60,000.00 (1 Aug), Approved budget 60,000.00 (16 Aug, "Limit, not cash"), Returned 17,499.25, NAV 42,659.41, a date per flow and a Time column; Portfolio alphas tab and the Account Allocations tab use the 11-column Fleet table; Overview shows no JPY and no USD; four reads real (`X-Real-Route: core`), the command-center snapshot answers `execution.manager-realtime-snapshot.v2`, the seven others stay fixture; no page error on Admin Actions at 1440 and 390 |

Open and not Claude's to close: Edge and TS data grants, win rate and drawdown facts (PM and TS), the Research trust binding (expired 28 Oct), C2 A2/B2 and P7, command relay and Live (still `PRODUCTION_INACTIVE`), the receipt route (waits for a real Core, Bobby's choice), the seven reads that need real preview data.

## H. Decisions closed on 11 Nov (read of the code; no change was needed)

| Request | Decision | Evidence |
| --- | --- | --- |
| R-MAN (V1 `runtime-manifest` for a caller without a source-workspace grant) | **No change; the V1 route stays workspace-bound.** The route's own comment (`execution/runtime-manifest.controller.ts` lines 49 to 52) says the legacy DTO mixes catalogue evidence with runtime configuration, business-read permission cannot authorize the technical part, and an old schema must not be silently redacted into a different success body. The static catalogue part already has its own public route (`contract-authority`). | The frontend already degrades correctly: `useExecutionRuntime.ts` falls back to `DEFAULT_PAGE_BOUNDS` and labels the source `FRONTEND_DEFAULT` instead of failing a screen |
| R-A (`view_of_deployment_id` on room identity, incident and queue row) | **Declined.** The request itself states the variants are a fixture device ("the real API has no variants"). A published field with no possible real producer would only widen three contracts. The fixture BFF keeps resolving a variant id to its base. | `CLAUDE_TO_CODEX_OPEN_REQUESTS_2026-10-29.md`, R-A "Actual" and "Fallback" |
| R-B (`blocker_summary` and `blocker_count` on the gate evidence frame) | **Already delivered.** The Live parent body carries both with the rule "count 0 if and only if summary null" (`governance/live-parent.contract.ts` line 9, schema `governance-live-decision-review.v1`); the frontend reader accepts it (`readers/governanceParents.ts` line 1255) and `cockpit/EvidenceFrame.tsx` line 990 prints the gate's own blocker line instead of only the generic sentence. | the three locators above |

## I. Before and after of the capital rule, `pf_scale_006` (UI adjustment point 2)

Source of "before": `apps/portal/fixture-bff/review-manager.ts` at `2faa8968f` (positive world branch: `initial_funds: opening`, `returned_capital: "0"`, `current_budget` = the world budget, a limit above allocated capital rounded up to the next ten thousand; no effective time on any figure). Source of "after": the same function today (UXM-07 WP-2) and the live lane measured on 11 Nov.

| Figure (USDT) | Before | After | Why |
| --- | --- | --- | --- |
| Allocated (current) | 42,500.75 | 42,500.75 | unchanged: `dep_scale_015` 40,000.25 plus `dep_scale_040` 2,500.50 |
| Approved budget | 60,000.00 | 60,000.00 | a **limit**, not cash (labelled "Limit, not cash" on the diagram) |
| Initial funds | **42,500.75** (it was the sum of allocations) | **60,000.00** | the owner's complaint: initial funds below the approved budget made no sense. The PM TS guide (11.1) and the Manager UX guide (6.3) say a budget is a limit over the capital that was funded: allocated plus headroom equals the budget, and funds never sit below it |
| Returned capital | 0.00 | 17,499.25 | the unallocated surplus is returned: initial minus allocated |
| Headroom | 17,499.25 | 17,499.25 | budget minus allocated |
| NAV | 42,659.41 | 42,659.41 | now closes by arithmetic: 60,000.00 + 0.00 - 17,499.25 + 158.66 net PnL |
| Time per flow | none (no figure carried an effective time) | Initial funds 1 Aug, Returned 4 Aug, Approved budget 16 Aug, `dep_scale_015` 1 Oct, `dep_scale_040` 2 Oct; a Time column and an "Allocated at" column; figures with no receipt of their own (NAV, headroom, net external flows, recalling) read "Not published" | optional `effective_at_ms` per metric and `allocation_effective_at_ms` per child (contract change), ordered as the PM TS guide orders a portfolio's life: funds in and returned, then the budget approval, then the allocations; "Times are UTC, the effective time each source publishes, none inferred" |

The live lane at 15:12Z (rebuilt at the tip) shows the "after" column; the screenshot of the diagram and the ledger (six rows with UTC times) was taken from `https://research-portal.primusspark.com/deployments/portfolios/pf_scale_006?tab=allocations` on the lane.

Screenshot evidence of section I: `img/capital-flow-pf_scale_006-before-after-2026-11-11.png`. Same frontend (the research-portal lane at the tip) in both halves; the left half reads a private copy of the fixture BFF built from `2faa8968f` (the old data), the right half reads the lane's own BFF. Measured text: before "Initial funds 42,500.75, Approved budget 60,000.00, Returned 0.00", allocations dated 12 and 13 Jul against a ledger starting 13 Jul; after "Initial funds 60,000.00 (1 Aug), Approved budget 60,000.00 (16 Aug), Returned 17,499.25 (4 Aug)", allocations 1 Oct and 2 Oct matching the ledger.

## J. What Edge asks Core to return (read of `EDGE_TS_CORE_READ_E2E_REQUEST_20261111_R2.md` section 6, 12 Nov)

State on 12 Nov (Edge notes 11 to 12 Nov, untracked in the canonical tree): the real least-privilege TS facade identity connected to `trading_system` with verified TLS, all 96 catalogue relations and 1,350 declared columns match the live metadata, 16 columns are denied (all in the two owner-excluded credential and token tables), TS raised the role connection limit from 4 to 12. Edge states **mapping and re-point NOT READY, connected read through Core NOT RUN**, and waits for the Core inputs below. Edge needs only a private reference `{path, sha256}` for each document; no session, token or credential value goes into a mailbox, Git or chat, and Core must never receive a DB login.

One set per actual scope (paper, sandbox, live; Canary needs its own identity and a binding Edge changes and tests first):

1. **Installed-ready document** `portal.execution.connected-read-ready.v1`: `status=INSTALLED`, `native_selection_verified=true`; origin (fixed `https://research-portal.primusspark.com`), environment, workspace_id (`ws_` + 8 to 96 characters), profile_id (`[A-Z][A-Z0-9_]{2,95}`), projection_epoch, acceptance_id; `api_ip` actually commissioned; `core_commit` (40 hex), `core_image` (`sha256:` digest), `core_config_sha256`, `field_policy_sha256`, `catalogue_sha256` (optionally `api_leaf_sha256`, `relation_catalogue_sha256`); subject (`usr_...`), native_revision, policy_revision, manager_grant_id and revision, `read_authorized=true`, `native_revoked=false`, `stream_authorized`; `session_sha256`; UTC `expires_at`, `trust_expires_at`, `native_expires_at`, each outliving the agreed request deadline. A distinct stream grant and revision, `source_set_ref` and a real way to observe a notice only if STREAM is in scope (READ does not grant STREAM).
2. **Private session**: either the owner-approved private browser-session document or `portal.research-acceptance-session-token.v1` (`session_id, user_id, cookie_name=__Host-portal_session, token, absolute_expires_at`) that outlives the whole test; return only its reference and hash. An application session does not prove Cloudflare, password or human presence; those references are separate where a route needs them. No fabricated human session and no production password change.
3. **Revoke, cache and stream inputs** (only for the specimens in scope): a fresh ready document after Core's authorized current-policy revoke plus `portal.execution.connected-read-revoke.v1` (baseline, before and after producer hashes, scope digest, policy, grant and native revisions, UTC commit time, official receipt hash); PM-native denial needs its own correlated owner receipt; STREAM-only revoke needs the distinct grant ids and the official `portal.native-research-manager-revoke.v1` receipt; cache or P22 needs private pinned prime and HIT with custody and ACK references.
4. **Per missing item** Core answers `NOT_READY` with owner and time, never a guess.

What blocks this on our side, in the order it must happen: (a) a new current Research trust window (the previous binding expired 28 Oct and certificates 23 Oct; reuse is not allowed, so the owner must open a new one); (b) the native selection installed and verified on the Research preview Control API, which today runs the retained-review profile (`EXECUTION_READ_PROFILE=retained_review_v1`, deny-all on writes) and refuses non-core reads to a caller without a grant; (c) a genuine session and a manager grant for the reader; (d) the private references prepared by the owner. None of (a) to (d) is something Claude can create: they carry credentials and authority. Edge and TS notes also confirm that A2/B2 command authority, the event or history lane and the journal fence do not gate a bounded read.
