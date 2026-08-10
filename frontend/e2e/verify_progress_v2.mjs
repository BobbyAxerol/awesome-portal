import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`http://127.0.0.1:5173/?run=${process.env.RUN_ID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
const out = await page.evaluate(() => {
  const body = document.body.innerText.toLowerCase();
  return {
    strip: document.body.innerText.match(/Fold \d+\/\d+/)?.[0] ?? null,
    eta: body.includes("ước tính"),
    gantt: body.includes("fold timeline"),
    separator: body.includes("fold 1 — study started"),
    foldsRendered: (body.match(/fold \d+/g) || []).length,
  };
});
console.log(JSON.stringify(out));
console.log("PASS:", out.strip !== null && out.eta && out.gantt && out.separator);
await page.screenshot({ path: "e2e/shots/run-progress-v2-final.png", fullPage: true });
await browser.close();
