// ---------------------------------------------------------------------------
// Cube model (no p5 dependency)
// The 27 cubies and the integer math that turns a slice. A cubie stores its
// grid position plus a sticker per outward face (each with a world-space
// direction). The sticker directions ARE the cubie's orientation.
// ---------------------------------------------------------------------------

import { COLORS } from "../config.js";

// Cube state. The cubies live on this object (mutated in place, never the
// binding) so other modules can read them via a live import while
// buildCubies() rebuilds the array. `size` is the cube's dimension N (3/4/5…);
// positions are centered coordinates i-(N-1)/2, so a 3×3 uses -1,0,1 exactly and
// even cubes use half-integers (±0.5, ±1.5…). The rounded quarter-turn math
// preserves these values exactly, so slice membership stays reliable.
export const cube = { cubies: [], size: 3 };

// The centered coordinate of the outermost layer on an axis (max |coord|).
export function outerLayer(size = cube.size) {
  return (size - 1) / 2;
}

// Populate an N×N×N cube in the solved state, N = `size`. Only the visible
// surface shell is built (interior cubies are never seen). Each cubie stores its
// centered position and a sticker per outward-facing side (with that color).
export function buildCubies(size = cube.size) {
  cube.size = size;
  const off = (size - 1) / 2;
  const max = size - 1;
  const cubies = [];
  for (let xi = 0; xi <= max; xi++) {
    for (let yi = 0; yi <= max; yi++) {
      for (let zi = 0; zi <= max; zi++) {
        // Skip interior cubies — they expose no face.
        if (xi > 0 && xi < max && yi > 0 && yi < max && zi > 0 && zi < max) continue;
        const stickers = [];
        if (xi === max) stickers.push({ dir: [1, 0, 0], color: COLORS.right });
        if (xi === 0) stickers.push({ dir: [-1, 0, 0], color: COLORS.left });
        if (yi === 0) stickers.push({ dir: [0, -1, 0], color: COLORS.up });
        if (yi === max) stickers.push({ dir: [0, 1, 0], color: COLORS.down });
        if (zi === max) stickers.push({ dir: [0, 0, 1], color: COLORS.front });
        if (zi === 0) stickers.push({ dir: [0, 0, -1], color: COLORS.back });
        cubies.push({ pos: [xi - off, yi - off, zi - off], stickers });
      }
    }
  }
  cube.cubies = cubies;
}

// Rotate an integer vector by a quarter turn about an axis. These match p5's
// rotateX/Y/Z matrices at ±90°, so the committed state lines up with the
// animation exactly.
export function applyQuarterTurn(v, axis, dir) {
  const [x, y, z] = v;
  if (axis === "x") return dir > 0 ? [x, -z, y] : [x, z, -y];
  if (axis === "y") return dir > 0 ? [z, y, -x] : [-z, y, x];
  return dir > 0 ? [-y, x, z] : [y, -x, z];
}
