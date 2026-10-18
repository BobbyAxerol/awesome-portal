# Sweep 04 - Source inventory: Alpha / Portfolio / Account entity screens

Read-only sweep of branch `claude/fe-parity`. Base dir `apps/portal/frontend/src/execution/` (omitted below).
Locators: `AF`=screens/AlphaFleet.tsx `A3`=AlphaThreeSixty `PL`=PortfolioList `P3`=PortfolioThreeSixty `AB`=AccountsBindings `BD`=BindingDetail `AC`=AccountBroker360 `RC`=screens/recomposeContainers.tsx `HI`=hifiInsight.tsx `HT`=hifiTiles.ts `TR`=components/TradeReplayEvents.tsx `RCC`=components/ReplayCandleChart.tsx `OT`=components/ObservedTimelinePanel.tsx `EQ`=components/EquityChart.tsx `DT`=components/DerivationTile.tsx `PO`=portfolioOverview.tsx `AS`=alphaScope.ts `KT`=components/table.tsx `MC`=components/marketChart.tsx `HTTP`=api/httpApi.ts.
Endpoints are under `/api/v1/execution`. Kind codes: SV sub-view, TAB, DR drawer, DL dialog, PO popover/hint, DX disclosure, FM form/select, MB mutating button, KB keyboard, CH chart, ST state variant, DP deep-link, FS filter/sort/group, EX export, PG pager, LK link, TBL table, KPI strip.
Reach: URL = reachable by URL alone, CLICK = needs a click after load, LAB = only `/execution/_fixtures` via `demo`/`demoPanels` props (product containers never pass them), DEAD = rendered but inert or hidden, POLL = timer/stream driven.
Routes (registry.json:2401-2570, ExecutionPreviewRoute.tsx:356-386): `/deployments/alphas`, `/deployments/alphas/:alphaId`, `/deployments/portfolios`, `/deployments/portfolios/:portfolioId`, `/deployments/accounts` (bindings list), `/deployments/accounts?binding=ID` (Binding detail), `/deployments/accounts/:accountId`. All screens are read-only in product. `CommandPlanDrawer` is used by NONE of the 7 screens (only AdminActionDrawer + `/execution/_fixtures`, Fixtures.tsx:975).

## 1. Alpha Fleet - `/deployments/alphas` (AF product branch 113-272; container RC:2185-2244)
| screen/tab | element | kind | reach | data/endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| Fleet | Masthead summary `N alphas - M deployments - ENV`; `reading...` while loading | ST | URL | `GET /alphas?limit=50` | count claim withheld until answered | AF:143-148 |
| Fleet | Source line: live dot (title = stream phase), authority, tier chip (title = freshness budget), age (title = refreshed/source instants), SourceClock flash | PO | URL+POLL | list envelope + `useProfilesRealtime` | stream vs data freshness are separate facts | AF:153-174,403-406 |
| Fleet | 5-cell KPI strip: exposure/ccy, position PnL/ccy, deployments, needs attention (tinted if >0), portfolios | KPI | URL | list `summary` | per-currency exact lines (never FX mixed), `useChangeFlash` on value change | AF:182-188,408-427 |
| Fleet | Stage chips All/Live/Canary/Sandbox/Paper/Research with counts | FS | CLICK | server `stage=` param AND client re-filter | stage filter, local state not in URL | AF:189-196; RC:2231-2238 |
| Fleet | Venue select, Owner select (options derived from rows; disabled if none) | FS | CLICK | client-side on current page only | narrow page; note `N of M alphas hidden` | AF:197-215 |
| Fleet | Alpha table 10 cols; row click toggles (ignores a/button/select) | TBL | URL | list rows | alpha - version, owner - portfolios links, stage chips, alloc, PnL, exposure, balances(free/locked), 30d spark, health | AF:218-245,430-455 |
| Fleet | Row expander `v/>` -> deployment sub-rows (stage chip, R/U PnL, balance, health) | DX | CLICK | rows' `deployments[]` | per-deployment drill; sub-row link -> `/deployments/{paper|sandbox|live}/:id`, account link, portfolio link | AF:444,456-469,437-440 |
| Fleet | Inline equity sparkline per row (SparkLine, no tooltip, good/bad tone by first vs last) | CH | URL | `GET /alphas/equity-sparklines?environment=paper` (always paper) | 30d trend, one request for all rows | AF:452; RC:2205 |
| Fleet | Pager Previous/Next (disabled with title reason) | PG | CLICK | `after`/`before` cursors | keyset paging, 50/page | AF:258-267; RC:2240-2241 |
| Fleet | States: reading skeleton rows/strip; PanelState unavailable/denied/partial; empty "an empty set is a fact"; per-row `data-arrived` flash | ST | URL/POLL | status + `useArrivals` | honest loading/empty | AF:121,180-181,240-243 |
| Fleet | Footer line `SOURCE_LATEST_WINDOW_NOT_PUBLISHED` (30d equity + max DD columns absent in product) | ST | URL | n/a | hi-fi `net pnl 30d`/`max dd` columns replaced by current facts | AF:253-255 |
| Fleet (demo) | Hi-fi smoke branch: session PnL ticker, `SUSPENDED_BY_CALENDAR` clock, default-open `av_2041`, per-row hi-fi chips/links | SV | LAB | `alphaFleet.smoke.ts` | reference design only | AF:273-342,344-384 |
| Fleet | NOT in product: default open row `av_2041` state (fixture id), `onNeedEquity` prop unused by container | ST | DEAD | n/a | latent fixture residue | AF:110; RC:2219 |

## 2. Alpha 360 - `/deployments/alphas/:alphaId` (A3; container RC:1675-1803)
Reads: `GET /resources/alphas/:id` (resource), `/alphas/:id/query-analytics?source_facts=false&environment=` (analytics), `/alphas/:id/stage-drift`, `/views/observed-timeline?...subject_kind=alpha`, `/derivations/alphas/:id/activity?environment=`, `/resources/alphas/:id/orders|fills` (relation page set, 4x15s refresh), `/market/candles` + `/market/venue-candles` (replay). Realtime refreshKey re-reads all (RC:1679-1702).
| screen/tab | element | kind | reach | data/endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| all | Masthead: ALPHA kind, title (`label - id` or `id - no label published`), health shown in the RESEARCH_APPROVED chip slot, WF tag, source line (authority/as_of/freshness), `Artifact passport ->` (only if passportHref; container never passes) | SV | URL | resource envelope | identity + provenance | A3:486-501; RC:1749 |
| all | Meta line: artifact link (`version N`, falls to `?tab=Audit`), owner, R1/R2 links (never passed -> never rendered), `current stages` | LK | URL | resource item | identity | A3:507-513 |
| all | Resource-state PanelState (denied/unavailable/empty/stale) above tabs | ST | URL | `profilePanelStatus` | server-owned state | A3:502-506; RC:1721-1725 |
| all | Scope bar: Portfolio/Mode/Venue/Window selects (disabled when <=1 option), scope note | FS | CLICK | local `useState`, options from item (venues/portfolios/stages) + `SCOPE_WINDOWS` 30d/90d/1y/All; opens on All | narrows positions/orders/audit/sessions/accounting/recon/risk/contribution/tiles/deployments; does NOT scope kpis, equity chart, activity tile, observed timeline, deployment map | A3:306-363; RC:1002-1010,1729-1761; AS:85-165 |
| all | Tab strip (10 tabs) ARIA tablist, `useId` ids | TAB | URL `?tab=` | `useParamState("tab")` | Overview, Insight Charts, Trade Replay, Positions, Orders & Fills, Risk, Sessions, Accounting, Reconciliation, Audit | A3:63-74,520-536; RC:1703 |
| Overview | Deployment map venue x stage (EnvironmentBadge, BrokerSyncChip always UNKNOWN in product, cap 16 keeping non-OK, cap notice) | TBL | URL | item.deployments | where each venue runs | A3:387-445; RC:1050-1064 |
| Overview | KPI strip (funnel counts "this subject" or "profile-wide", exec-quality keys; else allocation/balance/pnl/exposure per ccy) | KPI | URL | analytics + `subjectFunnel` | numeric facts, `Published` absent reasons | A3:550-566; RC:675-699,1765 |
| Overview | Equity-by-stage chart (EquityChart uPlot): Lin/Log, presets, Table, Expand, Export(JSON to clipboard), band toggle, dblclick reset, drag zoom, Ctrl+wheel | CH | URL+CLICK | `profileEquity(resource)` (account_equity/performance) else `analyticsEquity`; empty = PanelState unavailable BR-EX-41 | equity trend | A3:574-601; EQ:97-330; RC:184-205,1767 |
| Overview | Contribution: ECharts bar per currency + dl list; hint "How to read" | CH+PO | URL+CLICK | `performance` rows latest per venue/ccy | per-venue net, no FX sum | A3:602-605,636-657; ContributionChart.tsx:70-92 |
| Overview | Activity rollup tile (state chip, formula, inputs caption, state/status chips) | SV | URL | `GET /derivations/alphas/:id/activity` | EDS-05 rollup | A3:607; DT:466-503; RC:1791 |
| Overview | Observed timeline panel: env toggle buttons (when >1 env), provenance/semantics/state chips, `rev N` beat, table 8 cols, `older observations` button, Soon segments, mark-context legend, 15s poll | SV | URL+CLICK+POLL | `/views/observed-timeline` (limit 100, `after` cursor) | bounded current-page observation | A3:608; OT:66-141; RC:1561-1620 |
| Overview | Deployments in scope table; deployment id button -> workbench, account button -> `/deployments/accounts/:id`; cap 24 keeping non-READY | TBL | CLICK | item.deployments | drill to stage workbench / account | A3:609,659-727; RC:1651-1655,1795-1796 |
| Insight Charts | 12 hi-fi tiles in fixed order + up to 6 Portal extras (see section 8). Tile states ok / insufficient_data / unavailable / loading (320px skeleton, deferred) | SV | URL `?tab=Insight%20Charts` | analytics + relations + stage-drift + observed | diagnostics grid | A3:729-799,141-156; HI:169-509; RC:1769-1779 |
| Insight Charts | Each tile: EnvelopeCaption (`envelope` details disclosure), fact-row table, provenance tooltip | DX+PO | CLICK | tile envelope | formula/as_of | EQ:338-353; HI:48-59 |
| Insight Charts | Loading placeholder uses OLD 12 titles (Fill quality, Slippage vs mid ...) then swaps to hi-fi titles | ST | URL | `TILE_TITLES` RC:669 | title flip on load | RC:669-673,1631-1649 |
| Trade Replay | `TradeReplayLive` -> see section 7 | SV | URL `?tab=Trade%20Replay&focus=order:ID` | see sec 7 | trade logs on candles | A3:614; RC:1780-1784 |
| Positions | KeysetTable (deployment-venue, symbol, side, qty, entry, mark, uPnL, ccy); empty PanelState; `load older` button never appears (`pageOf` hasMore=false, onLoadOlder no-op) | TBL | URL | resource `positions`/analytics facts, scoped | current positions | A3:802-827; RC:1098-1116,1785,1794 |
| Orders & Fills | KeysetTable of ORDERS only (fills not shown despite tab name); same no-op load older | TBL | URL | `orders` facts | order list | A3:829-852; RC:1118-1133 |
| Risk | dl of `<instrument> current notional` rows, limit always null, canary-envelope marker | TBL | URL | positions notional | exposure; no real risk limits | A3:878-902; RC:1203-1209 |
| Sessions | Table w/ INCOMPLETE chip; cap 20 keeping incomplete | TBL | URL | `sessions` facts | restart/recovery evidence | A3:904-944; RC:1145-1160 |
| Accounting | Table account x ccy (allocated/used/realised/fees); cap 40; hint | TBL+PO | URL+CLICK | accountEquity+performance+allocations | per-account accounting | A3:946-987; RC:1162-1191 |
| Reconciliation | Table venue/policy/last run/freshness/findings (findings hard-coded 1 per row); hint "N/A is correct for paper" | TBL+PO | URL+CLICK | `reconciliation` facts | per-venue findings | A3:989-1027; RC:1193-1201 |
| Audit | KeysetTable command journal (time, actor, command, target, outcome) | TBL | URL | `journal` facts | command trail | A3:854-876; RC:1135-1143 |
| all | Retained-review mode: source reads (candles, market-context) blocked with `UDB_RETAINED_OBSERVATION_NOT_CURRENT_SOURCE`; TopBar `Retained` pill opens role=dialog popover | ST+DL | URL (session) | `useRetainedReview` | review of earlier observations | RC:1404-1411; RetainedBanner.tsx:55-76 |

## 3. Portfolio register - `/deployments/portfolios` (PL 61-131; RC:1840-1857)
| screen/tab | element | kind | reach | data/endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| List | Masthead `top N / total` when truncated, source freshness (SourceFreshness), live dot | KPI | URL | `GET /portfolios` | provenance | PL:65-80 |
| List | Degraded-branch PanelState (per-environment UNAVAILABLE/PARTIAL reason codes) | ST | URL | `environmentBranches` | partial transparency | PL:59,82-89 |
| List | Table: name link (SPA navigate, id - base ccy), owner, state chip, profiles, allocations, deployments, allocated per ccy (title = exact), updated + age | TBL+LK | URL | list items | open Portfolio 360 | PL:92-120 |
| List | Empty fact sentence; arrival flash on new portfolio | ST | URL/POLL | `useArrivals` | honest empty | PL:40,118 |
| List | No filter, sort, pager, export (single unpaged read, `truncated` flag only) | ST | DEAD | n/a | gap vs fleet | PL:33-131 |

## 4. Portfolio 360 - `/deployments/portfolios/:portfolioId` (P3; container RC:1859-1999)
Reads: `/resources/portfolios/:id`, `/portfolios/:id/query-analytics?...`, `/portfolios/:id/correlation`, `/portfolios/:id/capital-ledger`, `/portfolios/:id/cross-equity`, `/derivations/portfolios/:id/capital?environment=paper|sandbox|live` (3 reads), `/views/equity-chart?subject_kind=portfolio`, relation drain `portfolio-capital-ledger` + `portfolio-equity-snapshots`.
| screen/tab | element | kind | reach | data/endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| all | Masthead: `id - Portfolio 360`, name, live dot (worst of 3 phases), authority/as_of/freshness | SV | URL | resource envelope | identity | P3:842-854 |
| all | **Report pack** button (aria-pressed toggle) -> inline preview panel "The pack would carry: live strip, equity vs benchmark by revision era, correlation + influence map, drawdown overlap, ledger window, approvals" ; Close; footer "Preview only - nothing is produced" | DL | CLICK | static copy | placeholder for BR-EX-51 export | P3:857,883-899 |
| all | **Rebalance plan** button (aria-pressed, caret) -> inline PLAN panel: operation `portfolio.rebalance - <name>`, hard-coded targets text `Grid v2.1 69.8% -> 60.0% - Carry v3.2 30.2% -> 40.0%` for ANY portfolio, writes/governance rows, "Preview only - Admin Action Drawer" ; Close | DL+MB | CLICK | static copy (fixture figures in product) | plan preview; no apply control exists | P3:858,865-882,874 |
| all | Scope chips `Window X v`, `Mode All v`, `Venue All v`, `Benchmark - / not published` are `<span>`s with carets (not selects); window text = resource completeness | FM | DEAD | `scopeWindow` | looks interactive, is inert; benchmark always null | P3:900-911; RC:1960-1964 |
| all | Tab strip (6): Overview, Structure & Correlation, Capital Ledger, Approvals, Incidents, Audit | TAB | URL `?tab=` | `useParamState` | navigation | P3:67-75,913-929; RC:1897 |
| Overview | Equity vs benchmark: server EquityChart (170px, full toolbar: Lin/Log, presets 1W/1M/3M/ALL re-query `from_ms/to_ms`, Table, Expand, Export) else drained per-currency LinesChart; benchmark line "Soon" | CH | URL+CLICK | `/views/equity-chart` else `portfolio_equity_snapshots` | NAV trend | PO:286-315; RC:1881-1955; EQ:181-205 |
| Overview | Cross-portfolio table (first/last equity, source net, snapshot count; `data-self`) served or drained | TBL | URL | `/portfolios/:id/cross-equity` else relation | peer standings | PO:316-369 |
| Overview | Configuration log (25 newest capital movements: actor, amount, before->after, reason) | TBL | URL | `portfolio_capital_ledger` | what changed, by whom | PO:370-417 |
| Overview | `<details>` "published KPIs (contract)" (closed by default) holding the real KPI strip | DX | CLICK | analyticsKpis/allocation_by_currency | contract KPIs hidden behind disclosure | P3:949-969 |
| Structure & Correlation | Holdings table (alpha button, deployment link by stage, account button, venue-mode, alloc, exposure, exp% always "not published", stage badge + readiness); cap 40 keeping non-READY; empty row | TBL+LK | CLICK | resource deployments | portfolio -> alpha -> deployment -> account | P3:976-1055; RC:1815-1838 |
| Structure & Correlation | `<details open>` "published correlation - corr.v1" wrapping all below | DX | URL(default open) | n/a | contract disclosure | P3:1060-1098 |
| Structure & Correlation | CorrelationPanel: mode chip MATRIX/LENS/RANKED, reason sentence, authority badge (envelope hard-coded `freshness OK`), footer about 200-sample floor | SV | URL | `/portfolios/:id/correlation` | representation always explained | P3:543-607; RC:1973 |
| Structure & Correlation | Matrix (<=4,096 cells): row-label button toggles lens row, each cell is a button toggling column lens; cell tint by |rho| bucket (0.2/0.4/0.6/0.8); `-` = insufficient with title (samples, below 200-floor); `data-self` diag | CH | CLICK | PACKED_MATRIX `correlationAt/samplesAt` | heatmap + lens highlight | P3:337-401,267-301,62 |
| Structure & Correlation | Leader lens (> budget): select "Leader lens" + ranked table entity/rho/samples, cap 40 keeping insufficient | FM+TBL | CLICK (auto when n^2>4096) | same | one alpha row at a time | P3:411-479,96-120 |
| Structure & Correlation | Ranked pairs table (cap 60) + cluster list (RANKED_PAIRS payloads >150 dims) | TBL | URL (data dependent) | `kind: RANKED_PAIRS` | big-fleet fallback | P3:481-541 |
| Structure & Correlation | Influence map (ECharts graph, circular layout, node radius = exposure share (always equal: exposurePct null), edges |rho|>=0.5, hover tooltips) | CH | URL | derived from packed matrix | coupling picture | P3:309-335; MC:412-519 |
| Structure & Correlation | Two slot panels "rho(NAV,benchmark) 30d" / "Drawdown overlap timeline": unavailable BR-EX-65 text in product | ST | URL | none | named gaps | P3:1071-1084 |
| Structure & Correlation | Insight card and 3 Leaders lists (exposure/variance/influence) - product passes `insight=null`, `leaders=[]` -> render nothing | ST | DEAD | n/a | hi-fi only | P3:1086-1097; RC:1976-1977 |
| Capital Ledger | Capital-by-currency board: env chips (paper/sandbox/live read states), table per env x ccy, unpublished-input notes | SV | URL `?tab=Capital%20Ledger` | 3x `/derivations/portfolios/:id/capital` | exact partition, no total | RC:1982-1990; DT:242-324 |
| Capital Ledger | `<details open>` ledger: bounded-window notice, per-ccy table (time, type, account, amount + direction chip, before->after, op id), cap 50 keeping non-INCREASE, no-entry-count note; totals line absent (`ledgerTotals=null`) | TBL+DX | URL | `/portfolios/:id/capital-ledger` | append-only trail | P3:648-786,1106; RC:1978-1981 |
| Approvals | Table of approvals (product passes `[]`: header only, no empty sentence) | TBL | URL | none | placeholder | P3:1110-1150; RC:1991 |
| Incidents | `incidents=null` -> PanelState unavailable "none can be claimed either way" | ST | URL | none | honest absence | P3:1152-1233; RC:1992 |
| Audit | PanelState unavailable "portfolio command journal is not published yet" | ST | URL | none | gap | P3:1236-1246 |
| (LAB) | demoPanels: live strip NAV/KPIs, era chart with 30d/90d/All buttons, structure KPIs, hi-fi corr matrix, market corr, Alpha leadership with `Leader lens` toggle, what-if leader impact + symbol overlap, DD overlap EpisodesChart, footer links, hi-fi ledger/approvals/incidents/audit | SV | LAB | `portfolio360.smoke.ts` | design reference | P3:945-948,1056-1059,1104; components/PortfolioOverview.tsx |

## 5. Accounts & Bindings list - `/deployments/accounts` (AB product 66-183; RC:2246-2291)
| screen/tab | element | kind | reach | data/endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| List | Masthead `filtered/total bindings - ENV`; SourceFreshness (tier basis = projection refresh); live dot | KPI | URL | `GET /broker-bindings?limit=50` | provenance | AB:105-120 |
| List | Filter chips All/Live-bound/Testnet/Paper/Issues with counts (client-side on current page; env inferred from account-id prefix `live-`/`paper-`/`sandbox-`; issue = state set) | FS | CLICK | derived | triage | AB:83-139 |
| List | Table: binding link (`?binding=`), venue, account link, state chip, credential state word (never secret), physical equity + virtual headroom = "not published", updated + age | TBL+LK | URL | list rows | open binding / account | AB:142-160 |
| List | Pager Previous/Next with title reasons | PG | CLICK | cursors | paging | AB:171-178 |
| List | Empty sentences differ for no-bindings vs filter-excluded | ST | URL | n/a | honest empty | AB:156-158 |
| List (LAB) | Hi-fi: 5 KPIs (physical equity ticker, sigma virtual + headroom, credentials, findings, sync health), row expander to virtual accounts (row role=button, Enter/Space), sync text per venue, session clock | KB+DX | LAB | `accounts.smoke.ts` | design reference | AB:184-267 |

## 6. Binding detail - `/deployments/accounts?binding=ID` (BD product 64-173; RC:2266-2323)
| screen/tab | element | kind | reach | data/endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| Binding | Masthead BINDING, id - venue, SourceFreshness (readAt basis) | SV | URL `?binding=` | `GET /broker-bindings/:id?environment=paper` (env never passed -> always paper) | identity | BD:72-94; HTTP:539 |
| Binding | "Published binding facts" kv: account link, venue, state, credential state word, environment, delivery profile | SV | URL | detail item | non-secret facts | BD:96-119 |
| Binding | Capital invariant: per-ccy table used/reserved/available/headroom (negative = bad tone) or PanelState (usually empty "N28 exposure population") | TBL/ST | URL | `GET /broker-bindings/:id/exposure` | sigma virtual <= physical | BD:120-144; RC:2305 |
| Binding | Sync - policy kv (sync state chip, source published, projection read, binding updated) + permanent "per-venue policy verdicts not published" | SV | URL | detail | sync facts | BD:154-169 |
| Binding (LAB) | Capital bar (segments link to accounts), Credential panel + `Rotate credential` link `/administration/actions?action=rotate_credential&binding=`, live Sync stream (`aria-live`), virtual-accounts table, binding audit links to `/execution/operations?operation=` | MB+SV | LAB | `accounts.smoke.ts` | design reference | BD:174-242 |

## 7. Account / Broker 360 - `/deployments/accounts/:accountId` (AC; container RC:2003-2181)
Reads: `/resources/accounts/:id`, `/views/equity-chart?subject_kind=account&workspace_id=`, `/alphas/:strategy/query-analytics?account_id=` (only if exactly one strategy), `/resources/accounts/:id/orders|fills`, observed timeline.
| screen/tab | element | kind | reach | data/endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| Account | Masthead: LIVE shield + red frame when live/canary (aria-label), ACCOUNT id, meta links alpha - `/deployments/live/:dep` (always `live/`, even for paper/sandbox or "not published") - `/deployments/portfolios/:pf`, SYNC chip (top sync row), HEADROOM BREACH chip, facts line | SV | URL | resource | identity + risk frame | AC:435-450; RC:2114-2128 |
| Account | 3-column grid: Internal virtual state / Physical broker state / Difference (MATCH chip, `Delta`, note internal-vs-broker, severity chip, "not compared") | SV | URL | `positions`, `account_balances`, `margin_balances`, `account_sync`, `broker_sync`, `differences` | reconciliation view; broker positions/orders always null | AC:458-472,175-280; RC:2093-2113 |
| Account | `dry-run reconcile ->` ghost button in Difference column | MB | DEAD | `operatorAdmin=false` in product; `onDryRun` no-op | hidden mutation | AC:464-470; RC:2174-2176 |
| Account | HeadroomBanner (OK/EXCEEDED/UNKNOWN tone, maintenance-vs-free-balance wording, partial-population count, authority badge) or PanelState when `exposure_headroom` absent | ST | URL | `exposure_headroom[0]` | fail-closed headroom verdict (server, never browser) | AC:289-359; RC:2067,2139-2148 |
| Account | Account equity chart (EquityChart 280px; server presets re-query; live pulse if freshness OK; Table/Expand/Export/Lin-Log) | CH | URL+CLICK | `/views/equity-chart` | equity | AC:476; RC:2152-2168 |
| Account | Trade Replay embedded (account scope) -> see sec 8 | SV | URL (needs account facts) | relation page set | trades on candles | AC:477; RC:2150 |
| Account | Observed timeline (account) | SV | URL+POLL | `/views/observed-timeline?subject_kind=account` | observations | AC:478; RC:2151 |
| Account | Broker binding panel: reference, credential alias ("not published"), VALID/INVALID/NOT PUBLISHED chip, "secret never displayed", position mode; linked-accounts table (single row = this account; `(this)` mark; cap 12) | TBL | URL | resource | binding context | AC:482-545; RC:2129-2138 |
| Account | Sync history table (OK/STALE/FAILED chips, digest "none"), cap 10 keeping non-OK, "window over unbounded history" note | TBL | URL | `account_sync`+`broker_sync` | sync evidence | AC:547-596; RC:2072-2090 |
| Account | Reconciliation findings: open/last dry-run ("never run" always)/resolved(30d); `Sync now`, `Dry-run reconcile` buttons hidden | MB | DEAD | `reconciliation` rows | findings | AC:599-640 |

## 8. Trade Replay + insight tiles + charts (shared)
| screen/tab | element | kind | reach | data/endpoint | purpose | locator |
|---|---|---|---|---|---|---|
| Alpha Trade Replay / Account | Panel head: account chip (+N), Symbol select (when >1), venue chip (title endpoint), Candle interval select (1m..; remembered per subject in localStorage `exec.replay.interval.<subject>`), interval note, mark price + arrow, + - < > Fit (disabled w/o candles), Compact/Expand (localStorage `exec.replay.tall`) | FM | CLICK | `/market/candles` (Trading System bars, first) + `/market/venue-candles` (venue klines, fallback; never merged) | replay controls | TR:211-241; RC:1386-1390,1420-1463 |
| Replay | Candle chart (TradingView Lightweight Charts): crosshair hover card (role=tooltip), click marker selects, wheel zoom, drag pan, price-axis drag/dblclick reset, edge paging of 1500 candles each side, position boxes TP/SL with R:R, legs, rejects x, ladders, OCO brace, packages band, ledger diamonds | CH | CLICK | orders+fills (relation page set else N25 page) | trades on candles | TR:242-264; RCC:894-1100,1151-1152; RC:1485-1508 |
| Replay | Keyboard: ArrowLeft/Right steps fills (chart focusable), Enter/Space on log rows | KB | CLICK | n/a | accessibility | TR:173-177,259,306-308; RCC:1093 |
| Replay | Legend (many lines: marker glyphs, group publication status `order_brackets not published - boxes paired by time (DERIVED)`), footer provenance + TradingView attribution link | PO | URL | groups from relation bag | semantics | TR:265-287 |
| Replay | Trade log table (200 at a time newest first, `show N older events`, row hover<->marker highlight, click select, `data-scene-id`) | TBL+PG | CLICK | log model | event list | TR:289-329 |
| Replay | Deep link `focus=order:ID|fill:ID|reject:|leg:|ladder:` selects + reveals row (read once from `window.location.search`, not reactive) | DP | URL | `resolveFocus` | blotter -> replay | TR:88-100,159-161; RC:1705 |
| Replay | Empty state sentence (0 orders/fills; page holds N across M strategies; BR-EX-81 note), Soon/candle-refusal notice over event-indexed axis | ST | URL | n/a | honest empty | TR:179-191,204 |
| Replay (LAB) | Hi-fi SVG TradeReplay with disabled deployment/symbol pickers (BR-EX-50) | CH | LAB | `alphaReplay.smoke.ts` | reference | components/TradeReplay.tsx:91-100 |
| Insight 1 | Equity by stage - EquityChart line (uPlot) | CH | URL | `analytics.chartSeries[0]` ("EQUITY_SERIES_NOT_PUBLISHED") | stage equity | HI:187-196 |
| Insight 2 | Drawdown & underwater - LinesChart drawdown (bad tone) + shaded joint-DD bands (<=16, labels only if <=3) + zero line | CH | URL | `analytics.drawdownOverlap` | DD | HI:197-229 |
| Insight 3 | Rolling corr vs benchmark - BarsChart rho of this alpha vs others (<=14); benchmark "Soon" (title/data mismatch: not rolling, no benchmark) | CH | URL | `analytics.correlation` | coupling | HI:230-257 |
| Insight 4 | Venue contribution - BarsChart net per venue x ccy (<=12); fallback realized from fills | CH | URL | `performance` rows else fills | contribution | HI:258-298; HT:229-246 |
| Insight 5 | Execution quality by venue - BarsChart filled/rejected per venue, reject-rate rows, ack latency Soon | CH | URL | orders+fills | exec quality | HI:299-329; HT:157-186 |
| Insight 6 | Order funnel - BarsChart total + status counts (PROFILE-WIDE N25 numbers, un-labelled here though KPI strip labels them profile-wide) | CH | URL | `analytics.orderFunnel` | funnel | HI:330-352 |
| Insight 7 | Trade return histogram - HistogramChart 21 buckets, p50/p95, fills without PnL counted | CH | URL | fills `realized_pnl` | distribution | HI:353-372; HT:74-99 |
| Insight 8 | Execution density - DensityHeatmap 7x24 UTC, busiest cell | CH | URL | fills `trade_time` | timing | HI:373-396; HT:113-140 |
| Insight 9 | Regime-shaded equity - never a chart (insufficient/unavailable, Soon REGIME_LABELS_NOT_PUBLISHED) | ST | URL | none | gap | HI:397-401 |
| Insight 10 | "Paper vs Live drift" - LinesChart up to 3 stage equity lines (paper accent/sandbox warn/live bad) on one calendar; not-drawn stages + reasons; "vs approved research" Soon | CH | URL | `GET /alphas/:id/stage-drift` | stage comparison | HI:402-456 |
| Insight 11 | Risk utilization - always unavailable (Soon N17B_SOURCE_REJECTED) | ST | URL | none | gap | HI:457-459 |
| Insight 12 | Cost drag waterfall - BarsChart gross/fees/net of FIRST currency only (others as fact rows <=3); funding/slippage Soon | CH | URL | fills commission/realized | costs | HI:460-483; HT:208-225 |
| Insight 13+ | Portal extras (only when capability published, numbered after 12): Exact query surface (Bars counts per relation), Exposure profile (Bars notional <=12 or "flat" note), Trade replay journal (Bars events per UTC day), Market candles (no body -> state), Observed timeline (fact rows from the screen's own read), Mark context (fact rows) | CH | URL | `analytics.capabilities` | extras | RC:707-728,783-969,1775-1778 |

## 9. Things a first-pass screenshot review would NOT show
1. **Alpha 360 has 10 tabs, 6 of them tables that look "empty" until a deployment has rows; Insight Charts is 12+ tiles each with its own loading/insufficient/unavailable/ok state - a default screenshot shows tile text, not charts, when data is thin.** Tiles 9 and 11 can never draw; tile 10 draws stage equity, not drift.
2. **Scope bar is local state (not URL), opens on All, and only narrows ~9 of ~14 panels** (KPIs, equity chart, activity, observed timeline, deployment map are unscoped); it is disabled per axis when one option.
3. **Portfolio 360 Rebalance plan / Report pack** are click-only inline preview panels (no dialog, no focus trap); the plan panel prints hard-coded Grid v2.1 / Carry v3.2 target percentages for every portfolio.
4. **Portfolio scope chips look like dropdowns but are spans**; `Mode/Venue All v` and window never change anything.
5. **Correlation has three representations** (matrix <=4,096 cells, leader lens, ranked pairs) chosen by data size, plus cell click-to-lens, tooltip sample counts, influence map and two permanently-unavailable timeline slots; Overview KPIs and Structure content sit inside `<details>` disclosures.
6. **Trade Replay** (TradingView chart) has crosshair card, drag/wheel/axis zoom, edge paging, symbol + interval selects remembered in localStorage, arrow-key fill stepping, log<->marker linking and `?focus=` deep link - none visible in a static image; chart is blank-with-notice when candles are unavailable or retained review is active.
7. **Hidden mutation buttons**: Account 360 `Sync now`, `dry-run reconcile`, Binding `Rotate credential` exist only in lab/hi-fi; product renders none and no screen uses `CommandPlanDrawer`.
8. **Inert pagination**: Alpha 360 Positions/Orders/Audit never show `load older`; Fleet/Bindings pagers are disabled at edges with title reasons; Portfolio register has no pager.
9. **Row-expand state**: Fleet deployment sub-rows and Binding virtual accounts need a click (Fleet row body click or `v` button); lab default-open `av_2041`/`binance_main_01` do not exist in product.
10. **Timers/streams**: arrival flash, change flash, age counters (1s), observed timeline 15s poll + `rev` beat, relation drain 60s, realtime refresh on all three profile streams (live dot title text), tier chip tooltips with budgets.
11. **Env pitfalls**: Binding detail always reads `environment=paper`; fleet sparklines are paper-only; Account 360 deployment link always `/deployments/live/<id>` even for non-live accounts or `not published`; Portfolio correlation envelope hard-codes `freshness: OK` (RC:1973).
12. **Retained-review mode** (TopBar `Retained` pill dialog) disables candle reads and relabels sources; a loading-title flip (old 12 titles -> hi-fi titles) happens on Insight Charts load.
13. Count mismatch: brief said 16 insight tiles; code defines 12 hi-fi + up to 6 Portal extras (max 18, typically fewer).
