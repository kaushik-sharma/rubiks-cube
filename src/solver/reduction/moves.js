// ---------------------------------------------------------------------------
// NxN move layer (no p5 dependency)
//
// Parses cube notation into engine quarter turns ({axis, layer, dir}) for any
// cube size. Notation understood:
//   R  R' R2            outer layer (depth 1)
//   Rw Rw' Rw2  or  r   wide: the outer 2 layers
//   3Rw                 wide: the outer 3 layers (5×5+)
//   2R 2R' 2R2          ONLY the 2nd layer in from that face (a single slice)
// Faces: U D L R F B. Directions reuse the solver's verified FACE_TURN chirality
// (a consistent right-handed system that standard algorithms compose against),
// so hand-written algorithms behave as written.
// ---------------------------------------------------------------------------

import { cube } from "../../cube/model.js";
import { FACE_TURN } from "../cube-model.js";

// Which end of the axis each face sits on (sign of its outer coordinate).
const SIGN = {};
for (const f in FACE_TURN) SIGN[f] = Math.sign(FACE_TURN[f].layer);

// Centered coordinate of the k-th layer counted inward from `face` (k=1 = outer).
function layerCoord(face, k, size) {
  const off = (size - 1) / 2;
  return SIGN[face] * (off - (k - 1));
}

// Expand `q` clockwise quarter turns of one layer into engine moves (minimizing
// count: a 3 becomes a single reverse turn).
function quartersToMoves(axis, layer, cw, q) {
  const out = [];
  const qn = ((q % 4) + 4) % 4;
  if (qn === 0) return out;
  if (qn === 3) out.push({ axis, layer, dir: -cw });
  else for (let i = 0; i < qn; i++) out.push({ axis, layer, dir: cw });
  return out;
}

const TOKEN = /^(\d*)([urfdlbURFDLB])(w?)('|2)?$/;

function tokenMoves(tok, size) {
  const m = TOKEN.exec(tok);
  if (!m) throw new Error("bad move token: " + tok);
  const num = m[1] ? parseInt(m[1], 10) : 0;
  const face = m[2].toUpperCase();
  const wide = m[3] === "w" || m[2] !== face; // 'w' or a lowercase letter = wide
  const q = m[4] === "2" ? 2 : m[4] === "'" ? 3 : 1; // clockwise quarter turns
  const ft = FACE_TURN[face];
  const cw = ft.dir;

  const out = [];
  if (wide) {
    const depth = num || 2;
    for (let k = 1; k <= depth; k++) out.push(...quartersToMoves(ft.axis, layerCoord(face, k, size), cw, q));
  } else {
    const depth = num || 1; // plain R = outer; 2R = 2nd layer only
    out.push(...quartersToMoves(ft.axis, layerCoord(face, depth, size), cw, q));
  }
  return out;
}

// Parse a whitespace-separated algorithm string into engine moves.
export function parseAlg(str, size = cube.size) {
  const out = [];
  for (const tok of str.trim().split(/\s+/)) if (tok) out.push(...tokenMoves(tok, size));
  return out;
}
