import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// 1. Open run b4445d0af5604272
await page.goto("http://127.0.0.1:5173/?run=b4445d0af5604272", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
console.log("URL after load:", page.url());
const url1 = page.url();
const equity1 = await page.locator("text=Final equity").first().locator("xpath=following-sibling::div").first().textContent().catch(() => null);
console.log("final equity run b4445d0af:", equity1);

// 2. Select another run via dropdown
await page.selectOption('select[aria-label="Run selector"]', "9a4d3a8cce68476d");
await page.waitForTimeout(3000);
console.log("URL after select:", page.url());
const url2 = page.url();
const equity2 = await page.locator("text=Final equity").first().locator("xpath=following-sibling::div").first().textContent().catch(() => null);
console.log("final equity run 9a4d3a8c:", equity2);
console.log("URL changed:", url1 !== url2);
console.log("ERRORS:", errors.length ? errors : "none");
await browser.close();
