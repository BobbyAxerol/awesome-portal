import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
await page.goto("http://127.0.0.1:5173/?new=1", { waitUntil: "networkidle" });
await page.waitForTimeout(3000);
await page.getByRole("button", { name: /Run backtest/ }).first().click();
await page.waitForTimeout(3000);

// L1: live console must stream trial lines DURING the run
let liveTrials = 0;
for (const t of [8, 16]) {
  await page.waitForTimeout(t === 8 ? 8 : 8);
  liveTrials = await page.evaluate(() => {
    const header = Array.from(document.querySelectorAll("span")).find((el) => el.textContent && el.textContent.includes("live console"));
    if (!header) return 0;
    const scroll = header.closest("div").parentElement.querySelector("div.overflow-y-auto");
    return scroll ? (scroll.innerText.match(/Trial \d+ finished/g) || []).length : 0;
  });
  console.log(`L1 t+${t}s: live trial lines = ${liveTrials}`);
}
console.log("L1 PASS (streams during run):", liveTrials >= 3);

// wait for completion, then check replay on stage log
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(3000);
  if (await page.getByRole("button", { name: /Xem kết quả/ }).isVisible().catch(() => false)) break;
}
// grab the "replaying x/total" indicator early in replay
await page.waitForTimeout(800);
const replayEarly = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("span")).find((s) => s.textContent && s.textContent.includes("replaying"));
  return el ? el.textContent : null;
});
await page.waitForTimeout(2500);
const replayLater = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("span")).find((s) => s.textContent && (s.textContent.includes("replayed") || s.textContent.includes("replaying")));
  return el ? el.textContent : null;
});
const trialCountNow = await page.evaluate(() => {
  const header = Array.from(document.querySelectorAll("span")).find((el) => el.textContent === "stage log · structured · audit-grade");
  if (!header) return 0;
  const scroll = header.closest("div").parentElement.querySelector("div.overflow-y-auto");
  return scroll ? (scroll.innerText.match(/trial #/g) || []).length : 0;
});
console.log("R1 replay indicator early:", replayEarly);
console.log("R1 replay indicator later:", replayLater);
console.log("R1 trials visible now:", trialCountNow);
console.log("R1 PASS (progressive reveal):", replayEarly !== null && replayLater !== null && trialCountNow >= 10);
await browser.close();
console.log("ERRORS:", errors.length ? errors : "none");
