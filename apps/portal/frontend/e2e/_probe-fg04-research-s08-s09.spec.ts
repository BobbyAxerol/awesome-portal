/**
 * FG-04b/c · Screen 08 two-lane candle overview caption + Screen 09 print receipt.
 *
 * Lane: `COMPONENT_FIXTURE_BROWSER_RECEIPT` (fixture lane). The page is this
 * branch's production build served by an already running preview; every API
 * body is a committed canonical contract fixture
 * (`packages/contracts/fixtures/*.valid.json`, read through `contractFixture`),
 * a committed unit fixture under `src/research/`, or the typed P23 lane from
 * `e2e/research-qualification/stubs.ts`. Nothing here is a real-API claim.
 *
 * S08 · the retained WFO lane (`execution.candle_overview`, bound 160 buckets)
 * and the P04 hub lane (`candle_overview`, bound 48) draw one component. Each
 * lane at 1280/1440/660: the caption prints the server's
 * `emitted_bucket_count`, `bucket_bars` and envelope verbatim, the strip draws
 * exactly one candle per server bucket at the bucket's own ordinal midpoint,
 * and both captions follow one grammar.
 *
 * S09 · the report at 1280/1440/660, then print media and `page.pdf` on Letter
 * and A4: six y rules, labels carrying the server's exact strings, page count,
 * no horizontal overflow at the paper's content width, `break-inside: avoid`
 * blocks located per PDF page, warnings and provenance printed, `.no-print`
 * absent, and no request fired from entering print media to the last PDF.
 *
 * Raw screenshots, PDFs and `fg04-results.json` go to `$FG_SHOT_DIR` (never
 * into the repository). Guide ids travel as annotations; titles stay plain.
 *
 * Run (from apps/portal/frontend):
 *   RESEARCH_FG_BASE_URL=http://127.0.0.1:4417 FG_SHOT_DIR=... \
 *     npx playwright test -c playwright.research-fg04.config.ts
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { expect, test, type Locator, type Page, type Request, type Route } from "@playwright/test";

import type { components as ReportC } from "../../../../packages/contracts/generated/research-report";
import type { CurrentSourceReplay, Replay, ReplayChildAudit } from "../src/research/replayClient";
import { scaleToFolds, syntheticChildAudit, syntheticFoldOf, syntheticFoldWindow } from "../src/research/w5bFoldScale.fixture";
import { quiet } from "./research-qualification/harness";
import { EVIDENCE_RUN, contractFixture, installLane, reportDetail, watchConsole, watchNetwork } from "./research-qualification/stubs";

type ReportDetail = ReportC["schemas"]["ReportDetail"];

const BASE = process.env.RESEARCH_FG_BASE_URL;
const OUT = process.env.FG_SHOT_DIR;

/* The research-probe config's `_probe-research-*` glob also collects this
   file; without the two variables it is skipped there and never reaches that
   config's default origin. */
test.skip(!BASE || !OUT, "RESEARCH_FG_BASE_URL and FG_SHOT_DIR are required (playwright.research-fg04.config.ts)");
test.use({ baseURL: BASE, locale: "en-US", timezoneId: "UTC" });

const HERE = dirname(fileURLToPath(import.meta.url));
const WIDTHS = [1280, 1440, 660] as const;
const HEIGHT = 900;

function out(name: string): string {
  mkdirSync(OUT!, { recursive: true });
  return join(OUT!, name);
}

/** One row per key in `fg04-results.json`, written as soon as it is known. */
function record(key: string, row: object): void {
  const file = out("fg04-results.json");
  const current = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { rows?: Array<{ key: string }> }) : {};
  const rows = (current.rows ?? []).filter((r) => r.key !== key);
  rows.push({ key, ...row });
  rows.sort((a, b) => a.key.localeCompare(b.key));
  writeFileSync(file, `${JSON.stringify({ lane: "COMPONENT_FIXTURE_BROWSER_RECEIPT", base: BASE, rows }, null, 2)}\n`);
}

const sha = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const sha16 = (bytes: Buffer | string) => sha(bytes).slice(0, 16);

async function fulfill(route: Route, body: unknown): Promise<void> {
  try {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "cache-control": "private, no-store" },
      body: JSON.stringify(body),
    });
  } catch {
    /* the page aborted this request */
  }
}

const overflowX = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

/* =====================================================================
 * S08 — the two candle overview lanes
 * =================================================================== */

/** The facts `CandleOverviewStrip` draws, as the server sent them. */
interface OverviewFacts {
  source_bar_count: number;
  emitted_bucket_count: number;
  bucket_bars: number;
  sampling: string;
  envelope: { max_high: string; min_low: string };
  values: readonly { first_ordinal: number; last_ordinal: number; open: string; high: string; low: string; close: string }[];
}

const FOLD0 = contractFixture<CurrentSourceReplay>("research-current-source.replay.fold0");
const LEDGER = contractFixture<unknown>("research-current-source.replay-transitions");
const AUDIT0 = contractFixture<ReplayChildAudit>("research-current-source.replay-child-audit.fold0");
const P04 = contractFixture<Replay>("research-replay.p04-real.first-window");
const HUB_PENDING = contractFixture<Replay>("research-replay.p04-not-published");
const W3 = JSON.parse(readFileSync(join(HERE, "..", "src", "research", "w3RealWfo.fixture.json"), "utf8")) as { split: unknown; evidence: unknown };
const W3B = JSON.parse(readFileSync(join(HERE, "..", "src", "research", "w3bRealWfo.fixture.json"), "utf8")) as { progress: unknown; requested_spec: unknown };

function retainedFacts(body: CurrentSourceReplay): OverviewFacts {
  const overview = body.execution.candle_overview;
  if (!overview) throw new Error("retained fixture carries no candle_overview");
  return overview;
}

function hubFacts(body: Replay): OverviewFacts {
  const o = body.candle_overview;
  if (o.state !== "AVAILABLE" || o.envelope === null || o.sampling === null || o.bucket_bars === null || o.source_bar_count === null || o.emitted_bucket_count === null) {
    throw new Error("P04 fixture carries no AVAILABLE candle_overview");
  }
  return {
    source_bar_count: o.source_bar_count,
    emitted_bucket_count: o.emitted_bucket_count,
    bucket_bars: o.bucket_bars,
    sampling: o.sampling,
    envelope: o.envelope,
    values: o.values,
  };
}

/** The P04 hub's answer for a WFO run: the published pending body with its route declined (as `executeCandleReplay.test.tsx` HUB). */
function hubDeclined(runId: string): Replay {
  return { ...HUB_PENDING, run_id: runId, route: { ...HUB_PENDING.route, state: "NOT_PUBLISHED" } } satisfies Replay;
}

const RE_HUB = /\/api\/v1\/quantbt\/runs\/[^/?]+\/execute\/replay(\?|$)/;

interface OverviewLane {
  key: string;
  title: string;
  source: string;
  runId: string;
  expectLane: "retained" | "hub";
  facts: OverviewFacts;
  caption: string;
  install: (page: Page) => Promise<void>;
}

function retainedLane(key: string, title: string, source: string, body: CurrentSourceReplay, synthetic: boolean): OverviewLane {
  const runId = body.run_id;
  return {
    key,
    title,
    source,
    runId,
    expectLane: "retained",
    facts: retainedFacts(body),
    caption: "[data-screen='execute-replay'] [data-overview-caption]",
    install: async (page) => {
      await page.route(RE_HUB, (route) => fulfill(route, hubDeclined(runId)));
      await page.route(/\/current-source\/replay(\?|$)/, (route) => {
        const fold = synthetic ? syntheticFoldOf(route.request().url()) : null;
        return fulfill(route, fold === null ? body : syntheticFoldWindow(body, fold));
      });
      await page.route(/\/current-source\/replay\/transitions(\?|$)/, (route) => fulfill(route, LEDGER));
      await page.route(/\/current-source\/replay\/child-audit(\?|$)/, (route) => {
        const fold = Number(new URL(route.request().url()).searchParams.get("fold") ?? "0");
        return fulfill(route, synthetic ? syntheticChildAudit(AUDIT0, fold) : AUDIT0);
      });
      await page.route(/\/current-source\/split(\?|$)/, (route) => fulfill(route, W3.split));
      await page.route(/\/current-source\/evidence(\?|$)/, (route) => fulfill(route, W3.evidence));
      await page.route(/\/api\/v1\/research\/runs\/[^/?]+\/progress(\?|$)/, (route) => fulfill(route, W3B.progress));
      await page.route(/\/requested-spec(\?|$)/, (route) => fulfill(route, W3B.requested_spec));
    },
  };
}

const LANES: readonly OverviewLane[] = [
  retainedLane(
    "retained",
    "retained WFO lane",
    "contract fixture research-current-source.replay.fold0 (real-HMD seal, CG-P17-01)",
    FOLD0,
    false,
  ),
  retainedLane(
    "retained-32fold",
    "retained WFO lane, 32 folds (synthetic)",
    "src/research/w5bFoldScale.fixture.ts scaleToFolds(fold0) — synthetic, derived; not a server body",
    scaleToFolds(FOLD0),
    true,
  ),
  {
    key: "p04",
    title: "P04 hub lane",
    source: "contract fixture research-replay.p04-real.first-window (real receipt, E16-R1)",
    runId: P04.run_id,
    expectLane: "hub",
    facts: hubFacts(P04),
    caption: "[data-candle-overview='AVAILABLE'] [data-overview-caption]",
    install: async (page) => {
      await page.route(RE_HUB, (route) => fulfill(route, P04));
    },
  },
];

/** One grammar for both lanes (`CandleOverviewStrip`, ExecuteCandleReplay.tsx). */
const CAPTION_GRAMMAR =
  /^(?<scope>whole run|out-of-sample window) · (?<bars>[\d,]+) bars in (?<buckets>\d+) candles of (?<size>\d+) bars — each high\/low is the true extreme of its bars · range (?<lo>\S+) – (?<hi>\S+)(?: · (?<shading>.+))?$/;

test.describe("S08 candle overview — both lanes print the server's bucket facts and draw one candle per bucket", () => {
  for (const lane of LANES) {
    for (const width of WIDTHS) {
      test(`${lane.title} at ${width}`, async ({ page }) => {
        test.info().annotations.push({ type: "guide", description: "FG-04b · S08 · E16-R1" }, { type: "source", description: lane.source });
        const net = watchNetwork(page);
        const consoleLog = watchConsole(page, net);
        await page.setViewportSize({ width, height: HEIGHT });
        await installLane(page);
        await lane.install(page);
        await page.goto(`/research/quantbt/runs/${encodeURIComponent(lane.runId)}/execute`);
        await expect(page.locator("[data-screen='execute-replay']")).toHaveAttribute("data-lane", lane.expectLane, { timeout: 25_000 });
        const caption = page.locator(lane.caption);
        await expect(caption).toHaveCount(1);
        await expect(caption).toBeVisible();
        await quiet(page, net);

        const allCaptions = await page.locator("[data-overview-caption]").count();
        const strip: Locator = caption.locator("xpath=ancestor::*[@data-overview][1]");
        const drawn = await strip.evaluate((el) => {
          const svg = el.querySelector("svg")!;
          const box = svg.getBoundingClientRect();
          return {
            sampling: el.getAttribute("data-overview"),
            svgWidth: box.width,
            svgHeight: box.height,
            rects: svg.querySelectorAll("rect").length,
            lines: Array.from(svg.querySelectorAll("line")).map((line) => ({
              x1: Number(line.getAttribute("x1")),
              x2: Number(line.getAttribute("x2")),
              stroke: line.getAttribute("stroke"),
            })),
            caption: (el.querySelector("[data-overview-caption]")?.textContent ?? "").trim(),
            label: svg.getAttribute("aria-label"),
          };
        });

        const f = lane.facts;
        const n = f.source_bar_count;
        const expectedX = f.values.map((b) => ((b.first_ordinal + b.last_ordinal) / 2 / Math.max(1, n - 1)) * 100);
        const expectedStroke = f.values.map((b) => (Number(b.close) >= Number(b.open) ? "var(--good)" : "var(--bad)"));
        const xMismatch = drawn.lines
          .map((line, i) => ({ i, got: line.x1, want: expectedX[i], vertical: line.x1 === line.x2 }))
          .filter((row) => row.want === undefined || Math.abs(row.got - row.want) > 1e-9 || !row.vertical);
        const strokeMismatch = drawn.lines.map((line, i) => (line.stroke === expectedStroke[i] ? null : i)).filter((i) => i !== null);
        const grammar = CAPTION_GRAMMAR.exec(drawn.caption);
        const verbatim = {
          buckets: drawn.caption.includes(` in ${f.emitted_bucket_count} candles of ${f.bucket_bars} bars`),
          range: drawn.caption.includes(`range ${f.envelope.min_low} – ${f.envelope.max_high}`),
          sourceBarsRaw: drawn.caption.includes(` ${f.source_bar_count} bars`),
          sourceBarsGrouped: drawn.caption.includes(` ${f.source_bar_count.toLocaleString("en-US")} bars`),
        };

        await page.screenshot({ path: out(`s08-${lane.key}-${width}.png`), fullPage: true });
        const box = await strip.boundingBox();
        if (box) {
          await page.screenshot({
            path: out(`s08-${lane.key}-${width}-strip.png`),
            fullPage: true,
            clip: { x: 0, y: Math.max(0, box.y - 60), width, height: box.height + 90 },
          });
        }
        const overflow = await overflowX(page);

        record(`s08:${lane.key}:${width}`, {
          lane: lane.key,
          width,
          source: lane.source,
          server: {
            source_bar_count: f.source_bar_count,
            emitted_bucket_count: f.emitted_bucket_count,
            bucket_bars: f.bucket_bars,
            sampling: f.sampling,
            values: f.values.length,
            envelope: f.envelope,
          },
          caption: drawn.caption,
          captionsOnPage: allCaptions,
          grammar: grammar ? { ...grammar.groups } : null,
          verbatim,
          drawnCandles: drawn.lines.length,
          xMismatch: xMismatch.length,
          strokeMismatch: strokeMismatch.length,
          shadingRects: drawn.rects,
          svg: { width: Math.round(drawn.svgWidth), height: Math.round(drawn.svgHeight) },
          pxPerCandle: Number((drawn.svgWidth / Math.max(1, drawn.lines.length)).toFixed(2)),
          ariaLabel: drawn.label,
          overflowPx: overflow,
          fixtureGaps: net.gaps,
          consoleNoise: consoleLog.noise,
          screenshot: `s08-${lane.key}-${width}.png`,
        });

        expect(f.values.length, "server self-consistency: values = emitted_bucket_count").toBe(f.emitted_bucket_count);
        expect(drawn.sampling).toBe(f.sampling);
        expect(drawn.lines.length, "one drawn candle per server bucket").toBe(f.emitted_bucket_count);
        expect(xMismatch, "every candle sits at its own bucket's ordinal midpoint (no interpolated or extra candle)").toEqual([]);
        expect(strokeMismatch, "candle colour follows the bucket's own open/close").toEqual([]);
        expect(verbatim.buckets, "caption prints emitted_bucket_count and bucket_bars verbatim").toBe(true);
        expect(verbatim.range, "caption prints the envelope verbatim").toBe(true);
        expect(grammar, `caption follows the shared grammar: ${drawn.caption}`).not.toBeNull();
        expect(grammar!.groups!.buckets).toBe(String(f.emitted_bucket_count));
        expect(grammar!.groups!.size).toBe(String(f.bucket_bars));
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }
});

/* =====================================================================
 * S09 — screen and print (Letter / A4)
 * =================================================================== */

/* ---------- a small PDF reader: pages, MediaBox and ToUnicode text ---------- */

interface PdfObject {
  dict: string;
  stream: Buffer | null;
}

function pdfObjects(buf: Buffer): Map<number, PdfObject> {
  const s = buf.toString("latin1");
  const objects = new Map<number, PdfObject>();
  const header = /(\d+)\s+\d+\s+obj\b/g;
  let match: RegExpExecArray | null;
  while ((match = header.exec(s))) {
    const id = Number(match[1]);
    const start = match.index + match[0].length;
    const marker = /\bstream\r?\n|endobj/g;
    marker.lastIndex = start;
    const hit = marker.exec(s);
    if (!hit) break;
    if (hit[0] === "endobj") {
      objects.set(id, { dict: s.slice(start, hit.index), stream: null });
      header.lastIndex = hit.index + 6;
      continue;
    }
    const dict = s.slice(start, hit.index);
    const dataStart = hit.index + hit[0].length;
    const length = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
    let dataEnd = length ? dataStart + Number(length[1]) : s.indexOf("endstream", dataStart);
    if (!length) while (dataEnd > dataStart && (s[dataEnd - 1] === "\n" || s[dataEnd - 1] === "\r")) dataEnd -= 1;
    let data: Buffer = buf.subarray(dataStart, dataEnd);
    if (/\/FlateDecode/.test(dict)) {
      try {
        data = inflateSync(data);
      } catch {
        data = Buffer.alloc(0);
      }
    }
    objects.set(id, { dict, stream: Buffer.from(data) });
    const end = s.indexOf("endobj", dataEnd);
    header.lastIndex = end < 0 ? s.length : end + 6;
  }
  for (const object of [...objects.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(object.dict) || !object.stream) continue;
    const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
    const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1] ?? 0);
    const text = object.stream.toString("latin1");
    const pairs = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < count; i += 1) {
      const from = first + pairs[2 * i + 1]!;
      const to = i + 1 < count ? first + pairs[2 * i + 3]! : text.length;
      if (!objects.has(pairs[2 * i]!)) objects.set(pairs[2 * i]!, { dict: text.slice(from, to), stream: null });
    }
  }
  return objects;
}

/** The raw text of `/Key <value>` in a dict: a `<<…>>`, a `[…]`, a reference or a token. */
function dictValue(text: string, key: string): string | null {
  const at = new RegExp(`/${key}(?![A-Za-z0-9])`).exec(text);
  if (!at) return null;
  let i = at.index + at[0].length;
  while (/\s/.test(text[i] ?? "")) i += 1;
  if (text.startsWith("<<", i)) {
    let depth = 0;
    for (let j = i; j < text.length; j += 1) {
      if (text.startsWith("<<", j)) {
        depth += 1;
        j += 1;
      } else if (text.startsWith(">>", j)) {
        depth -= 1;
        j += 1;
        if (depth === 0) return text.slice(i, j + 1);
      }
    }
    return text.slice(i);
  }
  if (text[i] === "[") return text.slice(i, text.indexOf("]", i) + 1);
  const ref = /^(\d+)\s+\d+\s+R/.exec(text.slice(i));
  if (ref) return ref[0];
  return /^[^\s/<>[\]]+/.exec(text.slice(i))?.[0] ?? null;
}

const refsIn = (text: string | null) => (text ? [...text.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1])) : []);

function deref(objects: Map<number, PdfObject>, value: string | null): string | null {
  if (value === null) return null;
  const ref = /^(\d+)\s+\d+\s+R$/.exec(value.trim());
  return ref ? objects.get(Number(ref[1]))?.dict ?? null : value;
}

interface Cmap {
  bytes: number;
  map: Map<number, string>;
}

function utf16(hex: string): number[] {
  const units: number[] = [];
  for (let i = 0; i + 4 <= hex.length; i += 4) units.push(parseInt(hex.slice(i, i + 4), 16));
  if (hex.length % 4 === 2) units.push(parseInt(hex.slice(-2), 16));
  return units;
}

function parseCmap(text: string): Cmap {
  const map = new Map<number, string>();
  const space = /begincodespacerange\s*<([0-9A-Fa-f]+)>/.exec(text);
  const bytes = space ? space[1]!.length / 2 : 2;
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]*)>/g)) map.set(parseInt(m[1]!, 16), String.fromCharCode(...utf16(m[2]!)));
  }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const m of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([^\]]*)\])/g)) {
      const lo = parseInt(m[1]!, 16);
      const hi = parseInt(m[2]!, 16);
      if (m[3] !== undefined) {
        const base = utf16(m[3]);
        for (let c = lo; c <= hi; c += 1) {
          const units = [...base];
          units[units.length - 1] = units[units.length - 1]! + (c - lo);
          map.set(c, String.fromCharCode(...units));
        }
      } else {
        const list = [...m[4]!.matchAll(/<([0-9A-Fa-f]*)>/g)].map((x) => String.fromCharCode(...utf16(x[1]!)));
        list.forEach((value, k) => map.set(lo + k, value));
      }
    }
  }
  return { bytes, map };
}

function resourceMap(objects: Map<number, PdfObject>, resources: string | null, kind: "Font" | "XObject"): Map<string, number> {
  const out = new Map<string, number>();
  const dict = deref(objects, dictValue(resources ?? "", kind));
  if (!dict) return out;
  for (const m of dict.matchAll(/\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g)) out.set(m[1]!, Number(m[2]));
  return out;
}

function fontCmap(objects: Map<number, PdfObject>, fontId: number, cache: Map<number, Cmap | null>): Cmap | null {
  if (cache.has(fontId)) return cache.get(fontId)!;
  const font = objects.get(fontId);
  const toUnicode = refsIn(font ? dictValue(font.dict, "ToUnicode") : null)[0];
  const stream = toUnicode === undefined ? null : objects.get(toUnicode)?.stream ?? null;
  const cmap = stream ? parseCmap(stream.toString("latin1")) : null;
  cache.set(fontId, cmap);
  return cmap;
}

/** Glyph text of a content stream, following Form XObjects. Text order is paint order. */
function contentText(objects: Map<number, PdfObject>, content: string, resources: string | null, cache: Map<number, Cmap | null>, depth = 0): string {
  const fonts = resourceMap(objects, resources, "Font");
  const xobjects = resourceMap(objects, resources, "XObject");
  let text = "";
  let font: Cmap | null = null;
  type Operand = number | { name: string } | { str: string } | { arr: Operand[] } | "[";
  const stack: Operand[] = [];
  const decode = (raw: string) => {
    if (!font) return raw;
    let s = "";
    for (let i = 0; i + font.bytes <= raw.length; i += font.bytes) {
      let code = 0;
      for (let k = 0; k < font.bytes; k += 1) code = code * 256 + raw.charCodeAt(i + k);
      s += font.map.get(code) ?? "";
    }
    return s;
  };
  let i = 0;
  while (i < content.length) {
    const c = content[i]!;
    if (/\s/.test(c)) {
      i += 1;
    } else if (c === "%") {
      while (i < content.length && content[i] !== "\n" && content[i] !== "\r") i += 1;
    } else if (c === "/") {
      const m = /^\/[^\s/<>[\]()%{}]*/.exec(content.slice(i, i + 128))!;
      stack.push({ name: m[0].slice(1) });
      i += m[0].length;
    } else if (c === "(") {
      let depthParen = 1;
      let raw = "";
      i += 1;
      while (i < content.length && depthParen > 0) {
        const ch = content[i]!;
        if (ch === "\\") {
          const next = content[i + 1]!;
          const octal = /^[0-7]{1,3}/.exec(content.slice(i + 1, i + 4));
          if (octal) {
            raw += String.fromCharCode(parseInt(octal[0], 8));
            i += 1 + octal[0].length;
            continue;
          }
          raw += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[next] ?? next;
          i += 2;
          continue;
        }
        if (ch === "(") depthParen += 1;
        if (ch === ")") depthParen -= 1;
        if (depthParen > 0) raw += ch;
        i += 1;
      }
      stack.push({ str: raw });
    } else if (c === "<" && content[i + 1] === "<") {
      i += 2;
    } else if (c === ">" && content[i + 1] === ">") {
      i += 2;
    } else if (c === "<") {
      const end = content.indexOf(">", i);
      const hex = content.slice(i + 1, end).replace(/\s+/g, "");
      let raw = "";
      for (let k = 0; k < hex.length; k += 2) raw += String.fromCharCode(parseInt(hex.slice(k, k + 2).padEnd(2, "0"), 16));
      stack.push({ str: raw });
      i = end + 1;
    } else if (c === "[") {
      stack.push("[");
      i += 1;
    } else if (c === "]") {
      const arr: Operand[] = [];
      while (stack.length && stack[stack.length - 1] !== "[") arr.unshift(stack.pop()!);
      stack.pop();
      stack.push({ arr });
      i += 1;
    } else {
      const m = /^[^\s/<>[\]()%]+/.exec(content.slice(i, i + 64));
      if (!m) {
        i += 1;
        continue;
      }
      const token = m[0];
      i += token.length;
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(token)) {
        stack.push(Number(token));
        continue;
      }
      const last = stack[stack.length - 1];
      if (token === "Tf") {
        const name = stack.find((x): x is { name: string } => typeof x === "object" && "name" in x);
        const id = name ? fonts.get(name.name) : undefined;
        font = id === undefined ? null : fontCmap(objects, id, cache);
      } else if ((token === "Tj" || token === "'" || token === '"') && last && typeof last === "object" && "str" in last) {
        text += decode(last.str);
      } else if (token === "TJ" && last && typeof last === "object" && "arr" in last) {
        for (const part of last.arr) if (typeof part === "object" && part !== null && "str" in part) text += decode(part.str);
      } else if (token === "BT" || token === "T*" || token === "Td" || token === "TD") {
        text += " ";
      } else if (token === "Do" && depth < 4) {
        const name = stack.find((x): x is { name: string } => typeof x === "object" && "name" in x);
        const id = name ? xobjects.get(name.name) : undefined;
        const form = id === undefined ? undefined : objects.get(id);
        if (form && /\/Subtype\s*\/Form/.test(form.dict) && form.stream) {
          const own = deref(objects, dictValue(form.dict, "Resources"));
          text += contentText(objects, form.stream.toString("latin1"), own ?? resources, cache, depth + 1);
        }
      }
      stack.length = 0;
    }
  }
  return text;
}

interface PdfPage {
  mediaBox: number[];
  text: string;
}

function readPdf(buf: Buffer): { pages: PdfPage[]; pageDictCount: number } {
  const objects = pdfObjects(buf);
  const cache = new Map<number, Cmap | null>();
  const catalog = [...objects.values()].find((o) => /\/Type\s*\/Catalog/.test(o.dict));
  const pages: PdfPage[] = [];
  const walk = (id: number, inherited: string | null) => {
    const node = objects.get(id);
    if (!node) return;
    const resources = deref(objects, dictValue(node.dict, "Resources")) ?? inherited;
    if (/\/Type\s*\/Pages\b/.test(node.dict)) {
      for (const kid of refsIn(dictValue(node.dict, "Kids"))) walk(kid, resources);
      return;
    }
    const content = refsIn(dictValue(node.dict, "Contents"))
      .map((ref) => objects.get(ref)?.stream?.toString("latin1") ?? "")
      .join("\n");
    const box = (dictValue(node.dict, "MediaBox") ?? "").replace(/[[\]]/g, " ").trim().split(/\s+/).map(Number);
    pages.push({ mediaBox: box, text: contentText(objects, content, resources, cache) });
  };
  const root = refsIn(catalog ? dictValue(catalog.dict, "Pages") : null)[0];
  if (root !== undefined) walk(root, null);
  const pageDictCount = [...objects.values()].filter((o) => /\/Type\s*\/Page(?![s\w])/.test(o.dict)).length;
  return { pages, pageDictCount };
}

const squash = (text: string) => text.replace(/\s+/g, "");

/* ---------- S09 variants ---------- */

interface ReportVariant {
  key: string;
  title: string;
  source: string;
  runId: string;
  body: ReportDetail;
}

const REPORT_32 = contractFixture<ReportDetail>("research-report.wfo-32-folds");
const VARIANTS: readonly ReportVariant[] = [
  {
    key: "wfo-retained",
    title: "retained WFO report",
    source: "stubs.ts reportDetail(R-WFO-118) ← contract fixture research-report.wfo-retained",
    runId: EVIDENCE_RUN,
    body: reportDetail(EVIDENCE_RUN, "7"),
  },
  {
    key: "wfo-32-folds",
    title: "32-fold WFO report",
    source: "contract fixture research-report.wfo-32-folds",
    runId: REPORT_32.run_id,
    body: REPORT_32,
  },
];

const RE_REPORT = /\/api\/v1\/quantbt\/runs\/[^/?]+\/report(\?|$)/;

/** The strings the y axis must carry: the highest and lowest sealed equity, exactly as served. */
function serverYLabels(body: ReportDetail): string[] {
  const core = body.frozen_core as unknown as {
    equity: { state: string; points: { equity: string }[] };
    equity_is?: { state: string; points: { equity: string }[] } | null;
  };
  const withIs = core.equity_is && core.equity_is.state === "AVAILABLE" && core.equity_is.points.length > 0;
  const points = withIs ? [...core.equity_is!.points, ...core.equity.points] : core.equity.points;
  let high = points[0]!;
  let low = points[0]!;
  for (const point of points) {
    if (Number(point.equity) > Number(high.equity)) high = point;
    if (Number(point.equity) < Number(low.equity)) low = point;
  }
  return high.equity === low.equity ? [high.equity] : [high.equity, low.equity];
}

const PAPERS = [
  { key: "letter", format: "Letter" as const, widthIn: 8.5, heightIn: 11, mediaBox: [612, 792] },
  { key: "a4", format: "A4" as const, widthIn: 210 / 25.4, heightIn: 297 / 25.4, mediaBox: [595.92, 842.88] },
];
/** `@page { margin: 0.55in }` (ReportDetail.tsx SHEET_CSS). */
const PAGE_MARGIN_IN = 0.55;

test.describe("S09 report — screen widths and a Letter/A4 print receipt", () => {
  for (const variant of VARIANTS) {
    test(`${variant.title} on screen and in print`, async ({ page }) => {
      test.info().annotations.push({ type: "guide", description: "FG-04c · S09 · spec 09 §11" }, { type: "source", description: variant.source });
      const net = watchNetwork(page);
      const consoleLog = watchConsole(page, net);
      await installLane(page);
      await page.route(RE_REPORT, (route) => fulfill(route, variant.body));
      const expectedY = serverYLabels(variant.body);
      const core = variant.body.frozen_core as unknown as { warnings: { definition_id: string; copy: string }[]; provenance: { line: string } };

      /* ---- screen ---- */
      let noPrintTexts: string[] = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: HEIGHT });
        await page.goto(`/research/quantbt/runs/${encodeURIComponent(variant.runId)}/report`);
        await expect(page.locator("[data-panel='equity'] [data-equity-svg]")).toBeVisible({ timeout: 25_000 });
        await quiet(page, net);
        const screen = await page.evaluate(() => {
          const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
          return {
            yRules: document.querySelectorAll("[data-panel='equity'] [data-y-rule]").length,
            yLabels: Array.from(document.querySelectorAll("[data-panel='equity'] [data-y-label]")).map((el) => ({
              exact: el.getAttribute("data-exact"),
              title: el.getAttribute("title"),
              shown: (el.textContent ?? "").trim(),
            })),
            warnings: Array.from(document.querySelectorAll("[data-panel='warnings'] [data-warning]")).map((el) => el.getAttribute("data-warning")),
            warningsVisible: !!document.querySelector("[data-panel='warnings']") && visible(document.querySelector("[data-panel='warnings']")!),
            provenanceVisible: !!document.querySelector("[data-panel='provenance']") && visible(document.querySelector("[data-panel='provenance']")!),
            noPrintVisible: Array.from(document.querySelectorAll(".rr-page .no-print")).filter(visible).length,
            noPrintTexts: Array.from(document.querySelectorAll(".rr-page .no-print"))
              .map((el) => (el as HTMLElement).innerText.replace(/\s+/g, " ").trim())
              .filter((t) => t.length > 0),
          };
        });
        noPrintTexts = screen.noPrintTexts;
        await page.screenshot({ path: out(`s09-${variant.key}-screen-${width}.png`), fullPage: true });
        const overflow = await overflowX(page);
        record(`s09:${variant.key}:screen:${width}`, {
          variant: variant.key,
          width,
          source: variant.source,
          expectedYLabels: expectedY,
          ...screen,
          noPrintTexts: undefined,
          overflowPx: overflow,
          screenshot: `s09-${variant.key}-screen-${width}.png`,
        });
        expect(screen.yRules, "six y rules").toBe(6);
        expect(screen.yLabels.map((l) => l.exact), "y labels carry the server's exact strings").toEqual(expectedY);
        expect(screen.yLabels.map((l) => l.title)).toEqual(expectedY);
        expect(screen.warnings).toEqual(core.warnings.map((w) => w.definition_id));
        expect(screen.warningsVisible).toBe(true);
        expect(screen.provenanceVisible).toBe(true);
        expect(screen.noPrintVisible, "the no-print bar is on screen").toBeGreaterThan(0);
        expect(overflow).toBeLessThanOrEqual(0);
      }

      /* ---- print: nothing may be asked for from here to the last PDF ---- */
      const fired: string[] = [];
      const onRequest = (request: Request) => fired.push(`${request.method()} ${request.url()}`);
      page.on("request", onRequest);
      await page.emulateMedia({ media: "print" });
      const printRows: Record<string, unknown> = {};
      for (const paper of PAPERS) {
        const contentW = (paper.widthIn - 2 * PAGE_MARGIN_IN) * 96;
        const contentH = (paper.heightIn - 2 * PAGE_MARGIN_IN) * 96;
        await page.setViewportSize({ width: Math.floor(contentW), height: Math.floor(contentH) });
        await frames(page);
        const dom = await page.evaluate((limit) => {
          const visible = (el: Element) => (el as HTMLElement).getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
          const describe = (el: Element) =>
            `${el.tagName.toLowerCase()}${el.getAttribute("data-panel") ? `[data-panel=${el.getAttribute("data-panel")}]` : ""}.${String((el as HTMLElement).className ?? "").slice(0, 40)}`;
          const nodes = Array.from(document.querySelectorAll(".rr-page *"));
          const past = nodes.filter((el) => visible(el) && el.getBoundingClientRect().right > limit + 0.5).map(describe);
          const clipped = nodes
            .filter((el) => {
              if (!visible(el)) return false;
              const style = getComputedStyle(el);
              if (style.overflowX === "visible") return false;
              return (el as HTMLElement).scrollWidth > (el as HTMLElement).clientWidth + 1;
            })
            .map(describe);
          const keep = Array.from(document.querySelectorAll(".rr-page .rr-keep"))
            .filter(visible)
            .map((el) => {
              const rect = el.getBoundingClientRect();
              const text = (el as HTMLElement).innerText.replace(/\s+/g, "");
              return {
                block: describe(el),
                heightPx: Math.round(rect.height),
                head: text.slice(0, 28),
                tail: text.slice(-28),
              };
            });
          return {
            viewport: document.documentElement.clientWidth,
            yRules: document.querySelectorAll("[data-panel='equity'] [data-y-rule]").length,
            yLabels: Array.from(document.querySelectorAll("[data-panel='equity'] [data-y-label]")).map((el) => ({
              exact: el.getAttribute("data-exact"),
              shown: (el.textContent ?? "").trim(),
            })),
            warningsVisible: !!document.querySelector("[data-panel='warnings']") && visible(document.querySelector("[data-panel='warnings']")!),
            provenanceVisible: !!document.querySelector("[data-panel='provenance']") && visible(document.querySelector("[data-panel='provenance']")!),
            noPrintVisible: Array.from(document.querySelectorAll(".no-print")).filter(visible).map(describe),
            moduleHeaderVisible: Array.from(document.querySelectorAll(".portal-module-header, .portal-crosslinks")).filter(visible).length,
            pastContentWidth: past.slice(0, 12),
            pastCount: past.length,
            clipped: clipped.slice(0, 12),
            keep,
          };
        }, contentW);
        await page.screenshot({ path: out(`s09-${variant.key}-print-${paper.key}.png`), fullPage: true });
        const pdfPath = out(`s09-${variant.key}-${paper.key}.pdf`);
        const pdf = await page.pdf({ path: pdfPath, format: paper.format, printBackground: true });
        const parsed = readPdf(pdf);
        const pageTexts = parsed.pages.map((p) => squash(p.text));
        const pageOf = (needle: string, from = 0) => {
          if (!needle) return -1;
          for (let k = from; k < pageTexts.length; k += 1) if (pageTexts[k]!.includes(needle)) return k;
          return -1;
        };
        const keepPages = dom.keep.map((block) => {
          const head = pageOf(block.head);
          const tail = head < 0 ? pageOf(block.tail) : pageOf(block.tail, head);
          return {
            block: block.block,
            heightPx: block.heightPx,
            fitsOnePage: block.heightPx <= contentH,
            headPage: head < 0 ? null : head + 1,
            tailPage: tail < 0 ? null : tail + 1,
            split: head >= 0 && tail >= 0 ? head !== tail : null,
          };
        });
        const whole = pageTexts.join("");
        /* Glyphs carry the rendered case (`text-transform`), so the lookups below that name copy compare case-blind. */
        const wholeUpper = whole.toUpperCase();
        const printed = (copy: string) => wholeUpper.includes(squash(copy).toUpperCase());
        const row = {
          paper: paper.key,
          contentBoxPx: { width: Number(contentW.toFixed(1)), height: Number(contentH.toFixed(1)) },
          pdf: { file: `s09-${variant.key}-${paper.key}.pdf`, bytes: pdf.length, sha256: sha(pdf), sha16: sha16(pdf) },
          pages: parsed.pages.length,
          pageDictCount: parsed.pageDictCount,
          mediaBoxes: [...new Set(parsed.pages.map((p) => p.mediaBox.join(" ")))],
          textChars: whole.length,
          dom: { ...dom, keep: undefined },
          keepPages,
          pdfHas: {
            warnings: core.warnings.map((w) => ({ id: w.definition_id, printed: whole.includes(squash(w.copy)) })),
            provenanceLine: whole.includes(squash(core.provenance.line).slice(0, 40)),
            provenanceTitle: printed("Provenance of this report"),
            yLabelsShown: dom.yLabels.map((l) => ({ shown: l.shown, printed: whole.includes(squash(l.shown)) })),
            yLabelsExact: expectedY.map((y) => ({ exact: y, printed: whole.includes(y) })),
            noPrintTextsPrinted: noPrintTexts.filter((t) => t.length >= 12 && printed(t)),
          },
          screenshot: `s09-${variant.key}-print-${paper.key}.png`,
        };
        for (const block of keepPages.filter((k) => !k.fitsOnePage)) {
          /* A `break-inside: avoid` block taller than the page box cannot stay whole; it is recorded, not hidden. */
          test.info().annotations.push({
            type: "keep-block-taller-than-page",
            description: `${paper.key}: ${block.block} ${block.heightPx}px > ${contentH.toFixed(1)}px content height (pages ${block.headPage}–${block.tailPage})`,
          });
        }
        printRows[paper.key] = row;
        record(`s09:${variant.key}:print:${paper.key}`, { variant: variant.key, source: variant.source, ...row });
      }
      page.off("request", onRequest);
      await page.emulateMedia({ media: "screen" });
      record(`s09:${variant.key}:print:requests`, { variant: variant.key, requestsDuringPrint: fired, fixtureGaps: net.gaps, consoleNoise: consoleLog.noise });

      expect(fired, "no request between entering print media and the last PDF").toEqual([]);
      for (const paper of PAPERS) {
        const row = printRows[paper.key] as {
          pages: number;
          mediaBoxes: string[];
          textChars: number;
          dom: { yRules: number; yLabels: { exact: string | null }[]; warningsVisible: boolean; provenanceVisible: boolean; noPrintVisible: string[]; pastCount: number };
          keepPages: { split: boolean | null; fitsOnePage: boolean; block: string }[];
          pdfHas: { warnings: { printed: boolean }[]; provenanceTitle: boolean; noPrintTextsPrinted: string[] };
        };
        expect(row.pages, `${paper.key}: PDF has pages`).toBeGreaterThan(0);
        expect(row.mediaBoxes.map((b) => b.split(" ").slice(2).map((v) => Math.round(Number(v))).join("x"))).toEqual([paper.mediaBox.map((v) => Math.round(v)).join("x")]);
        expect(row.textChars, `${paper.key}: PDF text is readable`).toBeGreaterThan(200);
        expect(row.dom.yRules, `${paper.key}: six y rules in print`).toBe(6);
        expect(row.dom.yLabels.map((l) => l.exact)).toEqual(expectedY);
        expect(row.dom.warningsVisible).toBe(true);
        expect(row.dom.provenanceVisible).toBe(true);
        expect(row.dom.noPrintVisible, `${paper.key}: .no-print absent in print`).toEqual([]);
        expect(row.dom.pastCount, `${paper.key}: nothing past the content width`).toBe(0);
        expect(row.pdfHas.warnings.every((w) => w.printed), `${paper.key}: warnings printed`).toBe(true);
        expect(row.pdfHas.provenanceTitle, `${paper.key}: provenance printed`).toBe(true);
        expect(row.pdfHas.noPrintTextsPrinted, `${paper.key}: no-print copy absent from the PDF`).toEqual([]);
        expect(row.keepPages.filter((k) => k.fitsOnePage && k.split === true).map((k) => k.block), `${paper.key}: no keep block split`).toEqual([]);
      }
    });
  }
});
