// ---------------------------------------------------------------------------
// Cube actions: scramble, solve, reset, resize (no p5 dependency)
// High-level commands that enqueue moves or rebuild the cube state.
// ---------------------------------------------------------------------------

import { SCRAMBLE_MOVES } from "../config.js";
import { engine } from "./moves.js";
import { cube, buildCubies } from "./model.js";

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const SCRAMBLE_AXES = ["x", "y", "z"];

// The centered layer coordinates of the current cube: i-(N-1)/2 for each slice.
function scrambleLayers() {
  const off = (cube.size - 1) / 2;
  const layers = [];
  for (let i = 0; i < cube.size; i++) layers.push(i - off);
  return layers;
}

// Clear all in-flight / queued move-engine state.
function resetEngine() {
  engine.queue.length = 0;
  engine.current = null;
  engine.log.length = 0;
  engine.solveRequested = false;
  engine.thinking = false;
  engine.plan = null;
  engine.planDone = 0;
}

export function scramble(count = SCRAMBLE_MOVES) {
  // Ignore the request while moves are still pending or animating, so repeated
  // presses don't stack up additional scrambles.
  if (engine.current || engine.queue.length > 0) return;

  engine.plan = null; // clear any previous solver display
  const layers = scrambleLayers(); // all N slices per axis (works for any size)
  let prevAxis = null;
  for (let n = 0; n < count; n++) {
    // Never turn about the same axis twice in a row. This prevents a slice
    // turning then a neighboring slice on the same axis turning back (which
    // reads as a quick reverse/wobble), and also rules out same-slice repeats.
    let axis;
    do {
      axis = pick(SCRAMBLE_AXES);
    } while (axis === prevAxis);
    const layer = pick(layers);
    const dir = Math.random() < 0.5 ? 1 : -1;
    engine.queue.push({ axis, layer, dir });
    prevAxis = axis;
  }
}

// Request a solve. Deferred via a flag so it only runs after any in-flight /
// queued moves have been applied. Supported for 3×3 (two-phase) and 4×4
// (reduction); other sizes are silently ignored (never faked).
export function requestSolve() {
  if (cube.size !== 3 && cube.size !== 4) return;
  engine.solveRequested = true;
  engine.plan = null; // reset the display; it repopulates once solved
}

export function resetCube() {
  resetEngine();
  buildCubies();
}

// Switch to a different cube dimension (rebuilds solved and clears all state).
export function setCubeSize(n) {
  if (n === cube.size) return;
  resetEngine();
  buildCubies(n);
}
