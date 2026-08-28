// Scratch harness — NOT a gate. Dumps computed geometry for the blocks the
// hi-fi specifies, so a spacing claim can be checked instead of eyeballed.
import { test } from "@playwright/test";
import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

const SEL: [string, string][] = [
  ["switcher", ".exec-pw-switch"],
  ["switcher chip", ".exec-pw-tab"],
  ["masthead", ".exec-pw-masthead"],
  ["h1", ".exec-a3-h1"],
  ["lineage", ".exec-pw-meta"],
  ["lifecycle rail", ".exec-rail"],
  ["rail step", ".exec-rail-step"],
  ["kpi strip", ".exec-strip"],
  ["kpi cell", ".exec-strip-cell"],
  ["kpi label", ".exec-strip-label"],
  ["kpi value", ".exec-role-kpi"],
  ["grid row", ".exec-pw-grid"],
  ["panel", ".exec-pw-panel"],
  ["panel head", ".exec-pw-head"],
  ["panel title", ".exec-pw-title"],
  ["plot pad", ".exec-pw-plot"],
  ["panel foot", ".exec-pw-foot"],
  ["gate body", ".exec-pw-gate"],
  ["gate bar", ".exec-progress-track, .exec-progress, .exec-observation-bar"],
];

for (const [name, route] of [["paper", "/deployments/paper/dep_74"], ["vnm", "/deployments/paper/dep_102/vn-market"]] as const) {
  test(`measure ${name}`, async ({ page }) => {
    await freezeClock(page); await usePreferences(page, "operations"); await stubPortalApi(page, "healthy");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(route); await settle(page);
    const rows = await page.evaluate((sel) => {
      const out: string[] = [];
      for (const [label, q] of sel) {
        const n = document.querySelector(q) as HTMLElement | null;
        if (!n) { out.push(`${label.padEnd(15)} —— absent (${q})`); continue; }
        const s = getComputedStyle(n);
        const r = n.getBoundingClientRect();
        out.push(`${label.padEnd(15)} pad ${s.padding.padEnd(20)} gap ${(s.gap || "—").padEnd(14)} font ${s.fontSize}/${s.lineHeight} ${s.fontWeight}  mb ${s.marginBottom.padEnd(6)} box ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      const cells = [...document.querySelectorAll<HTMLElement>(".exec-strip-cell")].map((c) => Math.round(c.getBoundingClientRect().width));
      out.push(`kpi cell widths  ${cells.join(" · ")}`);
      const main = document.querySelector(".exec-ws-main, .exec-ws") as HTMLElement | null;
      if (main) out.push(`main column     ${Math.round(main.getBoundingClientRect().width)}px`);
      return out;
    }, SEL);
    console.log(`\n=== ${name} ===\n` + rows.join("\n"));
  });
}
