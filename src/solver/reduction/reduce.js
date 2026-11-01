// ---------------------------------------------------------------------------
// NxN reduction — orchestrator + 3×3 handoff (no p5 dependency)
//
// Reduction pipeline for 4×4 and 5×5: solve centers, pair edges, then treat the
// result as a 3×3 and finish with the existing Kociemba solver. Under the six
// OUTER face turns a reduced cube is isomorphic to a 3×3 (a face turn moves
// whole edges + corners and leaves the uniform centers uniform), so we:
//   1. build a "virtual 3×3" cubie list (corners scaled to ±1, each paired edge
//      → one edge, each face's centers → one center),
//   2. resolve reduction parity (see below),
//   3. solve the virtual 3×3 and remap every face turn (layer ±1) to the real
//      outer layer (±(size-1)/2).
//
// PARITY DIFFERS BY SIZE:
//   * Even (4×4): no piece is a true 3×3 edge, so a reduced cube can read as an
//     illegal 3×3 — odd edge orientation (OLL, code -3) or an edge/corner
//     permutation-parity mismatch (PLL, code -6). Each is fixed here with a
//     centre/corner-preserving algorithm.
//   * Odd (5×5): the midges, corners and six face centers ARE a real 3×3 — every
//     turn of the 5×5 acts on them as a legal 3×3 move (inner slices don't touch
//     them, the middle slice is a 3×3 slice move). solveCenters puts the face
//     centers back on their canonical faces, so after pairing the virtual 3×3
//     is always legal: there is no parity left at this stage. The 5×5's parity
//     cases (a flipped or swapped wing) are fixed inside pairEdges. The 4×4 algs
//     would be useless here anyway — they move only inner slices, so they can't
//     change the midge-built virtual cube. A nonzero code means a bug: decline.
// The final honesty guard in solve.js re-verifies the whole move list on the real
// cube, so a wrong turn can only ever make us decline, never fake a solve.
// ---------------------------------------------------------------------------

import { applyTurn, FACE_NORMAL, FACES } from "../cube-model.js";
import { solveKociemba, faceletsFrom } from "../kociemba/index.js";
import { toCubieCube, verify } from "../kociemba/cubiecube.js";
import { parseAlg } from "./moves.js";
import { faceOfDir, centersSolved } from "./model.js";
import { solveCenters } from "./centers.js";
import { pairEdges } from "./edges.js";

// Centre- and corner-preserving parity algorithms (inner-slice `2R`/`2L` form,
// which is what this codebase's moves.js expects). Verified: OLL flips a single
// dedge (fixes odd edge orientation); PLL swaps two dedges (fixes the edge/
// corner permutation-parity mismatch). Both keep all dedges paired.
const OLL_PARITY = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2";
const PLL_PARITY = "2R2 U2 F2 2R2 F2 U2 2R2";

const run = (state, moves, push) => { for (const m of moves) { applyTurn(state, m.axis, m.layer, m.dir); if (push) push(m); } };

// Build a virtual 3×3 cubie list from a reduced (centers solved, edges paired)
// state, in the {pos, stickers} format the Kociemba bridge reads.
export function buildVirtual3x3(state) {
  const cubies = [];
  // Corners: scale each coordinate ±(size-1)/2 → ±1; stickers carry over as-is.
  for (const c of state) {
    if (c.stickers.length === 3) {
      cubies.push({ pos: c.pos.map(Math.sign), stickers: c.stickers.map((s) => ({ dir: [...s.dir], color: s.color })) });
    }
  }
  // Centers: one per face, showing that face's current (solved) color. On ODD
  // cubes we read the fixed FACE center (two zero coordinates), so — like the
  // midge choice below — the virtual cube is the true 3×3 skeleton even before
  // the other centers are solved. Once centers are solved every choice agrees.
  for (const f of FACES) {
    const n = FACE_NORMAL[f];
    let color = null;
    for (const c of state) {
      if (c.stickers.length !== 1 || faceOfDir(c.stickers[0].dir) !== f) continue;
      const isFaceCenter = c.pos.filter((v) => v === 0).length === 2;
      if (color === null || isFaceCenter) color = c.stickers[0].color;
      if (isFaceCenter) break;
    }
    cubies.push({ pos: [...n], stickers: [{ dir: [...n], color }] });
  }
  // Edges: one per physical edge location. A paired edge's pieces all agree, so
  // any one of them represents it; its inner coordinate collapses to 0. On ODD
  // cubes we pick the MIDGE (the piece whose along-edge coordinate is 0) as the
  // representative — it is the genuine 3×3 edge, so the virtual cube still
  // reports the true 3×3 skeleton even when the wings are not yet paired.
  const rep = new Map();
  for (const c of state) {
    if (c.stickers.length !== 2) continue;
    const id = c.stickers.map((s) => faceOfDir(s.dir)).sort().join("");
    const isMidge = c.pos.some((v) => v === 0);
    if (rep.has(id) && !isMidge) continue;
    rep.set(id, c);
  }
  for (const c of rep.values()) {
    const pos = c.pos.map((v) => (Math.abs(v) > 1 ? Math.sign(v) : 0));
    cubies.push({ pos, stickers: c.stickers.map((s) => ({ dir: [...s.dir], color: s.color })) });
  }
  return cubies;
}

// Reduction validity of the current reduced state: 0 solvable, -3 OLL parity,
// -6 PLL parity (other codes shouldn't occur for a real reduced cube).
export function reductionParity(state) {
  return verify(toCubieCube(faceletsFrom(buildVirtual3x3(state))));
}

// Full NxN solve (4×4 and 5×5). Mutates `state`, pushes engine moves via `push`.
// Returns true on success. The caller (solve.js) simplifies and re-verifies the moves.
export function solveReduction(state, push, size) {
  if (size !== 4 && size !== 5) return false; // parity handling is only proven for these
  if (!solveCenters(state, push, size)) return false;
  if (!centersSolved(state)) return false;

  if (!pairEdges(state, push, size).paired) return false;

  // Odd cubes: the virtual 3×3 must already be legal (see header) — never apply
  // the even-cube algorithms to them.
  if (size % 2 === 1 && reductionParity(state) !== 0) return false;

  // Even cubes: resolve reduction parity (at most one OLL + one PLL fix are ever needed).
  for (let i = 0; i < 3; i++) {
    const code = reductionParity(state);
    if (code === 0) break;
    if (code === -3) run(state, parseAlg(OLL_PARITY, size), push);
    else if (code === -6) run(state, parseAlg(PLL_PARITY, size), push);
    else return false;
    if (i === 2) return false; // failed to converge — decline honestly
  }
  if (reductionParity(state) !== 0) return false;

  // Finish as a 3×3 and remap each face turn onto the real outer layer.
  const moves3 = solveKociemba(buildVirtual3x3(state));
  if (!moves3) return false;
  const off = (size - 1) / 2;
  for (const m of moves3) {
    const mapped = { axis: m.axis, layer: Math.sign(m.layer) * off, dir: m.dir };
    applyTurn(state, mapped.axis, mapped.layer, mapped.dir);
    push(mapped);
  }
  return true;
}
