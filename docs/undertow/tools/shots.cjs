// Screenshots of the live page driven by the demo bot: node tools/shots.cjs outDir [seconds...]
const { chromium } = require("playwright");
const path = require("path");
const out = process.argv[2] || ".";
const times = (process.argv.slice(3).length ? process.argv.slice(3) : ["1", "6", "14", "24"]).map(Number);
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 768, height: 576 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("file://" + path.resolve(__dirname, "..", "index.html"));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, "title.png") });
  await page.evaluate(() => window.__ut.start(true));
  let t = 0;
  for (const s of times) {
    await page.waitForTimeout((s - t) * 1000);
    t = s;
    await page.screenshot({ path: path.join(out, "play-" + s + ".png") });
  }
  console.log(errors.length ? errors.join("\n") : "no errors");
  await browser.close();
})();
