// ---------------------------------------------------------------------------
// NxN reduction — piece model & sub-goal checks (no p5 dependency)
//
// Pieces are classified by sticker count: 1 = center, 2 = edge (a "wing" on
// 4×4+), 3 = corner. The target color scheme is the canonical one from config
// (U shows the up color, etc.); the scramble came from that state, so it is
// always reachable. We solve to it directly — no orientation ambiguity.
// ---------------------------------------------------------------------------

import { COLORS } from "../../config.js";
import { FACE_NORMAL, FACES } from "../cube-model.js";

const key = (v) => v.join(",");

// canonical color -> face letter, and outward direction -> face letter
const COLOR_FACE = new Map([
  [key(COLORS.up), "U"], [key(COLORS.down), "D"],
  [key(COLORS.right), "R"], [key(COLORS.left), "L"],
  [key(COLORS.front), "F"], [key(COLORS.back), "B"],
]);
const DIR_FACE = new Map();
for (const f of FACES) DIR_FACE.set(key(FACE_NORMAL[f]), f);

export function faceOfColor(color) {
  return COLOR_FACE.get(key(color));
}
export function faceOfDir(dir) {
  return DIR_FACE.get(key(dir));
}

export function pieceType(cubie) {
  return cubie.stickers.length === 1 ? "center" : cubie.stickers.length === 2 ? "edge" : "corner";
}

// A fresh solved state for any size (mirrors model.buildCubies without touching
// the live cube) — used to derive algorithm libraries.
export function solvedCube(size) {
  const off = (size - 1) / 2, max = size - 1;
  const cubies = [];
  for (let xi = 0; xi <= max; xi++) {
    for (let yi = 0; yi <= max; yi++) {
      for (let zi = 0; zi <= max; zi++) {
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
  return cubies;
}

// A sticker is "home" when the face it shows on matches its color's target face.
export function stickerHome(s) {
  return faceOfDir(s.dir) === faceOfColor(s.color);
}

// True when every center piece shows on its correct face (each face uniform).
export function centersSolved(state) {
  for (const c of state) {
    if (c.stickers.length === 1 && !stickerHome(c.stickers[0])) return false;
  }
  return true;
}
