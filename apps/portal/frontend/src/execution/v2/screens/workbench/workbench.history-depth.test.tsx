/**
 * UXM-07 closeout 3.2 · FE side of the Paper-history qualification. JSDOM, NOT a browser.
 *
 * Input is the byte-exact response body that the REAL control-api producer + controller + Fastify serialised in-process
 * (apps/control-api/test/paper-history-http.spec.ts with PAPER_HISTORY_BODY_DIR=<dir>). The generated rows are SYNTHETIC and
 * the SQL engine behind them is a JS emulator: nothing here is a live/DB/browser measurement or a production SLO.
 *
 * Opt-in (skipped when the directory is not given):
 *   PAPER_HISTORY_BODY_DIR=<dir with workbench-<N>.json> [PAPER_HISTORY_OUT=<file>] npx vitest run <this file> --maxWorkers=2
 * Measures per depth: strict reader (JSON.parse + readPaperWorkbenchProfile), workbench model, chart series+reduction, React
 * mount to the screen heading, and DOM node counts (whole document, Equity SVG) and the length of the drawn series path.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readPaperWorkbenchProfile } from "../../readers/paperRead";
import { buildSeries, runsOf } from "../../charts/model";
import { reduceRuns } from "../../charts/downsample";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import PaperWorkbenchScreen from "./index";
import { buildWorkbench } from "./model";
import { fakeApi, qualityOf, sessionOf } from "./workbench.harness.fixtures";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

const DIR = process.env.PAPER_HISTORY_BODY_DIR;
const DEPTHS = [720, 2_000, 8_000, 32_000, 100_000] as const;
const WARMUP = 2, SAMPLES = 7;
const emit = (line: string) => { if (process.env.PAPER_HISTORY_OUT) appendFileSync(process.env.PAPER_HISTORY_OUT, line + "\n"); else console.info(line); };
const pct = (xs: number[], p: number) => { const o = xs.slice().sort((a, b) => a - b); return o[Math.max(0, Math.ceil(o.length * p) - 1)]; };
const r3 = (n: number) => Math.round(n * 1_000) / 1_000;
const stat = (xs: number[]) => ({ p50: r3(pct(xs, 0.5)), p95: r3(pct(xs, 0.95)), all: xs.map(r3) });

beforeEach(() => { session.current = sessionOf(V2_ROLE_PRESETS.manager); });
afterEach(() => cleanup());

describe.skipIf(!DIR)("JSDOM · real-HTTP Paper workbench bodies at each depth", () => {
  it.each(DEPTHS)("N=%i", async depth => {
    const file = resolve(DIR!, `workbench-${depth}.json`);
    expect(existsSync(file)).toBe(true);
    const text = readFileSync(file, "utf8");
    const bytes = Buffer.byteLength(text);
    const parseMs: number[] = [], modelMs: number[] = [], chartMs: number[] = [], mountMs: number[] = [];
    let returned = 0, shown = 0, nodes = 0, plotNodes = 0, pathNodes = 0, pathChars = 0;
    for (let i = -WARMUP; i < SAMPLES; i += 1) {
      const t0 = performance.now();
      const envelope = readPaperWorkbenchProfile(JSON.parse(text));
      const t1 = performance.now();
      expect(envelope?.schemaViolations ?? []).toEqual([]);
      const model = buildWorkbench(envelope!, null);
      const t2 = performance.now();
      const series = buildSeries(model.equity.points, "money");
      const reduced = reduceRuns(runsOf(series), 1_280);
      const t3 = performance.now();
      returned = model.equity.points.length; shown = reduced.envelope.shownCount;
      expect(returned).toBe(depth <= 2_000 ? depth : returned);
      expect(returned).toBeGreaterThan(200);

      const served = fakeApi({ profile: { ok: true, value: envelope! }, quality: { ok: true, value: qualityOf() } });
      const m0 = performance.now();
      const view = render(
        <MemoryRouter initialEntries={["/deployments/paper/dep_depth"]}>
          <PaperWorkbenchScreen api={served.api} deploymentId="dep_depth" />
        </MemoryRouter>,
      );
      await screen.findByRole("heading", { level: 1 });
      const m1 = performance.now();
      if (i >= 0) { parseMs.push(t1 - t0); modelMs.push(t2 - t1); chartMs.push(t3 - t2); mountMs.push(m1 - m0); }
      nodes = document.querySelectorAll("*").length;
      const plot = document.querySelector(".exec-eq2 svg");
      expect(plot).not.toBeNull();
      pathChars = (document.querySelector('.exec-eq2 [data-testid="series-line"]')?.getAttribute("d") ?? "").length;
      plotNodes = plot ? plot.querySelectorAll("*").length : 0;
      pathNodes = plot ? plot.querySelectorAll("path,circle,rect,line").length : 0;
      view.unmount();
    }
    emit(`PAPER_HISTORY_JSDOM ${JSON.stringify({
      scope: "JSDOM_REAL_HTTP_BODY_SYNTHETIC_ROWS_NOT_BROWSER", source_rows: depth, response_bytes: bytes, returned_rows: returned,
      chart_shown_rows: shown, document_nodes: nodes, equity_svg_descendants: plotNodes, equity_svg_drawn_elements: pathNodes, series_path_d_chars: pathChars,
      samples: SAMPLES, warmup: WARMUP, reader_ms: stat(parseMs), model_ms: stat(modelMs), chart_ms: stat(chartMs), mount_to_heading_ms: stat(mountMs),
    })}`);
  }, 180_000);
});
