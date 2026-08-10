import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto(`http://127.0.0.1:5173/?run=${process.env.RUN_ID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
const info = await page.evaluate(() => {
  const header = Array.from(document.querySelectorAll("span")).find((el) => el.textContent && el.textContent.includes("live console"));
  if (!header) return "no header";
  const scroll = header.closest("div").parentElement.querySelector("div.overflow-y-auto");
  const text = scroll ? scroll.innerText : "";
  return {
    hasStudyStarted: text.includes("study started"),
    sample: text.split("\n").slice(0, 12).join(" | "),
    total: text.length,
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
