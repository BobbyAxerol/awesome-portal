import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// 1. Load the RUNNING advanced run
const runId = process.env.RUN_ID;
await page.goto(`http://127.0.0.1:5173/?run=${runId}`, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
const strip = await page.locator("text=Fold").first().textContent().catch(() => null);
const eta = await page.getByText("ETA", { exact: false }).first().textContent().catch(() => null);
const gantt = await page.getByText("Fold timeline", { exact: false }).count();
const consoleText = await page.evaluate(() => {
  const header = Array.from(document.querySelectorAll("span")).find((el) => el.textContent && el.textContent.includes("live console"));
  if (!header) return "";
  const scroll = header.closest("div").parentElement.querySelector("div.overflow-y-auto");
  return scroll ? scroll.innerText : "";
});
const hasSeparator = consoleText.includes("fold 1 — study started");
const hasTrial = /Trial \d+ finished/.test(consoleText);
console.log("V1 progress strip:", strip);
console.log("V1 ETA row:", eta);
console.log("V1 gantt present:", gantt > 0);
console.log("V1 console separator:", hasSeparator, "| trials:", hasTrial);
console.log("V1 PASS:", strip?.includes("Fold") && gantt > 0 && hasSeparator && hasTrial);
await page.screenshot({ path: "e2e/shots/run-progress-v2-advanced.png", fullPage: true });
await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
