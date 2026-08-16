// Real-browser mechanics probe for the editable initials-entry flow.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const path = join(ROOT, rel === '/' ? 'index.html' : rel);
    res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(await readFile(path));
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

const problems = [];
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
page.on('console', (message) => { if (message.type() === 'error') problems.push(`console.error: ${message.text()}`); });
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('crash', () => problems.push('page crashed'));

const check = async (label, predicate, detail) => {
  const state = await page.evaluate(() => ({
    mode: window.__game.mode,
    pos: window.__game.entry.pos,
    name: window.__game.entry.name.join(''),
    hi: window.__game.hi,
  }));
  if (!predicate(state)) throw new Error(`${label}: ${detail(state)}`);
  console.log(`  PASS  ${label}  ${detail(state)}`);
};
const tap = async (code) => { await page.keyboard.press(code); await page.waitForTimeout(30); };
const edit = async (code) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(50);
  await page.keyboard.up(code);
  await page.waitForTimeout(170);
};

try {
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__game?.mode === 'attract');
  const checkpoint = await page.evaluate(() => {
    const game = window.__game;
    const sim = game.sim;
    game.mode = 'race';
    game.modeT = 0;
    sim.leg = 1;
    sim.z = game.course.checkpoints[0].z - 1;
    sim.speed = 100;
    sim.timer = 12.345;
    sim.score = 0;
    sim.finished = false;
    sim.gameOver = false;
    sim.rivals = [];
    sim.traffic = [];
    const event = sim.step(1 / 60, { steer: 0, throttle: 0, boost: false });
    game._reactTo(event);
    game.render();
    return { event: event.checkpoint, award: sim.lastCheckpoint, readout: game.checkpointReadout() };
  });
  if (!checkpoint.event
    || Math.abs(checkpoint.award.remaining - (12.345 - 1 / 60)) > 1e-9
    || checkpoint.readout.timeText !== '33.2 SEC'
    || checkpoint.readout.bonusText !== 'TIME LEFT BONUS +001232 SCORE') {
    throw new Error(`checkpoint readout mismatch: ${JSON.stringify(checkpoint)}`);
  }
  console.log(`  PASS  checkpoint readout identifies clock replacement and remaining-time score  ${checkpoint.readout.timeText}; ${checkpoint.readout.bonusText}`);
  await page.screenshot({ path: 'test/screenshot-checkpoint-time-set.png' });
  await page.evaluate(() => { window.__game._enterAttract(); });
  await page.waitForFunction(() => window.__game.mode === 'attract');
  await page.evaluate(() => { window.__game.modeT = 2; window.__game.render(); });
  await check('attract loop opens on its title phase',
    (s) => s.mode === 'attract', (s) => `mode=${s.mode}`);
  await page.evaluate(() => { window.__game.modeT = 10; window.__game.render(); });
  const rankPanel = await page.evaluate(() => ({
    panel: window.__game.attractPanel(),
    ranking: window.__game.attractRanking(),
  }));
  if (rankPanel.panel.phase !== 'ranking' || rankPanel.ranking[0]?.score !== 50000) {
    throw new Error(`ranking phase/default table mismatch: ${JSON.stringify(rankPanel)}`);
  }
  console.log(`  PASS  attract title alternates to live ranking data  leader=${rankPanel.ranking[0].name}:${rankPanel.ranking[0].score}`);
  await page.screenshot({ path: 'test/screenshot-attract-ranking.png' });

  await page.evaluate(async () => {
    const { propsFor } = await import('/src/props.js');
    const game = window.__game;
    const building = propsFor(game.course).find((prop) => prop.kind === 'BUILDING' && prop.z > 300);
    if (!building) throw new Error('probe course has no building');
    game.sim.z = building.z - 100;
    game.sim.traffic = [];
    game.sim.rivals = [{ z: building.z + 35, x: 0, speed: 0, lamp: 0 }];
    const order = [];
    const drawProp = game.renderer.drawProp.bind(game.renderer);
    const drawCar = game._drawCar.bind(game);
    game.renderer.drawProp = (prop) => { if (prop === building) order.push('building'); return drawProp(prop); };
    game._drawCar = (...args) => { order.push('car'); return drawCar(...args); };
    game.render();
    window.__farCarOrder = [...order];
    order.length = 0;
    game.sim.rivals[0].z = building.z - 35;
    game.render();
    window.__nearCarOrder = order;
    game.renderer.drawProp = drawProp;
    game._drawCar = drawCar;
  });
  const depthOrders = await page.evaluate(() => ({ far: window.__farCarOrder, near: window.__nearCarOrder }));
  if (depthOrders.far.join(',') !== 'car,building' || depthOrders.near.join(',') !== 'building,car') {
    throw new Error(`browser depth order mismatch: ${JSON.stringify(depthOrders)}`);
  }
  console.log(`  PASS  browser world queue handles both occlusion directions  far=${depthOrders.far.join('>')} near=${depthOrders.near.join('>')}`);

  await page.evaluate(() => {
    localStorage.removeItem('draftline.hi');
    const game = window.__game;
    game.hi = [{ name: 'ACE', score: 100000 }];
    game.sim.score = 234567;
    game._enterEntryOrAttract();
  });
  await page.waitForFunction(() => window.__game.mode === 'entry');

  await tap('ArrowLeft');
  await tap('KeyA');
  await check('left aliases clamp at the first slot', (s) => s.pos === 0, (s) => `pos=${s.pos}`);

  await tap('Enter');
  await check('Enter commits slot zero and advances exactly once',
    (s) => s.mode === 'entry' && s.pos === 1 && s.hi.length === 1,
    (s) => `mode=${s.mode} pos=${s.pos} table=${s.hi.length}`);
  await page.keyboard.down('KeyZ');
  await page.waitForTimeout(120);
  await check('held Z commits slot one but cannot submit at the right edge',
    (s) => s.mode === 'entry' && s.pos === 2 && s.hi.length === 1,
    (s) => `mode=${s.mode} pos=${s.pos} table=${s.hi.length}`);
  await page.keyboard.up('KeyZ');

  await tap('ArrowLeft');
  await edit('ArrowUp');
  await tap('KeyD');
  await edit('KeyW');
  await check('right and edit aliases target the selected slots',
    (s) => s.pos === 2 && s.name === 'ABB', (s) => `pos=${s.pos} name=${s.name}`);

  await tap('ArrowLeft');
  await tap('KeyA');
  await edit('ArrowUp');
  await tap('ArrowRight');
  await tap('KeyD');
  await check('an earlier initial can be corrected and the cursor returned right',
    (s) => s.pos === 2 && s.name === 'BBB', (s) => `pos=${s.pos} name=${s.name}`);

  await page.screenshot({ path: 'test/screenshot-initials-entry.png' });
  await tap('Space');
  await check('rightmost confirm submits every displayed character',
    (s) => s.mode === 'attract' && s.hi[0]?.name === 'BBB' && s.hi[0]?.score === 234567,
    (s) => `mode=${s.mode} leader=${s.hi[0]?.name}:${s.hi[0]?.score}`);

  if (problems.length) throw new Error(problems.join('\n'));
  console.log('\nINITIALS PROBE PASSED — exact browser transitions and input aliases match the entry contract.');
} finally {
  await browser.close();
  server.close();
}
