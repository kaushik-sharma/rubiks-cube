// ---------------------------------------------------------------------------
// Solver cube model (no p5 dependency)
// A lightweight, engine-consistent representation the solver reasons over.
//
// The state is a plain list of cubies { pos:[x,y,z], stickers:[{dir,color}] },
// mirroring the live render model. Crucially, moves are applied with the SAME
// quarter-turn math the animation engine uses (applyQuarterTurn), so a move the
// solver "thinks" it made is physically identical to the one that gets played.
//
// World axes (p5 WEBGL): +x right, +y DOWN, +z toward viewer. So the Up face is
// the -y face. Faces are read relative to the CURRENT center colors, which lets
// us solve a cube whose centers were rotated by slice moves (see solver notes).
// ---------------------------------------------------------------------------

import { cube } from "../cube/model.js";
import { applyQuarterTurn } from "../cube/model.js";
import { COLORS } from "../config.js";

// Outward normal of each face in world space.
export const FACE_NORMAL = {
  U: [0, -1, 0],
  D: [0, 1, 0],
  R: [1, 0, 0],
  L: [-1, 0, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
};

export const FACES = ["U", "D", "R", "L", "F", "B"];

// Base clockwise quarter turn for each face, as an engine move {axis,layer,dir}.
// These match the outer-face entries in config.js NOTATION exactly.
// Solver-internal face turns. Unlike config.js NOTATION (used for the keyboard
// controls), these must form a CONSISTENT chirality so that standard last-layer
// algorithms compose correctly. Each is still a real engine quarter turn, so
// the animation stays correct; the cross/F2L stages are derived against this
// table, so they adapt automatically.
export const FACE_TURN = {
  U: { axis: "y", layer: -1, dir: -1 },
  D: { axis: "y", layer: 1, dir: -1 },
  R: { axis: "x", layer: 1, dir: 1 },
  L: { axis: "x", layer: -1, dir: -1 },
  F: { axis: "z", layer: 1, dir: 1 },
  B: { axis: "z", layer: -1, dir: -1 },
};

const vecEq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

// Deep-clone the live render cube into a solver state we can mutate freely.
export function readState() {
  return cube.cubies.map((c) => ({
    pos: [...c.pos],
    stickers: c.stickers.map((s) => ({ dir: [...s.dir], color: s.color })),
  }));
}

// Build a fresh solved-cube state WITHOUT touching the live render cube — used
// to seed search tables independently of the current scramble.
export function solvedState() {
  const cubies = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const s = [];
        if (x === 1) s.push({ dir: [1, 0, 0], color: COLORS.right });
        if (x === -1) s.push({ dir: [-1, 0, 0], color: COLORS.left });
        if (y === -1) s.push({ dir: [0, -1, 0], color: COLORS.up });
        if (y === 1) s.push({ dir: [0, 1, 0], color: COLORS.down });
        if (z === 1) s.push({ dir: [0, 0, 1], color: COLORS.front });
        if (z === -1) s.push({ dir: [0, 0, -1], color: COLORS.back });
        cubies.push({ pos: [x, y, z], stickers: s });
      }
    }
  }
  return cubies;
}

// Apply one quarter turn (an engine move {axis,layer,dir}) to a solver state,
// mutating the cubies in the affected slice. Returns the state for chaining.
export function applyTurn(state, axis, layer, dir) {
  const idx = { x: 0, y: 1, z: 2 }[axis];
  for (const c of state) {
    if (c.pos[idx] === layer) {
      c.pos = applyQuarterTurn(c.pos, axis, dir);
      for (const s of c.stickers) s.dir = applyQuarterTurn(s.dir, axis, dir);
    }
  }
  return state;
}

// Find the cubie occupying a grid position.
export function cubieAt(state, pos) {
  return state.find((c) => vecEq(c.pos, pos));
}

// Color of the sticker on `cubie` that faces world direction `dir`, or null.
export function colorFacing(cubie, dir) {
  const s = cubie.stickers.find((st) => vecEq(st.dir, dir));
  return s ? s.color : null;
}

// The color of a face's center sticker — defines that face's target color.
export function centerColor(state, face) {
  const n = FACE_NORMAL[face];
  const center = cubieAt(state, n); // center cubie sits at the face normal
  return colorFacing(center, n);
}

// Map each of the 6 current center colors to its face letter. Lets the solver
// reason in logical face terms (U/D/F/L/R/B) regardless of how the centers are
// currently oriented in space — the key to solving slice-scrambled cubes.
export function faceColorMap(state) {
  const map = new Map();
  for (const face of FACES) map.set(centerColor(state, face), face);
  return map;
}

// True when every face shows a single uniform color (orientation-agnostic).
export function isSolved(state) {
  for (const face of FACES) {
    const n = FACE_NORMAL[face];
    let color = null;
    for (const c of state) {
      const sc = colorFacing(c, n);
      if (sc == null) continue;
      if (color == null) color = sc;
      else if (sc !== color) return false;
    }
  }
  return true;
}
