import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const results = {};
for (const [name, runId] of [["advanced", process.env.ADV_RUN], ["three-window", process.env.TW_RUN]]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  try {
    await page.goto(`http://127.0.0.1:5173/execution?run=${runId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    const px = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return { found: false };
      const ctx = canvas.getContext("2d");
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let green = 0, red = 0, total = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        total++;
        if (g > 110 && r < 110 && b < 130) green++;
        else if (r > 160 && g < 90 && b < 90) red++;
      }
      return { found: true, green, red, total };
    });
    results[name] = px;
    console.log(`${name}: greenPx=${px.green} redPx=${px.red} opaque=${px.total}`);
  } catch (err) {
    console.log(`${name}: ERROR ${err.message.slice(0, 80)}`);
  }
  await page.close();
}
const ok = Object.values(results).every((r) => r.found && r.green > 50 && r.red > 50);
console.log("PASS (visible green+red candles):", ok);
await browser.close();
