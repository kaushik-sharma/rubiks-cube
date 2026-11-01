// ---------------------------------------------------------------------------
// NxN reduction — orchestrator + 3×3 handoff (no p5 dependency)
//
// Reduction pipeline for an even cube (4×4): solve centers, pair edges into
// dedges, then treat the result as a 3×3 and finish with the existing Kociemba
// solver. Under the six OUTER face turns a reduced 4×4 is isomorphic to a 3×3
// (a face turn moves whole dedges + corners and leaves the uniform centers
// uniform), so we:
//   1. build a "virtual 3×3" cubie list (corners scaled ±1.5→±1, each dedge → one
//      edge, each face's centers → one center),
//   2. detect the two reduction parities via the Kociemba validator — odd edge
//      orientation (OLL) or an edge/corner permutation-parity mismatch (PLL) —
//      and fix each with a centre/corner-preserving algorithm,
//   3. solve the virtual 3×3 and remap every face turn (layer ±1) to the 4×4
//      outer layer (±1.5).
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
  // Centers: one per face, showing that face's current (solved) color.
  for (const f of FACES) {
    const n = FACE_NORMAL[f];
    let color = null;
    for (const c of state) if (c.stickers.length === 1 && faceOfDir(c.stickers[0].dir) === f) { color = c.stickers[0].color; break; }
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

// Full 4×4 solve. Mutates `state`, pushes engine moves via `push`. Returns true
// on success. The caller (solve.js) simplifies and re-verifies the moves.
export function solveReduction(state, push, size) {
  if (!solveCenters(state, push, size)) return false;
  if (!centersSolved(state)) return false;

  if (!pairEdges(state, push, size).paired) return false;

  // Resolve reduction parity (at most one OLL + one PLL fix are ever needed).
  for (let i = 0; i < 3; i++) {
    const code = reductionParity(state);
    if (code === 0) break;
    if (code === -3) run(state, parseAlg(OLL_PARITY, size), push);
    else if (code === -6) run(state, parseAlg(PLL_PARITY, size), push);
    else return false;
    if (i === 2) return false; // failed to converge — decline honestly
  }
  if (reductionParity(state) !== 0) return false;

  // Finish as a 3×3 and remap each face turn onto the 4×4 outer layer.
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
