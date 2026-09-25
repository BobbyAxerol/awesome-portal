/**
 * S1 — a slow answer for the run you left must never paint the run you are on.
 *
 * Run A's primary read is held 3 s; 300 ms after navigating to A the reader
 * moves (in-app) to run B, whose read answers at once. After B settles and
 * A's held response has either been aborted or delivered, the screen root must
 * carry no run-A id or digest. Then the reverse (B slow, A fast). Screens 04,
 * 09 and 11. Whether A's read was aborted by the client or delivered and
 * ignored is recorded, not asserted.
 *
 * A third observation per screen: A fully settled, then B slow — sampled 1 s
 * into B's load, the root must not still present A's content under B's URL.
 */
import { expect, test, type Page, type Route } from "@playwright/test";

import { freezeClock } from "../fixtures";
import { guide, open, quiet, rootHtml, spaNavigate, upsertRow } from "./harness";
import { EVIDENCE_RUN, RC_RUN, foundationRaw, installLane, rcIdFor, reportDetail, reportTagFor, screen, watchConsole, watchNetwork, type NetLog } from "./stubs";

const HOLD_MS = 3_000;
const MOVE_AFTER_MS = 300;

interface Pair {
  screen: "04" | "09" | "11";
  a: string;
  b: string;
  path: (run: string) => string;
  primary: (run: string) => RegExp;
  markers: (run: string) => string[];
}

/** The committed fixture's revision tag for A; a distinct one for any other run. */
const evTag = (run: string) => (run === EVIDENCE_RUN ? "7d21ab" : "b218ab");
const retagEvidence = (raw: string, run: string) =>
  run === EVIDENCE_RUN
    ? raw
    : raw.replaceAll(EVIDENCE_RUN, run).replaceAll("p13r1_7d21ab", `p13r1_${evTag(run)}`).replaceAll("p13h1_4c9a2f", `p13h1_${evTag(run)}`);

const PAIRS: Pair[] = [
  {
    screen: "04",
    a: EVIDENCE_RUN,
    b: "R-WFO-218",
    path: (run) => `/research/quantbt/runs/${run}/evidence`,
    primary: (run) => new RegExp(`/api/v1/quantbt/runs/${run}/evidence(\\?|$)`),
    markers: (run) => [run, `p13r1_${evTag(run)}`, `p13h1_${evTag(run)}`],
  },
  {
    screen: "09",
    a: EVIDENCE_RUN,
    b: "R-WFO-218",
    path: (run) => `/research/quantbt/runs/${run}/report`,
    primary: (run) => new RegExp(`/api/v1/quantbt/runs/${run}/report(\\?|$)`),
    markers: (run) => [run, reportDetail(run, reportTagFor(run)).report_revision.slice(0, 14)],
  },
  {
    screen: "11",
    a: RC_RUN,
    b: "run_rc_0918",
    path: (run) => `/research/quantbt/runs/${run}/release-candidate`,
    primary: (run) => new RegExp(`/api/v1/quantbt/runs/${run}/release-candidate(\\?|$)`),
    markers: (run) => [run, rcIdFor(run)],
  },
];


interface Outcome {
  screen: string;
  scenario: string;
  slowRun: string;
  fastRun: string;
  slowRead: "aborted" | "delivered-and-ignored" | "delivered-and-painted" | "not-sent";
  leakedMarkers: string[];
  fastRendered: boolean;
}

const STALE_LABEL = "fixture lane; A held 3 s, move after 300 ms";
const keep = (outcome: Outcome & { interim?: string[] }) =>
  upsertRow("stale.json", STALE_LABEL, `${outcome.screen} ${outcome.slowRun}→${outcome.fastRun} ${outcome.scenario.slice(0, 14)}`, outcome);

/** Installs the lane with a mutable "slow run"; evidence reads are retagged per run. */
async function lane(page: Page, pair: Pair) {
  const slow = { run: "" };
  await freezeClock(page);
  await installLane(page, { delayMs: (url) => (slow.run && url.pathname.includes(`/runs/${slow.run}/`) ? HOLD_MS : 0) });
  if (pair.screen === "04") {
    const hold = async (route: Route) => {
      const url = new URL(route.request().url());
      const run = decodeURIComponent(url.pathname.split("/")[5] ?? "");
      if (slow.run === run) await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
      return run;
    };
    const send = async (route: Route, body: string) => {
      try {
        await route.fulfill({ status: 200, contentType: "application/json", headers: { "cache-control": "private, no-store" }, body });
      } catch {
        /* aborted by the page */
      }
    };
    await page.route(/\/api\/v1\/quantbt\/runs\/[^/?]+\/evidence\/series\?/, async (route) => {
      const run = await hold(route);
      const kind = new URL(route.request().url()).searchParams.get("kind");
      const file = kind === "MONTHLY_RETURNS" ? "evidence-series-monthly.json" : kind === "ROLLING_RETURNS_20" ? "evidence-series-rolling.json" : "evidence-series-equity.json";
      await send(route, retagEvidence(foundationRaw(file), run));
    });
    await page.route(/\/api\/v1\/quantbt\/runs\/[^/?]+\/evidence(\?|$)/, async (route) => {
      const run = await hold(route);
      await send(route, retagEvidence(foundationRaw("evidence-hub.json"), run));
    });
  }
  return slow;
}

function slowReadOutcome(net: NetLog, from: number, primary: RegExp, leaked: boolean): Outcome["slowRead"] {
  const reads = net.requests.slice(from).filter((r) => primary.test(r.url));
  if (reads.length === 0) return "not-sent";
  if (reads.every((r) => r.failure !== null)) return "aborted";
  return leaked ? "delivered-and-painted" : "delivered-and-ignored";
}

async function leaked(page: Page, root: string, markers: string[]): Promise<string[]> {
  const html = await rootHtml(page, root);
  return markers.filter((m) => html.includes(m));
}

for (const pair of PAIRS) {
  const s = screen(pair.screen);
  for (const [slowRun, fastRun, label] of [
    [pair.a, pair.b, "A slow, B fast"],
    [pair.b, pair.a, "B slow, A fast"],
  ] as const) {
    test(`screen ${pair.screen}: a held read for the run left behind never paints the next run (${label})`, async ({ page }) => {
      guide("P23-T15");
      await page.setViewportSize({ width: 1280, height: 900 });
      const slow = await lane(page, pair);
      const net = watchNetwork(page);
      const { noise } = watchConsole(page, net);
      await open(page, net, "/research/quantbt/journey", "[data-screen='journey-map']");

      slow.run = slowRun;
      const from = net.requests.length;
      await spaNavigate(page, pair.path(slowRun));
      await page.waitForTimeout(MOVE_AFTER_MS);
      await spaNavigate(page, pair.path(fastRun));
      const fastRendered = await expect
        .poll(async () => (await rootHtml(page, s.root)).includes(fastRun), { timeout: 15_000 })
        .toBe(true)
        .then(
          () => true,
          () => false,
        );
      const held = pair.primary(slowRun);
      await expect.poll(() => net.requests.slice(from).filter((r) => held.test(r.url) && r.endedAt === null).length, { timeout: HOLD_MS + 5_000 }).toBe(0);
      await quiet(page, net);
      const found = await leaked(page, s.root, pair.markers(slowRun));
      const outcome: Outcome = {
        screen: pair.screen,
        scenario: label,
        slowRun,
        fastRun,
        slowRead: slowReadOutcome(net, from, held, found.length > 0),
        leakedMarkers: found,
        fastRendered,
      };
      keep(outcome);
      test.info().annotations.push({ type: "stale", description: JSON.stringify(outcome) });
      expect.soft(fastRendered, `[s${pair.screen} ${label}] ${fastRun} renders`).toBe(true);
      expect.soft(found, `[s${pair.screen} ${label}] markers of ${slowRun} in the screen root`).toEqual([]);
      expect.soft(net.writes().map((r) => `${r.method} ${r.url}`), "write requests").toEqual([]);
      expect.soft(noise, "console error/warning/pageerror").toEqual([]);
    });
  }

  test(`screen ${pair.screen}: a settled run's content does not stay on screen while the next run loads`, async ({ page }) => {
    guide("P23-T15");
    await page.setViewportSize({ width: 1280, height: 900 });
    const slow = await lane(page, pair);
    const net = watchNetwork(page);
    const { noise } = watchConsole(page, net);
    await open(page, net, pair.path(pair.a), s.root);
    expect((await leaked(page, s.root, pair.markers(pair.a))).length, `${pair.a} rendered first`).toBeGreaterThan(0);

    slow.run = pair.b;
    const from = net.requests.length;
    await spaNavigate(page, pair.path(pair.b));
    await page.waitForTimeout(1_000);
    const interim = await leaked(page, s.root, pair.markers(pair.a));
    await expect.poll(() => net.requests.slice(from).filter((r) => pair.primary(pair.b).test(r.url) && r.endedAt === null).length, { timeout: HOLD_MS + 5_000 }).toBe(0);
    await quiet(page, net);
    const final = await leaked(page, s.root, pair.markers(pair.a));
    const outcome: Outcome = {
      screen: pair.screen,
      scenario: `A settled, B held 3 s — sampled 1 s into B (interim leak: ${interim.join(", ") || "none"})`,
      slowRun: pair.b,
      fastRun: pair.a,
      slowRead: "delivered-and-ignored",
      leakedMarkers: final,
      fastRendered: true,
    };
    keep({ ...outcome, interim });
    test.info().annotations.push({ type: "stale", description: JSON.stringify({ ...outcome, interim }) });
    expect.soft(interim, `[s${pair.screen} retained] markers of ${pair.a} on screen 1 s into ${pair.b}'s load`).toEqual([]);
    expect.soft(final, `[s${pair.screen} retained] markers of ${pair.a} after ${pair.b} settled`).toEqual([]);
    expect.soft(net.writes().map((r) => `${r.method} ${r.url}`), "write requests").toEqual([]);
    expect.soft(noise, "console error/warning/pageerror").toEqual([]);
  });
}
