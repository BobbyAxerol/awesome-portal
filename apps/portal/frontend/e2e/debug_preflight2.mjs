import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const preflights = [];
page.on("response", (response) => {
  if (response.url().includes("/api/runs/preflight")) {
    preflights.push({ status: response.status() });
  }
});
page.on("console", (m) => { if (m.type() === "error") preflights.push({ console: m.text().slice(0, 200) }); });
page.on("pageerror", (e) => preflights.push({ pageerror: e.message }));
await page.goto("http://127.0.0.1:5173/?new=1", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await page.getByRole("button", { name: "Advanced WFO" }).click();
await page.waitForTimeout(800);
await page.getByRole("button", { name: /Validate/ }).first().click();
await page.waitForTimeout(5000);
const visible = await page.evaluate(() => document.body.innerText.includes("Something went wrong") || document.body.innerText.includes("Internal Server Error"));
console.log("preflight responses:", JSON.stringify(preflights));
console.log("error visible:", visible);
await browser.close();
