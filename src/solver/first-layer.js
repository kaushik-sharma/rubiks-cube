// ---------------------------------------------------------------------------
// First-layer corners (no p5 dependency)
// With the cross solved, place the 4 down-corners using fixed insertion
// algorithms (no runtime search). Each corner is brought above its home slot
// in the top layer, and the sequence is chosen by which way its Dcolor sticker
// faces. The algorithms were derived offline as the reverse of a short
// non-disruptive lift, so they preserve the cross and all placed corners.
// ---------------------------------------------------------------------------

import { centerColor } from "./cube-model.js";
import { parseAlg } from "./moves.js";
import { crossSolved, cornerSolved, findCorner, record } from "./state-helpers.js";

const SLOTS = [
  { pos: [1, 1, 1], faces: ["R", "F"] },
  { pos: [1, 1, -1], faces: ["R", "B"] },
  { pos: [-1, 1, 1], faces: ["L", "F"] },
  { pos: [-1, 1, -1], faces: ["L", "B"] },
];

// Insertion algorithm per slot, keyed by the direction the corner's Dcolor
// sticker faces while it sits in the top layer above the slot.
const INSERT = {
  "R,F": { "+x": "R U R'", "+z": "F' U' F", "-y": "R F R2 F' R'" },
  "R,B": { "+x": "R' U' R", "-z": "B U B'", "-y": "R' B' R2 B R" },
  "L,F": { "-x": "L' U' L", "+z": "F U F'", "-y": "L' F' L2 F L" },
  "L,B": { "-x": "L U L'", "-z": "B' U' B", "-y": "L B L2 B' L'" },
};

// A short non-disruptive trigger that ejects whatever corner sits in a slot up
// into the top layer (reused to free a corner stuck in the bottom layer).
const EJECT = {
  "R,F": "R U R'",
  "R,B": "R' U' R",
  "L,F": "L' U' L",
  "L,B": "L U L'",
};

const parse = parseAlg;
const dirKey = (d) =>
  d[0] === 1 ? "+x" : d[0] === -1 ? "-x" : d[1] === 1 ? "+y" : d[1] === -1 ? "-y" : d[2] === 1 ? "+z" : "-z";
const samePos = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// Solve all four first-layer corners on `state` (mutating). Returns the engine
// quarter turns used, or null if a corner can't be placed (never fakes).
export function solveFirstLayerCorners(state) {
  const out = [];

  for (const slot of SLOTS) {
    if (cornerSolved(state, slot.pos, slot.faces)) continue;

    const colors = [
      centerColor(state, "D"),
      centerColor(state, slot.faces[0]),
      centerColor(state, slot.faces[1]),
    ];
    let corner = findCorner(state, colors);
    if (!corner) return null;

    // If it's stuck in the bottom layer, eject it to the top first.
    if (corner.pos[1] === 1) {
      const fk = [corner.pos[0] === 1 ? "R" : "L", corner.pos[2] === 1 ? "F" : "B"].join(",");
      record(state, parse(EJECT[fk]), out);
      corner = findCorner(state, colors);
    }

    // Rotate U until the corner sits directly above its home slot.
    const above = [slot.pos[0], -1, slot.pos[2]];
    for (let i = 0; i < 4 && !samePos(corner.pos, above); i++) {
      record(state, parse("U"), out);
      corner = findCorner(state, colors);
    }
    if (!samePos(corner.pos, above)) return null;

    // Insert based on which way the Dcolor sticker currently faces.
    const dc = centerColor(state, "D");
    const o = dirKey(corner.stickers.find((s) => s.color === dc).dir);
    const seq = INSERT[slot.faces.join(",")][o];
    if (!seq) return null;
    record(state, parse(seq), out);

    if (!cornerSolved(state, slot.pos, slot.faces)) return null;
  }
  return out;
}

// True when the whole first (down) layer is solved.
export function firstLayerSolved(state) {
  if (!crossSolved(state)) return false;
  return SLOTS.every((s) => cornerSolved(state, s.pos, s.faces));
}
