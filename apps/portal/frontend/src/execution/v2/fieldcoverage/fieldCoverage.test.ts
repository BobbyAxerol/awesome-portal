/**
 * Field coverage of the three manager screens' readers against the published schemas, and the design's needs against
 * every published schema. See fieldCoverage.ts. The baseline file records today's honest gaps: a field that was read
 * and no longer is, or a read of a field the schema does not publish, fails here. Run with UPDATE_COVERAGE=1 to accept.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readCommandCenter } from "../../commandCenter";
import { readAlphaFleet, readPortfolioList } from "../../api/profileRead";
import { readManagerSeries } from "../readers/managerSeries";
import { boardColumns, fleetKpis, lensCounts, toFleetRow } from "../screens/fleet/fleetModel";
import { toRows as portfolioRows } from "../screens/portfolios/listModel";
import { currencyFacts, fleetCellGroups, needsAttention, openIncidents, stageCounts, todayRows, triageRows } from "../screens/overview/overviewModel";
import { coverageOf, schemaIndex, unusedByModel } from "./fieldCoverage";
import { HIFI_NEEDS } from "./hifiNeeds";
import { SCHEMA_DIR, loadCanonical } from "../testkit/loadCanonical";

const PROBES = [
  { id: "portfolios", schema: "execution-portfolio-list.v1.schema.json", fixture: "execution-portfolio-list", reader: readPortfolioList },
  { id: "alpha-fleet", schema: "execution-alpha-fleet-list.v2.schema.json", fixture: "execution-alpha-fleet-list.v2", reader: readAlphaFleet },
  { id: "command-center", schema: "execution-command-center-snapshot.v1.schema.json", fixture: "execution-command-center.busy", reader: readCommandCenter },
  { id: "manager-series", schema: "execution-manager-series.v1.schema.json", fixture: "execution-manager-series.populated.synthetic", reader: readManagerSeries },
] as const;

const BASELINE = resolve(__dirname, "fieldCoverage.baseline.json");

describe("field coverage: what each reader touches of its schema", () => {
  const actual: Record<string, { offered: number; unread: string[]; unknown: string[] }> = {};
  for (const probe of PROBES) {
    it(`${probe.id}: the reader accepts the canonical fixture`, () => {
      const cov = coverageOf(probe.schema, loadCanonical(probe.fixture), probe.reader);
      expect(cov.result, "the reader must accept the canonical fixture").not.toBeNull();
      actual[probe.id] = { offered: cov.offered, unread: cov.unread, unknown: cov.unknown };
    });
  }

  it("matches the committed baseline (a newly unread or unknown field is a decision, not a drift)", () => {
    if (process.env.UPDATE_COVERAGE === "1" || !existsSync(BASELINE)) {
      writeFileSync(BASELINE, `${JSON.stringify(actual, null, 2)}\n`);
      return;
    }
    const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as typeof actual;
    for (const probe of PROBES) {
      const was = new Set(baseline[probe.id]?.unread ?? []);
      const now = actual[probe.id]?.unread ?? [];
      expect(now.filter((p) => !was.has(p)), `${probe.id}: fields that used to be read and are not`).toEqual([]);
      const knownUnknown = new Set(baseline[probe.id]?.unknown ?? []);
      expect((actual[probe.id]?.unknown ?? []).filter((p) => !knownUnknown.has(p)), `${probe.id}: fields read that the schema does not publish`).toEqual([]);
    }
  });
});

describe("design needs against every published schema", () => {
  const files = readdirSync(SCHEMA_DIR).filter((f) => f.endsWith(".schema.json") && f.startsWith("execution-"));
  const index = schemaIndex(files);
  it("every need resolves to CARRIED (with where) or OPEN, and the OPEN ones are exactly the unpublished request ids", () => {
    const rows = HIFI_NEEDS.map((need) => {
      const where = need.names.flatMap((n) => index.get(n) ?? []).filter((w) => !need.in || need.in.some((f) => w.includes(f)));
      return { id: need.id, fe: need.fe ?? null, carried: where.length > 0, where: where.slice(0, 3) };
    });
    if (process.env.WRITE_COVERAGE_REPORT) writeFileSync(process.env.WRITE_COVERAGE_REPORT, `${JSON.stringify(rows, null, 2)}\n`);
    expect(rows.length).toBe(HIFI_NEEDS.length);
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
  });
});

describe("screen consumption: what each model uses of what its reader returned", () => {
  const unused: Record<string, string[]> = {};
  it("fleet: toFleetRow, fleetKpis, lensCounts, boardColumns", () => {
    const env = readAlphaFleet(loadCanonical("execution-alpha-fleet-list.v2"));
    expect(env).not.toBeNull();
    unused["fleet-model"] = unusedByModel(env!, (e) => {
      const rows = e.page.rows.map(toFleetRow);
      fleetKpis(e.summary ?? null);
      lensCounts(e.summary ?? null);
      boardColumns(rows, e.summary ?? null);
    });
  });
  it("portfolios: toRows", () => {
    const env = readPortfolioList(loadCanonical("execution-portfolio-list"));
    expect(env).not.toBeNull();
    unused["portfolios-model"] = unusedByModel(env!, (e) => { portfolioRows(e.items); });
  });
  it("overview: triage, attention, incidents, fleet cells, today, currency and stage facts", () => {
    const cc = readCommandCenter(loadCanonical("execution-command-center.busy"));
    expect(cc).not.toBeNull();
    unused["overview-command-center"] = unusedByModel(cc!, (c) => {
      triageRows(c.needsYou, (iso) => iso, null);
      needsAttention(c.needsYou);
      openIncidents(c.needsYou);
      fleetCellGroups(c.fleet);
      todayRows(c.today);
    });
    const fleet = readAlphaFleet(loadCanonical("execution-alpha-fleet-list.v2"));
    unused["overview-fleet-summary"] = unusedByModel(fleet!, (f) => { currencyFacts(f.summary ?? null); stageCounts(f.summary ?? null); });
  });
  it("matches the committed baseline", () => {
    const file = resolve(__dirname, "screenConsumption.baseline.json");
    if (process.env.UPDATE_COVERAGE === "1" || !existsSync(file)) { writeFileSync(file, `${JSON.stringify(unused, null, 2)}\n`); return; }
    const baseline = JSON.parse(readFileSync(file, "utf8")) as typeof unused;
    for (const [id, list] of Object.entries(unused)) expect(list.filter((p) => !(baseline[id] ?? []).includes(p)), `${id}: fields that used to be used and are not`).toEqual([]);
  });
});
