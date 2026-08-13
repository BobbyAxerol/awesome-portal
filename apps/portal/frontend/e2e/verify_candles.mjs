import { chromium } from "@playwright/test";
const browser = await chromium.launch();
for (const [name, runId] of [["advanced", process.env.ADV_RUN], ["three-window", process.env.TW_RUN]]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:5173/execution?run=${runId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const info = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      return { canvases: document.querySelectorAll("canvas").length, height: canvas ? Math.round(canvas.getBoundingClientRect().height) : 0, title: document.body.innerText.includes("Candles + target transitions") };
    });
    console.log(`${name}: canvases=${info.canvases} chartH=${info.height}px candles-title=${info.title} errors=${errors.length}`);
    await page.screenshot({ path: `e2e/shots/exec-candles-${name}.png`, fullPage: true });
  } catch (err) {
    console.log(`${name}: ERROR ${err.message.slice(0, 120)}`);
  }
  await page.close();
}
await browser.close();
