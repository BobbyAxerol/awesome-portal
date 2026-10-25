# WP-D Execution V2 shell, completion note (2026-10-23)

Lane FIXTURE_LAB for everything fed by a fixture; chips are typed constants. Base: `claude/post-land-20261022` at 8a17b3ad9, rebased before the last commit.

## Element table (audit sections 4, 6(d) A2, shell rows Overview 3-6 and 8, Portfolios 1, Operations 4, Approvals 6, Access 1, Users 1, A 16 #1 and #6)

| # | Element | State | Where / how |
|---|---|---|---|
| 1 | Environment chips | DATA (existing) | buttons where the read follows the URL, a path-fixed chip on deployment routes, typed "Not applied: Environment" elsewhere |
| 2 | Window chips 7D/30D/90D/ALL | DATA | now also on Compare (its series read sends `window`); typed "Not applied: Window" or the window the read fixes elsewhere (`windowLockFor`) |
| 3 | Basis chip | TYPED | "Basis: each currency on its own" (title: never converted, no selector published); "Basis: USDT, one currency" when a screen states one currency. No FX selector, no conversion |
| 4 | Scope chip | TYPED | "Scope: every portfolio you may see" (no scope parameter published); Portfolio 360 names its portfolio; a screen's own scope fact wins |
| 5 | Bar on Profile & Access, My access, Users | DATA | `PageContextBar` (own surface) above the V2 page; env and window typed "Not applied" |
| 6 | Top-bar "Search or jump to" field + Cmd K | DATA | the carbon CSS hid the search button on every Execution route (the audit's "no field"); a `data-v2-search` button is shown on V2 routes and opens the V2 bar |
| 7 | Entity search: alphas, accounts, operations (target id), incident (exact id) | DATA (server) | `entitySearch.ts`; each group names its read, cap 5, "n of m shown" |
| 8 | Entity search: portfolios, approvals | DATA (matched in the browser) | no search parameter on those reads: matched against the rows the server returned and labelled so |
| 9 | Cross-entity index (one search over alphas, portfolios, accounts, operations, incidents, approvals) | DATA | `searchEntities` (GET /search, execution-entity-search.v1) is the primary source; groups, caps and `total_matched` as the contract defines; the notice names it ("one server search"). Per-read searches (rows 7, 8) are the fallback when /search is unpublished (refused, unreadable, no port method), probed once per bar and labelled; the typed FE-023 line stays whenever the index is not the source. D to K (1) DONE |
| 10 | Operations badge | DATA | `health.open_exception_count` from `GET /operations?limit=1`; hidden when null, 0, partial-labelled "or more", refused |
| 11 | Approvals badge | DATA | `counts.pending` from `GET /governance/approvals?view=ALL&limit=1`; portfolio-wide pending, not "needs you" |
| 12 | "Needs you" count, per-user exception count | BLOCKED: CONTRACT | inbox D to K (2) |
| 13 | User chip | TYPED/DATA | principal username and role word, display only; a link to My access only when one is on offer (admin capability or live self entry) |
| 14 | Display name / role preset ("MANAGER") | BLOCKED: CONTRACT | inbox D to K (4) |
| 15 | Replay alias `/deployments/alphas/:id/replay` | DATA | extra route in the real table, redirects (replace) to `?tab=replay`, context and hash kept |
| 16 | V1 map redirects (Paper/Sandbox/Live lists, Archived, Exit Reviews root, Compare pre rev 9) | DATA | verified end to end by `v1ScreenMap.test.tsx`; flag off nothing redirects |
| 17 | VN-market chip on Deployment | BLOCKED: FILE_OWNED_BY_OTHER_WP (F3) | chip exists only on `/deployments/paper/:id/vn-market`; nothing on the normal page links there; inbox D to F3 |
| 18 | Access "Granted to you" without a workspace in the address | DATA | `SelfWorkspaceContext` carries the self-context RESOLVED workspace (never AMBIGUOUS/NONE/failed) into `ProfileAccessEntry` |
| 19 | Ctrl+K crash | NO DEFECT REPRODUCED | a keydown without `key` threw in the shortcut handler (uncaught error); guarded. Burst presses, 40 open/close cycles, empty-result keys tested: no throw. A chromium target crash is not a JS defect and was not reproduced (OOM on a loaded machine is the likely cause) |
| 20 | Scope selector with several scopes, as-of chip | BLOCKED: DESIGN_DECISION / CONTRACT | no scope parameter; as-of is decision B6 (no read at a past instant) |

Counts over 20 rows: data 12 (1, 2, 5, 6, 7, 8, 9, 10, 11, 15, 16, 18), typed 3 (3, 4, 13), blocked 4 (12, 14, 17, 20; blockers CONTRACT x2, FILE_OWNED_BY_OTHER_WP x1, DESIGN_DECISION/CONTRACT x1), defect check 1 (19, no defect reproduced).

## Files (own paths unless marked shared)
New: `shell/entitySearch.ts`, `shell/navCounts.tsx`, `shell/PageContextBar.tsx`. Edited own: `ContextBar.tsx`, `CommandBar.tsx`, `ExecCommandBar.tsx`, `SelfNavigation.tsx`, `useSelfNavigation.ts`, `css/shell.css`, `ExecutionPreviewRoute.tsx` (Compare window lock, replay alias), `previewRegistry.ts` (one extra route). Shell files outside the exclusive list, additive and V2-only: `app/PortalShell.tsx`, `app/Sidebar.tsx` (badges prop), `app/TopBar.tsx` (`v2` prop, `UserChip`), `app/PortalRoutes.tsx` (`ProfileAccessEntry`, plus `UsersEntry` and the my-access route got the bar), `app/selfNavView.ts` (types, one context), `app/CommandPalette.tsx` (key guard), `styles/shell.css` (rules keyed on `data-v2-search`, `data-v2-count`, `.portal-user-chip`; flag off the carbon topbar is byte for byte as before: `PortalShell.flagOff.test` green).

## Tests (vitest, `--maxWorkers=2`)
New: contextBar.routes (chips per route), entitySearch (each read, caps, failures, abort, debounce, workspace/environment), navCounts (readers, listed-only reads, workspace, unmount), v1ScreenMap (alias and redirects), PortalRoutes.accessWorkspace, PortalRoutes.pageBar, topBarV2, commandShortcut, Sidebar badges, useSelfNavigation resolvedWorkspaceId. Updated: contextFacts, ExecCommandBar, PortalShell.v2CommandBar, PortalShell.v2Gating, previewRegistry. Hygiene run green: disabledReason, testHygiene, titleAbsence, v2Hygiene, uxm10Css, budgets. Counts are in the final report.

## Layout (layout-audit.mjs, populated fixture BFF, 8 routes x 5 widths)
Before (no chips, no field, no chip, no badges: the prior audit's shell rows) versus first iteration: the new field and user chip squeezed the breadcrumb trail (clipped at 1280, and at 1440 on Portfolio 360), the user chip ellipsised, and the badge was 9px (off scale). Fixed: field `clamp(150px, 14vw, 200px)`, trail wraps inside the bar on V2 routes, chip shown from 1280px, badge 10px. Final run: shell findings 0 on all routes and widths, page overflow 0 everywhere. Shell probe (own script, not committed): context bar never overflows (rows 2-6, tallest 167px at 390 on Overview/Portfolio 360), top bar overflow 0, Cmd K panel 640px at 1440 and 358px at 390 with 0 overflow, badges 3 and 30 at 10px, fonts used by the chrome 10 to 16px roles only. Not measured: fleet at 390 in the probe (still rendering at measure time; the audit run covers it).

## Preview ops (for the primary; no docker run here)
Already landed on the preview per LOG 08:24 (exact locations for profile-access and activity). If it needs restating, add to `deploy/research-preview/nginx/fixture-bff/fixture-bff.conf` and fix the comment above `profile-access/v2/effective`:

```
location = /api/admin/profile-access {
    include /etc/nginx/fixture/proxy.inc;
}
location = /api/admin/profile-access/activity {
    include /etc/nginx/fixture/proxy.inc;
}
```
Then `scripts/research-preview/preview.sh build portal-web portal-fixture-bff && scripts/research-preview/preview.sh up` (nginx config is read at container creation; the fixture BFF image carries the WP-E answers). No compose change is needed: the shell's new reads (`/api/v1/execution/operations`, `/governance/approvals`, `/alphas`, `/broker-bindings`, `/portfolios`) are under the existing `^~ /api/v1/execution/` location.

## Inbox answers
B to D (chips, badges): done. C to D (replay alias): done. E to D (workspace pass-through, badges and chips): done; nginx item restated above. F1 to D, F2 to D (basis, scope, window chips, search, user chip, badges): done, except the scope selector (typed, no parameter). Posted: D to K, D to F3.

## Follow-up 2: Codex post-freeze review, three corrections (fix(shell))
1. Command-bar results are keyed to their owning scope `(workspace, environment, capability set and the kinds it lists)` and to the text. A scope change drops the shown results on the same render, aborts the in-flight search and asks again; a late answer for an old scope is refused by a second guard; "is /search served" is learned per scope; a row can be chosen only if it is in the current list, so a selection is never re-labelled with another workspace.
2. `workspace_id` is sent on the Alpha, Account and Portfolio reads (optional `workspace_id` on `ManagerListQuery`; optional `{ workspaceId }` on `listPortfolios`, both additive) and was already sent on `/search`, operations, incident and approvals. No workspace in the address sends none (the server's home workspace); nothing is invented.
3. Nav badges are keyed to `(session, workspace, listed entries)`: a scope change clears the badges in a layout effect before the new read starts, so a pending read never shows another workspace's numbers; revoked eligibility clears at once and stops the read.
Tests: entitySearch (all five per-read families and /search with a non-home workspace, no workspace sends none; deferred A answer after the switch to B, after an environment switch, a delivered answer after a switch, capability removal), navCounts (deferred B, late A dropped, revoked eligibility).
