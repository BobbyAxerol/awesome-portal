import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(`http://127.0.0.1:5173/?run=${process.env.RUN_ID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
const out = await page.evaluate(async () => {
  const response = await fetch(`/api/runs/${new URL(location.href).searchParams.get("run")}/fold-plan`);
  const text = await response.text();
  const body = document.body.innerText;
  return {
    fetchStatus: response.status,
    fetchOk: text.slice(0, 80),
    hasTuning: body.includes("Tuning parameters"),
    hasFoldLine: /Fold \d+\/\d+/.test(body),
    hasGantt: body.includes("Fold timeline"),
    hasNewRun: body.includes("Run progress") || body.includes("Run completed"),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
