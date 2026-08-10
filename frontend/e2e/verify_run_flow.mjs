import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// T3: submit run from UI -> must navigate to progress view immediately
await page.goto("http://127.0.0.1:4173/?new=1", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /Run backtest/ }).first().click();
await page.waitForTimeout(5000);
const urlAfterRun = page.url();
const hasProgress = await page.getByText("Run progress", { exact: false }).first().isVisible().catch(() => false);
const newRunId = new URL(urlAfterRun).searchParams.get("run");
console.log("T3 url:", urlAfterRun);
console.log("T3 run param:", newRunId);
console.log("T3 progress visible:", hasProgress);
console.log("T3 PASS:", Boolean(newRunId) && hasProgress);

// T4: live console shows per-trial lines while optimizing
let trialLines = 0;
for (let i = 0; i < 30; i++) {
  await page.waitForTimeout(3000);
  const text = await page.locator("text=live console").first().textContent().catch(() => "");
  const consoleText = await page.evaluate(() => {
    const el = document.querySelector('[class*="overflow-y-auto"]');
    return el ? el.textContent : "";
  });
  if (consoleText.includes("Trial") || consoleText.includes("trial")) {
    trialLines = (consoleText.match(/Trial/g) || []).length;
    break;
  }
}
console.log("T4 trial lines found:", trialLines);
console.log("T4 PASS:", trialLines > 0);

// cleanup: cancel the run
await page.goto("http://127.0.0.1:8000/api/health").catch(() => {});
await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
