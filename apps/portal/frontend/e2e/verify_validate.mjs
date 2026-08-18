import { chromium } from "@playwright/test";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://127.0.0.1:5173/?new=1", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);
await page.getByRole("button", { name: /Validate/ }).first().click();
await page.waitForTimeout(6000);
const tw = await page.evaluate(() => {
  const body = document.body.innerText;
  return { passBadges: (body.match(/schema|boundaries|content hash/g) || []).length, hasError: body.includes("Something went wrong") || body.includes("Internal Server Error") };
});
console.log("three-window validate:", JSON.stringify(tw));
console.log("TW PASS:", tw.passBadges >= 3 && !tw.hasError);
try {
  await page.getByRole("button", { name: "Advanced WFO" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Validate/ }).first().click();
  await page.waitForTimeout(6000);
  const aw = await page.evaluate(() => {
    const body = document.body.innerText;
    return { hasError: body.includes("Something went wrong") || body.includes("Internal Server Error") || body.includes("500"), hasBars: body.includes("bars") };
  });
  console.log("advanced validate:", JSON.stringify(aw));
  console.log("AW PASS:", !aw.hasError && aw.hasBars);
} catch (err) {
  console.log("advanced flow error:", err.message.slice(0, 120));
}
await browser.close();
