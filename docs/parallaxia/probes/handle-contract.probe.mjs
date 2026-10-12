// The debug handle itself: every other probe relies on these behaviours.

export default {
  name: "debug handle contract",
  requires: [],
  async run({ page, check }) {
    const r = await page.evaluate(() => {
      const g = window.__game;
      const out = {};
      g.reset({ seed: 7 });
      out.frameAfterReset = g.frame;
      out.frameAfterStep = g.step(10);
      out.pausedAfterStep = g.paused;
      const first = g.hash();
      g.reset({ seed: 7 });
      g.step(10);
      out.sameSeedSameHash = g.hash() === first;
      g.reset({ seed: 8 });
      g.step(10);
      out.otherSeedOtherHash = g.hash() !== first;
      g.reset({ seed: 7 });
      g.setInput(16);
      g.step(1);
      out.injectedInput = g.state.input;
      g.step(1, 8);
      out.overrideInput = g.state.input;
      g.setInput(null);
      g.step(1);
      out.releasedInput = g.state.input;
      out.replayHash = g.runReplay({ version: 1, seed: 7, frames: [[16, 1], [8, 1], [0, 1]] });
      out.replayFrame = g.frame;
      out.replayMatchesSteps = out.replayHash === g.hash();
      g.state.frame = 500;
      out.stateIsWritable = g.frame;
      return out;
    });
    check("reset puts the frame at 0", r.frameAfterReset, 0);
    check("step(10) advances exactly 10 frames", r.frameAfterStep, 10);
    check("step() pauses the real-time loop", r.pausedAfterStep, true);
    check("same seed and steps give the same hash", r.sameSeedSameHash, true);
    check("a different seed gives a different hash", r.otherSeedOtherHash, true);
    check("setInput(16) reaches the sim", r.injectedInput, 16);
    check("step(1, 8) overrides the held input", r.overrideInput, 8);
    check("setInput(null) releases the override", r.releasedInput, 0);
    check("runReplay plays every frame", r.replayFrame, 3);
    check("runReplay returns the state hash", r.replayMatchesSteps, true);
    check("state is writable for injection", r.stateIsWritable, 500);
  },
};
