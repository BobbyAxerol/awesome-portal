# WP-F2 completion: Account 360, Accounts, Blotter (2026-10-23)

Level FIXTURE_LAB for every simulated fact (register section 2f2). Nothing here is acceptance evidence, nothing connects a real source, no schema is widened, no command is enabled. Audit baseline: `PREVIEW_VS_ARTIFACT_AUDIT_2026-10-23.md` sections 7 (25 elements), 8 (19), 10 (26), items A12 and B10 of 6(d), highlights `account-recon`, `account-phys`, `accounts`, `blotter`.

## Summary
70 audit rows: 58 DATA, 2 TYPED (legal absence), 8 blocked with a named blocker, 2 excluded (a design aid and a screenshot artifact, not product elements).

## Element table

### 7. Account 360 (25)
| # | Element | State | Note |
|---|---|---|---|
| 1 | Context bar (basis, scope, window) | BLOCKED | FILE_OWNED_BY_OTHER_WP: WP-D (shell). Inbox row F2 to D |
| 2 | Back link, title, meta | DATA | |
| 3 | Sleeve / Physical binding toggle | DATA | |
| 4 | Stale chip | DATA | |
| 5 | Reconciling chip | DATA | the source's own broker-sync state is drawn (Synced, Reconciling, Delayed, Failed); design shows one of those states |
| 6 | Shared-account warning | DATA | "Shared account · 3 sleeves. Native figures are not sleeve capital." |
| 7 | Logical sleeve panel | DATA | |
| 8 | Physical: venue | DATA | |
| 9 | Physical: native account | TYPED | "Withheld" with its reason: policy, the broker reference is never shown (a masked tail would be a DESIGN_DECISION for Bobby, not done) |
| 10 | Physical: product | DATA | fixture `product` on the account row; typed `Not published (A360-4)` when absent |
| 11 | Physical: margin mode | DATA | |
| 12 | Physical: environment with proof time | DATA | "Real-funded · Mainnet · proof 17 Oct 0x:xxZ" from `network` and `network_proof_at_ms`; typed when absent |
| 13 | Physical: provenance disclosure | DATA | binding id, record authority, source authority, and the sentence that native facts are the venue's whole-account report and the broker reference is withheld |
| 14 | Six tabs | DATA | |
| 15 | KPI Internal ledger | DATA | |
| 16 | KPI Native custody | DATA | |
| 17 | KPI PM capital, gross, long/short | DATA | budget used / approved and exposure (WP-F2 predecessor fixture, register 2b) |
| 18 | Sleeves table | DATA | portfolio names Core / Satellite / Canary from the rows |
| 19 | Native attribution column | TYPED | "Not available" over "No source" in every row, plus a disclosure saying why (no source splits native balance among sleeves). Typed is the legal state |
| 20 | Margin panel | DATA | margin ratio 5.10% (fixture `margin_ratio`); typed `Not published (A360-2)` when absent |
| 21 | Reconciliation: Internal / Broker / Difference | BLOCKED | CONTRACT (inbox F2 to K item 4 and 5): the design's positions / open-orders difference rows and the sync-history Check and Duration columns; the shared-binding "Not computed" cells are drawn as the design draws them |
| 22 | Sync history | DATA | |
| 23 | Physical binding view | DATA | |
| 24 | Equity chart high marker | BLOCKED | FILE_OWNED_BY_OTHER_WP: WP-C (`charts/**`). Inbox row F2 to C |
| 25 | Drawdown panel | DATA | |
Counts: DATA 20, TYPED 2, BLOCKED 3.

### 8. Accounts (19)
| # | Element | State | Note |
|---|---|---|---|
| 1 | Context bar | BLOCKED | WP-D (inbox F2 to D) |
| 2 | Title, subtitle | DATA | |
| 3 | Freshness chip | DATA | |
| 4 | Tabs All / Issues / Real-funded / Paper / Testnet with counts | BLOCKED | the strip now holds the three environments with the published `counts.by_environment` and the Issues lens beside them. "All" needs one list over every environment (one environment per read, ELP2-REQ-FE-014); "Testnet" versus the Portal's "Sandbox" word is a DESIGN_DECISION (shared `ENV_LABEL`, WP-D) |
| 5 | Search | DATA | |
| 6 | Venue filter | DATA | |
| 7 | Credential filter | DATA | |
| 8 | Export with reason | DATA | disabled, reason and My access link |
| 9 | URL disclosure | DATA | `<details>` "URL" with the exact address |
| 10 | Binding - venue | DATA | |
| 11 | Account (sleeve count) | DATA | sleeve count from the published figures on every populated row |
| 12 | State | DATA | |
| 13 | Credential | DATA | |
| 14 | Physical equity | DATA | published list figures for every generated row; typed for the dedicated cases (see register) |
| 15 | Sum virtual / headroom | DATA | mixed-currency rows stack one line per currency |
| 16 | Check | DATA | WITHIN PHYSICAL / EXCEEDED (negative headroom case) / NOT AVAILABLE (absent equity case) |
| 17 | Updated | DATA | |
| 18 | Footer | DATA | |
| 19 | Row link | DATA | |
Counts: DATA 17, BLOCKED 2.

### 10. Blotter (26; 4 and 26 excluded)
| # | Element | State | Note |
|---|---|---|---|
| 1 | Context bar | BLOCKED | WP-D (inbox F2 to D) |
| 2 | Title, subtitle | DATA | "Orders and fills, newest first" (the window part of "90D" lives in the context bar, row 1) |
| 3 | Freshness chip | DATA | Fresh chip always drawn, with the read's as-of |
| 4 | Design-preview toggles | EXCLUDED | design aid, not a product element |
| 5 | Scope chips, Add scope, Clear all | DATA | Add scope offers the deployments, accounts and alphas of the loaded page; the scope is in the URL; narrows loaded rows only (said in the note) |
| 6 | Symbol / venue / side | DATA | |
| 7 | Status tabs with counts | BLOCKED | CONTRACT (inbox F2 to K item 1): Working, Conditional, Cancelled buckets; Canceled stays printed as "No chip" |
| 8 | Columns menu | DATA | |
| 9 | Export | DATA | enabled, exports the loaded rows (the design shows it disabled; DESIGN_DECISION left as built, honest) |
| 10 | Showing n of n | DATA | |
| 11 | Time (UTC) | DATA | |
| 12 | Order id, expander, bracket marker | DATA | |
| 13 | Deployment + venue | DATA | id over venue on every row |
| 14 | Symbol | DATA | |
| 15 | Side and type | DATA | |
| 16 | Price | DATA | |
| 17 | Filled / quantity | DATA | exact sum of the order's fills; true "0" for an order that traded nothing; one order in 23 stays "Not published for this order" (typed case) |
| 18 | Average price | DATA | quantity-weighted fill price, exact decimal; "No fill" when the row states zero filled |
| 19 | Fee + currency | DATA | exact sum of the fills' commissions in one currency; absent (typed, never 0) when a fill has no commission or fills use two currencies |
| 20 | Status badge | DATA | |
| 21 | Pager | DATA | |
| 22 | How to read | DATA | |
| 23 | Order funnel (scope-level) | BLOCKED | CONTRACT (inbox F2 to K item 2): scope-level counts; the per-order funnel is drawn on expand |
| 24 | Conditional groups | DATA | |
| 25 | Provenance | DATA | |
| 26 | First audit screenshot | EXCLUDED | capture artifact of the audit (a loading skeleton) |
Counts: DATA 21, BLOCKED 3, EXCLUDED 2.

## What changed
- Fixture (`e2e/bffSimulated.ts`, WP-F2 markers): `generatedFigures` (every generated binding publishes figures except its dedicated fallback case), `overlayBlotter` (rewritten from the fills), `overlayAccountF2` (product, network and proof, margin ratio, sleeve portfolio names). Register 2f2 lists every key, rule and expected real source.
- Account 360: `Native attribution` column and its disclosure, `ProductWord`, `EnvironmentWord`, `PhysicalProvenance`, margin ratio, shared-account sentence. Accounts: the Issues lens in the tab strip, URL disclosure, currency label of a mixed-currency Check line follows the flag role. Blotter: deployment over venue, `No fill`, Add scope, Fresh chip, subtitle, placeholder wraps inside its phone card (fix of the 17px spill), the expander glyph follows the id role.
- No shared CSS, token, contract or other WP file was edited. `css/account.css` and `css/blotter.css` are screen-local.

## Layout (scripts/layout-audit.mjs, local build, populated profile; columns overflow / clipped / wrapped / font outliers at 1440 / 1280 / 1024 / 660 / 390)
Before (`LAYOUT_QUALITY_AUDIT_2026-10-23.md`): accounts 0/0/0/17 at every width; account-360 0/0/0/0 and 0/0/2/0 at 390; blotter 0/0/0/59 at 1440, 1280, 1024, 0/0/0/12 at 660 and 0/10/0/12 at 390.
After (label wpf2-final, see below): accounts 0/0/0/0 at every width (was 0/0/0/17); account-360 0/0/0/0 at 1440 to 660 and 0/0/2/0 at 390 (unchanged: two chart readout figures, `charts/**`, WP-C); blotter 0/0/0/0 at every width (was 0/0/0/59 and 0/10/0/12: the 10 clipped "Not published for this order" cards at 390 are gone). The audit prints `-` for nothing it did not measure; run once per label after the final rebase.

## Tests
See the final report of the slice for the exact commands and counts. New files: `screens/account/generatedFigures.test.ts` (6), `screens/blotter/blotterSimulated.test.tsx` (7). Extended: `screens/account/account.test.tsx` (+5, two assertions updated for the attribution column and the shared sentence), `src/fixtureBff/simulated.test.ts` (two expectations updated).

## Not verified
- No browser look at the 390px Blotter card beyond the audit's metrics (no screenshot reviewed by eye).
- `account.test.tsx` "search and venue go to the server" fails on the lane tip (6aed1421e) without any F2 change (verified on a pristine lane-tip worktree); it passed on 91cc9a28a. Logged for the primary and WP-E.
- `titleAbsence.test.ts` still lists three fleet titles (WP-A files `FleetDatasetTable.tsx`, `FleetMetricControls.tsx`, `fleet/index.tsx`) after the rebase; not an F2 file.
- Visual baselines for Accounts, Account 360 and Blotter were not re-recorded (board rule: the primary records baselines).
