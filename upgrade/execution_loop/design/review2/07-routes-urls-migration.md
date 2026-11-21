# Review2-07 — Routes, URLs, migration (read-only critic, 2026-10-18)

Basis (static read, nothing executed): README (S1-S7, UI3, C1-C4), V1_SCREEN_REVIEW §1/§6, V1_SUBSCREEN_DISPOSITION, sweep/01 + sweep/05, UXM-01 §1-§2, `registry.json` rev 6, `PortalRoutes.tsx`, `previewRegistry.ts`, `links.ts`, `idLinks.tsx`, `routeState.ts`, `ExecutionPreviewRoute.tsx`, `e2e/execution-{journeys,preview,fixtures}.spec.ts`, `runtimeBounds.test.ts`, `execution.test.tsx`, `test_portal_registry_contract.py`, `portal_registry.py`. Test claims come from grep/reading, not from a run.

## 0. Findings that shape everything
1. **Registry cannot express the redirects.** `legacy_routes` are normalised with the query stripped (`_normalize_route`) and `LegacyRedirect` only goes to a feature's `canonical_route`. `/deployments/paper` -> `/deployments/alphas?stage=paper` has to be a hard-coded `<Navigate>` in `PortalRoutes` (that file already allows "legacy compatibility redirects"). The registry keeps the three feature roots and only turns off their nav.
2. **Screen ids and routes are pinned from three sides:** the server screen-contract catalogue (`runtimeBounds.test.ts` hard-codes 25 screens + route parity), the 22 gated baselines (named by screen), and `execution-preview.spec` screen_id asserts. Rule for V2: **never rename a `screen_id` or an existing `route`; only add.**
3. **Tab values in V1 URLs are display labels** (`?tab=Insight+Charts`, `Structure+%26+Correlation`). `useParamState` falls back silently to the default for an unknown value, so a renamed tab degrades to the wrong tab with no error. Aliases must run before `useParamState`.
4. **Today the only shared URL context is `workspace_id`** (read in `ExecutionPreviewRoute`, forwarded to reads). `env`/`window`/`ccy` do not exist in the UI URL yet: env is implied by path (`/deployments/{paper|sandbox|live}`) and sent to the BFF as `environment=`. `ID_ROUTES` / `targetHrefFor` emit bare paths, so every IdLink drops context today.
5. **Spec conflict:** UXM-01 §2 says `window` default `30d`, values 7d/30d/90d; Bobby's UI3 says default 90D with 7D/30D/90D/ALL (Operations: 24H default). UI3 wins; UXM-01 must be corrected. `PortfolioOverview` already defaults 90d; `alphaScope.ts` has `30d|90d|1y|All`.
6. **Stage and env are coupled in the backend** (env mandatory, no ALL). Folding Paper/Sandbox/Live into Fleet `stage=` means a stage filter either picks the env or Fleet reads three envs. The redirect below sets both; Codex must confirm (section 3, C-9).

## 1. FINAL V2 route map
Legend: K kept unchanged path; N new; C kept path, new content; R redirect (section 2). Shared = travels in the context bar (C1); Local = screen-only. Default values are **never serialised** (keeps `/execution$`, `/governance/approvals$` regexes in e2e green).

| Route | Screen (id kept) | State | Params (local unless noted) |
| --- | --- | --- | --- |
| `/` , `/portal-map` | Portal home / map | K | none; `/?new=1` shim stays |
| `/execution` | M01 Overview (`EXECUTION_COMMAND_CENTER_SCREEN`) | C (Decision 1) | shared env, window, ccy; `workspace_id`; `sel` |
| `/execution/operations` | M09 Operations\|Decisions | C | `tab=operations\|decisions`, `view=commands\|exceptions\|audit`, `operation=op_x`, `window` (local, default 24h), `sel`, `cursor` |
| `/execution/operations/incidents/:incidentId` | Incident | K, opens as route-drawer over M09 | `workspace_id` |
| `/governance/approvals` | C4 cockpit queue | C | `view=<8 server views>\|exit-reviews`, `q`, `sort`, `workspace_id` |
| `/governance/approvals/new` | New request | K | `alpha`, `run`, `claim` (keep names) |
| `/governance/approvals/:id/{r1,r2,live}` | cockpit frame, GateReviewShell | K (path = selection) | `workspace_id`, `from`/`ctx`, `as_of` |
| `/governance/exit-reviews/:reviewId` | cockpit frame (Paper/Sandbox exit) | K | `workspace_id`, `from`/`ctx` |
| `/governance/exit-reviews` | root | R -> `/governance/approvals?view=exit-reviews` | |
| `/governance/waivers` | Waivers (M09 Decisions links here) | K | `state`, `cursor` |
| `/deployments/portfolios` | M02 list | K | shared env, window, ccy; `q`,`sort`,`group`,`f.*`,`sel`,`cursor` |
| `/deployments/portfolios/:portfolioId` | M04 | K | `tab=overview\|allocations\|alphas\|accounts\|risk\|people\|approvals\|incidents`, `ccy`, `window` |
| `/deployments/alphas` | M03 Fleet (Table\|Board, heat map) | C | shared env, window; `stage=all\|paper\|sandbox\|canary\|live` (comma list ok), `view=table\|board`, `q`,`sort`,`group`,`f.*`,`sel`,`cursor`, `venue` |
| `/deployments/alphas/archived` | M08 (N, new id `EXECUTION_ARCHIVED_ALPHAS_SCREEN`) | N | `q`,`sort`,`cursor`; id `archived` reserved |
| `/deployments/alphas/:alphaId` | M05 | K | `tab=performance\|deployments\|evidence\|regime\|orders\|activity\|positions\|replay\|reconciliation`, `venue`,`window`,`type` (Activity filter), `as_of` |
| `/deployments/{paper,sandbox,live}` | stage lists | R -> Fleet `env`+`stage` | |
| `/deployments/paper/:id` | M07 Paper workbench | K | `tab=overview\|orders\|fills\|positions\|sessions`; `#accounting`,`#evidence` anchors; `cal=vn` |
| `/deployments/paper/:id/vn-market` | VN variant | K (renders same workbench with `cal=vn`) | |
| `/deployments/sandbox/:id` | Sandbox cert | K | `tab=reconciliation\|steps\|plans\|timeline` (new; V1 had state only) |
| `/deployments/live/:id` , `/:id/canary` | Live ops / Canary | K, shared header with Canary⇄Live switch | `tab=` (new: exposure\|continuity\|predecessor\|guard; envelope\|positions\|reconciliation\|guard) |
| `/deployments/accounts` | M06 list | K | `q`,`sort`,`venue`,`binding=<id>` (alias, section 2) |
| `/deployments/accounts/:accountId` | M06 Account 360 | K | `tab=overview\|positions\|allocations\|fees\|reconciliation\|audit`, `view=physical`, `binding` |
| `/deployments/blotter` | Global blotter | K | `filter=` (existing), `fill=`, `stage`,`deployment`,`account`,`alpha`,`venue`,`symbol`,`side`,`sort`,`window`,`cursor` |
| `/deployments/compare` | C2 Compare (N, new id) | N | `kind=portfolio\|alpha`, `ids=a,b,c,d` (2-4), `window`,`ccy` |
| `/administration/actions` | Admin actions (trimmed) | K, hidden from sidebar | `operation`, `action=rotate_credential`, `binding`, `cmd` |
| `/administration/profile-access`, `/administration/users` | M10 / users | K | `tab` (new) |
| `/execution/_fixtures`, `/research/_fixtures` | labs | K (non-product) | |
| `/backtests/approvals`, `/data/catalog` | legacy stubs | K or R (Decision 9) | |

**Shared context (carried by the context bar and by a central `withContext(href)` helper in `idLinks.tsx`):**
`env` (`live|paper|sandbox`, default `live`; path wins on deployment routes, mismatch shows a notice, FE maps to BFF `environment=`), `window` (`7d|30d|90d|all|from..to`, default **90d**; "Equity 30D" stays fixed 30D), `ccy`, `workspace_id` (existing; never dropped), `ctx` (breadcrumb origin `kind:id`, replaces `from`; `from` stays readable), `as_of` (UTC instant for evidence/receipt reproducibility; PROPOSED, detail + cockpit only).
**Screen-local (never carried):** `stage q sort group f.* cursor sel tab view type venue filter fill operation binding cmd action alpha run claim kind ids cal`. `cursor` is cleared on any filter/sort change; `sel` only for peek drawers (not gates). Operations' 24H default makes `window` local there: it is not propagated into or out of M09.
Invalid param after a permission change: explain and drop (UXM-01 rule) - needs one shared parser, not per-screen `useParamState`.

## 2. Redirects and legacy URL behaviour
All redirects are client `<Navigate replace>` in `PortalRoutes`, preserve `workspace_id` and unknown params, are permanent (zero cost), and fire only when the target V2 screen is flag-on (section 5).

| Old | New | Notes |
| --- | --- | --- |
| `/deployments/paper` | `/deployments/alphas?env=paper&stage=paper` | S1 |
| `/deployments/sandbox` | `/deployments/alphas?env=sandbox&stage=sandbox` | S1 |
| `/deployments/live` | `/deployments/alphas?env=live&stage=canary,live` | D2 "Real-funded" (Decision 6) |
| `/governance/exit-reviews` | `/governance/approvals?view=exit-reviews` | root had no subject |
| `/governance/approvals/:id/{r1,r2,live}`, `/exit-reviews/:id` | **no redirect** - same paths render the cockpit frame | C4 "deep-link into the frame"; avoids breaking `recordHref`, receipts, 8 e2e URL asserts |
| `/deployments/accounts?binding=B` | `/deployments/accounts/:accountId?view=physical&binding=B` | client-resolved: needs `GET /broker-bindings/B` to learn the account; unresolved = typed "binding not found" + list link, never a blank page |
| `/execution/operations?operation=op_x` , `/execution/operations/op_x` | unchanged (`canonicalHref` keeps working) | |
| `/deployments/paper/exit/:id` | `/governance/exit-reviews/:id` | existing `canonicalHref` rewrite, keep |
| `/backtests/approvals` | `/governance/approvals` (optional) | stub today |

**Legacy `?tab=` (V1 label, case-insensitive, `+`/`%20`/`%26` tolerant) -> V2 key; the app canonicalises with `replace` after mapping.** Unknown value -> default tab + one-line notice (not silent).
- Alpha 360: Overview -> `performance`; Insight Charts -> `performance#charts`; Trade Replay -> `replay`; Positions -> `positions`; Orders & Fills -> `orders`; Risk -> `positions#risk`; Sessions -> `activity&type=session`; Accounting -> `performance#costs`; Reconciliation -> `reconciliation`; Audit -> `activity&type=audit`.
- Portfolio 360: Overview -> `overview`; Structure & Correlation -> `risk` (holdings sub-block -> `allocations`); Capital Ledger -> `allocations#ledger`; Approvals/Incidents unchanged; Audit -> `people&type=audit`.
- Paper workbench: Overview/Positions/Orders/Fills/Sessions unchanged; Accounting -> `overview#accounting`; Evidence -> `overview#evidence` (S5 "URL cu cuon toi dung muc"). Bare URL: V1 = Orders (no param); V2 = Overview (Decision 4).
- Sandbox/Canary/Live/Account 360: V1 had no `?tab=`, so nothing legacy; new keys are additive.
- `Blotter ?filter=` / `?fill=`, `Admin ?operation/?action/?binding/?cmd`, `New approval ?alpha/?run/?claim`, `?from=` all keep their names.

## 3. Registry impact - REQUEST to Codex (registry.json not edited here)
- C-1 **Additive only.** No `screen_id`/`route` renames. Revision 6 -> 7 requires updating in the same commit: `test_portal_registry_contract.py` (`revision == 6`, per-screen `expected_contract_revision`), `execution.test.tsx:1114` (`toBe(6)`), and the server screen-contract catalogue (`runtimeBounds.test.ts` `toHaveLength(25)`).
- C-2 Features `PAPER_TRADING`, `SANDBOX_TRADING`, `LIVE_OPERATIONS`: keep `canonical_route` and `screen_ids` (they own the `:deploymentId` screens); set `navigation.show_in_sidebar=false`, `show_in_command_palette=false`. Do NOT use `legacy_routes` for the Fleet redirect (query stripped; route-collision invariant). Frontend removes them from `EXECUTION_PREVIEW_FEATURE_DEFAULTS` when the redirect goes live.
- C-3 Screens `PAPER_TRADING_SCREEN`, `SANDBOX_TRADING_SCREEN`, `LIVE_OPERATIONS_SCREEN`: text change (`primary_decision`, `activation_gate`) saying "redirects to Fleet"; keep them (they are the only registry rows with no component).
- C-4 `EXECUTION_COMMAND_CENTER` feature label -> "Overview"; screen text/`primary_decision` update; bump `contract_revision`. Route unchanged if Decision 1 = A.
- C-5 NEW screens: `EXECUTION_ARCHIVED_ALPHAS_SCREEN` (`/deployments/alphas/archived`, feature `EXECUTION_ALPHA_FLEET`, `alpha.read`), `EXECUTION_COMPARE_SCREEN` (`/deployments/compare`, same feature, no sidebar). Each needs `delivery_profile` + `delivery_policy` (fixture rev 2 until its inputs exist) per the COMMISSIONED invariant, and a matching server catalogue row.
- C-6 `EXECUTION_APPROVALS` label -> "Decisions"; `EXECUTION_EXIT_REVIEWS` `show_in_sidebar=false` once the inbox exposes `view=exit-reviews` (or keep, Decision 8). Screens keep ids; only `primary_decision`/`primary_action` text moves to the cockpit wording.
- C-7 Sidebar target (UXM-01 §1): Overview, Portfolios, Alpha Fleet, Accounts, Archived Alphas, Operations, Profile & Access. UXM-01 omits Approvals, Waivers, Blotter, Admin actions: say which stay in nav (Decision 8).
- C-8 Do not add a query-param schema to the registry (schema is `additionalProperties:false`; cost > value). The param contract lives in FE `links.ts` + a unit test.
- C-9 Backend confirmations needed before flags flip: `window=all` and `90d` accepted by Manager dataset; whether Fleet can read stage across envs or each stage tab switches `environment`; `group` on fleet (FE-012); `q` (FE-008); binding->account lookup; archived list; compare read.

## 4. Test and baseline impact
Counts (sweep/05): 82 journey tests, 20 route-smoke + 7 feature roots, 17-route control sweep, 22 journey PNG + 86 lab PNG + 2 profile-access PNG = 110 gated baselines, 124 unit files / 1,883 `it`. Unit-file hits are by grep of path/tab strings, not by run.

| Decision | Breaks (certain) | Likely touched | Not broken |
| --- | --- | --- | --- |
| S1 fold lists | `execution-preview.spec` FEATURE_ROOTS rows for `/deployments/{paper,sandbox,live}` (final screen_id becomes ALPHA_FLEET_LIST); journey 2 (`dep_1` row on Paper overview -> workbench); `fleetPipeline.ts` `ROUTE` map + `fleetPipeline.test.ts`; hard-coded back-links (`SandboxCertification` "Sandbox overview", `CanaryControlRoom` "Live board", `PaperOverview` rows) | `paperOverview.test.tsx`, `sandbox.test.tsx`, overview fixture-lab groups | no PNG baseline exists for the 3 list screens (smoke only) |
| S2 light governance | EL-V2-01b in `execution-fixtures.spec.ts` (~157-187: governance surface luminance < 0.5), "no seam" test in `execution-preview.spec`, EL-V2-10 contrast; PNGs inbox, r1, r2, gov-live-gate, gov-new-request, gov-waivers, exit-review = 7 journey + 4 lab groups x 2 widths = 8 | `gateFrame.test.tsx`, `governanceChain.test.tsx` | tests currently assert ONE Carbon canvas |
| S3/C4 incident drawer + cockpit | PNG `incident-inc-fixture-44` (layout), inbox/r1/r2/exit PNGs; journey 7 only if the incident stops being a URL; EL-V2-05 chain (decision bar stays in viewport) | `inboxView.test.tsx`, `governanceAdditions.test.tsx`, `retainedPill.test.tsx` | URL asserts stay green if gate paths are kept and the incident is a nested route |
| S4 Alpha/Portfolio tab merge | journey 3 (`Insight Charts` >= 12 tiles; `Trade Replay` region); journey 4 (`Structure & Correlation`, `Capital Ledger` text); PNGs alpha-av-2041, alpha-tiles (URL has `tab=Insight+Charts`), portfolio-PF-CRYPTO; EL-V2-08 (">=12 tiles each chart-or-typed-state" vs S4 "draw only when data"); scope contract "10 tabs share one scope" | `alpha360.test.tsx`, `alphaScope.test.ts`, `analytics360.test.tsx`, `previewControllers.test.tsx` | tab aliases keep old URLs resolving |
| S5 Paper tabs | journey 1 (clicks Accounting/Evidence, expects `tab=` mirror and Orders = no param); EL-V2-04 above-fold asserts; PNG paper-dep-94, paper-vnm x2 | `previewControllers.test.tsx` (WORKBENCH_TABS), `PaperWorkbench` tests | |
| UI3 90D default | tests/fixtures with fixed 30d (`LiveFull`, `Canary` envelope, lab `Fixtures.tsx:911`, `alphaScope` SCOPE_WINDOWS default); any chart baseline showing the window control (alpha, portfolio, paper) | `PortfolioOverview` already 90d | contract fixtures (server windows) |
| M01 at `/execution` | journey 7 (hub: `exec-cc-row`, "Needs you now" order, `/execution$` after Back), PNG command-center, EL-V2-07 | `commandCenter.test.tsx`, stream tests | none if the V1 panel keeps its test ids inside Needs attention |
| Registry rev 7 | `revision==6` x2, contract_revision expectations, catalogue length 25, nav tests only if EXECUTION_* sidebar flags move | `navigation.test.ts` | |

**Migration order that keeps CI green** (each step = one commit lane; PNGs re-recorded only with the pinned `./scripts/portal-web-visual.sh`, forced `=all`, contact sheet reviewed, never bare `--update-snapshots`):
1. Codex: registry rev 7 additive + catalogue + test pins (C-1..C-5), no behaviour change.
2. FE URL layer: shared parser, `withContext`, alias maps, `ctx`/`from`; unit tests only; defaults omitted, so zero e2e change.
3. Additive `?tab=` on Sandbox/Canary/Live/Account; new routes (archived, compare) flag-off.
4. Add V2 specs (`execution-v2-*.spec.ts`, new PNG names) beside V1 specs; V1 specs untouched.
5. Flip per screen, same commit retires its V1 test rows: Fleet+S1 redirects -> Archived -> Portfolios/M04 -> Alpha 360 (S4) -> Paper/Stage header (S5) -> Account -> Operations/Incident (S3) -> Profile -> Overview `/execution` -> cockpit + S2 last (needs evidence-diff API; most PNG churn).
6. Final: delete V1 components, V1 fixture-lab groups, FEATURE_DEFAULTS entries; sweep list (17 routes) extended with every V2 route.

## 5. Flags and rollout (UXM-07)
- Keep `VITE_EXECUTION_PREVIEW_ENABLED` as the umbrella. Add build-time `VITE_EXECUTION_V2_SCREENS=fleet,archived,portfolios,alpha,workbench,account,ops,profile,overview,cockpit` (one manifest, identical on dev and stable; the memory note on 8 drifting flags says a flip on one stack puts old data on screen).
- Same route, two components: `ExecutionPreviewRoute` picks V2 only if the id is in the list. No new URL prefix (`/v2/...` would fork every deep link).
- A query override (`?v2=1`) is allowed only for presentation in non-production builds and must never change data source (N29-FE-01 forbids a query param swapping real data for a fixture).
- A redirect fires only when its target screen is flag-on, so `/deployments/paper` is V1 until Fleet-V2 is qualified.
- **Qualification gate per V2 screen:** (a) states Healthy / Source not ready / Researcher / Loading / denied / unavailable in unit tests; (b) BFF-double e2e for its journey, with Manager, Researcher, Operator personas (V1 tests use one ADMIN actor); (c) 110-baseline set re-recorded in the pinned image, contact sheet reviewed; (d) DOM <= 8000, heap <= 200 MB, type scale, no ellipsised numbers, drawer at 390/834; (e) backend sources exist or the control is disabled with reason + M10 link (D9).
- **Stays V1 until then:** anything needing a missing source - Fleet `group` (FE-012), `q` (FE-008), Overview digest/last-visit, cockpit evidence-diff + receipt, Compare, capital flow, Trade Replay candles.

## 6. Decisions Bobby must take
1. **Where is Overview?** A `/execution` becomes M01 in place (recommended: keeps journey 7 + all links, V1 triage survives as Needs attention). B `/execution/overview` + redirect: breaks `/execution$` asserts, makes V1 Command Center a dead path. UX: A means the nav label changes but the address does not.
2. **Approval URLs.** A keep `/governance/approvals/:id/{r1,r2,live}` as the selection URL, same cockpit frame (recommended). B single `?sel=` URL: needs redirects, rewrites 8 e2e asserts and every `recordHref`. UX: A is back-button friendly, B shorter.
3. **S2 light governance vs one theme.** Tests and V1_SCREEN_REVIEW §2 both argue for one canvas; S2 reverses EL-V2-01b and costs ~15 PNG + a second token set. Recommend Carbon everywhere; if kept, light only for the full-review route and name it a deliberate test rewrite. UX: light switch mid-flow vs consistent chrome.
4. **Paper bare URL default.** Orders (V1) or Overview (S5). Recommend Overview; old bare links change landing tab, `?tab=Orders` still works.
5. **Tab keys.** Slugs with V1-label aliases (recommended) vs keeping label strings. Slugs survive renames; labels keep URLs human-readable but re-break on every rename.
6. **Real-funded filter.** `stage=canary,live` (recommended, matches D2) vs two separate tabs. UX: `/deployments/live` lands on both Canary and Live rows with a breakdown.
7. **Window.** UI3 90D default; confirm `all` semantics, that Operations is local (24H), and that old links (no param) now open 90D. Correct UXM-01 §2.
8. **Nav list.** Which of Approvals, Waivers, Blotter, Admin actions get sidebar entries once Paper/Sandbox/Live leave it. Recommend Decisions + Blotter in nav, Waivers inside Decisions, Admin unlisted.
9. **Redirect lifetime and stubs.** Keep all redirects permanently (recommended); `/backtests/approvals` -> `/governance/approvals`, or leave the stub.
10. **VN market and Incident.** Keep `/vn-market` as a route that renders the workbench with the VN chip (recommended) and Incident as a nested route-drawer so its URL still works; the alternative (query drawers) leaves two URLs per object.
11. **Flag granularity.** Per-screen flags (recommended, slower, safer) vs one all-or-nothing switch at the end (one big baseline re-record, no partial qualification).
