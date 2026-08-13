import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
let captured = null;
page.on("response", async (response) => {
  if (response.url().includes("/api/runs/preflight") && response.status() >= 400) {
    captured = { status: response.status(), body: await response.text().catch(() => "") };
  }
});
await page.goto("http://127.0.0.1:5173/?new=1", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
// switch to Advanced WFO
await page.getByRole("button", { name: "Advanced WFO" }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: /Validate/ }).first().click();
await page.waitForTimeout(4000);
console.log("captured 500:", JSON.stringify(captured, null, 1));
// also dump the request payload
const req = await page.evaluate(() => {
  const pre = document.querySelector("pre");
  return pre ? pre.innerText.slice(0, 1200) : "no payload preview";
});
console.log("UI payload preview:", req);
await browser.close();
