// Fixture for the purity scan: a "sim" that reads the clock and the DOM.
export function stepSim(sim) {
  sim.t = performance.now();
  sim.w = window.innerWidth;
  sim.r = Math.random();
  sim.a = Math.atan2(sim.y, sim.x);
}
