import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// 1. Run library page
await page.goto("http://127.0.0.1:5173/runs", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const hasTitle = await page.getByText("Run Library", { exact: true }).isVisible();
const rowCount = await page.locator("tbody tr").count();
const firstRow = rowCount ? (await page.locator("tbody tr").first().innerText()).slice(0, 200) : "";
console.log("L1 title visible:", hasTitle, "| rows:", rowCount);
console.log("L1 first row sample:", firstRow.replace(/\n/g, " | "));
console.log("L1 PASS (library with metadata):", hasTitle && rowCount >= 3);

// 2. paste run id to open
const runs = await page.evaluate(async () => {
  const response = await fetch("/api/runs");
  const data = await response.json();
  return data.map((r) => r.run_id);
});
const target = runs.find((id) => id !== "real_backend_fix_20260810") ?? runs[0];
console.log("L2 paste target:", target);
await page.getByLabel("Paste run id để mở").fill(target);
await page.getByRole("button", { name: "Open", exact: true }).click();
await page.waitForTimeout(3000);
const url = page.url();
console.log("L2 url after paste-open:", url);
console.log("L2 PASS (paste id opens run):", url.includes(`run=${target}`));

// 3. top bar has no select, has Runs button
await page.goto("http://127.0.0.1:5173/runs", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
const selectCount = await page.locator('select[aria-label="Run selector"]').count();
const runsButton = await page.locator('a[href="/runs"]').count();
console.log("L3 select count (expect 0):", selectCount, "| Runs button:", runsButton > 0);
console.log("L3 PASS:", selectCount === 0 && runsButton > 0);

await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
