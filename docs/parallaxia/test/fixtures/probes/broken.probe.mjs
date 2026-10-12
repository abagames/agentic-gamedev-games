// Deliberately wrong expectation: proves the probe runner fails when a value
// does not match. Run only by the self-test in tools/check.mjs.

export default {
  name: "fixture: wrong expectation",
  requires: [],
  async run({ page, check }) {
    const frame = await page.evaluate(() => {
      window.__game.reset({ seed: 1 });
      return window.__game.step(3);
    });
    check("step(3) advances 4 frames (wrong on purpose)", frame, 4);
  },
};
