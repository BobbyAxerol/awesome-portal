import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:5173/?run=b4445d0af5604272", { waitUntil: "networkidle" });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const selects = Array.from(document.querySelectorAll("select"));
  return selects.map((s) => ({ label: s.getAttribute("aria-label"), value: s.value, options: s.options.length, disabled: s.disabled }));
});
console.log("selects:", JSON.stringify(info));
// simulate native change
await page.evaluate(() => {
  const select = document.querySelector('select[aria-label="Run selector"]');
  const change = new Event("change", { bubbles: true });
  Object.defineProperty(change, "target", { value: select });
  select.value = "9a4d3a8cce68476d";
  select.dispatchEvent(change);
});
await page.waitForTimeout(3000);
console.log("URL after manual change:", page.url());
await browser.close();
