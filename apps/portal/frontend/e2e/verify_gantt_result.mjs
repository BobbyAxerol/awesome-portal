import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://127.0.0.1:5173/optimization?run=fb0c0d0f6f4d4fdc", { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
const out = await page.evaluate(() => {
  const body = document.body.innerText.toLowerCase();
  return { ganttInResult: body.includes("fold timeline"), folds: (body.match(/fold \d+/g) || []).length };
});
console.log(JSON.stringify(out));
console.log("RESULT GANTT PASS:", out.ganttInResult && out.folds >= 2);
await browser.close();
