import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
await page.goto("http://127.0.0.1:5173/?new=1", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /Run backtest/ }).first().click();
await page.waitForTimeout(3000);
for (const t of [10, 18, 26]) {
  await page.waitForTimeout(t === 10 ? 10 : 8);
  const info = await page.evaluate(() => {
    const header = Array.from(document.querySelectorAll("span")).find((el) => el.textContent && el.textContent.includes("live console"));
    if (!header) return { header: false };
    const scroll = header.closest("div").parentElement.querySelector("div.overflow-y-auto");
    const text = scroll ? scroll.innerText : "";
    return { header: true, lines: (text.match(/Trial \d+ finished/g) || []).length, sample: text.slice(0, 120) };
  });
  console.log(`t+${t}s:`, JSON.stringify(info));
}
await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
