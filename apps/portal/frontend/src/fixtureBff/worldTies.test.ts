// @vitest-environment node
/**
 * WORLD TIES (UXM-07 fixture campaign, step B-T). The fixture world must never again contradict itself without a red test.
 *
 * The tie logic is `runWorldTies` in scripts/fixture-ties.mjs (plain JS over a `get(path)`, so the walker can run the same rules against a
 * running stack). This file runs it WITHOUT a browser against the real fixture server (the answerer, the review manager, the relations) and turns each
 * tie into one test. The catalogue (one row per tie, with the QA5 id and the owner) is
 * upgrade/execution_loop/evidence/UXM-07/WORLD_TIE_CATALOGUE_2026-10-28.md and a test below keeps the two lists equal.
 *
 * WHERE THIS FILE LIVES: vitest excludes `e2e/**` (Playwright's), so the file sits beside the other fixture-server suites, not in e2e/.
 *
 * THE MECHANISM (how an owner lands a fix):
 *   `ties (must hold)`           ties that are green on the tip. They must stay green; a violation is a regression.
 *   `ties (open, known red)`     ties with a QA5 blocker or major still open. Each is registered in OPEN_TIES below and runs as `it.fails`:
 *                                it PASSES while the tie is red and FAILS the moment the tie turns green, with the message "now green: delete
 *                                <ID> from OPEN_TIES". The owner (or the integrator) deletes that one line; the tie then moves to `must hold`
 *                                by itself. Nothing else changes. A tie that is red but NOT in OPEN_TIES is a regression and fails.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureServer, loadConfig, resetFixtureGlobals } from "../../../fixture-bff/app";
import { resetScenario } from "../../../fixture-bff/scenario";

type TieResult = { checked: number; violations: string[] };
type Get = (path: string) => Promise<{ status: number; body: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Every tie of the catalogue. `qa` = the QA5 (and earlier) ids it generalises; `owner` = the agent whose doubles make it green. */
const TIES: readonly { id: string; title: string; qa: string; owner: string }[] = [
  { id: "W01", title: "no stage page of a deployment says RUNNING/current unless it is the deployment's own stage; at most one says it", qa: "R5-02 R5-03 R4-01 R2-02", owner: "B-S" },
  { id: "W01b", title: "a deployment has one stage: the other stage pages do not answer for it", qa: "R5-03 R4-01", owner: "B-S" },
  { id: "W02", title: "a stage the alpha has left is not active in the Fleet row, the alpha resource or its own page", qa: "R2-01 R4-01 R5-02", owner: "B-S" },
  { id: "W03", title: "alpha lifecycle (days, dates) equals the stage pages' lifecycle", qa: "R5-02 R2-01 R2-15", owner: "B-S" },
  { id: "W04", title: "every id linked from Overview, approvals, incidents, operations resolves, with the same name and stage", qa: "R1-01 R1-02 R1-03 R1-06 R5-07 R5-08 R3-16", owner: "B-A" },
  { id: "W05", title: "counts agree: Overview fleet = Fleet header = rows = register; lane loaded <= total", qa: "R1-07 R2-03 R2-13", owner: "B-A" },
  { id: "W06", title: "one capital world: approval preview = register = capital read = portfolio resource, and the move equals the request", qa: "R3-01 R1-13", owner: "B-A" },
  { id: "W07", title: "every order shown in any room is in the blotter with the same id, deployment, status, qty, price, time", qa: "R5-01 R5-04 R4-07 R2-05", owner: "B-O" },
  { id: "W07d", title: "known-open: synthetic earlier-trade ids ord_9xxxxx (retired Paper deployment) are the only order ids allowed to be missing from the blotter, until the blotter adopts the 60-fill window", qa: "R5-01 R2-05", owner: "B-O" },
  { id: "W07b", title: "times in one body are ordered: submit < fill, and nothing is stamped after its own as-of", qa: "R4-06 R2-04", owner: "B-O" },
  { id: "W07c", title: "replay (observed timeline) shows the blotter's order times", qa: "R4-07 R2-04", owner: "B-O" },
  { id: "W08", title: "one mark per symbol on every screen; position notional = quantity x mark", qa: "R4-03 R2-09 R2-10", owner: "B-C" },
  { id: "W08b", title: "a sleeve has one equity; sleeve arithmetic; exposure = sum of position notionals", qa: "R4-04 R5-12 R2-09", owner: "B-C" },
  { id: "W09", title: "one net PnL and return per alpha deployment across Overview, Alpha 360, Compare, Core contributors and the Live room", qa: "R3-03 R5-13 R2-07 R1-09", owner: "B-C" },
  { id: "W09b", title: "drawdown is never above zero", qa: "R1-09 R1-10 R2-06", owner: "B-C" },
  { id: "W10", title: "one last-seen per person across every roster filter", qa: "R3-04", owner: "B-A" },
  { id: "W11", title: "environment labels derive from the entity's stage (deployment) or the portfolio's books", qa: "R3-05 R3-10", owner: "B-O" },
  { id: "W12", title: "register NAV / Net PnL = 360 statement for every portfolio and book", qa: "R1-05 R1-15", owner: "B-C" },
  { id: "W19", title: "an approval request exists only for the next gate of its subject, once, with an open quorum, and its environment label is a partition of the portfolio whose capital it moves", qa: "R3-02 R3-03 R3-09 R3-10", owner: "B-A3" },
  { id: "W20", title: "an account has one environment: operations, incidents and its Account 360 agree", qa: "R3-04 R1-02", owner: "B-A3" },
  { id: "W21", title: "Account 360 ties inside itself and to the Accounts list: margin ratio = maintenance / equity, the list virtual sum = the ledger, venue wallet not below the ledger unflagged, distinct deployment names", qa: "R3-05 R3-06 R3-08", owner: "B-A3" },
  { id: "W22", title: "Since your last visit lists only observations after that visit", qa: "R1-04", owner: "B-A3" },
  { id: "W60", title: "an Accounts list row is a projection of the same account fact as its Account 360: virtual sum = ledger = exposure used, headroom = exposure headroom", qa: "N3-01 R3-05", owner: "B-A3" },
  { id: "W61", title: "a decided request is decided everywhere: absent from the queue, APPROVED, quorum met, decision actions locked", qa: "N5-04", owner: "B-A3" },
  { id: "W62", title: "a Live gate request states the decided R1 of its alpha and it opens", qa: "R3-02 N3-02", owner: "B-A3" },
  { id: "W63", title: "every approval subject opens a readable Alpha 360 and its Fleet row stage is the stage its approval waits at", qa: "N3-05 N3-09", owner: "B-A3" },
  { id: "W64", title: "the contribution an exit review prints is the published Net PnL of the deployment it reviews, in its currency", qa: "N3-02 R3-09", owner: "B-A3" },
  { id: "W65", title: "an R2 request's portfolio weight is allocation over the NAV the portfolio's own chart ends on", qa: "N3-03", owner: "B-A3" },
  { id: "W66", title: "no margin ratio and no buying power without the data they are made of", qa: "N3-04", owner: "B-A3" },
  { id: "W67", title: "an R2 request labels an account (NEW) only when it does not exist, and states the capital check of an existing one", qa: "N3-07", owner: "B-A3" },
  { id: "W68", title: "a request names the entity it decides (a linkable id of the fleet) and the session's alpha picker lists the fleet's alphas and no placeholder", qa: "N3-06 N3-08", owner: "B-A3" },
  { id: "W80", title: "one criteria count per gate: a request's criteria met now is Alpha 360's count for the stage the gate leaves", qa: "N8c-01", owner: "B-A3" },
  { id: "W81", title: "a Fleet dataset row whose stage its alpha has left says ENDED; a row of the current stage never does", qa: "N8c-04 N3-09", owner: "B-A3" },
  { id: "W13", title: "one clock: every read of the world is taken within a day of the others", qa: "R3-10 R3-09", owner: "B-O" },
  // ===== WP-B2-S3 begin
  { id: "W31", title: "a Sandbox page that shows an equity difference or an approved decision blocks its gate: open blocking finding, nothing eligible to submit, steps counted and dated inside the run", qa: "R4-01 R4-03 R4-05 R4-12", owner: "B-S" },
  { id: "W32", title: "every lineage entry of a stage page is a request of that page's alpha, opens, and is that alpha's only (one request id, one alpha)", qa: "R4-02 R4-13 R5-04 R5-06", owner: "B-S" },
  { id: "W33", title: "one halt fact: a room that says HALTED is HALTED in the Fleet row and the alpha resource (and the reverse), and nothing is ordered after the halt", qa: "R5-02 R5-09", owner: "B-S" },
  { id: "W34", title: "a stage page never contradicts the alpha's record: a stage the alpha left is STOPPED and nothing on it is as-of later than its stop", qa: "R4-03 R4-06 R5-10 R2-05", owner: "B-S" },
  { id: "W35", title: "a finished Canary is a Canary record: the room declares the Canary stage, and a Live alpha's predecessor envelope opens as a finished trial", qa: "R5-01 R5-05", owner: "B-S" },
  { id: "W30", title: "a decided certification reads as passed in the contract's own words: APPROVED, eligible, no blocker, every step PASS/DONE, no finding, both sides of every figure equal (the Sandbox page and its history records)", qa: "N4-01 N5-02", owner: "B-S" },
  { id: "W36", title: "a Live page's predecessor envelope is the linked Canary room's own envelope (same id, same caps), finished, never active for live", qa: "N5-01", owner: "B-S" },
  { id: "W37", title: "the links of a mismatch page open the deployment's own records: the finding is an open Real-funded incident of that deployment, the dry-run link's Operations queue is non-empty and is that deployment's", qa: "R5-03 N5-09", owner: "B-S" },
  { id: "W38", title: "an alpha link of the Overview with its query, and the alpha resource under every workspace/deployment query, answer that alpha's own deployments, stage and allocation", qa: "R1-01", owner: "B-S" },
  { id: "W39", title: "a Paper stage the alpha left nets flat (no position, orders net zero, no locked cash with nothing open), its accounting fee is the fills' own USDT fees, and its gate minimum is the one its exit review states", qa: "N4-04 N4-05", owner: "B-S" },
  { id: "W40", title: "Alpha 360's criteria met of a Sandbox stage is the Sandbox page's own passed-step count (seven once the alpha left the stage)", qa: "N4-09", owner: "B-S" },
  { id: "W41", title: "an ended Canary trial carries ended facts: no readiness claim in its rollback checks, no promotion gate waiting on the owner, no capital consumed with nothing held, the exit review date not after the end", qa: "N5-05", owner: "B-S" },
  { id: "W70", title: "an alpha's published lifecycle is its own history: the fleet's stage is CURRENT, stages it left are DONE, later stages NOT_STARTED (a variant page spines its own alpha's stage)", qa: "N8a-01 N8a-03", owner: "B-S" },
  { id: "W71", title: "a dark variant removes source facts only: its declared envelope limits, approved caps and trial duration are the base room's", qa: "N8a-04", owner: "B-S" },
  { id: "W72", title: "a room and its variants are one deployment: an open reconciliation incident is an open finding of the base room too, and a variant id in a room link opens the deployment's own non-empty blotter and operations list", qa: "N8b-02 N8b-03 N8b-04", owner: "B-S" },
  { id: "W73", title: "the world has no venue bar after its clock, and the bar holding the clock closes at the world's mark of the symbol", qa: "N8b-01", owner: "B-S" },
  { id: "W74", title: "a Paper page of a stage the alpha left never publishes freshness FRESH for data days older than its read", qa: "N8a-05 N4-03", owner: "B-S" },
  // ===== WP-B2-S3 end
  { id: "W23", title: "a scoped blotter is the scope's population: every order of the deployment/alpha (including ord_00225 for Carry A) is on it, count and chips equal the filtered population", qa: "QA6 R2-02", owner: "B-B1" },
  { id: "W24", title: "one definition of the money of a book: Net PnL is the published realized, a venue is the sum of its deployments, Equity is allocation + realized + unrealized (a ledger figure without the unrealized is not named Equity)", qa: "R2-03 R5-08 R3-07", owner: "B-C3" },
  { id: "W25", title: "an Alpha 360 equity line is the alpha's OWN deployments on one account, opens at their allocation on the book's first day and ends at their equity", qa: "R2-01 R2-04", owner: "B-C3" },
  { id: "W26", title: "drawdown is the drawdown of one level path: the alpha pane and the line above it agree, a sleeve's Account 360 line and its Portfolio NAV are the same series, open PnL is the sum of the positions", qa: "R2-12 R3-07", owner: "B-C3" },
  { id: "W27", title: "one fee model: the 30-day cost drag of a live book is not below what its deployment has paid since activation", qa: "R2-06", owner: "B-C3" },
  { id: "W28", title: "the lifecycle is told at the world clock: no event after the read, every exit is named for the stage exited, every started stage has its start event", qa: "R2-09 R2-10 R2-11", owner: "B-C3" },
  { id: "W29", title: "a limit exactly reached is full, not a breach; a stopped trial states no daily PnL", qa: "R5-07 R5-10", owner: "B-C3" },
  { id: "W50", title: "a stage's daily closes are its own book's: inside the days the stage ran, none after the world's day, the last one is the stage's equity", qa: "N2-01", owner: "B-C4" },
  { id: "W51", title: "one drawdown per book and window: the dataset tile equals the lowest point of the drawdown pane at the page's default window", qa: "N2-02", owner: "B-C4" },
  { id: "W52", title: "the Orders rollup is the blotter's own book of the alpha's deployments in the book (orders, fills, statuses)", qa: "N2-03", owner: "B-C4" },
  { id: "W53", title: "every open position of a Real-funded room is opened by fills in the order book or carries the typed warning that it predates the retained order window", qa: "N2-04", owner: "B-C4" },
  { id: "W54", title: "the room's KPI that holds allocation + realized is not named equity, and its Net PnL series says realized", qa: "N5-06", owner: "B-C4" },
];

/** Ties still red on the tip. Delete a line when its owner lands the fix (the test then tells you which). */
const OPEN_TIES: Readonly<Record<string, string>> = {
};

let server: Server;
let base = "";
let results: Record<string, TieResult> = {};
let legacy: { checked: number; mismatches: string[] } = { checked: 0, mismatches: [] };

const get: Get = async (path) => {
  const response = await fetch(`${base}${path}`);
  let body: unknown = null;
  try { body = await response.json(); } catch { /* an event stream or an empty body */ }
  return { status: response.status, body };
};
const loadTies = async () => import(/* @vite-ignore */ pathToFileURL(join(process.cwd(), "../../../scripts/fixture-ties.mjs")).href);

beforeAll(async () => {
  server = createFixtureServer(loadConfig({ PORT: "0", FIXTURE_HOST: "127.0.0.1", FIXTURE_REVIEW_PROFILE: "populated", FIXTURE_SCALE: "medium" }));
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const mod = await loadTies();
  results = (await mod.runWorldTies(get)).ties;
  legacy = await mod.runTies(get);
  // WORLD_TIES_REPORT=/path.json: every violation of every tie, for the owners (the test output shows the first twelve)
  if (process.env.WORLD_TIES_REPORT) writeFileSync(process.env.WORLD_TIES_REPORT, JSON.stringify({ results, legacy }, null, 1));
}, 120_000);
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
  resetFixtureGlobals();
  resetScenario();
});

const report = (id: string): string => {
  const r = results[id];
  return r === undefined ? `${id}: not run` : `${id}: ${r.violations.length} of ${r.checked} checks violated\n  ${r.violations.slice(0, 12).join("\n  ")}`;
};
const open = TIES.filter((t) => OPEN_TIES[t.id] !== undefined);
const held = TIES.filter((t) => OPEN_TIES[t.id] === undefined);

describe("ties (must hold)", () => {
  it("the cross-screen ties of the walker (T1-T14) still hold", () => {
    expect(legacy.mismatches).toEqual([]);
  });
  for (const tie of held) {
    it(`${tie.id} ${tie.title}`, () => {
      // W07d is a standing guard: it only counts ord_9xxxxx ids, and there are none on the tip
      if (tie.id !== "W07d") expect(results[tie.id]?.checked ?? 0, `${tie.id} checked nothing: a tie that reads no data is vacuous`).toBeGreaterThan(0);
      expect(results[tie.id]?.violations ?? ["not run"], report(tie.id)).toEqual([]);
    });
  }
});

describe("ties (open, known red)", () => {
  for (const tie of open) {
    // it.fails: passes while the assertion below FAILS (the tie is red); fails ("Expect test to fail") once the tie is green, so the line gets deleted.
    it.fails(`${tie.id} ${tie.title} [open: ${OPEN_TIES[tie.id]}]`, () => {
      expect(results[tie.id]?.violations ?? ["not run"], `now green: delete ${tie.id} from OPEN_TIES\n${report(tie.id)}`).toEqual([]);
    });
  }
  it("every open tie still reads data (a tie that reads nothing is not red, it is broken)", () => {
    for (const tie of open) expect(results[tie.id]?.checked ?? 0, `${tie.id} checked nothing`).toBeGreaterThan(0);
  });
});

describe("catalogue", () => {
  it("every OPEN_TIES entry names a tie of the catalogue", () => {
    for (const id of Object.keys(OPEN_TIES)) expect(TIES.map((t) => t.id)).toContain(id);
  });
  it("the catalogue document has one row per tie", () => {
    const file = join(process.cwd(), "../../../upgrade/execution_loop/evidence/UXM-07/WORLD_TIE_CATALOGUE_2026-10-28.md");
    const text = readFileSync(file, "utf8");
    for (const tie of TIES) expect(text, `${tie.id} has no row in the catalogue`).toContain(`| ${tie.id} |`);
  });
  it("no tie is unknown to the tie runner", () => {
    for (const id of Object.keys(results)) expect(["W00", ...TIES.map((t) => t.id)], `runner reports ${id}, which the catalogue does not know`).toContain(id);
  });
});
