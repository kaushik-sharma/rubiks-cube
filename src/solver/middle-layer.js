// ---------------------------------------------------------------------------
// Middle-layer edges (no p5 dependency)
// With the first layer solved, place the 4 E-slice edges using fixed insertion
// algorithms (no runtime search). Each edge is brought to the top layer above
// face fa of its slot; the sequence is chosen by which way it's oriented. An
// edge stuck in the wrong middle slot is first ejected to the top. The
// algorithms (derived offline) preserve the first layer and placed edges.
// ---------------------------------------------------------------------------

import { FACE_NORMAL, centerColor, cubieAt, colorFacing } from "./cube-model.js";
import { parseAlg } from "./moves.js";
import { isEdge, record } from "./state-helpers.js";
import { firstLayerSolved } from "./first-layer.js";

const SLOTS = [
  { key: "FR", faces: ["F", "R"], pos: [1, 0, 1] },
  { key: "FL", faces: ["F", "L"], pos: [-1, 0, 1] },
  { key: "BR", faces: ["B", "R"], pos: [1, 0, -1] },
  { key: "BL", faces: ["B", "L"], pos: [-1, 0, -1] },
];

// Insertion per slot, keyed by orientation at the fa-adjacent top position:
// "A" = the fa-color sticker faces fa, "B" = it faces up.
const INSERT = {
  FR: { A: "F R F' U' F' U F R'", B: "F' U2 F U2 R U R'" },
  FL: { A: "U' L' U L F' L F L'", B: "F U2 F' U2 L' U' L" },
  BR: { A: "U' R' U R B' R B R'", B: "B U2 B' U2 R' U' R" },
  BL: { A: "B L B' U' B' U B L'", B: "B' U2 B U2 L U L'" },
};

// Eject the edge currently in a slot up to the top (to free a misplaced edge).
const EJECT = {
  FR: "R U' R' U2 F' U2 F",
  FL: "L' U L U2 F U2 F'",
  BR: "R' U R U2 B U2 B'",
  BL: "L U' L' U2 B' U2 B",
};

const SLOT_BY_POS = {
  "1,0,1": "FR",
  "-1,0,1": "FL",
  "1,0,-1": "BR",
  "-1,0,-1": "BL",
};

const samePos = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function findEdge(state, colors) {
  const want = new Set(colors);
  return state.find(
    (c) => isEdge(c) && c.stickers.length === 2 && c.stickers.every((s) => want.has(s.color))
  );
}

function middleSolved(state, slot) {
  const c = cubieAt(state, slot.pos);
  return slot.faces.every((f) => colorFacing(c, FACE_NORMAL[f]) === centerColor(state, f));
}

// Solve all four middle-layer edges on `state` (mutating). Returns the engine
// quarter turns used, or null if an edge can't be placed (never fakes).
export function solveMiddleLayer(state) {
  const out = [];

  for (const slot of SLOTS) {
    if (middleSolved(state, slot)) continue;

    const colors = [centerColor(state, slot.faces[0]), centerColor(state, slot.faces[1])];
    let e = findEdge(state, colors);
    if (!e) return null;

    // Stuck in a middle slot: eject it to the top first.
    if (e.pos[1] === 0) {
      record(state, parseAlg(EJECT[SLOT_BY_POS[e.pos.join(",")]]), out);
      e = findEdge(state, colors);
    }

    // Align via U so the edge sits above face fa of the slot.
    const faN = FACE_NORMAL[slot.faces[0]];
    const faU = [faN[0], -1, faN[2]];
    for (let i = 0; i < 4 && !samePos(e.pos, faU); i++) {
      record(state, parseAlg("U"), out);
      e = findEdge(state, colors);
    }
    if (!samePos(e.pos, faU)) return null;

    // Insert based on which way the fa-color sticker faces.
    const o = colorFacing(e, faN) === centerColor(state, slot.faces[0]) ? "A" : "B";
    record(state, parseAlg(INSERT[slot.key][o]), out);

    if (!middleSolved(state, slot)) return null;
  }
  return out;
}

// True when the first two layers are fully solved.
export function twoLayersSolved(state) {
  return firstLayerSolved(state) && SLOTS.every((s) => middleSolved(state, s));
}
