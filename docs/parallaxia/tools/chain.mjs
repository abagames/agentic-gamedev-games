#!/usr/bin/env node
// How the chain, the bosses and the score come out under different simulated
// players. For questions about the chain and the scoring, not about how hard
// the game is: every policy here is exact where a person is not.
//
// Usage:
//   node tools/chain.mjs [--seconds 600] [--mode normal|rapid|dense] [--start 1] [--policies keeper,keeper:body-only,seeker,seeker:ground-both]

import { createSim, stepSim, observe, isEnded } from "../src/sim/sim.js";
import { seekerWith } from "./policies/index.mjs";
import { keeperWith } from "./policies/keeper.mjs";

const POLICIES = [keeperWith(), keeperWith({ wings: false }), seekerWith(), seekerWith({ ground: "both" })];
const opts = { seconds: 600, mode: "normal", start: 1, policies: POLICIES.map((p) => p.name) };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--seconds") opts.seconds = Number(argv[++i]);
  else if (argv[i] === "--mode") opts.mode = argv[++i];
  else if (argv[i] === "--start") opts.start = Number(argv[++i]);
  else if (argv[i] === "--policies") opts.policies = argv[++i].split(",");
  else {
    console.error(`chain: unexpected argument '${argv[i]}'`);
    process.exit(2);
  }
}

const per = (n, minutes) => (n / minutes).toFixed(2);
for (const name of opts.policies) {
  const policy = POLICIES.find((p) => p.name === name);
  if (!policy) {
    console.error(`chain: no policy '${name}' (have ${POLICIES.map((p) => p.name).join(", ")})`);
    process.exit(2);
  }
  const total = { runs: 0, ended: 0, frames: 0, score: 0, misses: 0, bossMisses: 0, bosses: 0, bossFrames: 0, clean: 0, left: 0, top: 0, chainSum: 0, breaks: { escape: 0, ground: 0, miss: 0 } };
  for (const seed of [2001, 2002, 2003]) {
    for (let variant = 0; variant < 4; variant++) {
      const sim = createSim({ seed, mode: opts.mode, startSector: opts.start });
      const decide = policy.create({ seed, variant });
      let t = 0;
      let bossAt = 0;
      while (t < opts.seconds * 60 && !isEnded(sim)) {
        stepSim(sim, decide(observe(sim), t));
        for (const e of sim.events) {
          if (e.type === "boss") {
            bossAt = t;
            total.bosses++;
          } else if (e.type === "boss-destroy") {
            total.bossFrames += t - bossAt;
            if (e.clean) total.clean++;
          } else if (e.type === "boss-left") total.left++;
          else if (e.type === "chain-break") total.breaks[e.cause]++;
          else if (e.type === "miss") {
            total.misses++;
            if (["midboss", "bigboss", "wing"].includes(e.from)) total.bossMisses++;
          }
        }
        total.top = Math.max(total.top, sim.chain);
        total.chainSum += sim.chain;
        t++;
      }
      total.runs++;
      total.frames += t;
      total.score += sim.score;
      total.ended += isEnded(sim) ? 1 : 0;
    }
  }
  const minutes = total.frames / 3600;
  const destroyed = total.bosses - total.left;
  console.log(
    `${opts.mode} from ${opts.start}  ${name.padEnd(20)} ended ${total.ended}/${total.runs}, mean ${(total.frames / 60 / total.runs).toFixed(0)}s, ${Math.round(total.score / minutes)} points/min | chain: mean ${(total.chainSum / total.frames).toFixed(1)}, longest ${total.top}, breaks/min escape ${per(total.breaks.escape, minutes)} ground ${per(total.breaks.ground, minutes)} miss ${per(total.breaks.miss, minutes)} | bosses ${total.bosses}: mean ${destroyed ? (total.bossFrames / 60 / destroyed).toFixed(1) : "-"}s, all wings off ${total.clean}, gave up ${total.left} | misses/min ${per(total.misses, minutes)} (${total.bossMisses} of ${total.misses} to bosses)`
  );
}
console.log("note: exact policies; this says how the scoring behaves, not how hard the game is.");
