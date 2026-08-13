import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

// TEST 1: load specific completed run -> must show ITS results
await page.goto("http://127.0.0.1:4173/?run=9a4d3a8cce68476d", { waitUntil: "networkidle" });
await page.waitForTimeout(3500);
const url1 = page.url();
const selectValue1 = await page.locator('select[aria-label="Run selector"]').inputValue();
const equity1 = await page.locator("text=Final equity").first().locator("xpath=following-sibling::div").first().textContent().catch(() => null);
console.log("T1 url:", url1);
console.log("T1 select value:", selectValue1);
console.log("T1 final equity:", equity1, "(expect $25,629)");
console.log("T1 PASS:", url1.includes("run=9a4d3a8cce68476d") && selectValue1 === "9a4d3a8cce68476d");

// TEST 2: switch run via dropdown
await page.selectOption('select[aria-label="Run selector"]', "b4445d0af5604272");
await page.waitForTimeout(3500);
const url2 = page.url();
const selectValue2 = await page.locator('select[aria-label="Run selector"]').inputValue();
const equity2 = await page.locator("text=Final equity").first().locator("xpath=following-sibling::div").first().textContent().catch(() => null);
console.log("T2 url:", url2);
console.log("T2 select value:", selectValue2);
console.log("T2 final equity:", equity2, "(expect $19,856)");
console.log("T2 PASS:", url2.includes("run=b4445d0af5604272") && selectValue2 === "b4445d0af5604272");

await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
