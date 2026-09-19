// ---------------------------------------------------------------------------
// Solver state helpers & sub-goal predicates (no p5 dependency)
// Shared lookups and a tiny depth-limited search used by the LBL stages.
// ---------------------------------------------------------------------------

import {
  FACE_NORMAL,
  centerColor,
  cubieAt,
  colorFacing,
  applyTurn,
} from "./cube-model.js";
import { HTM } from "./moves.js";

const DOWN = [0, 1, 0];

// --- piece lookups --------------------------------------------------------

// Is a cubie an edge (one zero coord) / corner (no zero coord)?
export const isEdge = (c) => c.pos.filter((v) => v === 0).length === 1;
export const isCorner = (c) => c.pos.every((v) => v !== 0);

// Find the corner piece whose three sticker colors equal the given set.
export function findCorner(state, colors) {
  const want = new Set(colors);
  return state.find(
    (c) =>
      isCorner(c) &&
      c.stickers.length === 3 &&
      c.stickers.every((s) => want.has(s.color))
  );
}

// --- sub-goal predicates --------------------------------------------------

// The down cross: each D-layer edge slot holds its edge, Dcolor down + sides matched.
export function crossSolved(state) {
  const Dcolor = centerColor(state, "D");
  for (const side of ["F", "R", "B", "L"]) {
    const n = FACE_NORMAL[side];
    const c = cubieAt(state, [n[0], 1, n[2]]);
    if (colorFacing(c, DOWN) !== Dcolor) return false;
    if (colorFacing(c, n) !== centerColor(state, side)) return false;
  }
  return true;
}

// A first-layer corner slot (bottom corner at `pos`, between `faces`) is solved
// when Dcolor faces down and both side stickers match their centers.
export function cornerSolved(state, pos, faces) {
  const Dcolor = centerColor(state, "D");
  const c = cubieAt(state, pos);
  if (colorFacing(c, DOWN) !== Dcolor) return false;
  for (const f of faces) {
    if (colorFacing(c, FACE_NORMAL[f]) !== centerColor(state, f)) return false;
  }
  return true;
}

// --- restricted depth-limited search -------------------------------------

function make(state, move) {
  for (const t of move.turns) applyTurn(state, t.axis, t.layer, t.dir);
}
function unmake(state, move) {
  for (let i = move.turns.length - 1; i >= 0; i--) {
    const t = move.turns[i];
    applyTurn(state, t.axis, t.layer, -t.dir);
  }
}

function dfs(state, depth, prevFace, moves, goalFn, path) {
  if (depth === 0) return goalFn(state);
  for (const m of moves) {
    if (m.name[0] === prevFace) continue; // never two turns of the same face
    make(state, m);
    path.push(m);
    if (dfs(state, depth - 1, m.name[0], moves, goalFn, path)) return true;
    path.pop();
    unmake(state, m);
  }
  return false;
}

// Iterative-deepening search restricted to faces in `allowedFaces`. Returns the
// shortest list of HTM moves reaching `goalFn`, leaving `state` unchanged, or
// null if none is found within maxDepth.
export function searchMoves(state, allowedFaces, goalFn, maxDepth = 9) {
  if (goalFn(state)) return [];
  const moves = HTM.filter((m) => allowedFaces.includes(m.name[0]));
  for (let depth = 1; depth <= maxDepth; depth++) {
    const path = [];
    if (dfs(state, depth, null, moves, goalFn, path)) return path;
  }
  return null;
}

// Apply a list of HTM moves to `state`, recording the engine quarter turns.
export function record(state, htmMoves, out) {
  for (const m of htmMoves) {
    for (const t of m.turns) {
      applyTurn(state, t.axis, t.layer, t.dir);
      out.push({ axis: t.axis, layer: t.layer, dir: t.dir });
    }
  }
}
