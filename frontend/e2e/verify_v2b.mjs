import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto(`http://127.0.0.1:5173/?run=${process.env.RUN_ID}`, { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
const out = await page.evaluate(() => {
  const strip = Array.from(document.querySelectorAll("span")).find((s) => s.textContent && /Fold \d+\/\d+/.test(s.textContent));
  const eta = Array.from(document.querySelectorAll("span")).find((s) => s.textContent && s.textContent.includes("ETA"));
  const gantt = document.body.innerText.includes("Fold timeline");
  const header = Array.from(document.querySelectorAll("span")).find((el) => el.textContent && el.textContent.includes("live console"));
  const scroll = header ? header.closest("div").parentElement.querySelector("div.overflow-y-auto") : null;
  const text = scroll ? scroll.innerText : "";
  return {
    strip: strip ? strip.textContent : null,
    eta: eta ? eta.textContent.replace(/\n/g, " ") : null,
    gantt,
    separator: text.includes("STUDY STARTED") || text.includes("study started"),
    trialLines: (text.match(/Trial \d+ finished/g) || []).length,
    firstLines: text.split("\n").slice(0, 6),
  };
});
console.log(JSON.stringify(out, null, 1));
console.log("PASS:", out.strip !== null && out.eta?.includes("ước tính") && out.gantt && out.separator && out.trialLines > 0);
await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
