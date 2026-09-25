// Filmstrip of an autopiloted game: node tests/capture-play.mjs <outDir> [frames] [intervalMs]
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
const [out = "shots", n = "8", every = "1500"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 640 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(pathToFileURL(resolve("index.html")).href);
await page.waitForTimeout(500);
await page.keyboard.press("Space");
await page.evaluate(() => window.__blink.autopilot(3));
for (let i = 0; i < Number(n); i++) {
  await page.waitForTimeout(Number(every));
  await page.screenshot({ path: `${out}/f${i}.png` });
  const s = await page.evaluate(() => { const g = window.__blink.game; return `${g.phase} sc=${g.score} L=${g.lives} sec=${g.sector} h=${g.hunters.length} blips=${g.blips.length}`; });
  console.log(i, s);
}
console.log("errors", errors);
await browser.close();
