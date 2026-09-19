// ---------------------------------------------------------------------------
// Last layer (no p5 dependency)
// The U layer can't be solved by single turns without disturbing the finished
// layers, so we work in "macro-moves": short algorithms (plus AUF) that each
// preserve the first two layers. The set is closed under inverse.
//
// For speed, the BFS runs on a COMPACT last-layer state (4 corners + 4 edges,
// each as a permutation index + orientation), not full cubes. Each macro's
// effect is precomputed once as a permutation + orientation twist, so building
// the ~62k-state distance table is fast. Descent then maps the chosen macro
// back to real engine turns.
// ---------------------------------------------------------------------------

import { solvedState, faceColorMap, cubieAt, applyTurn } from "./cube-model.js";
import { parseAlg } from "./moves.js";
import { record } from "./state-helpers.js";

// --- last-layer piece geometry -------------------------------------------

const CORNER_POS = [[1, -1, 1], [1, -1, -1], [-1, -1, -1], [-1, -1, 1]]; // UFR UBR UBL UFL
const EDGE_POS = [[0, -1, 1], [1, -1, 0], [0, -1, -1], [-1, -1, 0]]; // UF UR UB UL

// Per corner slot, the directions of its [up, sideA, sideB] stickers. The index
// of the U-colored sticker among these is the corner's orientation (0/1/2).
const CORNER_DIRS = [
  [[0, -1, 0], [0, 0, 1], [1, 0, 0]], // UFR: up, F, R
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]], // UBR: up, R, B
  [[0, -1, 0], [0, 0, -1], [-1, 0, 0]], // UBL: up, B, L
  [[0, -1, 0], [-1, 0, 0], [0, 0, 1]], // UFL: up, L, F
];

const CORNER_ID = { FRU: 0, BRU: 1, BLU: 2, FLU: 3 };
const EDGE_ID = { FU: 0, RU: 1, BU: 2, LU: 3 };

const UP = [0, -1, 0];
const vecEq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// Read the compact last-layer state {cp, co, ep, eo} from a full cube.
function extract(state, map) {
  const cp = [0, 0, 0, 0], co = [0, 0, 0, 0], ep = [0, 0, 0, 0], eo = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const c = cubieAt(state, CORNER_POS[i]);
    const letters = c.stickers.map((s) => map.get(s.color));
    cp[i] = CORNER_ID[letters.slice().sort().join("")];
    const u = c.stickers.find((s) => map.get(s.color) === "U");
    co[i] = CORNER_DIRS[i].findIndex((d) => vecEq(d, u.dir));
  }
  for (let i = 0; i < 4; i++) {
    const c = cubieAt(state, EDGE_POS[i]);
    const letters = c.stickers.map((s) => map.get(s.color));
    ep[i] = EDGE_ID[letters.slice().sort().join("")];
    const u = c.stickers.find((s) => map.get(s.color) === "U");
    eo[i] = vecEq(u.dir, UP) ? 0 : 1;
  }
  return { cp, co, ep, eo };
}

// --- macro-moves (F2L-preserving), closed under inverse -------------------

const BASE = [
  "U",
  "U2",
  "R U R' U R U2 R'", // Sune
  "F R U R' U' F'", // orient edges
  "R U' R U R U R U' R' U' R2", // edge 3-cycle
  "U R U' L' U R' U' L", // corner mover
];

const invName = (n) => (n.endsWith("2") ? n : n.endsWith("'") ? n[0] : n + "'");
const invAlg = (a) => a.split(/\s+/).reverse().map(invName).join(" ");

// Each macro: its parsed moves (for replay) + its compact transition, computed
// once by applying it to a fresh solved cube and reading the result.
const MACROS = (() => {
  const algs = new Set();
  for (const a of BASE) {
    algs.add(a);
    algs.add(invAlg(a));
  }
  const solvedMap = faceColorMap(solvedState());
  return [...algs].map((a) => {
    const moves = parseAlg(a);
    const s = solvedState();
    for (const m of moves) for (const t of m.turns) applyTurn(s, t.axis, t.layer, t.dir);
    return { moves, t: extract(s, solvedMap) };
  });
})();

// Apply a macro's transition to a compact state.
function step(c, t) {
  const cp = [0, 0, 0, 0], co = [0, 0, 0, 0], ep = [0, 0, 0, 0], eo = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const sc = t.cp[i];
    cp[i] = c.cp[sc];
    co[i] = (c.co[sc] + t.co[i]) % 3;
    const se = t.ep[i];
    ep[i] = c.ep[se];
    eo[i] = (c.eo[se] + t.eo[i]) % 2;
  }
  return { cp, co, ep, eo };
}

const key = (c) => `${c.cp.join("")}${c.co.join("")}${c.ep.join("")}${c.eo.join("")}`;
const SOLVED = { cp: [0, 1, 2, 3], co: [0, 0, 0, 0], ep: [0, 1, 2, 3], eo: [0, 0, 0, 0] };

let DIST = null; // Map<compactKey, distance-to-solved (in macros)>

function buildTable() {
  DIST = new Map();
  DIST.set(key(SOLVED), 0);
  let frontier = [SOLVED];
  let d = 0;
  while (frontier.length) {
    const next = [];
    for (const c of frontier) {
      for (const macro of MACROS) {
        const n = step(c, macro.t);
        const k = key(n);
        if (!DIST.has(k)) {
          DIST.set(k, d + 1);
          next.push(n);
        }
      }
    }
    frontier = next;
    d += 1;
  }
}

// Solve the last layer on `state` (mutating). Returns the engine quarter turns
// used, or null if the state isn't reachable in the table (never fakes).
export function solveLastLayer(state) {
  if (!DIST) buildTable();
  const map = faceColorMap(state);
  let c = extract(state, map);
  let d = DIST.get(key(c));
  if (d === undefined) return null;

  const out = [];
  while (d > 0) {
    let advanced = false;
    for (const macro of MACROS) {
      const n = step(c, macro.t);
      if (DIST.get(key(n)) === d - 1) {
        record(state, macro.moves, out);
        c = n;
        d -= 1;
        advanced = true;
        break;
      }
    }
    if (!advanced) return null; // symmetric table guarantees this won't happen
  }
  return out;
}
