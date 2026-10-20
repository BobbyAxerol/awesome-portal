/**
 * What the UXM-08 slice may and may not touch (FIXTURE ONLY), held as tests so it stays true:
 *
 * 1. nothing it ships names a transport or a poller: no EventSource, WebSocket, fetch, XMLHttpRequest, sendBeacon or
 *    setInterval, and `setTimeout` only inside the one injectable clock;
 * 2. the contracts JSON is imported by exactly one module (`canonicalLane.ts`), and only that module;
 * 3. every product module the lane owns (reader, realtime, slice) is under the paths this lane owns;
 * 4. slice.css holds the rules v2Hygiene.test.ts holds for v2/css (it lives beside the screen, so that test does not read it).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const V2 = resolve(__dirname, "../..");
const SRC = resolve(V2, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const isProduct = (path: string) => /\.(ts|tsx)$/.test(path) && !/\.(test|testbase)\.(ts|tsx)$/.test(path);
const OWNED = [
  ...walk(join(V2, "realtime")).filter(isProduct),
  ...walk(join(V2, "screens/slice")).filter(isProduct),
  join(V2, "readers/scopedRealtime.ts"),
  join(V2, "scopedEviction.ts"),
];

describe("the lane's product sources", () => {
  it("finds the sources it is meant to police", () => {
    const names = OWNED.map((p) => relative(V2, p)).sort();
    expect(names).toEqual(expect.arrayContaining([
      "readers/scopedRealtime.ts", "realtime/scopedStreamController.ts", "realtime/scopedStreamMachine.ts", "realtime/streamView.ts",
      "realtime/useScopedStream.ts", "screens/slice/canonicalLane.ts", "screens/slice/index.tsx", "screens/slice/model.ts", "screens/slice/scopedRead.ts",
    ]));
  });

  it("1. names no transport and no poller", () => {
    for (const file of OWNED) {
      const source = strip(readFileSync(file, "utf8"));
      expect(source, relative(V2, file)).not.toMatch(/\b(EventSource|WebSocket|XMLHttpRequest|sendBeacon|setInterval|requestIdleCallback)\b|\bfetch\s*\(|navigator\.serviceWorker/);
    }
  });

  it("1. setTimeout appears only inside the system clock of the controller", () => {
    const hits = OWNED.filter((file) => /\bsetTimeout\b/.test(strip(readFileSync(file, "utf8")))).map((file) => relative(V2, file));
    expect(hits).toEqual(["realtime/scopedStreamController.ts"]);
    const source = strip(readFileSync(join(V2, "realtime/scopedStreamController.ts"), "utf8"));
    const clockBlock = source.slice(source.indexOf("export const systemClock"));
    expect(clockBlock).toContain("setTimeout");
    expect(source.slice(0, source.indexOf("export const systemClock"))).not.toContain("setTimeout");
  });

  it("1. touches no browser storage and no cookie (scoped data must not outlive its view)", () => {
    for (const file of OWNED) {
      expect(strip(readFileSync(file, "utf8")), relative(V2, file)).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|document\.cookie|caches\.open)\b/);
    }
  });

  it("2. only canonicalLane.ts imports the contracts package JSON", () => {
    const importers = OWNED.filter((file) => /from\s+"[^"]*packages\/contracts\/[^"]*\.json"/.test(strip(readFileSync(file, "utf8")))).map((file) => relative(V2, file));
    expect(importers).toEqual(["screens/slice/canonicalLane.ts"]);
  });

  it("2. no module of the lane imports a `.fixtures` or `.smoke` producer", () => {
    for (const file of OWNED) {
      expect(readFileSync(file, "utf8"), relative(V2, file)).not.toMatch(/from\s+"[^"]*\.(fixtures|smoke)"/);
    }
  });

  it("3. nothing outside the lane's paths imports the lane (the only entry is the lazy route in PortalRoutes)", () => {
    const entries: string[] = [];
    for (const file of walk(SRC).filter((p) => /\.(ts|tsx)$/.test(p) && !/\.(test|testbase)\.(ts|tsx)$/.test(p))) {
      const rel = relative(SRC, file);
      if (rel.startsWith("execution/v2/screens/slice/") || rel.startsWith("execution/v2/realtime/") || rel === "execution/v2/readers/scopedRealtime.ts") continue;
      if (/screens\/slice|v2\/realtime|readers\/scopedRealtime/.test(strip(readFileSync(file, "utf8")))) entries.push(rel);
    }
    expect(entries).toEqual(["app/PortalRoutes.tsx"]);
  });

  it("3. the slice is reached only through the flag-gated lazy import", () => {
    const routes = readFileSync(join(SRC, "app/PortalRoutes.tsx"), "utf8");
    expect(routes).toMatch(/const V2Slice = import\.meta\.env\.VITE_EXECUTION_V2_SCREENS\s*\?\s*lazy\(\(\) => import\("\.\.\/execution\/v2\/screens\/slice"\)\)\s*:\s*null/);
    expect(routes).toContain('isV2Screen("scoped")');
    expect(routes).not.toMatch(/^import .*screens\/slice/m);
  });
});

describe("slice.css (the rules v2Hygiene holds for v2/css)", () => {
  const css = strip(readFileSync(join(V2, "screens/slice/slice.css"), "utf8"));
  const TOKENS = readFileSync(resolve(SRC, "styles/tokens.css"), "utf8");
  const carbon = TOKENS.slice(TOKENS.indexOf('[data-theme="operations-carbon"]'));
  const declared = new Set([...carbon.slice(0, carbon.indexOf("\n}")).matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));

  it("no font-family, no font-size, no raw colour, no color-mix", () => {
    expect(css).not.toMatch(/font-family\s*:/);
    expect(css).not.toMatch(/font-size\s*:/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(|color-mix\(/);
  });

  it("no uppercase transform", () => {
    expect(css).not.toMatch(/text-transform\s*:\s*uppercase/);
  });

  it("every class is .exec-slice-* or the shared flag class it styles from the outside", () => {
    const classes = [...new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]).filter((c) => !/^\d/.test(c)))];
    expect(classes.filter((c) => c !== "exec-slice" && !c.startsWith("exec-slice-") && c !== "exec-flag")).toEqual([]);
  });

  it("every var(--x) is a carbon token or a type/layout role", () => {
    const unknown = [...new Set([...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]))].filter(
      (name) => !declared.has(name) && !name.startsWith("--exec-") && !name.startsWith("--space-") && !name.startsWith("--radius-") && !name.startsWith("--font-"),
    );
    expect(unknown).toEqual([]);
  });

  it("no .exec-slice-* name is used by any other stylesheet or V1 source", () => {
    const others = walk(SRC)
      .filter((p) => /\.(css|ts|tsx)$/.test(p) && !p.includes("/screens/slice/"))
      .filter((p) => /exec-slice(?![\w-])|exec-slice-/.test(readFileSync(p, "utf8")))
      .map((p) => relative(SRC, p));
    expect(others).toEqual([]);
  });
});
