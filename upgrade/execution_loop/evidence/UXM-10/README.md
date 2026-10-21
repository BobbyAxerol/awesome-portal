# UXM-10 · Coexistence, accessibility and release handoff: draft package

Owner: Claude · 2026-10-20 · Base `claude/uxm-f9` @ `4ac2e3a7` · Lane of every number here: **FIXTURE_LAB / BFF_DOUBLE** (Rules 9.5.5)
Status: **draft package, not accepted.** Nothing in this folder claims that UXM-10 is met; section 3 lists what is open.

What this package is: a browser-tab cost and accessibility regression pass over the V2 screens on the in-repo fixture lane, a scope manifest, a test matrix against the UXM-10 exit criteria, an explicit NOT-MEASURED list, a draft operator runbook and a findings list. What it is not: capacity evidence, a statement about a real source or a real API, or approval to deploy (guide §18: "deploy only after approval").

Files owned by this package: this README, `apps/portal/frontend/e2e/execution-v2-coexistence.spec.ts` (Playwright, `chromium-v2`), `apps/portal/frontend/src/execution/v2/budgets.test.ts` (vitest). No V2 screen source was changed.

## 1. Scope manifest (release candidate)

Build-time list `VITE_EXECUTION_V2_SCREENS` (compose: `PORTAL_EXECUTION_V2_SCREENS`), default empty; also needs `VITE_EXECUTION_PREVIEW_ENABLED=true`. The chromium-v2 lane builds with all 19 mountable keys:

`shell, fleet, cockpit, ops, profile, portfolios, compare, alpha, replay, account, overview, blotter, admin, users, workbench, sandbox, canary, live, request`

`archived` and `replay` are permanent reserved keys (they mount nothing of their own; Archived is a Fleet lens, Replay is an Alpha 360 tab). `EXEC_V2_PENDING_KEYS` is empty. The per-key route, commit and rollback table is **not repeated here**: see [UXM-07 rollback.md](../UXM-07/rollback.md) §2 (20 keys) and §3-§6. The 32 entry routes this package exercises are the `SCREENS` table of `e2e/v2Lane.ts`.

**`fleet-stream` (ELP2-09, 2026-10-21, dark, FIXTURE_LAB evidence only).** A 21st key that is NOT in the list above and is NOT in the shared chromium-v2 build: it needs `fleet` too, mounts one chip inside the Fleet when the table is the Manager dataset of one environment, and opens `GET /manager/fleet/realtime-snapshot` and then `GET /manager/fleet/stream` only when the key is on AND the snapshot says the stream is available. Off (the default) nothing mounts, nothing is requested and the Fleet DOM is unchanged. Its spec runs from `playwright.fleet-stream.config.ts` (own build, port 4177). Remove the key to turn it off. Words it adds: the chip labels `Live`, `Paused`, `Stopped`; every reason is an existing sentence of `realtime/streamView.ts`. The adapter is a `fetch` reader, not `EventSource`, so the typed non-200 problem body and the status are readable and no browser auto-reconnect runs; frames carry no ordinal, so a gap or a duplicate is detected by the server (`SOURCE_COVERAGE_UNPROVED`), the client checks generation, source set and that a block's `id` is its cursor.

**`fleet-stream` refresh-cancellation review (2026-10-21, Claude; FIXTURE_LAB, unit + host Chromium, no hook/visual).** Every request the dark stream can cause, and what cancels it: the barrier read (session stop, last lease released, lens/environment/workspace change, flag off = chip unmounted), the table re-read the pairing asks for (the read's signal now reaches the table request, so it dies with the session), the stream request and its open body (stop, hide, scope change), a loadMore/refresh of the table (new query, unmount). A superseded answer is refused by the machine's epoch (session) and by the hook's generation (table). Findings, all fixed in `useFleetDataset.refresh` and the chip: (1) `refresh()` had no unmount cleanup, so its request kept running and could set state after the screen left; (2) `refresh()` ignored the caller's `AbortSignal` and the chip did not pass one, so stopping the stream did not cancel the table read; (3) two refreshes shared one controller and cancelled each other, so a notice racing an access end failed the pairing read ("The read did not complete"); it is now ONE shared request, cancelled when every caller that passed a signal has cancelled. No defect found in the session or the transport. STALE_BASELINE is bounded to two barrier reads and one table re-read per read, then a failed read (never a third, never the old cursor); the machine allows one read in flight, so re-reads never overlap. A hidden tab closes the stream and opens nothing; a barrier or table read already out when it is hidden is not cancelled by design (its answer is applied and the stream stays closed until the tab is visible). Dark means no extra request: flag off = none; flag on with no stream offered = exactly one (the barrier), no table read (screen test counts requests). Regression tests: `fleetStream/fleetStreamCancellation.test.ts` (14), `useFleetDataset.test.tsx` (`refresh · cancellation`, 8), `screens/fleet/fleetStream.test.tsx` (`cancellation and the dark stream`, 4; the rig now goes through the real `withReadSignal`), and the Playwright case "leaving the scope while the barrier is still out" (13/13 in `playwright.fleet-stream.config.ts`). Open, not touched: `fleetDataset.test.tsx` "a dataset that cannot group by owner or health" and its twin read the owner choices right after `waitFor(rows)`, one effect before they update; they failed in about half of the runs of the whole `screens/fleet` folder under `--maxWorkers=1` and 0 of 6 runs of that file alone. This looks like a race in the test, not in the cancellation code (the changed hook paths are not on that test's route), but it was not checked against the previous commit.

Two things the manifest does **not** include and the package does not test: any real-read screen (UXM-08 is not entered) and any real command path (UXM-09 is not entered). New request and the Sandbox note keep the two V1 writes they always had (UXM-07 README §6); nothing here posts one.

## 2. Test matrix against the UXM-10 exit criteria

Guide §18, UXM-10 Tests/exit: *no trading-server workload per browser tab · valid resource measurements · selected acceptance complete.* Every row is FIXTURE_LAB.

| Exit criterion | What this package ran | Result (this run) | What it does not show |
| --- | --- | --- | --- |
| No trading-server workload per browser tab | (a) per-route request count and bytes, first load and a tab switch, ceilings = measured + 25% (32 routes, `budget ·` tests); (b) idle traffic, 10 s and 60 s on a fake clock, visible and hidden (`idle ·`); (c) `openStream` and `useProfileRealtime` with injected failing/slow ports and fake timers (`budgets.test.ts`); (d) client-side navigation through 19 screens x 3 laps and five open/close drawer cycles, document/window listeners and intervals counted (`coexistence ·`, `drawer ·`) | See §2.1-§2.4 | Anything about what a real source, a real API or a real network does. The doubles never push a stream delta. Browser to source amplification is NOT_MEASURED (ELP2-10 T10-04) |
| Valid resource measurements | The table in §2.1 is reproducible: the spec has a measure mode (`UXM10_MEASURE_OUT`), two runs on two worker counts gave identical counts and bytes, and a self-check asserts every ceiling is `ceil(1.25 x measured)`. Decoded bytes, cold cache, no compression | Valid as measurements of this build on the double | Not "valid" in the ELP2-10 sense: no approved budgets exist (all 42x3 manifest budgets are null, T10-08 BLOCKED_APPROVED_SCOPE_BUDGETS). Ceilings are regression guards derived from today, **not** approved limits |
| Selected acceptance complete | UX-F18 (repeat clicks, back, cancel; drawers and Esc), UX-F21 client half (slow/failed stream, resync once), UX-F22 (390/1024/1440, keyboard, focus, axe) on the fixture subset; coexistence V1/V2 (§2.4) | Partial, see §2.5 | Not complete: the selected read/action scope for the release is not decided (UXM-08/09 not entered), the real-source halves of UX-F21 and F03 are open, visual baselines for the new V2 group were not part of this lane |

### 2.1 Budgets (measured on the 4176 build; ceiling = ceil(1.25 x measured))

Short table; the full 32-row table with every measured value and ceiling is the `BUDGET` constant in the spec. Decoded response bytes. `assets` = same-origin JS/CSS/font/image files of a cold page.

| Route | api requests | api bytes | tab switch (requests / bytes) | assets (files / bytes) |
| --- | ---: | ---: | --- | --- |
| overview | 10 | 119,484 | n/a (no tablist) | 72 / 2.93 MB |
| fleet | 8 | 109,472 | 0 / 0 | 72 / 2.86 MB |
| operations | 9 | 108,965 | 0 / 0 | 72 / 2.89 MB |
| cockpit | 11 | 106,650 | n/a | 74 / 2.96 MB |
| portfolio-360 | 13 | 119,621 | **10 / 19,114** | 76 / 2.98 MB |
| alpha-360 | 10 | 108,576 | 2 / 4,930 | 76 / 2.98 MB |
| alpha-replay | 13 | 117,251 | 3 / 7,333 | 76 / 3.15 MB |
| account-360 | 11 | 110,738 | 3 / 7,537 | 75 / 2.98 MB |
| blotter | 10 | 166,231 | n/a | 68 / 2.83 MB |
| admin | 11 | 202,856 | n/a | 71 / 2.85 MB |
| workbench | 9 | 178,737 | 2 / **77,494** | 75 / 2.95 MB |
| sandbox / canary / live | 8-9 | 102-128 KB | 1-2 / 3.8-27 KB | 72-73 / 2.86-2.89 MB |
| users, access (lightest) | 6, 5 | 111,730; 91,607 | n/a; 2 / 986 | 42 / 1.10 MB; 36 / 1.06 MB |

Range over all 32 routes: 5-13 api requests, 91.6-202.9 KB api bytes, 36-76 asset files, 1.06-3.15 MB assets. Not a single request left the origin on any route.

### 2.2 Idle traffic (fake clock, one page per route)

| Window | Result on all 32 routes |
| --- | --- |
| Visible, first 10 s | 0 requests |
| Visible, 60 s | 0 requests on 31 routes. **Overview: 8** (4 ticks x 2 reads: command-center composition and the unacknowledged-operations count) at the 15 s fallback cadence (`PROJECTION_POLL_MS`) |
| Hidden 60 s (visibility overridden, `visibilitychange` fired) | **0 requests on all 32 routes**, 0 foreign |
| Becoming visible again | 0 requests (no catch-up burst) |

The unit side (`budgets.test.ts`) proves the mechanism: a hidden `usePollTick` never changes state (renders do not grow over ten minutes), the next beat after showing the tab ticks once, an unmounted tick leaves no timer, a zero cadence and the fixtures page start none.

### 2.3 Realtime hooks with injected failing and slow ports (vitest, fake timers)

| Behaviour asserted | Result |
| --- | --- |
| Single-flight: 5 readers of one profile | 1 bootstrap fetch, 1 EventSource; last reader out closes it; next reader makes exactly one new bootstrap |
| Bootstrap network error / HTTP 503 / 401 / 204 / invalid body | each ends the attempt (`closed` / `auth_expired` / `retained`); 1 request; no retry in 5-10 virtual minutes; no EventSource |
| Slow bootstrap (never answers) then unmount | request aborted; a late answer opens no stream |
| Transport error | `closed`, stream closed, 1 fetch, 1 EventSource for 10 virtual minutes |
| Sequence gap | exactly one delayed resnapshot (not before 1000 ms); a second gap closes the channel; 2 fetches total, ever |
| Delta storm (300 in one tick) | 2 re-reads (first at once, one trailing); 100 deltas/s for 10 s: 9-11 re-reads; the bootstrap never repeats |
| Hidden tab | 50 deltas, 0 re-reads; becoming visible: exactly 1 |
| Heartbeats | liveness only, 0 re-reads |
| `openStream`: failing snapshot / slow snapshot closed before it answers / preflight 401, 403 / dying transport / repeated gaps | 1 attempt each; no automatic reconnect in 10 virtual minutes; 50 transport errors give 1 DISCONNECTED; 20 gaps give 1 resnapshot request; 1000 deltas in one tick reach the reducer in full (sequence 1005) and notify the screen at most 10 times |

### 2.4 Coexistence and listener balance

| Check | Result |
| --- | --- |
| Flag-off build (port 4175) vs flag-on build (4176), same URL, 32 routes (Playwright) | flag-off: no V2 root and no V2 marker (`.exec-ctxbar`, `.exec-cmdbar`, `-v2` roots), V1 `.exec-surface` present (Users and Access are portal admin pages with no surface); flag-on: V2 root present |
| Flag-off build ships no V2 code | `dist-preview/assets` contains none of `exec-blk-kpi`, `exec-ctxbar`, `overview-v2`, `exec-dock-scrim`; `dist-v2/assets` contains each (the rollback.md §1 claim, now a test) |
| Mount/unmount each of 19 V2 screens in jsdom, V2 flags on | document+window listeners and running intervals after unmount equal the baseline (19 of 19) |
| Same routes flag-off, two passes | second pass adds nothing |
| Flip the list V2 to V1 three times | nothing accumulates (one module-level capture click note per module evaluation is excluded, see F-9) |
| Browser: SPA navigation through 19 screens, three laps | the third lap equals the second per screen and back at the first screen |
| Browser: drawers (7), five open/close cycles | listeners and intervals back to the starting count |

### 2.5 Keyboard, focus, responsive and axe (1440 / 1024 / 390, 32 routes)

| Check | Result |
| --- | --- |
| No horizontal page scroll | all pass (`accounts@1024` was F-3, fixed 2026-10-20: see §7) |
| Tab walk reaches every tabbable control and comes round (no trap) | all pass (closed `<details>` content is correctly not counted) |
| Visible focus ring on every Tab stop | all pass (outline or box-shadow on every stop) |
| Focused control not covered | all pass except Workbench tabs at 1024 (F-4) |
| Pointer-only controls | none |
| Drawers (Fleet, Accounts, Users, Admin, Operations, Incident, New request) at docked 1600, overlay 1440 and 390 | open with the right `data-mode` and role; modal keeps Tab inside; Esc closes; no scrim/aria-modal/inert/scroll lock left; focus lands on a page control; URL loses `sel`/`compose`. Esc reaches the document from every control (the target-link swallow, F-1, was fixed 2026-10-20) |
| axe-core 4.13 (wcag2a, wcag2aa, wcag21a, wcag21aa), whole page, 3 widths | after the F-5 fixes of 2026-10-20 the rows left in `KNOWN_AXE` are the Sandbox and Workbench stage screens only (FE-C); every other route is clean. `KNOWN_AXE` still fails on any new rule or growth |

## 3. NOT MEASURED (all stay open)

None of the following was run or can be run on this lane. Each remains an open gate; none is waived by a green fixture.

- **Real source, real API load.** No request reached the Execution source, Core, Edge or the Portal API. All reads are the in-repo BFF double. No concurrent-tab or multi-user load; no query fan-out against a real database (ELP2-10 measured one local PG repository path: 20 same-key readers coalesced to 1 SELECT, "not 20 authenticated HTTP users").
- **Real reconnect.** The EventSource and bootstrap failures above are injected in jsdom. No reconnect against a real stream, no server-side `resnapshot_not_before` honoured, no slow-consumer cut by a real server, no epoch rebuild (UX-F21 server half).
- **Cross-host propagation.** Revocation, scope change or ownership change reaching an open stream (UX-F03); HK to SGP to browser latency and freshness; real clock skew.
- **Browser-to-source amplification and coexistence with TS/DL/Research.** Paired B0/B1/B2 regressions and P184 performance G2 are not run (ELP2-10 T10-06, T10-12; request 10-002 BLOCKED). The ELP2-10 coexistence conclusion stays "NOT_RUN production/Research/TS/DL paired regression".
- **Approved budgets.** None exist. The 25% ceilings are regression guards. The 15 s fallback cadence, the 1 s realtime re-read window and the 32-reader pending cap are code defaults, not approved limits (ELP2-10 source-truth: "do not port UDB500/600ms or use a cap as capacity approval").
- **Real data volumes.** The double returns 5-50 rows. Payload sizes at 10^3-10^5 rows, DOM size, virtualisation break points and memory per tab are not measured (Scale refine, CLAUDE.md §8).
- **Transfer size.** Bytes are decoded response bodies from `vite preview` with no compression, cold cache. Gzip/brotli transfer size, CDN and HTTP/2 behaviour are not measured. Warm-cache cost not measured.
- **Time to interactive, CPU, heap, GC.** No timing or memory metric was recorded (the host was also heavily loaded).
- **Browsers other than Chromium**, real assistive technology (screen reader), 200% zoom, forced-colours, touch, and any print path. axe finds a subset of WCAG failures; "axe clean" is not "accessible".
- **Visual baselines for the new V2 group and for the shared V1 files** (UXM-07 DEBT-016, DEBT-019). This lane does not run the pinned-image visual suite.
- **Real-read acceptance (UXM-08) and command UX (UXM-09).** Not entered; not part of this package.
- **Selected release scope.** Which keys ship, to which environment, and who approves is undecided (§4).

## 4. Known gates (open)

| Gate | Owner | State |
| --- | --- | --- |
| Release approval and the selected scope/environment | Bobby | Not given. This package is input to it |
| UXM-08 read-only vertical slice, UXM-09 operations | Claude + Codex | Not entered (UXM-07 README §6 item 7) |
| ELP2-10 approved budgets, calibration, paired coexistence, P184 G2 | Codex + owners | NOT_MET (ELP2-10 README; T10-06/08/12 BLOCKED) |
| ELP2-11 | Codex | NOT_ENTRY_READY |
| UXM-07 R2 for S3 (visual verify, baselines, full hook), DEBT-023/024 | Claude + Bobby | Open (UXM-07 README §6-§7). Debt register: `debt-register.json` there; this package adds F-1 to F-9 below |
| Source/provider qualification (`NO_ACTIVE_MAPPING`) | Codex | Open; no mount is `EXISTS_MOUNTED` |

## 5. Deployment and rollback package

Reuse [../UXM-07/rollback.md](../UXM-07/rollback.md) as is: flag first (drop the key, rebuild; no migration for any key), then commit revert, then backend/infra. This package adds one verified fact to it: the flag-off build contains no V2 code (§2.4, now a test). Not copied here: the 20-key table, the S3 revert command, the backend/migration table (note migration `1723680000145` and its Down), the shared V1 files touched. Per guide §18 the rollback scope is "UI/read-side release preserving IDs/contracts/revocations and economic facts"; nothing in the V2 UI deletes or rewrites those.

## 6. Operator runbook (DRAFT, nothing here has been run on a stack)

Audience: the person who turns V2 screens on or off for a stack. Draft: it has not been walked through with an operator, and Bobby has not approved any cutover.

**Flags.** One list, set at build time. Compose: `PORTAL_EXECUTION_V2_SCREENS=<comma list>` (maps to build arg `EXECUTION_V2_SCREENS` of `deploy/images/portal-web.Dockerfile`). Local: `VITE_EXECUTION_V2_SCREENS`. Also required: `VITE_EXECUTION_PREVIEW_ENABLED=true` (umbrella), otherwise every key is ignored. A typo drops that key only; it never turns anything else on.

- Turn a screen **on**: add its key, rebuild the web image, redeploy the web container. Keys and what they mount: rollback.md §2. `request` and `cockpit` interact (the New request drawer rides `cockpit`); `fleet` also carries the Archived lens and the stage-list redirects; `shell` carries the context bar, command bar and nav overlay and is a shared-file change (DEBT-024).
- Turn a screen **off**: remove its key, rebuild, redeploy. The route stays and serves V1.
- Turn **everything** off: empty the list. Check: `grep -rl "exec-blk\|exec-stage" dist/assets` is empty (and the spec's `dist-preview` scan agrees).
- Gotcha (see memory "Deploy can leave the old container up"): `exit=0` is not proof. Compare the running image ID with the tag, and the bundle name served at the public host with the one just built.

**Fixture or real?** Check three things, in this order, never one:
1. The page: a stack with the fixture overlay shows the **FIXTURE DATA** banner; every V2 screen also states its source status (Not published / Unavailable / Stale are words, never a blank or a 0).
2. The stack: `scripts/research-preview/preview.sh fixture on|off` toggles the fixture BFF (marker `fixture-bff.enabled`). With it on, the API answers from the table in `apps/portal/fixture-bff`, not from a source.
3. The source: `NO_ACTIVE_MAPPING` for the Research workspace and `retained-review` answering a typed 404 mean no live Execution source is mounted. A green page, HTTP 200 or a fixture PASS is none of "the exchange accepted it" (guide §20).

**Before a cutover** (all must be true; none is true today):
- Bobby's approval of the key list, the environment and the time. No agent approves its own release.
- The key list was run through this spec (`--project=chromium-v2`, one run, unlocked) and the unit file, with the table regenerated if the build changed.
- UXM-07 R2 for the new keys is done (visual verify on the pinned image, baselines recorded and reviewed, full hook), or Bobby accepted the gap in writing.
- The real-read prerequisites for any screen that must show real data: a qualified provider, `EXISTS_MOUNTED` source, approved budgets. Otherwise the screen is a preview and must say so.
- A rollback owner is named and the flag-off build for the previous list is built and kept.
- Dev projection check after any backend deploy (refresh_failed and snapshot `source_as_of` per env), and the dev/stable flag drift (8 flags) is reviewed before flipping one.

**Roll back.** In this order: (1) remove the keys, rebuild, redeploy, verify as above; (2) if the build itself is wrong, redeploy the previous image by digest and check the running image ID; (3) only then code reverts from rollback.md, in a throwaway worktree with `tsc` and the focused vitest, never on a shared checkout; (4) backend/migration items are separate and need their own owner (the incident-link index has a Down; contract changes need `generate`, `contracts-test.sh` and the ledger refresh). Do not roll back data: V2 writes nothing of its own, and the two V1 writes it can call (approval create, sandbox capture-note) are not undone by a UI rollback.

**While it runs.** Hidden tabs ask for nothing (§2.2). A visible tab on Overview re-reads two endpoints every 15 s; other screens re-read on stream signals and navigation. A tab opened for hours costs the stream plus that poll, not a growing set of timers (§2.4). If a stream fails the screen stops asking and says so; it does not loop (§2.3). Reload to recover.

## 7. Findings

Each finding has a file:line and a minimal fix. None is fixed here (V2 screen source is not mine to edit); the spec holds a `KNOWN_*` row for each that is a defect, so a fix turns that row red and the row gets deleted.

- **F-1 (defect, keyboard).** Esc does nothing while focus is on a target link inside the Operations or Incident drawer. `TargetLink.tsx:36` (`onKeyDown={stop}`, `stop` at `:20`) and `IncidentLinks.tsx:46-47` stop propagation of every key, so the drawer's document-level Esc listener (`Drawer.tsx` keydown effect) and the V2 command bar's shortcut never see it. Minimal fix: stop only Enter and Space, e.g. `onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); }}`, in both files. Spec: `KNOWN_ESC_SWALLOWED` rows `operations`, `incident`. **Fixed 2026-10-20** (`TargetLink.tsx`, `IncidentLinks.tsx` stop only Enter and Space; row set emptied; unit test in `opsUrl.test.tsx`).
- **F-2 (record fix).** UXM-07 DEBT-017 "no axe" is stale: `@axe-core/playwright` 4.13.0 is a devDependency (`package.json:38`) and ran here. Update the debt register; the axe results are F-5.
- **F-3 (defect, layout).** Accounts & Bindings scrolls the page sideways by about 141 px at 1024 (clean at 1440 and 390). `KNOWN_ACCESS` row `accounts@tablet:overflow`. Probably the register table without a card/overflow wrapper between 661 and 1100 px; fix in `css/account.css` (give the table container `overflow-x: auto; min-width: 0`). **Fixed 2026-10-20.** The wrapper was not the cause (`.exec-cards-wrap` already scrolls): the `(stale)` screen-reader span in a cell is `position:absolute` with no positioned ancestor inside the scroller, so it escaped it and widened the page. `.exec-acct-v2 .exec-cards-wrap { position: relative }` in `account.css`; row deleted; layout guard in `screens/account/layout.test.ts`.
- **F-4 (defect, focus).** On the Workbench screens (all three variants) at 1024 the focused "Overview" tab button is covered by another element (WCAG 2.4.11). `KNOWN_ACCESS` rows `workbench*@tablet:obscured`. Likely the sticky header or a stage-header overlap; check the stacking of `.exec-stage-tabs` in `css/stage.css`. **Fixed 2026-10-20.** Not the stage tabs: the "On scroll" summary bar (`.exec-wb-mini`, `position: sticky; bottom: 0`, 66 px at 1024) sits over the bottom of the viewport and the tab row is there at scroll 0 (tab y 685-719, bar at 702). `css/workbench.css`: `scroll-margin-bottom: 5rem` on the focusable controls of `.exec-wb-v2` from 661 px up, so the browser scrolls a focused control clear of the bar (measured: y 638-672, scrollY 47). The three `workbench*@tablet:obscured` rows are deleted; guard in `screens/workbench/layout.test.ts`.
- **F-5 (axe, 12 routes).** `color-contrast` 53-57 nodes on Account 360 (serious); `scrollable-region-focusable` on Access, Sandbox (4 variants), Workbench (3) and Live with body (5 nodes); `link-in-text-block` on Alpha 360 and Sandbox steps; `nested-interactive` on Alpha replay. Exact node counts: `KNOWN_AXE` in the spec. Minimal fixes: `tabindex="0"` plus a label on scroll containers that hold no focusable child; underline or 3:1 treatment for inline links; remove the interactive child from the interactive replay row. **Fixed 2026-10-20 on the routes the Execution V2 frontend owns.** (a) Account 360 `color-contrast` (57): `.exec-blk-demoted` is opacity .85, so `--ink-faint` #8d8d8d renders #7b7b7b = 4.02:1 on #1c1c1c, 4.46:1 on #111111, 3.71:1 on the selected tint; inside the demoted body of Account 360 only, `--ink-faint` now resolves to `--ink-soft` #c6c6c6 (existing token, about 7.6:1 demoted). Deviation: a demoted label is lighter than on a healthy account. Real fix for the shared demotion (a contrast-safe cue instead of opacity) is an owner decision, it would move Workbench, Replay and Event feed. (b) `scrollable-region-focusable` on Access and Live: `CardsTable` makes its wrap a named focusable region only while it overflows and holds nothing focusable (also cleared Live-with-body). (c) `link-in-text-block` on Alpha 360: the facts-strip `Open` link is underlined (no token pair reaches 3:1 against the ink). (d) `nested-interactive` on Alpha replay: it was not a row; the TradingView attribution link sits inside the `role=img` chart host (tabindex=-1 does not clear the rule). The V2 panel now names the host `role=group` (same label), V1 keeps `img`. Left, not mine (FE-C): `.exec-blk-spine` scroll region on Sandbox and Workbench, and the three `link-in-text-block` links on Sandbox steps (shared `.exec-blk-link`).
- **F-6 (design, not defect).** "No idle polling while the tab is visible" does not hold as written: Overview re-reads two endpoints every 15 s (§2.2). Hidden is silent. Whether 15 s is acceptable needs an approved budget, which does not exist (§3). The timer itself keeps its 15 s beat while the tab is hidden (no network, no state change); a hook could skip arming it.
- **F-7 (observation).** Every screen costs about 2.9 MB of decoded JS/CSS in 72-76 files on a cold page, almost the same for all, so the lazy per-screen chunks share a heavy vendor set. Transfer size is not measured (§3). Worth a bundle analysis before any real-load claim.
- **F-8 (observation).** Portfolio 360 tab switch costs 10 requests (19 KB), Workbench tab switch 77 KB: tab changes re-read rather than reuse. Sandbox "plans" first load issues 2 identical repeated reads (11 requests, 9 distinct). **Sandbox fixed 2026-10-20, cause found.** `screenDeliveryPolicy` returns a new object on every render of the routes, so `ExecutionPreviewRoute.tsx:343` (`useMemo(() => createHttpApi({ policy }), [policy])`) builds a new `api` after every URL change and every screen effect that lists `api` reads again: the certification, the capabilities and the stage eligibility were each read twice when `?tab=Promotion+plans` was rewritten to its slug, and every tab click re-read two of them. The V2 Sandbox branch (and its eligibility wrapper) now gets a port keyed on the policy's value (`stableApi`); measured: sandbox-plans first load 11 -> 10 requests, no repeat; the four Sandbox rows tab switch 2 -> 0 requests. **Not fixed, same cause:** Canary and Live (tab switch 1 -> 2 requests, capabilities and eligibility), Workbench (77 KB), Portfolio 360 (12 requests), Alpha 360/replay (24.7/27.5 KB). Minimal fix for all: give those branches `stableApi` too, or memoise the policy once in `PortalRoutes.tsx:245` (that also changes V1 screens, which then stop re-reading on a URL change: needs a V1 check).
- **F-9 (info).** `Drawer.tsx` registers one capture-phase `click` listener on `document` when the module is evaluated (never removed). One per document, not per mount; the balance tests account for it.
- **F-10 (limit of the double).** The BFF double never emits stream deltas, so the idle and navigation numbers are the floor. A real stream adds re-reads (bounded at about one per second per screen by `REALTIME_COALESCE_MS`, asserted in §2.3), not measured end to end.
- **F-11 (defect, focus; found 2026-10-20 once the 501 noise was gone; FIXED 2026-10-20 in `ac6cda4a`: `shell.css` `html { scroll-padding-top: var(--topbar-h) }`, 56px under 720px; the two `KNOWN_ACCESS` rows are deleted and the access tests of portfolio-360 and live pass on a private V2 build).** A focus scroll can land a control at the top edge of the viewport, under the sticky shell top bar (`.portal-topbar`, 52 px): Portfolio 360 "By funding source" (focus scrolls it to y=0) and Live "My access: Halt" (y=44), both at 1440. The shell sets no `scroll-padding-top`. Minimal fix: `scroll-padding-top: var(--topbar-h, 52px)` on `html` in the shell CSS (shared with V1 and Research: pixel-neutral, but not mine to change without the shell owner), or `scroll-margin-top` on the V2 controls. Spec: `KNOWN_ACCESS` rows `portfolio-360@wide:obscured`, `live@wide:obscured`.
- **F-12 (defect, keyboard/pointer; FIXED 2026-10-20 in `ac6cda4a`: `v2/css/blocks.css` `.exec-blk-replay span[class~="exec-rp-chip"] { cursor: default }`, V1 rule untouched; the three `alpha-replay` rows are deleted and the access test passes).** Alpha replay's header shows the account and the venue as `<span class="exec-rp-chip">` and `.exec-rp-chip` is `cursor: pointer` for every use (`execution.css:5620`; `TradeReplayEvents.tsx:242,248`), so a pointer promises an action the keyboard (and a click) does not have. Minimal fix: `.exec-rp-chip:is(span) { cursor: default }` (V1 shares the class and the file), or a V2-scoped override `.exec-blk-replay span.exec-rp-chip { cursor: default }` in `css/alpha.css`. Spec: `KNOWN_ACCESS` rows `alpha-replay@wide|tablet|narrow:pointer-only`.
- **F-13 (defect, keyboard; fixed 2026-10-20).** The New request drawer's "What happens next" disclosure was unreachable by Tab in the modal drawer: `Drawer.tsx:121` `FOCUSABLE` had no `summary`, so the trap wrapped at the last button and the disclosure after it was skipped (seen at 1440, 1024 and 390). `summary` is now a stop; unit test in `Drawer.test.tsx`; `request.test.tsx` mirrored the old list and now expects SUMMARY as the last stop.
- **F-14 (spec, not a product defect).** The drawer test flagged `?sel=AP-352` after the New request drawer closed. `?sel=` there is the queue behind the drawer selecting its first request on a wide first load (HIFI; `cockpit/index.tsx` "First load on a wide screen"); only `?compose=` names the drawer. The spec now checks `compose` alone for that drawer.
- **F-15 (contract gap, found while serving the self reads; FIXED 2026-10-20 in `da3dbba1`: the batch reader is `...batch.v2` with `challenges[]`, `accessSelfBatch.conformance` loads and is green, the `newReads.test.ts` KNOWN row asserts the v2 body is read; `GET /self-context` has a reader since `66bb1a31`).** `GET /eligibility/batch` is `portal.self-eligibility-batch.v2` with `session_step_up.challenges[]` in the published OpenAPI and fixture; `v2/readers/accessSelfBatch.ts` still reads `...batch.v1` with one `challenge`, so it refuses the canonical body (`unsupported_shape`) and `accessSelfBatch.conformance.test.ts` fails to load on this base (`no parent for path session_step_up.challenge.mechanism`, also red at 892ea030 before this work). Nothing renders the batch yet. Fix: BE-P7 section "FE reader change" (literal to v2, `challenges[]`). `newReads.test.ts` holds a KNOWN row that turns red when the reader moves. `GET /self-context` has no FE reader at all.

## 8. Run record and commands

2026-10-20, tip of this branch, one run alone: `execution-v2-coexistence.spec.ts` on `chromium-v2`, 2 workers, the config's own three webServers started fresh (builds included): **135 passed, 0 failed, 11.3 min** on a heavily loaded host. Vitest `budgets.test.ts`: 41 passed (~30 s); with the v2 hygiene/flag/link-target/product-boundary suites: 7 files, 302 passed. `tsc --noEmit -p .` exit 0. Lane label of all of it: FIXTURE_LAB. The measure-mode runs that cut the table were repeated on two worker counts with identical counts and bytes. Not run: visual suite, Docker, the full hook, any preview stack.

**Re-run 2026-10-20 on `claude/fe-parity` after the Manager, governance and self-access reads were added (base `892ea030`).** Lane: FIXTURE_LAB / BFF_DOUBLE. On the base the spec was 102 passed, 36 failed (private build on ports 4275/4276, one run): 30 of the 36 were console noise from the double's 501 on `manager/series`, `manager/fleet`, `governance/stage-action-eligibility` and `profile-access/v2/self-navigation` (the four routes are now served from the canonical fixtures, see `apps/portal/frontend/e2e/bffDoubleManager.ts`, `bffDoubleGovernance.ts`, `bffDoubleSelfAccess.ts`); the other 6 are F-4/F-8-adjacent budget drift, F-11, F-12, F-13, F-14. After: **138 passed, 0 failed, 6.0 min** (2 workers, one run alone). The BUDGET table in §2.1 and the spec was regenerated by the measure mode in that build; the short table above is the 2026-10-20 first cut and is stale where the spec's `BUDGET` differs (e.g. alpha-360 tab switch 24,676 bytes, Sandbox tab switch 0, Fleet tab switch 1 request). Not run: visual suite, Docker, the full hook, any preview stack.

```
cd apps/portal/frontend
npx tsc --noEmit -p .                                              # exit 0
npx vitest run src/execution/v2/budgets.test.ts --maxWorkers=3     # 41 tests, ~30 s
npx playwright test --project=chromium-v2 execution-v2-coexistence # one run, starts its own webServers
UXM10_MEASURE_OUT=/abs/out.jsonl npx playwright test --project=chromium-v2 execution-v2-coexistence -g budget   # regenerate the table
```
