// Shared headless-browser setup for the tools: starts the static server, opens
// the game page paused, and collects page errors. With title: true the page is
// opened the way a player opens it: no seed, not paused, on the title screen
// (query, as "&rec=1", is then all there is in the URL).

import { chromium } from "playwright";
import { startServer } from "../serve.mjs";

export async function openGame({ seed = 1, paused = true, query = "", title = false } = {}) {
  const server = await startServer(0);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 800, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });
  page.on("crash", () => errors.push("crash: page crashed"));
  const url = title ? `${server.url}/index.html${query ? "?" + query.replace(/^&/, "") : ""}` : `${server.url}/index.html?seed=${seed}${paused ? "&paused=1" : ""}${query}`;
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__game !== undefined, null, { timeout: 10000 });
  return {
    page,
    errors,
    url: server.url,
    async close() {
      await browser.close();
      await server.close();
    },
  };
}
