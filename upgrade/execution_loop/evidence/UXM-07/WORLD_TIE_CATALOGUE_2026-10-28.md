# World tie catalogue, 28 Oct 2026 (UXM-07 fixture campaign, step B-T)

Purpose: the fixture world must never again contradict itself without a red test. Each QA5 BLOCKER (and the MAJORs that are the same kind of
contradiction) is generalised into a rule over ALL entities, not only the ones the reviewers named, and encoded once.

- Rules: `runWorldTies(get)` in `scripts/fixture-ties.mjs`. Plain JS over served bodies, so the walker (`fixture-journey.mjs`) can run the same rules against a running stack. It imports no world module: stage, environment and names are read from the bodies the screens read.
- Runner: `apps/portal/frontend/src/fixtureBff/worldTies.test.ts`. No browser; it starts the real fixture server (answerer + review manager + relations, `populated` profile, `medium` scale) and calls the routes. Vitest excludes `e2e/**` (Playwright's), so the file sits beside the other fixture-server suites rather than in `e2e/`.
- Run: `cd apps/portal/frontend && nice -n 10 npx vitest run src/fixtureBff/worldTies.test.ts --maxWorkers=2`. Add `WORLD_TIES_REPORT=/path/report.json` to get every violation of every tie (the test output shows the first twelve).
- The existing `runTies` (T1 to T14, 92 checks, wired into `ties.test.ts` and the walker) is unchanged and stays green; `worldTies.test.ts` runs it too as the first test of `ties (must hold)`.

## Mechanism (how an owner lands a fix)

The test file has two describe groups.

- `ties (must hold)`: every tie that is green on the tip, and the T1 to T14 walker ties. A violation here is a regression.
- `ties (open, known red)`: every tie listed in `OPEN_TIES` (a map `id -> why it is red`, at the top of the test file). Each runs as `it.fails`: it passes while the tie is red and fails with `now green: delete <ID> from OPEN_TIES` the moment the tie turns green. The owner deletes that one line; the tie then runs in `must hold` by itself. A tie that is red and not in `OPEN_TIES` is a regression and fails in `must hold`.

So the suite is green on today's tip, turns red for the owner exactly when a blocker is fixed (to tell them to promote it), and turns red for everybody if a green tie breaks.
A tie that checks nothing is itself a failure (`checked > 0` is asserted), so a tie cannot go green by reading no data.

## The catalogue

Status is on the tip `3f02e233e` (the frozen lane tip) with the populated, medium fixture server. `checked` is how many comparisons the tie made; `viol.` is how many it failed.

| ID | Statement (rule over all entities) | Routes compared | QA5 / earlier ids | Owner | Status | checked / viol. |
|---|---|---|---|---|---|---|
| W01 | No stage page of a deployment says RUNNING or "envelope ACTIVE" unless it is the deployment's own stage; at most one stage page says it; every stage page names the same deployment and the same alpha as the Fleet row | `/screens/paper/{d}`, `/deployments/{d}/certification`, `/canary`, `/live` vs `/alphas` rows | R5-02, R5-03, R4-01, R2-02 | B-S | GREEN | 200 / 0 |
| W01b | A deployment has ONE stage: a stage page of another stage does not answer for it (404 or typed refusal, not a template body) | same four stage routes, for every deployment of the fleet (first 40) | R5-03, R4-01 | B-S | RED | 160 / 120 |
| W02 | A stage the alpha has left is not active anywhere: its deployment is not `ACTIVE`/`active` in the Fleet row, the alpha resource, or on its own stage page | `/alphas` rows, `/resources/alphas/{a}`, own stage page | R2-01, R4-01, R5-02 | B-S | RED | 41 / 29 |
| W03 | The alpha's lifecycle equals the stage pages: Live activation date, Canary start date and trial day, Sandbox decision date, Paper stop date all chain from the days in `life_*_days` (each page read on its own as-of) | `/manager/alphas/{a}/overview` (`life_*_days`) vs the four stage pages | R5-02, R2-01, R2-15 | B-S | RED | 22 / 2 |
| W04 | Every id linked from Overview, the approvals inbox and details, the operations queue and incidents resolves (200) and means the same thing: operation, incident and approval links resolve; a deployment link is a deployment of the fleet in the stage the path says, with the label the card shows; deployment and portfolio ids inside approval, operation and incident bodies exist | `/compositions/command-center` hrefs; `/operations/incidents/{i}`, `/operations/{op}`, `/governance/approvals/{AP}/{gate}`; ids inside `/governance/approvals`, `/operations`, incident roots vs `/alphas` and `/portfolios` | R1-01, R1-02, R1-03, R1-06, R5-07, R5-08, R3-16 | B-A | RED | 69 / 17 |
| W05 | Counts agree: Overview fleet total and per-stage cells = Fleet header = rows of the Fleet; stage header counts = alphas whose stages include the stage; board lane loaded <= filtered total = header; Fleet PORTFOLIOS = register total = register rows | `/compositions/command-center` `fleet_health`; `/alphas` summary and `?stage=` lanes; `/portfolios` | R1-07, R2-03, R2-13 | B-A | RED | 18 / 7 |
| W06 | One capital world: the approval's capital preview moves by the requested amount and starts from the allocated capital the register, the portfolio capital read and the portfolio resource state; those three agree for every portfolio | `/governance/approvals/{AP}/{gate}` `capital`, `/portfolios`, `/derivations/portfolios/{p}/capital`, `/resources/portfolios/{p}` | R3-01, R1-13 | B-A | RED | 21 / 4 |
| W07 | Every order shown in any room is in the blotter with the same id, symbol, side, quantity, price, status, submit time and deployment (Live and Canary rooms, Paper page, alpha orders, account orders); alpha orders belong to the alpha in the blotter | `/deployments/{d}/live`, `/canary`, `/screens/paper/{d}`, `/resources/alphas/{a}/orders`, `/resources/accounts/{x}/orders` vs `/screens/blotter` (all pages) | R5-01, R5-04, R4-07, R2-05 | B-O | RED | 165 / 18 |
| W07d | Known-open carve-out of W07: synthetic earlier-trade ids `ord_9xxxxx` (retired Paper deployment) are the ONLY order ids allowed to be missing from the blotter, and are counted here, not in W07. Flip when B-O adopts the 60-fill window. | same as W07 | R5-01, R2-05 | B-O | GREEN (vacuous: no ord_9xxxxx id is served on the tip; goes red the day one is shown and is missing; remove the carve-out when B-O adopts the 60-fill window) | 0 / 0 |
| W07b | Times in one body are ordered: submit <= updated, submit < every fill of the order, and nothing (order update, fill, room order) is stamped after its own as-of | `/screens/blotter` orders and fills, alpha fills, Live and Canary rooms | R4-06, R2-04 | B-O | RED | 848 / 2 |
| W07c | Replay shows the blotter's times: the observed-timeline entry of an order is observed at the blotter order's `updated_at` (its declared clock `ORDER_UPDATED_AT`) | `/views/observed-timeline` vs `/screens/blotter` | R4-07, R2-04 | B-O | RED | 11 / 11 |
| W08 | One mark per symbol on every screen (alpha positions, room positions, paper positions, the implied mark of account positions); a position's notional = quantity x its mark | `/resources/alphas/{a}`, `/resources/accounts/{x}`, `/deployments/{d}/live` and `/canary`, `/screens/paper/{d}` | R4-03, R2-09, R2-10 | B-C | RED | 90 / 14 |
| W08b | A sleeve has one equity (an alpha page's balance row for a sleeve = the account page's row; two sleeves' pages state the same total for a third); exposure = sum of the deployment's position notionals; net PnL = realized + unrealized | `/resources/alphas/{a}` vs `/resources/accounts/{x}` | R4-04, R5-12, R2-09 | B-C | RED | 68 / 8 |
| W09 | One net PnL and one return per alpha deployment: Fleet datasets (paper, sandbox, live), Alpha 360 overview, Portfolio (Core) contributors, the alpha resource's Net PnL block and the Live room's equity less allocation all state the same value; return = net PnL / allocation | `/manager/fleet`, `/manager/alphas/{a}/overview`, `/manager/portfolios/{p}/overview`, `/resources/alphas/{a}`, `/deployments/{d}/live` | R3-03, R5-13, R2-07, R1-09 | B-C | RED | 88 / 33 |
| W09b | Drawdown is never above zero (alpha and portfolio statements) | `/manager/alphas/{a}/overview`, `/manager/portfolios/{p}/overview` | R1-09, R1-10, R2-06 | B-C | GREEN | 13 / 0 |
| W10 | One last-seen per person across every roster filter (plain, by username, by display name, by role, by state) | `/api/admin/accounts` with `q=`, `role=`, `state=` | R3-04 | B-A | GREEN | 32 / 0 |
| W11 | Environment labels derive from the entity: an operation or incident on a deployment carries the environment of the deployment's stage (Canary and Live are LIVE); on a portfolio, an environment the portfolio holds a book in | `/operations`, `/operations/incidents/{i}`, `/governance/approvals` vs `/alphas` and `/portfolios` environments | R3-05, R3-10 | B-O | RED | 78 / 35 |
| W12 | Register NAV and Net PnL = the 360 statement for every portfolio and book, including "Not published" in both or neither | `/manager/fund-overview?group_by=portfolio_id` vs `/manager/portfolios/{p}/overview`, all environments the portfolio holds | R1-05, R1-15 | B-C | GREEN | 80 / 0 |
| W13 | One clock: the as-of of the alpha resource, blotter, register, alpha fleet, the four rooms, the fund dataset, the operations queue and an incident root are within one day of each other | the as-of field of each | R3-10, R3-09 | B-O | RED | 10 / 4 |
| W14 | A Sandbox page that shows an equity difference blocks its gate (open blocking finding, verdict OPEN_FINDINGS, not eligible); an approved certification is closed (no open finding, nothing eligible to submit); a passed step is dated inside the run and before the submission, its evidence unexpired at the read; passed_count = steps that PASS | `/deployments/{d}/certification` for the fleet's sandbox deployments and the variant ids (`_mismatch`, `_dark`) | R4-01, R4-03, R4-05, R4-12 | B-S | GREEN | see test | 
| W15 | Every lineage entry (R1, R2, Paper exit, Sandbox exit, Canary promotion / Live approval) of a stage page is a request of that page's alpha: the value is the id the link opens (200), the request names the same alpha, one request id is one alpha across all pages, and a stage-record link opens a record of the same alpha | lineage of the four stage pages (fleet deployments and variant ids) vs `/governance/approvals/{AP}/{gate}`, `/governance/exit-reviews/{id}` and the linked stage pages | R4-02, R4-13, R5-04, R5-06 | B-S | GREEN | see test | 
| W16 | One halt fact: a room that says HALTED is HALTED in the Fleet row and in the alpha resource (and the reverse); no order of the deployment is submitted after the halt | stage rooms vs `/alphas` rows vs `/resources/alphas/{a}` vs `/screens/blotter` | R5-02, R5-09 | B-S | GREEN | see test | 
| W17 | A stage page never contradicts the alpha's record: a stage the alpha has left (Fleet/Alpha 360 stage is further) answers STOPPED, and no reconciliation or panel on it is as-of later than the stop | stage pages (fleet deployments and variant ids) vs `/alphas` stage | R4-03, R4-06, R5-10, R2-05 | B-S | GREEN | see test | 
| W18 | A Canary deployment's room declares the Canary stage (never "does not declare"); every Live deployment of a Live alpha links a predecessor Canary envelope that opens as a finished (STOPPED) trial | Canary rooms; `lineage` CANARY_ENVELOPE of Live rooms | R5-01, R5-05 | B-S | GREEN | see test | 

Counts on the tip: 18 world ties, 4 GREEN (W01, W09b, W10, W12), 14 RED. Plus the walker's T1 to T14 (92 checks): GREEN.

## Owner view (what turns each RED tie green)

- B-S (stage pages, lifecycle): W01b, W02, W03. Make stage routes answer only for a deployment of that stage; mark a left stage's deployment stopped (`state`, `active` false) in the Fleet row and the alpha resource; start the Canary room at the lifecycle's canary start.
- B-O (orders, blotter, replay, times, operations): W07, W07b, W07c, W11, W13. One book of orders for every room, the blotter's own as-of after its last fill, replay on the blotter's `updated_at`, operation and incident environments from the target.
- B-A (approvals, overview, people): W04, W05, W06 (W10 is green). Overview links point at world ids; Overview counts from the Fleet read; the approval preview from the register's capital.
- B-C (accounts, marks, performance): W08, W08b, W09 (W09b and W12 are green). One mark of BTCUSDT; a sleeve row on an alpha page is the account page's row or is labelled as the alpha's share; `net_pnl` is one definition in the datasets and the alpha resource.

## Findings worth knowing before editing a double

- W09: the datasets publish `net_pnl` as realized only (Carry A 980.40) while the alpha resource and the Live room publish realized + unrealized (1,120.80). Return 2.451% = 980.40 / 40,000 uses the realized figure. One definition must win everywhere.
- W06: the portfolio resource states Core's allocated capital as 350,000.50 while the register and the capital read state 270,000.00 (the QA5 R3-01 pair); the approval preview uses 270,000.00 for Core and 85,000.00 for Satellite (register 75,000).
- W08: BTCUSDT has three marks in the served bodies: 66,470.50 (alpha_c and the rooms), 67,410.00 (alpha_d and generated alphas) and 165,000.00 (implied by the account positions: 0.90 BTC = 148,500.00 notional).
- W13: the dataset and operations reads are taken on the operations instant (22 Aug) or 1 Sep while the rooms and the alpha resource are taken on 17 Oct. The preview's rebase moves every body by the same delta, so it keeps the gap.

## What these ties do not cover

- The DOM (what a screen prints). `scripts/fixture-dom-ties.mjs` is unchanged: it needs a browser and a built dist, which this step did not run. The ties here prove the served world; a screen that formats or picks a different field from a consistent world is still the DOM walker's job (P1 to P6) and the screenshots'.
- Frontend-derived panels that have no served field: the Evidence diff "350,000.50 to 375,000.50" is the portfolio resource's number (W06 catches the source), but the screen's own arithmetic is not read; the Fleet board header "10 of 9 rows loaded" is a front-end count (W05 checks the served lane counts it is built from).
- Items that are text or design, not ties: R5-09 (the 100% bar), R5-10 (chart titles), R5-11 duplicate labels in a list (partly W01/W08b), raw `TEST_ONLY` tokens, Command-K coverage, quorum wording (R3-06) and the Basis B / Carry A approval-lineage text (R5-07 beyond link resolution, R3-02).
- Generated (scale) entities are tied through the rows that list them, but only the first 40 deployments, 12 alphas, 12 portfolios and 20 approvals are read per run; the stage-page ties read only the first 40 deployments.
- Writes (approvals created, incidents acknowledged) store nothing in the fixture BFF, so no tie covers a state change.
