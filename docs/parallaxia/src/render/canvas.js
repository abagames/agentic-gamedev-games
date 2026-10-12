// Canvas renderer. Reads the sim state and draws it; never writes to it.
//
// The look is an early-1980s raster arcade board: a portrait screen at
// 220x320 (10 pixels per field unit) scaled up with hard pixels, a small fixed
// palette where every colour has one job, sprites made of pixel maps, a
// two-layer starfield, and a score line across the top.

import { BOSS, BULLET, GROUND, KINDS, LOCK, MODES, RATE, SHOT } from "../sim/constants.js";
import { closeMultiplier, distanceTo, killMultiplier } from "../sim/score.js";
import { shipAbsent, shipInvincible } from "../sim/player.js";
import { bossFramesLeft, bossWarning } from "../sim/boss.js";
import { flightHolding, SIDEWAYS } from "../sim/flight.js";
import { rollStage, shakeOffset } from "./fx.js";

export const CANVAS_WIDTH = 220;
// A 16-pixel strip above the field holds the score line, so nothing in play
// is ever drawn under it.
export const HUD_HEIGHT = 16;
export const CANVAS_HEIGHT = 320 + HUD_HEIGHT;

// Palette roles. Danger's magenta is used for nothing else.
export const PALETTE = Object.freeze({
  space: "#000008",
  farStar: "#3a3f9c",
  nearStar: "#9aa0ff",
  ship: "#ffffff",
  shipTrim: "#21d4ff",
  shot: "#7fe9ff",
  enemy: "#39e05a",
  enemyTrim: "#ff9d2e",
  big: "#ff9d2e",
  bigTrim: "#39e05a",
  bigHurt: "#ffffff",
  large: "#ff5a36",
  largeTrim: "#ffd21f",
  largeDark: "#a32a14",
  steel: "#9aa6c4",
  steelDark: "#56607e",
  lock: "#ffffff",
  laser: "#c9a0ff",
  danger: "#ff2a6d",
  dangerCore: "#ffffff",
  dangerSeed: "#8a1840",
  reward: "#ffd21f",
  // The ground is a family of dull blues, darker than anything that flies.
  plate: "#0e1638",
  plateEdge: "#1d2a66",
  plateSeam: "#080d26",
  ground: "#6f86d6",
  groundTrim: "#c4d0ff",
  wreck: "#04060f",
  // What an explosion leaves: grey with no colour of its own, so that it is
  // never taken for a bullet or for anything that scores.
  smoke: "#5b5868",
  smokeThin: "#34323e",
  // A cleared island: the blue gone out of it, the colour of a bonus dimmed.
  plateDone: "#2b2209",
  plateDoneEdge: "#7a6118",
  plateDoneSeam: "#171204",
  // The blink as it clears: a step up from the cleared colour, not a glare.
  plateLit: "#4d3d10",
  hud: "#ff3b30",
  hudValue: "#ffffff",
  // The lit and the shaded edge of each hull colour (see TONES).
  shipShade: "#a8c4e0",
  enemyLight: "#b4ffbe",
  enemyDark: "#1c8a36",
  bigLight: "#ffd596",
  bigDark: "#b05f10",
  largeLight: "#ffac96",
  steelLight: "#dfe6ff",
  groundLight: "#9fb0ee",
  groundDark: "#414f98",
  rewardLight: "#fff3a6",
  rewardDark: "#b0890e",
});
const C = PALETTE;

// Light falls from the upper left. A hull colour has a lit and a shaded tone:
// an edge that faces up or left takes the first, one that faces down or right
// the second. The ship is already white, so it only takes the shade. Only a
// thing in its own colour is toned: bullets, shots, wrecks, and anything
// blinking (the white of a hit, a warning) are drawn flat.
const TONES = {
  ship: [C.ship, C.shipShade],
  enemy: [C.enemyLight, C.enemyDark],
  big: [C.bigLight, C.bigDark],
  large: [C.largeLight, C.largeDark],
  steel: [C.steelLight, C.steelDark],
  ground: [C.groundLight, C.groundDark],
  reward: [C.rewardLight, C.rewardDark],
};

const UNIT = 10;
// Field x to screen x, through the scrolling view (set at the top of draw).
let viewX = 0;
const sx = (x) => Math.round((x - viewX + 11) * UNIT);
const sy = (y) => HUD_HEIGHT + Math.round((16 - y) * UNIT);

// "#" main colour, "o" trim colour, "." empty.
const SPRITES = {
  ship: [
    "......#......",
    "......#......",
    ".....###.....",
    ".....#o#.....",
    ".....###.....",
    "#...#####...#",
    "#..#######..#",
    "#.#########.#",
    "######o######",
    "###.#####.###",
    "##...###...##",
    "#.....#.....#",
  ],
  // CLOSE: a broad hammerhead, built to go in.
  shipClose: [
    "....#####....",
    "....#####....",
    ".....###.....",
    ".....#o#.....",
    "#...#####...#",
    "##.#######.##",
    "#############",
    "######o######",
    "###.#####.###",
    "##..#####..##",
    "#....###....#",
    ".....#.#.....",
  ],
  // CHAIN: a swept dart, built to run things down.
  shipChain: [
    "......#......",
    "......#......",
    ".....###.....",
    ".....#o#.....",
    "....#####....",
    "....#####....",
    "...#######...",
    "#..###o###..#",
    "##.#######.##",
    "#############",
    "###..###..###",
    "#.....#.....#",
  ],
  // GRAZE: a slim body on long thin wings, built to slip through.
  shipGraze: [
    "......#......",
    "......#......",
    "......#......",
    ".....###.....",
    ".....#o#.....",
    ".....###.....",
    "#....###....#",
    "#...#####...#",
    "######o######",
    "#...#####...#",
    "#....###....#",
    "......#......",
  ],
  shipIcon: ["...#...", "...#...", "..#o#..", "#.###.#", "#######", "##.#.##", "#..#..#"],
  enemyA: [
    "#...............#",
    "##.............##",
    "###...........###",
    ".####..###..####.",
    "..######o######..",
    "....#########....",
    ".....#o###o#.....",
    ".....#######.....",
    "......#####......",
    ".......###.......",
    "........#........",
  ],
  enemyB: [
    ".................",
    "..#...........#..",
    ".###.........###.",
    "#####..###..#####",
    "###.####o####.###",
    "#...#########...#",
    ".....#o###o#.....",
    ".....#######.....",
    ".....##.#.##.....",
    "....##.....##....",
    ".................",
  ],
  // Small enemies are drawn by the way their formation flies, so the shape
  // says what is coming before it moves. All are 17 x 11 with a hull at least
  // 11 pixels wide through the middle, which is the part that costs a ship.
  // A down-pointing spearhead: it dives.
  dive: [
    "....#.......#....",
    "....##.....##....",
    "....###...###....",
    "....####.####....",
    "...#####o#####...",
    "...###########...",
    "....#########....",
    ".....###o###.....",
    "......#####......",
    ".......###.......",
    "........#........",
  ],
  // A flat saucer: it hangs in a row.
  hover: [
    ".................",
    ".................",
    "......#####......",
    "....#########....",
    "..######o######..",
    "#################",
    ".###o###o###o###.",
    "...###########...",
    ".....#.....#.....",
    ".................",
    ".................",
  ],
  // Pincers reaching down and out: it turns the corner.
  hook: [
    "###...........###",
    "####.........####",
    ".####.......####.",
    "..####.###.####..",
    "...#####o#####...",
    "....#########....",
    "...###o###o###...",
    "..###.#####.###..",
    ".###...###...###.",
    ".##.....#.....##.",
    ".#.............#.",
  ],
  // An up-pointing arrowhead: it goes back the way it came.
  hairpin: [
    "........#........",
    ".......###.......",
    "......#####......",
    ".....###o###.....",
    "....#########....",
    "...####o#o####...",
    "..#############..",
    ".#####.###.#####.",
    "####....#....####",
    "###...........###",
    "#...............#",
  ],
  // A ring: it flies an arc.
  sweep: [
    ".....#######.....",
    "...###########...",
    "..####.....####..",
    ".###...###...###.",
    ".##...#####...##.",
    ".##...##o##...##.",
    ".##...#####...##.",
    ".###...###...###.",
    "..####.....####..",
    "...###########...",
    ".....#######.....",
  ],
  // A slab leaning the way it travels (drawn for a formation crossing to the
  // right; mirrored for one crossing to the left).
  diagonal: [
    "########.........",
    ".#########.......",
    "..##########.....",
    "...#####o####....",
    "...###########...",
    "....####o######..",
    ".....##########..",
    ".......#########.",
    ".........#######.",
    "...........######",
    "..............###",
  ],
  // A bow tie: it snakes from side to side.
  wave: [
    ".................",
    "..###.......###..",
    ".#####.....#####.",
    "#######...#######",
    "##..#########..##",
    "#....###o###....#",
    "##..#########..##",
    "#######...#######",
    ".#####.....#####.",
    "..###.......###..",
    ".................",
  ],
  // A saw-toothed crown: it zigzags.
  zigzag: [
    "#...#...#...#...#",
    "##.###.###.###.##",
    "#################",
    ".###############.",
    "..#####o#o#####..",
    "...###########...",
    "....#########....",
    ".....#######.....",
    "......#####......",
    ".......###.......",
    ".................",
  ],
  // A dart lying on its side, nose first (drawn flying right).
  cross: [
    ".................",
    "###..............",
    "######...........",
    ".#########.......",
    "..###o#########..",
    "...##############",
    "..###o#########..",
    ".#########.......",
    "######...........",
    "###..............",
    ".................",
  ],
  // Square blocks: the staircase (the drill only).
  stairs: [
    "######.....######",
    "######.....######",
    "######.....######",
    "...###########...",
    "...#####o#####...",
    "...###########...",
    "...###o###o###...",
    "...###########...",
    "######.....######",
    "######.....######",
    "######.....######",
  ],
  // Things on the ground: square, flat and blue, so that nothing on the
  // ground can be taken for something in the air. Three looks of the common
  // one-shot panel, the larger core that takes several, and what is left.
  // The valuable target: a faceted gem, in the colour of a bonus.
  bonus: [
    ".....###.....",
    "....#ooo#....",
    "...#o###o#...",
    "..#o#####o#..",
    ".#o#######o#.",
    "#o####o####o#",
    "#o###ooo###o#",
    "#o####o####o#",
    ".#o#######o#.",
    "..#o#####o#..",
    "...#o###o#...",
    "....#ooo#....",
    ".....###.....",
  ],
  panelA: [
    "#############",
    "#ooooooooooo#",
    "#o#########o#",
    "#o#.......#o#",
    "#o#.#####.#o#",
    "#o#.#ooo#.#o#",
    "#o#.#ooo#.#o#",
    "#o#.#ooo#.#o#",
    "#o#.#####.#o#",
    "#o#.......#o#",
    "#o#########o#",
    "#ooooooooooo#",
    "#############",
  ],
  panelB: [
    "....#####....",
    "....#ooo#....",
    "....#o#o#....",
    "....#o#o#....",
    "#####o#o#####",
    "#oooo###oooo#",
    "#o####o####o#",
    "#oooo###oooo#",
    "#####o#o#####",
    "....#o#o#....",
    "....#o#o#....",
    "....#ooo#....",
    "....#####....",
  ],
  panelC: [
    "......#......",
    ".....#o#.....",
    "....#ooo#....",
    "...#oo#oo#...",
    "..#oo###oo#..",
    ".#oo##o##oo#.",
    "#oo##ooo##oo#",
    ".#oo##o##oo#.",
    "..#oo###oo#..",
    "...#oo#oo#...",
    "....#ooo#....",
    ".....#o#.....",
    "......#......",
  ],
  core: [
    ".....#######.....",
    "...###ooooo###...",
    "..##ooo###ooo##..",
    ".##oo#######oo##.",
    ".#oo###ooo###oo#.",
    "##o###o###o###o##",
    "#oo##o#####o##oo#",
    "#o###o##o##o###o#",
    "#o###o#ooo#o###o#",
    "#o###o##o##o###o#",
    "#oo##o#####o##oo#",
    "##o###o###o###o##",
    ".#oo###ooo###oo#.",
    ".##oo#######oo##.",
    "..##ooo###ooo##..",
    "...###ooooo###...",
    ".....#######.....",
  ],
  wreck: [
    ".............",
    "...##...#....",
    "..####.###...",
    ".###########.",
    "..#########..",
    ".##########..",
    "..##########.",
    ".##########..",
    "..#########..",
    ".####.#####..",
    "..##...###...",
    ".........#...",
    ".............",
  ],
  // A ring: it flies a full circle.
  loop: [
    ".....#######.....",
    "...###########...",
    "..###o#####o###..",
    ".###.........###.",
    "###...........###",
    "##o...#####...o##",
    "###...........###",
    ".###.........###.",
    "..###o#####o###..",
    "...###########...",
    ".....#######.....",
  ],
  // Two claws closing: its files cross.
  pincer: [
    "##.............##",
    "###...........###",
    "####...###...####",
    ".####.#####.####.",
    "..####o###o####..",
    "..#############..",
    ".###o#######o###.",
    "###...#####...###",
    "##.....###.....##",
    "##......#......##",
    ".##...........##.",
  ],
  // A broad dart pointing down: it comes low before it turns away.
  duck: [
    "........#........",
    ".......###.......",
    "......#####......",
    "#....#######....#",
    "##..###o#o###..##",
    "#################",
    ".###o#######o###.",
    "..#############..",
    "....#########....",
    "......#####......",
    "........#........",
  ],
  // An upturned fork: the file parts in two.
  split: [
    "........#........",
    ".......###.......",
    "......#####......",
    ".....#######.....",
    "....###o#o###....",
    "...###.###.###...",
    "..###...#...###..",
    ".###.........###.",
    "###...........###",
    "##.............##",
    "#...............#",
  ],
  // Two blocks side by side: two files abreast.
  stagger: [
    "..###.......###..",
    "..###.......###..",
    ".#####..#..#####.",
    ".##o##.###.##o##.",
    ".###############.",
    ".###############.",
    ".##o##.###.##o##.",
    ".#####..#..#####.",
    "..###.......###..",
    "..###.......###..",
    "..#.#.......#.#..",
  ],
  // Rungs: it comes down in steps.
  ladder: [
    ".###############.",
    ".###############.",
    ".....#.o#o.#.....",
    "..#############..",
    "..#############..",
    ".....#.o#o.#.....",
    "...###########...",
    "...###########...",
    ".....#..#..#.....",
    "....#########....",
    "....#########....",
  ],
  // A shallow bowl: it dips across the field.
  swoop: [
    "#...............#",
    "##.............##",
    "###...........###",
    ".###.........###.",
    ".####.......####.",
    "..#####.o.#####..",
    "...###########...",
    "....#########....",
    "......#####......",
    ".................",
    ".................",
  ],
  // A body with four moons: it circles the ship's place.
  orbit: [
    ".................",
    "##.............##",
    "##...#######...##",
    "....#########....",
    "...###o###o###...",
    "...##o.o#o.o##...",
    "...###o###o###...",
    "....#########....",
    "##...#######...##",
    "##.............##",
    ".................",
  ],
  // A cross of two strokes: its files cross twice.
  lace: [
    "##.............##",
    ".##...........##.",
    "..##.........##..",
    "...##...#...##...",
    "....##.###.##....",
    ".....#o###o#.....",
    "....##.###.##....",
    "...##...#...##...",
    "..##.........##..",
    ".##...........##.",
    "##.............##",
  ],
  // A diamond: down, and straight back up.
  bounce: [
    "........#........",
    ".......###.......",
    "......#####......",
    ".....##o#o##.....",
    "....#########....",
    "...###########...",
    "....#########....",
    ".....##o#o##.....",
    "......#####......",
    ".......###.......",
    "........#........",
  ],
  // A coil: it curls round before it goes.
  curl: [
    "..#############..",
    ".###.........###.",
    "###..#######..###",
    "##..##.....##..##",
    "##.##.o###o.##.##",
    "##.##.#####.##.##",
    "##..#########..##",
    "###...........###",
    ".###############.",
    "..#############..",
    ".................",
  ],
  middleA: [
    "##...................##",
    "###.................###",
    "####...............####",
    ".#####....###....#####.",
    "..######.#####.######..",
    "...########o########...",
    "....###############....",
    "....##o####o####o##....",
    ".....#############.....",
    ".....###.#####.###.....",
    "......#...###...#......",
    "..........###..........",
    "...........#...........",
  ],
  middleB: [
    ".......................",
    "#.....................#",
    "###.................###",
    "#####.....###.....#####",
    ".#######.#####.#######.",
    "...########o########...",
    "....###############....",
    "....##o####o####o##....",
    ".....#############.....",
    ".....###.#####.###.....",
    ".....##...###...##.....",
    "..........###..........",
    "...........#...........",
  ],
  middlePost: [
    "......###########......",
    ".....#############.....",
    "####.######o######.####",
    "#######################",
    "##o#################o##",
    "#######################",
    "####.######o######.####",
    ".....#############.....",
    ".....##.#######.##.....",
    "......#..#####..#......",
    ".........#####.........",
    "..........###..........",
    "...........#...........",
  ],
  middleStalk: [
    "...........#...........",
    "..........###..........",
    ".....#...#####...#.....",
    "....###.#######.###....",
    "...#################...",
    "..########o#o########..",
    ".#####################.",
    "###o#####o###o#####o###",
    "###..#############..###",
    "##....#####.#####....##",
    "##.....###...###.....##",
    "#.......#.....#.......#",
    "#.....................#",
  ],
  middleDrift: [
    ".......................",
    ".......................",
    ".......#########.......",
    ".....#############.....",
    "..########o#o########..",
    "#######################",
    "#o##o##o##o#o##o##o##o#",
    "#######################",
    "..###################..",
    ".....#############.....",
    ".......#########.......",
    ".......................",
    ".......................",
  ],
  // A broad flat wing: it goes back and forth across the top.
  largePatrol: [
    ".................................",
    ".................................",
    "#...............................#",
    "###.........#########.........###",
    "#####....###############....#####",
    "##############o###o##############",
    "#################################",
    ".###o#######o#######o#######o###.",
    "...###########################...",
    ".......###################.......",
    "..........#############..........",
    ".............#######.............",
    "...............###...............",
  ],
  // Two hulls on a spar: it fires from one side, then the other.
  largeShift: [
    "..#####...................#####..",
    ".#######.................#######.",
    ".#######.....#######.....#######.",
    ".###o###...###########...###o###.",
    ".###############################.",
    ".##############o#o##############.",
    ".###############################.",
    ".###o###...###########...###o###.",
    ".#######.....#######.....#######.",
    ".#######......#####......#######.",
    "..#####........###........#####..",
    "...###..........#..........###...",
    "....#.......................#....",
  ],
  // Claws reaching down: it comes to the middle and goes back.
  largeRetreat: [
    "..............#####..............",
    "...........###########...........",
    ".....#######################.....",
    "..###########o#####o###########..",
    ".###############################.",
    "####o#######################o####",
    "#####..###################..#####",
    "####....#####o#####o#####....####",
    "###......###############......###",
    "###.......#############.......###",
    "##.........#####.#####.........##",
    "##..........###...###..........##",
    "#............#.....#............#",
  ],
  // A wedge: it flies a triangle.
  largeCircuit: [
    "#################################",
    ".###############################.",
    "..####o###################o####..",
    "...###########################...",
    "....#########o#####o#########....",
    ".....#######################.....",
    "......#####################......",
    ".......####o#########o####.......",
    "........#################........",
    ".........###############.........",
    "..........#############..........",
    "............#########............",
    "..............#####..............",
  ],
  // A spearhead with swept wings: it comes forward.
  largeLunge: [
    "###...........................###",
    "#####.........#####.........#####",
    ".######.....#########.....######.",
    "..#######..###########..#######..",
    "....########o#######o########....",
    "......#####################......",
    ".......####o#########o####.......",
    "........#################........",
    ".........###############.........",
    "..........#####o#o#####..........",
    "...........###########...........",
    "............#########............",
    "..............#####..............",
  ],
  // A long bar with guns under it: it crosses the top.
  largeStrafe: [
    ".................................",
    ".................................",
    "..#############################..",
    ".###############################.",
    "####o####o####o###o####o####o####",
    "#################################",
    ".###############################.",
    "..##..###..###..#..###..###..##..",
    "..##..###..###..#..###..###..##..",
    "..##...#....#...#...#....#...##..",
    "................#................",
    ".................................",
    ".................................",
  ],
  // Wavy wings: it sways from side to side.
  middleSway: [
    ".......................",
    "#.........###.........#",
    "##.....#########.....##",
    "###..#############..###",
    "########o#####o########",
    "#######################",
    "##o#################o##",
    ".#####################.",
    "..##...#########...##..",
    ".##.....#######.....##.",
    "##.......#####.......##",
    "#.........###.........#",
    "...........#...........",
  ],
  // A shield: it stands over the ship.
  middleGuard: [
    "..###################..",
    ".#####################.",
    "####o#############o####",
    "#######################",
    "#########o###o#########",
    "#######################",
    ".#####################.",
    ".#####################.",
    "..###################..",
    "...#################...",
    ".....#############.....",
    ".......#########.......",
    ".........#####.........",
  ],
  // A thin chevron: it crosses on a slant.
  middleSlant: [
    "##...................##",
    "####...............####",
    ".#####...........#####.",
    "..######...#...######..",
    "...#######.#.#######...",
    "....#####o###o#####....",
    ".....#############.....",
    "......###########......",
    ".......#########.......",
    "........###o###........",
    ".........#####.........",
    "..........###..........",
    "...........#...........",
  ],
  // A teardrop: it comes down fast and stays.
  middleDrop: [
    "...........#...........",
    "..........###..........",
    ".........#####.........",
    "........#######........",
    "......###########......",
    "....######o#o######....",
    "...#################...",
    "..###################..",
    "..###o###########o###..",
    "..###################..",
    "...#################...",
    ".....#############.....",
    ".......#########.......",
  ],
  // The ships left, drawn as the mode's own craft.
  iconClose: ["..###..", "..#o#..", "#.###.#", "#######", "#######", "##.#.##", "#..#..#"],
  iconChain: ["...#...", "...#...", "..#o#..", "..###..", "#.###.#", "#######", "##...##"],
  iconGraze: ["...#...", "...#...", "..#o#..", "...#...", "#######", "#..#..#", "...#..."],
  largeA: [
    "###...........................###",
    "####.........................####",
    "#####.......................#####",
    ".######.......#####.......######.",
    "..########..#########..########..",
    "....############o############....",
    "....#########################....",
    ".....###o#######o#######o###.....",
    ".....#######################.....",
    "......####.###########.####......",
    ".......##...#########...##.......",
    "............###.#.###............",
    ".............#.....#.............",
  ],
  // 9 pixels across: as large as the area that can hit (radius 0.45 units).
  bulletA: ["....#....", "...###...", "..##o##..", ".##ooo##.", "##ooooo##", ".##ooo##.", "..##o##..", "...###...", "....#...."],
  bulletB: ["..#...#..", ".#######.", "###ooo###", ".#ooooo#.", ".#ooooo#.", ".#ooooo#.", "###ooo###", ".#######.", "..#...#.."],
  // A square that turns.
  bulletC: ["#########", "#########", "##ooooo##", "##ooooo##", "##ooooo##", "##ooooo##", "##ooooo##", "#########", "#########"],
  bulletD: ["....#....", "...###...", "..#####..", ".##ooo##.", "###ooo###", ".##ooo##.", "..#####..", "...###...", "....#...."],
  // A spiked star.
  bulletE: ["#...#...#", ".#.###.#.", "..#####..", ".##ooo##.", "###ooo###", ".##ooo##.", "..#####..", ".#.###.#.", "#...#...#"],
  bulletF: ["....#....", "#..###..#", ".#######.", ".##ooo##.", "###ooo###", ".##ooo##.", ".#######.", "#..###..#", "....#...."],
  bulletSeed: [".#.", "###", ".#."],
  // One bar of the twin shot: three pixels wide, so that the pair spans
  // exactly the ship's 13 pixels.
  shot: ["###", "###", "###", "###", "###", "###"],
};

// A roll: a craft banking into a sideways move. The half on the side it moves
// toward is drawn narrower. A column that goes is folded into the one inside
// it rather than dropped, so that nothing one pixel wide is lost. The sprite
// keeps its width and its centre; the light and shade are worked out on the
// rolled shape. Only a shape that is the same on both sides rolls: one that
// already points the way it flies says so itself.
const ROLL_PART = 0.16;
const fold = (a, b) => (a === "o" || b === "o" ? "o" : a === "#" || b === "#" ? "#" : ".");
function rollRight(rows, stage) {
  const w = rows[0].length;
  const mid = w >> 1;
  const half = w - 1 - mid;
  const count = Math.max(1, Math.round(half * ROLL_PART * stage));
  const gone = new Set();
  for (let k = 0; k < count; k++) gone.add(mid + Math.round(((k + 1) * half) / (count + 1)));
  return rows.map((row) => {
    const out = [];
    for (let c = 0; c < w; c++) {
      if (gone.has(c)) out[out.length - 1] = fold(out[out.length - 1], row[c]);
      else out.push(row[c]);
    }
    return out.join("").padEnd(w, ".");
  });
}
const ROLLED = new WeakMap();
function rolled(rows, stage) {
  if (stage === 0) return rows;
  let stages = ROLLED.get(rows);
  if (!stages) {
    stages = new Map();
    if (rows.some((row) => row !== [...row].reverse().join(""))) for (const s of [-2, -1, 1, 2]) stages.set(s, rows);
    ROLLED.set(rows, stages);
  }
  if (!stages.has(stage)) stages.set(stage, stage > 0 ? rollRight(rows, stage) : mirrored(rollRight(mirrored(rows), -stage)));
  return stages.get(stage);
}

// The two frames of each small-enemy shape. The column keeps the flapping
// wings; the others blink their lights.
const lightsOff = (rows) => rows.map((row) => row.replaceAll("o", "#"));
const mirrored = (rows) => rows.map((row) => [...row].reverse().join(""));
const SMALL_SHAPES = { column: [SPRITES.enemyA, SPRITES.enemyB] };
for (const id of ["dive", "hover", "hook", "hairpin", "sweep", "diagonal", "stairs", "wave", "zigzag", "cross", "loop", "pincer", "duck", "split", "stagger", "ladder", "swoop", "orbit", "lace", "bounce", "curl"]) SMALL_SHAPES[id] = [SPRITES[id], lightsOff(SPRITES[id])];
// Shapes that lean or point the way they travel have a mirror image.
for (const id of SIDEWAYS) SMALL_SHAPES[`${id}-left`] = SMALL_SHAPES[id].map(mirrored);

// A middle enemy's shape says how it flies. The one that sinks keeps the
// flapping wings; the others blink their lights.
const MIDDLE_SHAPES = {
  sink: [SPRITES.middleA, SPRITES.middleB],
  post: [SPRITES.middlePost, lightsOff(SPRITES.middlePost)],
  stalk: [SPRITES.middleStalk, lightsOff(SPRITES.middleStalk)],
  drift: [SPRITES.middleDrift, lightsOff(SPRITES.middleDrift)],
};
for (const [id, key] of [["sway", "middleSway"], ["guard", "middleGuard"], ["slant", "middleSlant"], ["drop", "middleDrop"]]) MIDDLE_SHAPES[id] = [SPRITES[key], lightsOff(SPRITES[key])];

// A large enemy's shape says how it flies, too (its lights blink).
const LARGE_SHAPES = { descend: SPRITES.largeA, patrol: SPRITES.largePatrol, shift: SPRITES.largeShift, retreat: SPRITES.largeRetreat, circuit: SPRITES.largeCircuit, lunge: SPRITES.largeLunge, strafe: SPRITES.largeStrafe };
const SHIP_ICONS = { normal: SPRITES.iconClose, rapid: SPRITES.iconChain, dense: SPRITES.iconGraze };

// The ship is a different craft in each mode (all 13 pixels across, the
// width of the shot; the point that can be hit is the same).
const SHIP_SHAPES = { normal: SPRITES.shipClose, rapid: SPRITES.shipChain, dense: SPRITES.shipGraze };

const BULLET_SHAPES = [
  [SPRITES.bulletA, SPRITES.bulletB],
  [SPRITES.bulletC, SPRITES.bulletD],
  [SPRITES.bulletE, SPRITES.bulletF],
];

function sprite(ctx, rows, cx, cy, main, trim, tones = null) {
  const w = rows[0].length;
  const h = rows.length;
  const x0 = cx - (w >> 1);
  const y0 = cy - (h >> 1);
  const open = (r, c) => r < 0 || r >= h || c < 0 || c >= w || rows[r][c] === ".";
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = rows[r][c];
      if (ch === ".") continue;
      if (ch === "o") ctx.fillStyle = trim;
      // Lit wins where an edge faces both ways, so a line one pixel wide
      // stays bright.
      else if (tones && (open(r - 1, c) || open(r, c - 1))) ctx.fillStyle = tones[0];
      else if (tones && (open(r + 1, c) || open(r, c + 1))) ctx.fillStyle = tones[1];
      else ctx.fillStyle = main;
      ctx.fillRect(x0 + c, y0 + r, 1, 1);
    }
  }
}

// A filled circle of pixels. every > 1 thins it to a regular scatter.
function disc(ctx, cx, cy, r, color, every = 1) {
  if (r < 0.5) return;
  ctx.fillStyle = color;
  const n = Math.floor(r);
  for (let dy = -n; dy <= n; dy++) {
    const w = Math.floor(Math.sqrt(r * r - dy * dy));
    if (every === 1) ctx.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    else for (let dx = -w; dx <= w; dx++) if ((((dx + dy * 3) % every) + every) % every === 0 && (every === 2 || (dy & 1) === 0)) ctx.fillRect(cx + dx, cy + dy, 1, 1);
  }
}

// An explosion at its present stage (fx.js blast): white light growing, then
// held; fire drawing in from yellow through red; smoke, thinning as it goes.
// The smoke is drawn in a pass of its own (under the enemies).
function drawBlast(ctx, b, smokePass) {
  if (b.delay > 0) return;
  const x = sx(b.x);
  const y = sy(b.y);
  const lit = b.flash + b.hold;
  const smoking = b.age >= lit + b.burn;
  if (smoking !== smokePass) return;
  if (b.age < lit) {
    const grown = Math.min((b.age + 1) / b.flash, 1);
    if (b.age < b.flash) disc(ctx, x, y, b.r * grown + 1, C.reward);
    disc(ctx, x, y, b.r * grown, "#ffffff");
  } else if (!smoking) {
    const k = (b.age - lit) / b.burn;
    disc(ctx, x, y, b.r * (1 - k * 0.35), k < 0.5 ? C.large : C.largeDark, k < 0.75 ? 1 : 2);
    disc(ctx, x, y, b.r * (0.8 - k * 0.7), k < 0.5 ? C.reward : C.big);
    disc(ctx, x, y, b.r * (0.45 - k), "#ffffff");
  } else {
    const k = (b.age - lit - b.burn) / b.smoke;
    disc(ctx, x, y, b.r * (0.7 + k * 0.3), k < 0.5 ? C.smoke : C.smokeThin, k < 0.3 ? 2 : k < 0.7 ? 3 : 5);
  }
}

// A hull in pieces (fx.js wreck): each a slice of the craft's own picture,
// white for a moment and then burnt dark, flat, with no lights: it is not a
// craft any more and cannot be run into. It blinks before it goes.
function drawWreck(ctx, w) {
  const rows = w.kind === "large" ? LARGE_SHAPES[w.pattern] ?? SPRITES.largeA : (MIDDLE_SHAPES[w.pattern] ?? MIDDLE_SHAPES.sink)[0];
  const width = rows[0].length;
  for (const p of w.pieces) {
    if (p.life < 10 && p.life % 4 < 2) continue;
    const age = p.max - p.life;
    ctx.fillStyle = age < 3 ? C.bigHurt : w.kind === "large" ? C.largeDark : C.bigDark;
    const x0 = sx(p.x) - (width >> 1);
    const y0 = sy(p.y) - (rows.length >> 1);
    const from = Math.round(p.from * width);
    const to = Math.round(p.to * width);
    for (let r = 0; r < rows.length; r++) {
      // A ragged cut: every other row is a pixel further over.
      for (let c = from + (r & 1); c < to + (r & 1) && c < width; c++) if (rows[r][c] !== ".") ctx.fillRect(x0 + c, y0 + r, 1, 1);
    }
  }
}

// 3x5 digits and the few capitals the screen needs.
const FONT = {
  0: "###|#.#|#.#|#.#|###", 1: ".#.|##.|.#.|.#.|###", 2: "###|..#|###|#..|###", 3: "###|..#|###|..#|###",
  4: "#.#|#.#|###|..#|..#", 5: "###|#..|###|..#|###", 6: "###|#..|###|#.#|###", 7: "###|..#|..#|.#.|.#.",
  8: "###|#.#|###|#.#|###", 9: "###|#.#|###|..#|###",
  A: "###|#.#|###|#.#|#.#", B: "##.|#.#|##.|#.#|##.", C: "###|#..|#..|#..|###", D: "##.|#.#|#.#|#.#|##.",
  E: "###|#..|##.|#..|###", F: "###|#..|##.|#..|#..", G: "###|#..|#.#|#.#|###", H: "#.#|#.#|###|#.#|#.#",
  I: "###|.#.|.#.|.#.|###", J: "..#|..#|..#|#.#|###", K: "#.#|#.#|##.|#.#|#.#", L: "#..|#..|#..|#..|###",
  M: "#.#|###|###|#.#|#.#", N: "###|#.#|#.#|#.#|#.#", O: "###|#.#|#.#|#.#|###", P: "###|#.#|###|#..|#..",
  Q: "###|#.#|#.#|###|..#", R: "###|#.#|##.|#.#|#.#", S: "###|#..|###|..#|###", T: "###|.#.|.#.|.#.|.#.",
  U: "#.#|#.#|#.#|#.#|###", V: "#.#|#.#|#.#|#.#|.#.", W: "#.#|#.#|###|###|#.#", X: "#.#|#.#|.#.|#.#|#.#",
  Y: "#.#|#.#|.#.|.#.|.#.", Z: "###|..#|.#.|#..|###",
  " ": "...|...|...|...|...", "-": "...|...|###|...|...", "/": "..#|..#|.#.|#..|#..",
  "<": "..#|.#.|#..|.#.|..#", ">": "#..|.#.|..#|.#.|#..",
};

function text(ctx, str, x, y, color, scale = 1) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of str) {
    const rows = (FONT[ch] ?? FONT[" "]).split("|");
    rows.forEach((row, r) => {
      for (let c = 0; c < 3; c++) if (row[c] === "#") ctx.fillRect(cx + c * scale, y + r * scale, scale, scale);
    });
    cx += 4 * scale;
  }
}

// Cheap repeatable scatter for the starfield.
const scatter = (i, m) => ((i * 2654435761) >>> 8) % m;

const FX_COLORS = { ground: C.ground, shot: C.shot, big: C.big, large: C.large, hot: "#ffffff", enemy: C.enemy, laser: C.laser, reward: C.reward, ship: C.ship, danger: C.danger };

// hud is what the page knows and the sim does not: { hiScore, newRecord }.
export function draw(ctx, sim, fx, hud) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = fx && fx.screenFlash > 0 ? "#30304a" : C.space;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  if (fx) {
    const [ox, oy] = shakeOffset(fx);
    ctx.setTransform(1, 0, 0, 1, ox, oy);
  }

  viewX = sim.viewX;
  // Stars slide against the scroll, the near layer more: parallax.
  const scoring = MODES[sim.mode].scoring;
  starfield(ctx, sim.frame, sim.viewX, Math.floor(Math.max(sim.stage.section, 0) / 10));
  drawGround(ctx, sim, fx);
  // One shot, drawn as a pair of bars the width of the ship.
  for (const shot of sim.shots) {
    for (const side of [-1, 1]) sprite(ctx, SPRITES.shot, sx(shot.x + side * SHOT.halfW), sy(shot.y), C.shot, C.shot);
  }

  // What is left of a hull, and the smoke of old explosions, lie under
  // everything that can still hit.
  if (fx) {
    for (const w of fx.wrecks) drawWreck(ctx, w);
    for (const b of fx.blasts) drawBlast(ctx, b, true);
  }

  // The enemy the ship ran into blinks white, so the cause of the miss shows.
  const culprit = fx && fx.culprit && fx.culprit.life % 6 < 3 ? fx.culprit.id : 0;
  for (const enemy of sim.enemies) {
    const roll = fx ? rollStage(fx, enemy.id) : 0;
    if (enemy.boss || enemy.parent) {
      const turned = fx && fx.shields.has(enemy.id) ? fx.shields.get(enemy.id) : 0;
      // (A shot the shield turns does not make the hull flash: it has hardly been touched.)
      drawBossPart(ctx, sim, enemy, (fx && fx.flashes.has(enemy.id) && turned === 0) || enemy.id === culprit, turned);
    } else if (enemy.kind === "large") {
      const flash = (fx && fx.flashes.has(enemy.id)) || enemy.id === culprit;
      const hurt = flash || (enemy.hp <= KINDS.large.hp / 3 && (sim.frame >> 2) % 2 === 0);
      const shape = LARGE_SHAPES[enemy.plan ? enemy.plan.pattern : "descend"] ?? SPRITES.largeA;
      sprite(ctx, rolled(shape, roll), sx(enemy.x), sy(enemy.y) + (flash ? -1 : 0), hurt ? C.bigHurt : C.large, flash ? C.bigHurt : (enemy.age >> 4) % 2 ? C.largeTrim : C.large, hurt ? null : TONES.large);
    } else if (enemy.kind === "middle") {
      // Darkens toward its trim colour as it takes damage.
      const flash = (fx && fx.flashes.has(enemy.id)) || enemy.id === culprit;
      const hurt = flash || (enemy.hp <= KINDS.middle.hp / 3 && (sim.frame >> 2) % 2 === 0);
      // Recoils a pixel while it is being hit.
      const kick = flash ? -1 : 0;
      const frames = MIDDLE_SHAPES[enemy.plan ? enemy.plan.pattern : "sink"] ?? MIDDLE_SHAPES.sink;
      sprite(ctx, rolled(frames[(enemy.age >> 4) % 2 ? 0 : 1], roll), sx(enemy.x), sy(enemy.y) + kick, hurt ? C.bigHurt : C.big, flash ? C.bigHurt : C.bigTrim, hurt ? null : TONES.big);
    } else {
      // Standing still before its next move: it blinks, as a warning.
      const hit = enemy.id === culprit || (flightHolding(enemy) && (sim.frame >> 1) % 2 === 0);
      const formation = enemy.formation ? sim.formations.find((f) => f.id === enemy.formation) : null;
      const pattern = formation && formation.pattern ? formation.pattern : "column";
      const frames = SMALL_SHAPES[SIDEWAYS.includes(pattern) && formation.side < 0 ? `${pattern}-left` : pattern] ?? SMALL_SHAPES.column;
      // CHAIN: one of a formation that is about to get away (low on the
      // screen, or nearly at a wall) flashes in the colour of danger: it is
      // the chain that is about to go.
      const leaving = scoring === "chain" && formation && sim.chain > 0 && (enemy.y < -9 || Math.abs(enemy.x) > 11.5) && (sim.frame >> 2) % 2 === 0;
      sprite(ctx, rolled(frames[(enemy.age >> 3) % 2 ? 0 : 1], roll), sx(enemy.x), sy(enemy.y), hit ? C.bigHurt : leaving ? C.danger : C.enemy, hit ? C.bigHurt : C.enemyTrim, hit || leaving ? null : TONES.enemy);
    }
    // Muzzles blink while a burst is on, so the source of a pattern is plain.
    const type = sim.stage.types[enemy.type];
    if (type && enemy.burst > 0 && (sim.frame >> 1) % 2) {
      ctx.fillStyle = C.dangerCore;
      for (const muzzle of type.muzzles) ctx.fillRect(sx(enemy.x + muzzle.ox) - 1, sy(enemy.y) + 1, 3, 3);
    }
  }
  // A bullet leaving: a white cross on the muzzle, then only its tips.
  if (fx) {
    ctx.fillStyle = C.dangerCore;
    for (const m of fx.muzzles) {
      const x = sx(m.x);
      const y = sy(m.y) + 2;
      if (m.life > 2) {
        ctx.fillRect(x - 4, y, 9, 1);
        ctx.fillRect(x, y - 4, 1, 9);
        ctx.fillRect(x - 1, y - 1, 3, 3);
      } else {
        for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) ctx.fillRect(x + dx, y + dy, 1, 1);
      }
    }
  }

  // The light and the fire of an explosion: over the enemies, under the
  // bullets.
  if (fx) for (const b of fx.blasts) drawBlast(ctx, b, false);

  // A big enemy beyond the screen edge is marked there: it will start firing
  // the moment the view reaches it.
  for (const enemy of sim.enemies) {
    const kind = KINDS[enemy.kind];
    if (!kind.lockable) continue;
    const off = enemy.x - sim.viewX;
    if (Math.abs(off) <= 11 + kind.halfW) continue;
    const x = off > 0 ? CANVAS_WIDTH - 4 : 1;
    const y = sy(enemy.y);
    if ((sim.frame >> 3) % 2) continue;
    ctx.fillStyle = enemy.kind === "middle" ? C.big : C.large;
    for (let i = 0; i < 3; i++) ctx.fillRect(off > 0 ? x + i : x + 2 - i, y - 2 + i, 1, 5 - i * 2);
  }

  // Locks: corner brackets on the target, one pip per lock held on it.
  const held = new Map();
  for (const lock of sim.locks) held.set(lock.target, (held.get(lock.target) ?? 0) + 1);
  for (const [id, count] of held) {
    // On an enemy, or on a core on the ground.
    const core = sim.ground.targets.find((t) => t.id === id);
    const enemy = core ?? sim.enemies.find((e) => e.id === id);
    if (!enemy) continue;
    const kind = core ? { halfW: GROUND.kinds.core.half, halfH: GROUND.kinds.core.half } : KINDS[enemy.kind];
    const hw = Math.round(kind.halfW * UNIT) + 3;
    const hh = Math.round(kind.halfH * UNIT) + 5;
    const cx = sx(enemy.x);
    const cy = sy(enemy.y);
    ctx.fillStyle = (sim.frame >> 2) % 2 ? C.lock : C.laser;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.fillRect(cx + dx * hw - (dx > 0 ? 4 : 0), cy + dy * hh, 5, 1);
      ctx.fillRect(cx + dx * hw, cy + dy * hh - (dy > 0 ? 4 : 0), 1, 5);
    }
    for (let i = 0; i < LOCK.max; i++) {
      ctx.fillStyle = i < count ? C.lock : C.farStar;
      ctx.fillRect(cx - 9 + i * 5, cy - hh - 5, 3, 3);
    }
  }

  if (fx) {
    // A lock snaps in: oversized brackets closing onto the target.
    ctx.fillStyle = C.lock;
    for (const b of fx.brackets) {
      const d = 6 + b.life * 3;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillRect(sx(b.x) + dx * (20 + d) - (dx > 0 ? 6 : 0), sy(b.y) + dy * (8 + d), 7, 2);
        ctx.fillRect(sx(b.x) + dx * (20 + d) - (dx > 0 ? 1 : 0), sy(b.y) + dy * (8 + d) - (dy > 0 ? 5 : 0), 2, 7);
      }
    }
  }

  // Lasers: a thick bright streak from where it was to where it is.
  for (const laser of sim.lasers) {
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const x = laser.px + ((laser.x - laser.px) * i) / steps;
      const y = laser.py + ((laser.y - laser.py) * i) / steps;
      ctx.fillStyle = i === steps ? C.lock : C.laser;
      ctx.fillRect(sx(x) - 1, sy(y) - 1, 3, 3);
    }
  }

  // Danger pulses between two shapes so it never reads as scenery. A bullet
  // that cannot hit yet is a small dark seed. A barrage's bullets share one of
  // three shapes; a carrier (a bullet about to burst) has a hollow, blinking
  // core. All of them are as large as the area that can hit.
  const pulse = (sim.frame >> 3) % 2 === 0;
  for (const bullet of sim.bullets) {
    if (bullet.age < BULLET.armFrames) {
      sprite(ctx, SPRITES.bulletSeed, sx(bullet.x), sy(bullet.y), C.dangerSeed, C.dangerSeed);
      continue;
    }
    const pair = BULLET_SHAPES[bullet.shape ?? 0];
    const carrier = bullet.fuse >= 0;
    const core = carrier ? ((sim.frame >> 1) % 2 ? C.space : C.reward) : C.dangerCore;
    sprite(ctx, pulse ? pair[0] : pair[1], sx(bullet.x), sy(bullet.y), C.danger, core);
  }

  const ship = sim.ship;
  if (sim.phase === "play" && !shipAbsent(ship) && !(shipInvincible(ship) && ship.respawn % 8 < 4)) {
    // GRAZE: how near a bullet has to pass to count, as a faint ring of dots
    // that turns round the ship.
    if (scoring === "graze") {
      ctx.fillStyle = sim.rate > 1 ? C.dangerSeed : C.farStar;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + sim.frame * 0.02;
        ctx.fillRect(sx(ship.x + Math.cos(a) * RATE.graze.radius), sy(ship.y + Math.sin(a) * RATE.graze.radius), 1, 1);
      }
    }
    const shape = rolled(SHIP_SHAPES[sim.mode] ?? SPRITES.ship, fx ? rollStage(fx, "ship") : 0);
    const cx = sx(ship.x);
    const top = sy(ship.y) + 2 - (shape.length >> 1);
    const mid = shape[0].length >> 1;
    // A shot leaving: a flare over each barrel, in the shot's colour (white
    // would only look like more wing), wide with a white core and then small.
    // Under the hull, so the ship keeps its outline.
    if (fx && fx.shotFlash > 0) {
      const bright = fx.shotFlash > 1;
      for (const side of [-1, 1]) {
        const col = mid + side * Math.round(SHOT.halfW * UNIT);
        const wing = shape.findIndex((row) => row[col] !== ".");
        const x = cx + side * Math.round(SHOT.halfW * UNIT);
        const y = top + (wing < 0 ? shape.length >> 1 : wing) - 1;
        ctx.fillStyle = C.shot;
        if (bright) ctx.fillRect(x - 2, y - 3, 5, 3);
        else ctx.fillRect(x - 1, y - 2, 3, 2);
        if (bright) {
          ctx.fillStyle = C.ship;
          ctx.fillRect(x - 1, y - 2, 3, 1);
        }
      }
    }
    sprite(ctx, shape, cx, sy(ship.y) + 2, C.ship, C.shipTrim, TONES.ship);
    // The engine: a flame under the hull, long and short by turns.
    const nozzle = top + shape.findLastIndex((row) => row[mid] !== ".") + 1;
    const long = (sim.frame >> 1) % 2 === 0;
    ctx.fillStyle = C.shot;
    ctx.fillRect(cx, nozzle, 1, long ? 3 : 1);
    if (long) {
      ctx.fillStyle = C.ship;
      ctx.fillRect(cx, nozzle, 1, 1);
    }
    // The point that can be hit.
    ctx.fillStyle = C.danger;
    ctx.fillRect(sx(ship.x) - 1, sy(ship.y) - 1, 3, 3);
    ctx.fillStyle = C.dangerCore;
    ctx.fillRect(sx(ship.x), sy(ship.y), 1, 1);
  }

  // GRAZE: the multiplier as it goes up, said beside the ship the way a close
  // kill's is said where it happened; large from x12.
  if (fx && fx.ratePop && sim.phase === "play" && !shipAbsent(ship) && (fx.ratePop.life > 10 || fx.ratePop.life % 4 < 2)) {
    const scale = fx.ratePop.mult >= 12 ? 2 : 1;
    const label = `X${fx.ratePop.mult}`;
    text(ctx, label, sx(ship.x) + 10, sy(ship.y) - 12 - 3 * scale, C.reward, scale);
  }

  if (fx) {
    for (const r of fx.rings) {
      // A ring of pixels, sparser as it fades.
      ctx.fillStyle = FX_COLORS[r.color];
      const n = Math.max(8, Math.round(r.r * 9));
      const skip = r.life * 2 < r.max ? 2 : 1;
      for (let i = 0; i < n; i += skip) {
        const a = (i / n) * Math.PI * 2;
        ctx.fillRect(sx(r.x + Math.cos(a) * r.r), sy(r.y + Math.sin(a) * r.r), 2, 2);
      }
    }
    for (const p of fx.particles) {
      ctx.fillStyle = p.life * 3 < p.max ? C.farStar : FX_COLORS[p.color];
      const size = p.life * 2 < p.max ? 1 : p.size;
      ctx.fillRect(sx(p.x), sy(p.y), size, size);
    }
    for (const p of fx.popups) {
      if (p.life < 12 && p.life % 4 < 2) continue;
      const scale = p.scale ?? 1;
      text(ctx, p.text, sx(p.x) - p.text.length * 2 * scale, sy(p.y) - 2 * scale, p.color ? FX_COLORS[p.color] : C.hudValue, scale);
    }
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.space;
  ctx.fillRect(0, 0, CANVAS_WIDTH, HUD_HEIGHT);
  ctx.fillStyle = C.farStar;
  ctx.fillRect(0, HUD_HEIGHT - 1, CANVAS_WIDTH, 1);
  text(ctx, "SCORE", 4, 2, C.hud);
  text(ctx, String(sim.score).padStart(9, "0"), 4, 9, C.hudValue);
  drawRate(ctx, sim, fx);
  text(ctx, "SECTOR", 134, 2, C.hud);
  text(ctx, String(sim.stage.section + 1).padStart(3, " "), 146, 9, C.hudValue);
  drawBossGauges(ctx, sim);
  // A new loop: said large, above the sector's own line.
  if (fx && fx.loopBanner && (fx.loopBanner.life > 20 || fx.loopBanner.life % 4 < 2)) {
    centered(ctx, fx.loopBanner.text, HUD_HEIGHT + 34, C.reward, 3);
  }
  if (fx && fx.banner && (fx.banner.life > 16 || fx.banner.life % 4 < 2)) {
    text(ctx, fx.banner.text, 110 - fx.banner.text.length * 4, HUD_HEIGHT + 60, C.hudValue, 2);
  }
  for (let i = 0; i < Math.max(sim.lives, 0); i++) sprite(ctx, SHIP_ICONS[sim.mode] ?? SPRITES.shipIcon, CANVAS_WIDTH - 7 - i * 9, 7, C.ship, C.shipTrim);

  if (hud && hud.label) text(ctx, hud.label, 4, CANVAS_HEIGHT - 8, C.farStar);
  // A new place to start from has opened: said for a few seconds, blinking in.
  if (hud && hud.notice && (hud.notice.life < 200 || hud.notice.life % 8 < 4)) centered(ctx, hud.notice.text, HUD_HEIGHT + 84, C.reward);

  if (sim.phase === "gameover") {
    text(ctx, "GAME OVER", 110 - 36, 156, C.hud, 2);
    if ((sim.frame >> 4) % 2) text(ctx, "PUSH SHOT", 110 - 18, 180, C.hudValue);
    if (hud && hud.hiScore !== undefined) {
      const line = hud.newRecord ? "NEW HI-SCORE" : `HI-SCORE ${hud.hiScore}`;
      if (!hud.newRecord || (sim.frame >> 3) % 2) text(ctx, line, 110 - line.length * 2, 200, hud.newRecord ? C.reward : C.hud);
    }
  }
}

// The grid a boss part's hull is laid down on: wide enough for the large
// boss's deck, with the part's centre at (HULL_X, HULL_Y).
const HULL_W = 61;
const HULL_H = 33;
const HULL_X = 30;
const HULL_Y = 16;

// A boss, drawn from mirrored blocks. The middle boss is a red manta: a hull
// with swept shoulders and a prow toward the ship. The large boss is a steel
// fortress: a long deck, a tower behind it and two prongs ahead. Wings are
// gun pods; the large boss's outer pair are blades. A boss flickers while it
// comes in, when nothing can touch it yet. In the last seconds before it
// gives up and goes, it dims and lights by turns, faster as the time runs out.
// shielded: frames since a shot was last turned by the body's shield.
function drawBossPart(ctx, sim, enemy, flash, shielded = 0) {
  if (enemy.entering && (sim.frame >> 1) % 2) return;
  const body = enemy.parent ? sim.enemies.find((e) => e.id === enemy.parent) : enemy;
  const big = body && body.kind === "bigboss";
  const kind = KINDS[enemy.kind];
  const cx = sx(enemy.x);
  const cy = sy(enemy.y) + (flash ? -1 : 0);
  const hurt = flash || (enemy.hp <= kind.hp / 4 && (sim.frame >> 2) % 2 === 0);
  const going = body && bossWarning(body) && (sim.frame >> (bossFramesLeft(body) <= BOSS.warnFrames / 3 ? 2 : 3)) % 2 === 0;
  const main = hurt ? C.bigHurt : going ? (big ? C.steelDark : C.largeDark) : big ? C.steel : C.large;
  const dark = hurt ? C.bigHurt : big ? C.steelDark : C.largeDark;
  const trim = flash ? C.bigHurt : big ? C.large : C.largeTrim;
  const tones = hurt || going ? null : big ? TONES.steel : TONES.large;
  const block = (x, y, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(cx + x, cy + y, w, h);
  };
  // The hull is laid down as plates on a small grid and painted in one pass,
  // so that the main colour's outline is lit and shaded the way a sprite's
  // is (TONES).
  const hull = new Array(HULL_W * HULL_H).fill(null);
  const plate = (x, y, w, h, color) => {
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) hull[(r + HULL_Y) * HULL_W + c + HULL_X] = color;
  };
  const open = (c, r) => c < 0 || c >= HULL_W || r < 0 || r >= HULL_H || hull[r * HULL_W + c] === null;
  const paintHull = () => {
    for (let r = 0; r < HULL_H; r++) {
      for (let c = 0; c < HULL_W; c++) {
        const color = hull[r * HULL_W + c];
        if (color === null) continue;
        const toned = tones && color === main;
        if (toned && (open(c, r - 1) || open(c - 1, r))) ctx.fillStyle = tones[0];
        else if (toned && (open(c, r + 1) || open(c + 1, r))) ctx.fillStyle = tones[1];
        else ctx.fillStyle = color;
        ctx.fillRect(cx + c - HULL_X, cy + r - HULL_Y, 1, 1);
      }
    }
  };
  // The same plate on both sides of the centre line.
  const both = (x, y, w, h, color) => {
    plate(x, y, w, h, color);
    plate(-x - w + 1, y, w, h, color);
  };
  if (enemy.parent) {
    // Back to the body: a strut, and along it the beam that holds the body's
    // shield up, pulsing toward the body. Shoot the wing off and it is gone.
    if (body) {
      const from = sx(body.x) - cx;
      block(Math.min(from, 0), -1, Math.abs(from), 3, dark);
      const steps = Math.floor(Math.abs(from) / 4);
      for (let i = 0; i < steps; i++) if ((i + (sim.frame >> 1)) % 3 === 0) block(Math.sign(from) * (Math.abs(from) - i * 4) - 1, 0, 2, 1, C.shot);
    }
    const outer = big && Math.abs(enemy.ox) === KINDS.bigboss.wings[1];
    if (outer) {
      // A blade: broad at the back, narrowing to a point ahead.
      for (let r = 0; r < 8; r++) plate(-11 + r, -8 + r * 2, 23 - r * 2, 2, r === 2 ? trim : main);
      plate(-1, 8, 3, 3, dark);
    } else {
      plate(-12, -6, 25, 9, main);
      plate(-9, -8, 19, 2, dark);
      plate(-8, 3, 17, 3, main);
      plate(-3, 6, 7, 3, dark);
      plate(-9, -3, 19, 2, trim);
    }
    paintHull();
    block(-1, -1, 3, 3, C.bigHurt);
    return;
  }
  if (big) {
    both(1, -4, 26, 9, main);
    plate(-12, -12, 25, 8, main);
    both(14, -9, 6, 5, dark);
    both(6, 5, 8, 6, main);
    both(8, 11, 4, 3, dark);
    plate(-5, 5, 11, 3, dark);
    both(1, -1, 26, 2, trim);
    both(4, -10, 4, 2, C.largeTrim);
    both(20, 2, 3, 2, C.largeTrim);
  } else {
    plate(-8, -10, 17, 17, main);
    both(8, -6, 14, 7, main);
    both(8, 1, 9, 3, main);
    both(17, 1, 4, 2, dark);
    both(10, -10, 4, 4, dark);
    plate(-5, 7, 11, 3, main);
    plate(-2, 10, 5, 2, dark);
    both(1, -3, 20, 2, trim);
    both(4, -8, 3, 2, trim);
  }
  paintHull();
  // The core: lit, and quicker as the hull wears down.
  const lit = (sim.frame >> (enemy.hp <= kind.hp / 2 ? 2 : 4)) % 2 === 0;
  block(-4, -4, 9, 9, C.dangerSeed);
  block(-2, -2, 5, 5, lit ? C.bigHurt : C.danger);
  // While a wing is left, the body is behind a shield: a ring of points
  // around it that turns, and that lights up whole where a shot is turned.
  if (enemy.boss.wings > 0) {
    const struck = shielded > 0;
    const rx = Math.round(kind.halfW * UNIT) + 6;
    const ry = Math.round(kind.halfH * UNIT) + 7;
    const points = 44;
    for (let i = 0; i < points; i++) {
      if (!struck && (i + (sim.frame >> 2)) % 2) continue;
      const a = (i / points) * Math.PI * 2;
      block(Math.round(Math.cos(a) * rx), Math.round(Math.sin(a) * ry), struck ? 2 : 1, struck ? 2 : 1, struck ? C.hudValue : C.shot);
    }
  }
}

// The multiplier, as the mode earns it (score.js).
//   chain: what the next kill pays. It blinks when the chain is lost.
//   close: what the nearest enemy would pay if it were destroyed now, so the
//          value of moving in can be read before the shot.
//   graze: what the next kill pays, with a bar for the part of a step earned
//          so far.
function drawRate(ctx, sim, fx) {
  const scoring = MODES[sim.mode].scoring;
  text(ctx, "RATE", 92, 2, C.hud);
  let rate = killMultiplier(sim, sim.ship.x, sim.ship.y, 99);
  if (scoring === "close") {
    rate = 1;
    for (const enemy of sim.enemies) rate = Math.max(rate, closeMultiplier(distanceTo(sim, enemy.x, enemy.y, KINDS[enemy.kind])));
    for (const target of sim.ground.targets) if (target.hp > 0) rate = Math.max(rate, Math.min(RATE.close.ground, closeMultiplier(distanceTo(sim, target.x, target.y, { halfW: GROUND.kinds[target.kind].half, halfH: GROUND.kinds[target.kind].half }))));
  }
  const blink = scoring === "chain" && fx && fx.chainLost > 0 && fx.chainLost % 8 < 4;
  if (!blink) text(ctx, `X${String(rate).padStart(2, " ")}`, 94, 9, rate > 1 ? C.reward : C.hudValue);
  if (scoring === "graze") {
    const part = sim.rate >= RATE.max ? 1 : sim.rate - Math.floor(sim.rate);
    ctx.fillStyle = C.dangerSeed;
    ctx.fillRect(110, 10, 16, 3);
    ctx.fillStyle = C.reward;
    ctx.fillRect(110, 10, Math.round(16 * part), 3);
  }
}

// A boss's hit points, under the readouts: one long bar for the body and a
// short one for each wing still on, in the order they hang.
function drawBossGauges(ctx, sim) {
  const body = sim.enemies.find((e) => e.boss);
  if (!body) return;
  const bar = (x, w, part) => {
    ctx.fillStyle = C.dangerSeed;
    ctx.fillRect(x, HUD_HEIGHT + 3, w, 3);
    // With every wing shot off, the body's bar turns the colour of a bonus:
    // destroying it now counts in the chain.
    ctx.fillStyle = part.kind === "wing" ? C.largeTrim : body.boss.wings === 0 ? C.reward : C.large;
    ctx.fillRect(x, HUD_HEIGHT + 3, Math.max(Math.ceil((w * part.hp) / KINDS[part.kind].hp), 1), 3);
  };
  bar(60, 100, body);
  // Behind its wings the body's bar is fenced in the shield's colour.
  if (body.boss.wings > 0) {
    ctx.fillStyle = C.shot;
    ctx.fillRect(58, HUD_HEIGHT + 2, 1, 5);
    ctx.fillRect(161, HUD_HEIGHT + 2, 1, 5);
    for (let x = 60; x < 160; x += 4) ctx.fillRect(x, HUD_HEIGHT + 7, 2, 1);
  }
  // About to give up and go: the time it has left, as a blinking line under
  // its bar that shortens toward the middle.
  if (bossWarning(body) && (sim.frame >> 2) % 2 === 0) {
    const w = Math.max(Math.ceil((50 * bossFramesLeft(body)) / BOSS.warnFrames), 1);
    ctx.fillStyle = C.danger;
    ctx.fillRect(110 - w, HUD_HEIGHT + 9, w * 2, 2);
  }
  const wings = sim.enemies.filter((e) => e.parent === body.id);
  for (const wing of wings) {
    const rank = KINDS[body.kind].wings.findIndex((ox) => ox === Math.abs(wing.ox));
    bar(wing.ox < 0 ? 34 - rank * 26 : 164 + rank * 26, 22, wing);
  }
}

const centered = (ctx, str, y, color, scale = 1) => text(ctx, str, Math.round(110 - str.length * 2 * scale), y, color, scale);

const PANELS = [SPRITES.panelA, SPRITES.panelB, SPRITES.panelC];

// Islands and what stands on them, under everything else.
function drawGround(ctx, sim, fx) {
  const size = GROUND.cell * UNIT;
  const unseen = new Set();
  for (const t of sim.ground.targets) {
    if (!t.unseen) continue;
    const island = sim.ground.islands.find((i) => i.id === t.island);
    if (island) unseen.add(`${island.id}:${Math.round((island.rows - 1) / 2 - t.oy / GROUND.cell)}:${Math.round(t.ox / GROUND.cell + (island.cols - 1) / 2)}`);
  }
  for (const island of sim.ground.islands) {
    const left = sx(island.x - (island.cols * GROUND.cell) / 2);
    const top = sy(island.y + (island.rows * GROUND.cell) / 2);
    const plated = (r, c) => r >= 0 && r < island.rows && c >= 0 && c < island.cols && island.cells[r][c];
    const plate = C.plate;
    const seam = C.plateSeam;
    const edge = C.plateEdge;
    for (let r = 0; r < island.rows; r++) {
      for (let c = 0; c < island.cols; c++) {
        if (!island.cells[r][c]) continue;
        const x = left + c * size;
        const y = top + r * size;
        ctx.fillStyle = plate;
        ctx.fillRect(x, y, size, size);
        // Seams between plates, and a rim wherever the island ends: shaded
        // where it faces down or right, lit where it faces up or left.
        ctx.fillStyle = seam;
        ctx.fillRect(x + size - 1, y, 1, size);
        ctx.fillRect(x, y + size - 1, size, 1);
        if (!plated(r + 1, c)) ctx.fillRect(x, y + size - 2, size, 2);
        if (!plated(r, c + 1)) ctx.fillRect(x + size - 2, y, 2, size);
        ctx.fillStyle = edge;
        if (!plated(r - 1, c)) ctx.fillRect(x, y, size, 2);
        if (!plated(r, c - 1)) ctx.fillRect(x, y, 2, size);
        // A plate's own marking, one of three per band. A plate with something
        // hidden on it has none: the only sign there is.
        if (unseen.has(`${island.id}:${r}:${c}`)) continue;
        if (island.look === 0) ctx.fillRect(x + 4, y + 4, 2, 2);
        else if (island.look === 1) ctx.fillRect(x + 3, y + 9, size - 7, 1);
        else {
          ctx.fillRect(x + 4, y + 4, 1, 1);
          ctx.fillRect(x + size - 6, y + size - 6, 1, 1);
        }
      }
    }
  }
  for (const target of sim.ground.targets) {
    const x = sx(target.x);
    const y = sy(target.y);
    if (target.hp <= 0) {
      sprite(ctx, SPRITES.wreck, x, y, C.wreck, C.wreck);
      continue;
    }
    // Not to be seen until a shot has crossed it.
    if (target.unseen) continue;
    const flash = fx && fx.flashes.has(target.id);
    if (target.rising > 0) {
      // Coming up: a frame closes in on it while it flickers into place.
      // Nothing can destroy it until the frame has closed.
      const h = Math.round((GROUND.kinds.hidden.half + (target.rising / GROUND.rise) * 1.4) * UNIT);
      ctx.fillStyle = C.reward;
      ctx.fillRect(x - h, y - h, h * 2, 1);
      ctx.fillRect(x - h, y + h - 1, h * 2, 1);
      ctx.fillRect(x - h, y - h, 1, h * 2);
      ctx.fillRect(x + h - 1, y - h, 1, h * 2);
      if ((sim.frame >> 1) % 2 === 0) sprite(ctx, SPRITES.panelA, x, y, C.plateDoneEdge, C.reward);
      continue;
    }
    if (target.kind === "bonus" || target.kind === "hidden") {
      // In the colour of a bonus, its facets glinting.
      const glint = ((sim.frame >> 3) + target.id) % 4 === 0;
      sprite(ctx, target.kind === "bonus" ? SPRITES.bonus : SPRITES.panelA, x, y, C.reward, glint ? C.hudValue : C.plateDoneEdge, TONES.reward);
    } else if (target.kind === "wall") {
      // A steel block that fills its plate; it cracks as it is worn down.
      const h = Math.round(GROUND.kinds.wall.half * UNIT);
      ctx.fillStyle = flash ? C.bigHurt : C.steelDark;
      ctx.fillRect(x - h, y - h, h * 2, h * 2);
      ctx.fillStyle = flash ? C.bigHurt : C.steelLight;
      ctx.fillRect(x - h, y - h, h * 2, 1);
      ctx.fillRect(x - h, y - h, 1, h * 2);
      ctx.fillStyle = flash ? C.bigHurt : C.steel;
      ctx.fillRect(x - h + 1, y - h + 1, h * 2 - 3, h * 2 - 3);
      ctx.fillStyle = C.steelDark;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(x + dx * (h - 4) - 1, y + dy * (h - 4) - 1, 2, 2);
      if (target.hp <= 2) {
        ctx.fillRect(x - 5, y - h + 2, 1, 8);
        ctx.fillRect(x - 5, y - h + 9, 6, 1);
        ctx.fillRect(x, y - h + 9, 1, 7);
      }
      if (target.hp <= 1) {
        ctx.fillRect(x + 3, y, 1, h - 2);
        ctx.fillRect(x - 2, y + 4, 6, 1);
      }
    } else if (target.kind === "core") {
      // Its light quickens as it is worn down.
      const worn = target.hp <= GROUND.kinds.core.hp / 2;
      const lit = (sim.frame >> (worn ? 2 : 4)) % 2 === 0;
      sprite(ctx, SPRITES.core, x, y, flash ? C.groundTrim : C.ground, flash || lit ? C.groundTrim : C.plateEdge, flash ? null : TONES.ground);
    } else {
      sprite(ctx, PANELS[target.look % PANELS.length], x, y, C.ground, C.groundTrim, TONES.ground);
    }
  }
}

// Each loop has its own sky: the colour of the stars changes, and they come
// a little faster (to a limit), so that a loop further on looks further on.
const SKIES = [
  ["#3a3f9c", "#9aa0ff"],
  ["#1f6a6a", "#7fe0d8"],
  ["#5a3a8c", "#c9a0ff"],
  ["#6a4a1f", "#ffcf7a"],
  ["#6a2440", "#ff9ab0"],
];
function starfield(ctx, frame, viewX, loop = 0) {
  const [farColor, nearColor] = SKIES[loop % SKIES.length];
  const pace = 1 + Math.min(loop, 5) * 0.12;
  for (let i = 0; i < 40; i++) {
    const far = i % 2 === 0;
    const drift = Math.round(viewX * (far ? 2 : 6));
    const x = (((scatter(i + 1, CANVAS_WIDTH) - drift) % CANVAS_WIDTH) + CANVAS_WIDTH) % CANVAS_WIDTH;
    // Slower than the ground drifts (0.7 pixels a frame): the stars are behind it.
    const y = (scatter(i + 77, CANVAS_HEIGHT) + Math.floor(frame * (far ? 0.3 : 0.6) * pace)) % CANVAS_HEIGHT;
    ctx.fillStyle = far ? farColor : nearColor;
    if (far || ((frame >> 3) + i) % 5 !== 0) ctx.fillRect(x, y, 1, 1);
  }
}

// The title: the name, the best score, how to start, and the three things a
// first-time player has to know. Nothing here touches the sim.
// The run held by the player: said over the frame it stopped on.
export function drawPaused(ctx) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.space;
  ctx.fillRect(66, 150, 88, 28);
  centered(ctx, "PAUSED", 154, C.hudValue, 2);
  centered(ctx, "P  CARRY ON", 168, C.hud);
}

// What each mode is, in a line under its name.
const MODE_LINES = { normal: "STEADY BULLETS - STEADY SHIP", rapid: "FAST SPARSE BULLETS - FAST SHIP", dense: "SLOW GRAZE BULLETS - SLOW SHIP" };
// And how its score multiplier, up to x16, is earned.
const RATE_LINES = { normal: "DESTROY UP CLOSE FOR UP TO X16", rapid: "WIPE OUT FORMATIONS FOR UP TO X16", dense: "GRAZE BULLETS FOR UP TO X16" };

export function drawTitle(ctx, { frame, hiScore, muted, modeName = "CLOSE", modeId = "normal", start = 1, reach = 1 }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.space;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  starfield(ctx, frame, 0);
  centered(ctx, "PARALLAXIA", 60, C.hudValue, 4);
  ctx.fillStyle = C.shipTrim;
  ctx.fillRect(30, 86, 160, 2);
  // The two choices. (main.js takes touches on these rows: TITLE_ROWS.) Each
  // says how it is changed where it stands, by arrows that point the way the
  // stick or the keys go: left and right of the mode, above and below the
  // start sector. They are lit and blink only when there is something that way.
  const blink = (frame >> 4) % 2 === 0;
  centered(ctx, "MODE", 95, C.hud);
  centered(ctx, modeName, 106, C.hudValue, 2);
  const half = modeName.length * 4 + 8;
  ctx.fillStyle = blink ? C.reward : C.hudValue;
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(110 - half - 5 + i, 111 - i, 1, 1 + i * 2);
    ctx.fillRect(110 + half + 4 - i, 111 - i, 1, 1 + i * 2);
  }
  centered(ctx, MODE_LINES[modeId] ?? "", 120, C.shot);
  centered(ctx, `START SECTOR ${start}`, 136, reach > 1 ? C.hudValue : C.hud);
  ctx.fillStyle = blink ? C.reward : C.hudValue;
  for (let i = 0; i < 4; i++) {
    if (start < reach) ctx.fillRect(110 - i, 129 + i, 1 + i * 2, 1);
    if (start > 1) ctx.fillRect(110 - i, 149 - i, 1 + i * 2, 1);
  }
  centered(ctx, "HI-SCORE", 154, C.hud);
  centered(ctx, String(hiScore).padStart(9, "0"), 162, C.hudValue);
  sprite(ctx, SHIP_SHAPES[modeId] ?? SPRITES.ship, 110, 186, C.ship, C.shipTrim, TONES.ship);
  if ((frame >> 4) % 2) centered(ctx, "PUSH SHOT", 204, C.hudValue, 2);
  centered(ctx, "MOVE   ARROWS / WASD / DRAG", 232, C.hud);
  centered(ctx, "SHOT   Z / X / SPACE / TOUCH", 240, C.hud);
  centered(ctx, "HOLD SHOT TO LOCK ON - RELEASE TO FIRE", 256, C.shot);
  centered(ctx, RATE_LINES[modeId] ?? "", 264, C.reward);
  centered(ctx, `${muted ? "M  SOUND OFF" : "M  SOUND ON"}     P  PAUSE`, 304, C.farStar);
}
