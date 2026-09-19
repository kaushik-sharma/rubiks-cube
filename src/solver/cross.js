// ---------------------------------------------------------------------------
// Cross solver (no p5 dependency)
// Solves the 4 edges of the down (D) face optimally via a precomputed
// breadth-first distance table over the cross sub-state, then gradient descent.
//
// A face turn's effect on a single edge is exactly applyQuarterTurn() on its
// position and its sticker direction, so the whole search runs on bare vectors
// — no orientation coordinates to get subtly wrong. The table is built once
// (~190k states) and cached for the lifetime of the page.
// ---------------------------------------------------------------------------

import { applyQuarterTurn } from "../cube/model.js";
import { FACE_NORMAL, centerColor, applyTurn } from "./cube-model.js";
import { HTM } from "./moves.js";

const AX = { x: 0, y: 1, z: 2 };
const posIndex = (p) => (p[0] + 1) * 9 + (p[1] + 1) * 3 + (p[2] + 1);
const dirIndex = (d) =>
  d[0] === 1 ? 0 : d[0] === -1 ? 1 : d[1] === 1 ? 2 : d[1] === -1 ? 3 : d[2] === 1 ? 4 : 5;

// Geometric transform of one edge's (position, Dcolor-sticker direction) by an
// HTM move — identical to how applyTurn would move that cubie.
function moveEdge(pos, dir, move) {
  for (const t of move.turns) {
    if (pos[AX[t.axis]] === t.layer) {
      pos = applyQuarterTurn(pos, t.axis, t.dir);
      dir = applyQuarterTurn(dir, t.axis, t.dir);
    }
  }
  return [pos, dir];
}

// Pack the 4 edges' (position, direction) into a single integer key. Each edge
// is 0..161 (27 positions × 6 directions), so base-162 keeps them distinct.
const encode = (edges) => {
  let k = 0;
  for (const [p, d] of edges) k = k * 162 + (posIndex(p) * 6 + dirIndex(d));
  return k;
};

// Solved homes for the 4 cross edges in [F, R, B, L] order: each sits in its
// D-layer slot with the Dcolor sticker facing straight down (+y).
const HOMES = [
  [[0, 1, 1], [0, 1, 0]], // DF
  [[1, 1, 0], [0, 1, 0]], // DR
  [[0, 1, -1], [0, 1, 0]], // DB
  [[-1, 1, 0], [0, 1, 0]], // DL
];

let DIST = null; // Map<encoding, distance-to-solved>

function buildTable() {
  DIST = new Map();
  const start = HOMES.map(([p, d]) => [[...p], [...d]]);
  DIST.set(encode(start), 0);
  let frontier = [start];
  let dist = 0;
  while (frontier.length) {
    const next = [];
    for (const edges of frontier) {
      for (const move of HTM) {
        const moved = edges.map(([p, d]) => moveEdge(p, d, move));
        const k = encode(moved);
        if (!DIST.has(k)) {
          DIST.set(k, dist + 1);
          next.push(moved);
        }
      }
    }
    frontier = next;
    dist++;
  }
}

// Read the current (position, Dcolor-sticker direction) of the 4 cross edges,
// in [F, R, B, L] order, identifying each by its {Dcolor, sideColor} pair.
function readTargets(state) {
  const Dcolor = centerColor(state, "D");
  const targets = [];
  for (const side of ["F", "R", "B", "L"]) {
    const sc = centerColor(state, side);
    let found = null;
    for (const c of state) {
      if (c.pos.filter((v) => v === 0).length !== 1) continue; // edges only
      const cols = c.stickers.map((s) => s.color);
      if (cols.includes(Dcolor) && cols.includes(sc)) {
        const ds = c.stickers.find((s) => s.color === Dcolor);
        found = [[...c.pos], [...ds.dir]];
        break;
      }
    }
    if (!found) return null; // malformed state — fail honestly
    targets.push(found);
  }
  return targets;
}

// Solve the cross on `state` (mutating it). Returns the list of engine quarter
// turns used, or null if the state is unreachable in the table (never fakes).
export function solveCross(state) {
  if (!DIST) buildTable();
  let edges = readTargets(state);
  if (!edges) return null;

  const moves = [];
  let d = DIST.get(encode(edges));
  if (d === undefined) return null;

  while (d > 0) {
    let advanced = false;
    for (const move of HTM) {
      const moved = edges.map(([p, dd]) => moveEdge(p, dd, move));
      if (DIST.get(encode(moved)) === d - 1) {
        for (const t of move.turns) {
          applyTurn(state, t.axis, t.layer, t.dir);
          moves.push({ axis: t.axis, layer: t.layer, dir: t.dir });
        }
        edges = moved;
        d -= 1;
        advanced = true;
        break;
      }
    }
    if (!advanced) return null; // exact table guarantees this never happens
  }
  return moves;
}
