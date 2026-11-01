// ---------------------------------------------------------------------------
// Solver entry point (no p5 dependency)
// Returns the full list of engine quarter turns that solve the live cube.
//
// Primary solver: Kociemba's two-phase algorithm (~20 face turns, near optimal).
// Fallback: the layer-by-layer stages, kept as a proven safety net in case the
// two-phase solver ever declines a state (it shouldn't for a valid cube).
//
// Honesty guard: whichever solver runs, the accumulated solution is replayed on
// a snapshot, and after simplification the FINAL move list is replayed again —
// we only return moves if the cube actually reaches the solved state. Otherwise
// we return null and solve nothing (the solver never "cheats" by recoloring or
// forcing a solved state).
// ---------------------------------------------------------------------------

import { cube } from "../cube/model.js";
import { readState, isSolved, applyTurn } from "./cube-model.js";
import { solveCross } from "./cross.js";
import { solveFirstLayerCorners } from "./first-layer.js";
import { solveMiddleLayer } from "./middle-layer.js";
import { solveLastLayer } from "./last-layer.js";
import { solveKociemba } from "./kociemba/index.js";
import { solveReduction } from "./reduction/reduce.js";

const STAGES = [solveCross, solveFirstLayerCorners, solveMiddleLayer, solveLastLayer];

// Layer-by-layer fallback: run the stages against a snapshot, each verifying its
// own sub-goal. Returns the move list or null if any stage fails.
function solveLayerByLayer() {
  const state = readState();
  const moves = [];
  for (const stage of STAGES) {
    const part = stage(state);
    if (part === null) return null;
    moves.push(...part);
  }
  return isSolved(state) ? moves : null;
}

// Collapse redundant turns. Within a run of consecutive same-AXIS moves the
// layers all commute, so we sum each layer's net quarter-turns (mod 4) and emit
// the minimum: 0 (gone), 1 (one turn), 2 (a half turn), or 3 (one reverse).
// This catches plain repeats (R R' , U U U) and commuting cases (R L R' -> L).
// Repeating to a fixed point lets cancellations cascade: when a run vanishes,
// its same-axis neighbors become adjacent and merge on the next pass.
export function simplify(moves) {
  let arr = moves;
  for (;;) {
    const out = [];
    let i = 0;
    while (i < arr.length) {
      const axis = arr[i].axis;
      const net = new Map(); // layer -> net quarter-turns, first-seen order
      let j = i;
      while (j < arr.length && arr[j].axis === axis) {
        const layer = arr[j].layer;
        net.set(layer, ((((net.get(layer) || 0) + arr[j].dir) % 4) + 4) % 4);
        j++;
      }
      for (const [layer, n] of net) {
        if (n === 0) continue;
        if (n === 3) out.push({ axis, layer, dir: -1 });
        else for (let t = 0; t < n; t++) out.push({ axis, layer, dir: 1 });
      }
      i = j;
    }
    if (out.length === arr.length) return out;
    arr = out;
  }
}

// Compute a solution for the current cube. Returns an array of engine moves
// ({axis, layer, dir} quarter turns), or null if it cannot be solved honestly.
export function computeSolution() {
  if (isSolved(readState())) return [];

  let moves = null;
  if (cube.size === 3) {
    // Two-phase solver first; fall back to layer-by-layer if it declines.
    moves = solveKociemba(cube.cubies) || solveLayerByLayer();
  } else if (cube.size === 4 || cube.size === 5) {
    // NxN reduction: centers → edge pairing → parity → 3×3 hand-off.
    const state = readState();
    const acc = [];
    moves = solveReduction(state, (m) => acc.push(m), cube.size) ? acc : null;
  }
  if (!moves) return null; // no solver could honestly solve this cube/size

  // Tidy the move list, then re-verify the simplified sequence on a fresh
  // snapshot so the honesty guard covers exactly what we return.
  const tidy = simplify(moves);
  const check = readState();
  for (const m of tidy) applyTurn(check, m.axis, m.layer, m.dir);
  if (!isSolved(check)) return null;

  return tidy;
}
