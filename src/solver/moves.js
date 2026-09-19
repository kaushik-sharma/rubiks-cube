// ---------------------------------------------------------------------------
// Solver move set (no p5 dependency)
// The 18 half-turn-metric (HTM) face moves: each of U D R L F B in clockwise,
// counter-clockwise, and double variants. Each move expands to one or two
// engine quarter turns {axis,layer,dir}, so a solved sequence maps directly
// onto the animation queue.
// ---------------------------------------------------------------------------

import { FACE_TURN } from "./cube-model.js";

const ORDER = ["U", "D", "R", "L", "F", "B"];

export const HTM = ORDER.flatMap((f) => {
  const b = FACE_TURN[f];
  const prime = { axis: b.axis, layer: b.layer, dir: -b.dir };
  return [
    { name: f, turns: [b] },
    { name: f + "'", turns: [prime] },
    { name: f + "2", turns: [b, b] },
  ];
});

const BY_NAME = Object.fromEntries(HTM.map((m) => [m.name, m]));

// Parse an algorithm string like "R U R' U2" into a list of HTM moves.
export const parseAlg = (str) =>
  str.split(/\s+/).filter(Boolean).map((n) => BY_NAME[n]);
