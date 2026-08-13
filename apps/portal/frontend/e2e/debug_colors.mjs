import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await page.goto(`http://127.0.0.1:5173/execution?run=${process.env.ADV_RUN}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const out = await page.evaluate(() => {
  const canvas = document.querySelector("canvas");
  if (!canvas) return "no canvas";
  const ctx = canvas.getContext("2d");
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const counts = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 250) continue;
    const key = `${data[i]},${data[i+1]},${data[i+2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10);
  return { size: [canvas.width, canvas.height], top };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
