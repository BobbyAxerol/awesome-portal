import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(`http://127.0.0.1:5173/?run=${process.env.RUN_ID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
const out = await page.evaluate(() => {
  const body = document.body.innerText;
  const strip = body.match(/Fold \d+\/\d+/);
  const eta = body.includes("ước tính");
  const gantt = body.includes("Fold timeline");
  const header = Array.from(document.querySelectorAll("span")).find((el) => el.textContent && el.textContent.includes("live console"));
  const scroll = header ? header.closest("div").parentElement.querySelector("div.overflow-y-auto") : null;
  const text = scroll ? scroll.innerText : "";
  return {
    strip: strip ? strip[0] : null,
    eta,
    gantt,
    separator: /fold \d+ — study started/i.test(text),
    trialLines: (text.match(/Trial \d+ finished/g) || []).length,
  };
});
console.log(JSON.stringify(out));
console.log("PASS:", out.strip !== null && out.eta && out.gantt && out.separator && out.trialLines > 0);
await page.screenshot({ path: "e2e/shots/run-progress-v2-running.png", fullPage: true });
await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
