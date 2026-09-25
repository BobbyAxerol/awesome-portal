/**
 * C1 — thirty in-app navigation cycles 04 → 08 → 06 in one context.
 *
 * Navigation is client-side (router push), so each screen mounts and unmounts
 * inside one document and anything it fails to release accumulates. After
 * each screen settles: forced GC (CDP `HeapProfiler.collectGarbage`), then
 * `Performance.getMetrics` JSHeapUsedSize and the DOM element count. Growth of
 * the last-5-cycle mean over the first-5-cycle mean above 25 % is reported as
 * a finding (PLAN C1); it is measured, not a gate this lane invents.
 */
import { expect, test } from "@playwright/test";

import { freezeClock } from "../fixtures";
import { guide, heap, mb, mean, open, quiet, spaNavigate, writeJson } from "./harness";
import { installLane, screen, watchConsole, watchNetwork } from "./stubs";

const CYCLES = 30;
const ORDER = ["04", "08", "06"] as const;

test("thirty 04→08→06 navigation cycles keep a bounded heap", async ({ page }) => {
  guide("P23-T02");
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await freezeClock(page);
  await installLane(page);
  const net = watchNetwork(page);
  const { noise } = watchConsole(page, net);

  await open(page, net, "/research/quantbt/journey", "[data-screen='journey-map']");
  const baseline = await heap(page, true);
  const samples: { cycle: number; screen: string; heapUsedBytes: number; nodes: number; rendered: boolean }[] = [];

  for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
    for (const id of ORDER) {
      const s = screen(id);
      await spaNavigate(page, s.path);
      const rendered = await page
        .locator(s.root)
        .first()
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(
          () => true,
          () => false,
        );
      await quiet(page, net);
      const sample = await heap(page, true);
      samples.push({ cycle, screen: id, heapUsedBytes: sample.heapUsedBytes, nodes: sample.nodes, rendered });
    }
  }

  const perCycle = Array.from({ length: CYCLES }, (_, i) => mean(samples.filter((x) => x.cycle === i + 1).map((x) => x.heapUsedBytes)));
  const first5 = mean(perCycle.slice(0, 5));
  const last5 = mean(perCycle.slice(-5));
  const max = Math.max(...samples.map((x) => x.heapUsedBytes));
  const growthPct = ((last5 - first5) / first5) * 100;
  const byScreen = Object.fromEntries(
    ORDER.map((id) => {
      const rows = samples.filter((x) => x.screen === id);
      const f = mean(rows.slice(0, 5).map((x) => x.heapUsedBytes));
      const l = mean(rows.slice(-5).map((x) => x.heapUsedBytes));
      return [id, { first5Mb: Number(mb(f)), last5Mb: Number(mb(l)), growthPct: Number((((l - f) / f) * 100).toFixed(1)), nodesFirst: rows[0]!.nodes, nodesLast: rows[rows.length - 1]!.nodes }];
    }),
  );

  writeJson("cycles.json", {
    label: "client cost, fixture lane; forced GC before every sample",
    baseline,
    first5MeanBytes: first5,
    last5MeanBytes: last5,
    maxBytes: max,
    growthPct,
    finding: growthPct > 25 ? "GROWTH_ABOVE_25_PERCENT" : "WITHIN_25_PERCENT",
    byScreen,
    perCycleMeanBytes: perCycle,
    samples,
  });
  console.log(
    `C1 (client cost, fixture lane): baseline ${mb(baseline.heapUsedBytes)} MB · first-5 mean ${mb(first5)} MB · last-5 mean ${mb(last5)} MB · max ${mb(max)} MB · growth ${growthPct.toFixed(1)} %`,
  );
  for (const [id, row] of Object.entries(byScreen)) console.log(`  s${id}: ${JSON.stringify(row)}`);

  expect.soft(samples.filter((x) => !x.rendered).map((x) => `cycle ${x.cycle} s${x.screen}`), "screens whose root did not render").toEqual([]);
  expect.soft(net.writes().map((r) => `${r.method} ${r.url}`), "write requests").toEqual([]);
  expect.soft(noise, "console error/warning/pageerror").toEqual([]);
  expect(samples).toHaveLength(CYCLES * ORDER.length);
  if (growthPct > 25) test.info().annotations.push({ type: "finding", description: `heap growth ${growthPct.toFixed(1)} % > 25 %` });
});
