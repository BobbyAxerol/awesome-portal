import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://127.0.0.1:5173/?new=1", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
// set small trial budget to finish faster: input[type=number] near "Trials"
await page.locator('input[type="number"]').first().fill("30");
await page.getByRole("button", { name: /Run backtest/ }).first().click();
await page.waitForTimeout(4000);
const runParam = new URL(page.url()).searchParams.get("run");
console.log("submitted run:", runParam);

// wait until COMPLETED banner with View results appears (max 150s)
let buttonVisible = false;
let stillProgress = false;
for (let i = 0; i < 50; i++) {
  await page.waitForTimeout(3000);
  const btn = page.getByRole("button", { name: /View results/ });
  if (await btn.isVisible().catch(() => false)) {
    buttonVisible = true;
    stillProgress = new URL(page.url()).searchParams.get("run") === runParam;
    console.log("completed after ~", (i + 1) * 3, "s — still on progress screen:", stillProgress);
    break;
  }
}
console.log("G1 PASS (completed shows button, stays on progress):", buttonVisible && stillProgress);

// click View results -> must land on /overview?run=X
if (buttonVisible) {
  await page.getByRole("button", { name: /View results/ }).click();
  await page.waitForTimeout(3000);
  const url = page.url();
  console.log("after click:", url);
  console.log("G2 PASS (lands on overview of that run):", url.includes(`/overview?run=${runParam}`));
}
await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
