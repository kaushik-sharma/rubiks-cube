// ---------------------------------------------------------------------------
// Kociemba two-phase solver — coordinate move tables & pruning tables
//
// These turn the cubie-level model into fast integer transitions:
//   move tables   — coord  --move-->  coord        (transition lookup)
//   pruning tables — coord  -->  lower bound on remaining moves to the goal
//
// Everything is built once (a few seconds, a few MB) and cached. Move tables
// are flat Int32Arrays indexed [coord * 18 + move]; pruning tables are flat
// Uint8Arrays holding exact BFS depths (255 = unfilled). Phase 1 brings the
// cube into the subgroup G1 = <U,D,L2,R2,F2,B2>; phase 2 solves within it.
// ---------------------------------------------------------------------------

import { CubieCube, moveCubes, mergeURtoDF } from "./cubiecube.js";

export const N_MOVE = 18;
export const N_TWIST = 2187;
export const N_FLIP = 2048;
export const N_SLICE1 = 495; // location of the 4 UD-slice edges (C(12,4))
export const N_SLICE2 = 24; // permutation of the 4 UD-slice edges in phase 2
export const N_PARITY = 2;
export const N_URFtoDLF = 20160; // permutation of 6 corners (phase 2)
export const N_FRtoBR = 11880; // location+permutation of the 4 UD-slice edges
export const N_URtoDF = 20160; // permutation of 6 U/D edges (phase 2)
export const N_URtoUL = 1320; // permutation of UR,UF,UL (phase 1)
export const N_UBtoDF = 1320; // permutation of UB,DR,DF (phase 1)

// The 10 moves allowed in phase 2: U,U2,U' D,D2,D' R2 L2 F2 B2.
export const PHASE2_MOVES = [0, 1, 2, 9, 10, 11, 4, 13, 7, 16];

// Exported, lazily-filled tables.
export let twistMove, flipMove, FRtoBR_Move, URFtoDLF_Move, URtoDF_Move, URtoUL_Move, UBtoDF_Move;
export let MergeURtoULandUBtoDF;
export let parityMove;
export let Slice_Twist_Prun, Slice_Flip_Prun;
export let Slice_URFtoDLF_Parity_Prun, Slice_URtoDF_Parity_Prun;

let built = false;

// Fill a move table: for every coordinate value, apply each of the 18 moves and
// record the resulting coordinate. `mult` applies a move-cube; get/set convert
// between the cube and the coordinate.
function buildMoveTable(size, set, get, mult) {
  const table = new Int32Array(size * N_MOVE);
  const a = new CubieCube();
  for (let i = 0; i < size; i++) {
    set(a, i);
    for (let j = 0; j < 6; j++) {
      for (let k = 0; k < 3; k++) {
        mult(a, moveCubes[j]);
        table[i * N_MOVE + 3 * j + k] = get(a);
      }
      mult(a, moveCubes[j]); // 4th application restores the base state
    }
  }
  return table;
}

// Breadth-first fill of a pruning table from the goal coordinate (index 0).
// `neighbors(idx)` yields the indices reachable by the allowed moves.
function buildPruning(size, neighbors) {
  const table = new Uint8Array(size).fill(255);
  table[0] = 0;
  let frontier = [0];
  while (frontier.length) {
    const next = [];
    for (const idx of frontier) {
      const d = table[idx] + 1;
      const ns = neighbors(idx);
      for (let n = 0; n < ns.length; n++) {
        const ni = ns[n];
        if (table[ni] === 255) {
          table[ni] = d;
          next.push(ni);
        }
      }
    }
    frontier = next;
  }
  return table;
}

export function buildTables() {
  if (built) return;

  const cmul = (a, b) => a.cornerMultiply(b);
  const emul = (a, b) => a.edgeMultiply(b);

  twistMove = buildMoveTable(N_TWIST, (a, i) => a.setTwist(i), (a) => a.getTwist(), cmul);
  flipMove = buildMoveTable(N_FLIP, (a, i) => a.setFlip(i), (a) => a.getFlip(), emul);
  FRtoBR_Move = buildMoveTable(N_FRtoBR, (a, i) => a.setFRtoBR(i), (a) => a.getFRtoBR(), emul);
  URFtoDLF_Move = buildMoveTable(N_URFtoDLF, (a, i) => a.setURFtoDLF(i), (a) => a.getURFtoDLF(), cmul);
  URtoDF_Move = buildMoveTable(N_URtoDF, (a, i) => a.setURtoDF(i), (a) => a.getURtoDF(), emul);
  URtoUL_Move = buildMoveTable(N_URtoUL, (a, i) => a.setURtoUL(i), (a) => a.getURtoUL(), emul);
  UBtoDF_Move = buildMoveTable(N_UBtoDF, (a, i) => a.setUBtoDF(i), (a) => a.getUBtoDF(), emul);

  // Merge of URtoUL and UBtoDF into URtoDF, valid when both have their edges in
  // the U/D layer (coordinate < 336). Used at the phase-1 -> phase-2 boundary.
  MergeURtoULandUBtoDF = new Int32Array(336 * 336);
  for (let u = 0; u < 336; u++) {
    for (let v = 0; v < 336; v++) MergeURtoULandUBtoDF[u * 336 + v] = mergeURtoDF(u, v);
  }

  // Corner parity flips on a quarter turn (power 1 or 3), not on a half turn.
  parityMove = new Uint8Array(2 * N_MOVE);
  for (let p = 0; p < 2; p++) {
    for (let mv = 0; mv < N_MOVE; mv++) parityMove[p * N_MOVE + mv] = mv % 3 === 1 ? p : 1 - p;
  }

  // Phase-1 pruning: distance to (twist/flip = 0, slice located). Indexed
  // N_SLICE1 * coord + slice, using all 18 moves.
  Slice_Twist_Prun = buildPruning(N_SLICE1 * N_TWIST, (idx) => {
    const twist = Math.floor(idx / N_SLICE1), slice = idx % N_SLICE1;
    const out = [];
    for (let mv = 0; mv < N_MOVE; mv++) {
      const nt = twistMove[twist * N_MOVE + mv];
      const ns = Math.floor(FRtoBR_Move[slice * 24 * N_MOVE + mv] / 24);
      out.push(N_SLICE1 * nt + ns);
    }
    return out;
  });
  Slice_Flip_Prun = buildPruning(N_SLICE1 * N_FLIP, (idx) => {
    const flip = Math.floor(idx / N_SLICE1), slice = idx % N_SLICE1;
    const out = [];
    for (let mv = 0; mv < N_MOVE; mv++) {
      const nf = flipMove[flip * N_MOVE + mv];
      const ns = Math.floor(FRtoBR_Move[slice * 24 * N_MOVE + mv] / 24);
      out.push(N_SLICE1 * nf + ns);
    }
    return out;
  });

  // Phase-2 pruning: indexed (N_SLICE2 * coord + sliceSort) * 2 + parity, using
  // only the 10 phase-2 moves.
  Slice_URFtoDLF_Parity_Prun = buildPruning(N_SLICE2 * N_URFtoDLF * N_PARITY, (idx) => {
    const parity = idx % 2;
    const t = Math.floor(idx / 2);
    const slice = t % N_SLICE2;
    const coord = Math.floor(t / N_SLICE2);
    const out = [];
    for (let m = 0; m < PHASE2_MOVES.length; m++) {
      const mv = PHASE2_MOVES[m];
      const nc = URFtoDLF_Move[coord * N_MOVE + mv];
      const ns = FRtoBR_Move[slice * N_MOVE + mv];
      const np = parityMove[parity * N_MOVE + mv];
      out.push((N_SLICE2 * nc + ns) * 2 + np);
    }
    return out;
  });
  Slice_URtoDF_Parity_Prun = buildPruning(N_SLICE2 * N_URtoDF * N_PARITY, (idx) => {
    const parity = idx % 2;
    const t = Math.floor(idx / 2);
    const slice = t % N_SLICE2;
    const coord = Math.floor(t / N_SLICE2);
    const out = [];
    for (let m = 0; m < PHASE2_MOVES.length; m++) {
      const mv = PHASE2_MOVES[m];
      const nc = URtoDF_Move[coord * N_MOVE + mv];
      const ns = FRtoBR_Move[slice * N_MOVE + mv];
      const np = parityMove[parity * N_MOVE + mv];
      out.push((N_SLICE2 * nc + ns) * 2 + np);
    }
    return out;
  });

  built = true;
}
