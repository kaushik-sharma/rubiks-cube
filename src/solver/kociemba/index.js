// ---------------------------------------------------------------------------
// Kociemba two-phase solver — engine bridge (no p5 dependency)
//
// Connects the solver to the live cube:
//   * reads the cube into a 54-char facelet string, labelling colors by the
//     CURRENT center colors (center-relative, so slice-scrambled centers solve);
//   * auto-calibrates each face's turn direction against ground truth, so we
//     never assume the engine's rotation handedness;
//   * translates the solver's move indices back into engine quarter turns.
// ---------------------------------------------------------------------------

import { applyQuarterTurn } from "../../cube/model.js";
import { solvedState } from "../cube-model.js";
import { FACE_TURN } from "../cube-model.js";
import { CubieCube, moveCubes, toFaceletString } from "./cubiecube.js";
import { solveFacelets } from "./search.js";

// Kociemba axis order and the index of each face in moveCubes.
const FACES6 = ["U", "R", "F", "D", "L", "B"];
const FACE_INDEX = { U: 0, R: 1, F: 2, D: 3, L: 4, B: 5 };

const key = (c) => c.join(",");

// Which face a sticker's world direction points to.
function faceOf(dir) {
  if (dir[1] === -1) return "U";
  if (dir[0] === 1) return "R";
  if (dir[2] === 1) return "F";
  if (dir[1] === 1) return "D";
  if (dir[0] === -1) return "L";
  return "B";
}

// Facelet index (0..53) of a sticker, from its face and the cubie position.
function faceletIndex(dir, pos) {
  const [x, y, z] = pos;
  if (dir[1] === -1) return 0 + (z + 1) * 3 + (x + 1); // U
  if (dir[0] === 1) return 9 + (y + 1) * 3 + (1 - z); // R
  if (dir[2] === 1) return 18 + (y + 1) * 3 + (x + 1); // F
  if (dir[1] === 1) return 27 + (1 - z) * 3 + (x + 1); // D
  if (dir[0] === -1) return 36 + (y + 1) * 3 + (z + 1); // L
  return 45 + (y + 1) * 3 + (1 - x); // B
}

// Build a 54-char facelet string from a cubie list, mapping each color to the
// face letter of the center currently showing that color. Exported so the NxN
// reducer can validate its virtual 3×3 (parity detection) before solving.
export function faceletsFrom(cubies) {
  const colorToLetter = new Map();
  for (const cb of cubies) {
    if (cb.stickers.length === 1) {
      const s = cb.stickers[0];
      colorToLetter.set(key(s.color), faceOf(s.dir));
    }
  }
  const f = new Array(54);
  for (const cb of cubies) {
    for (const s of cb.stickers) f[faceletIndex(s.dir, cb.pos)] = colorToLetter.get(key(s.color));
  }
  return f.join("");
}

// --- calibration -------------------------------------------------------------
// Determine, per face, the engine `dir` that reproduces a Kociemba clockwise
// quarter turn. Runs once; throws if the facelet geometry is inconsistent (a
// build-time guard — it can only happen if the tables above are wrong).

let engineDir = null;

function cloneCubies(cubies) {
  return cubies.map((c) => ({ pos: [...c.pos], stickers: c.stickers.map((s) => ({ dir: [...s.dir], color: s.color })) }));
}
function turn(cubies, axis, layer, dir) {
  const idx = { x: 0, y: 1, z: 2 }[axis];
  for (const c of cubies) {
    if (c.pos[idx] === layer) {
      c.pos = applyQuarterTurn(c.pos, axis, dir);
      for (const s of c.stickers) s.dir = applyQuarterTurn(s.dir, axis, dir);
    }
  }
  return cubies;
}

function calibrate() {
  if (engineDir) return;
  const solved = solvedState();
  const canonical = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
  if (faceletsFrom(solved) !== canonical) {
    throw new Error("Kociemba: solved cube did not map to the canonical facelet string");
  }
  engineDir = {};
  for (const face of FACES6) {
    const ft = FACE_TURN[face];
    // Kociemba clockwise quarter turn for this face, as a facelet string.
    const k = new CubieCube();
    k.cornerMultiply(moveCubes[FACE_INDEX[face]]);
    k.edgeMultiply(moveCubes[FACE_INDEX[face]]);
    const target = toFaceletString(k);

    const plus = faceletsFrom(turn(cloneCubies(solved), ft.axis, ft.layer, 1));
    const minus = faceletsFrom(turn(cloneCubies(solved), ft.axis, ft.layer, -1));
    if (plus === target) engineDir[face] = 1;
    else if (minus === target) engineDir[face] = -1;
    else throw new Error(`Kociemba: could not calibrate turn direction for face ${face}`);
  }
}

// Translate a list of solver move indices into engine quarter turns.
function toEngineMoves(mvList) {
  const moves = [];
  for (const mv of mvList) {
    const face = FACES6[(mv / 3) | 0];
    const power = (mv % 3) + 1;
    const ft = FACE_TURN[face];
    const d = engineDir[face];
    if (power === 2) {
      moves.push({ axis: ft.axis, layer: ft.layer, dir: d });
      moves.push({ axis: ft.axis, layer: ft.layer, dir: d });
    } else {
      moves.push({ axis: ft.axis, layer: ft.layer, dir: power === 1 ? d : -d });
    }
  }
  return moves;
}

// Solve a cubie list (e.g. the live cube). Returns engine moves, or null if the
// solver cannot honestly solve it.
export function solveKociemba(cubies) {
  calibrate();
  const facelets = faceletsFrom(cubies);
  const mvList = solveFacelets(facelets);
  if (!mvList) return null;
  return toEngineMoves(mvList);
}
