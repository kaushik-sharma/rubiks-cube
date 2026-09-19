// ---------------------------------------------------------------------------
// Kociemba two-phase solver — search
//
// Phase 1 (all 18 moves) drives the cube into the subgroup G1, where corner and
// edge orientation are solved and the 4 UD-slice edges sit in the slice. Phase 2
// (only U,D,L2,R2,F2,B2) finishes the solve. We iteratively deepen phase 1; for
// each phase-1 maneuver found we run phase 2 within a shrinking budget, keeping
// the shortest total. The result is a list of move indices (0..17), where
// move = 3 * axis + (power - 1), axis order U R F D L B.
// ---------------------------------------------------------------------------

import { CubieCube, toCubieCube, verify } from "./cubiecube.js";
import {
  buildTables,
  twistMove, flipMove, FRtoBR_Move, URFtoDLF_Move, URtoDF_Move, URtoUL_Move, UBtoDF_Move,
  MergeURtoULandUBtoDF, parityMove,
  Slice_Twist_Prun, Slice_Flip_Prun, Slice_URFtoDLF_Parity_Prun, Slice_URtoDF_Parity_Prun,
  N_MOVE, N_SLICE1, N_SLICE2, PHASE2_MOVES,
} from "./coordcube.js";

const MAX_PHASE1 = 12; // phase 1 is always solvable within 12 moves
const MAX_TOTAL = 31; // safe upper bound on the full solution length
let TIME_BUDGET_MS = 350; // keep improving the solution until this elapses

// Tune the improvement budget (ms). Lower = faster but slightly longer solutions.
export function setTimeBudget(ms) {
  TIME_BUDGET_MS = ms;
}

// Phase-1 lower bound: moves remaining to reach G1.
function h1(twist, flip, slice) {
  const a = Slice_Twist_Prun[N_SLICE1 * twist + slice];
  const b = Slice_Flip_Prun[N_SLICE1 * flip + slice];
  return a > b ? a : b;
}
// Phase-2 lower bound: moves remaining to the solved state.
function h2(URFtoDLF, URtoDF, slice2, parity) {
  const a = Slice_URtoDF_Parity_Prun[(N_SLICE2 * URtoDF + slice2) * 2 + parity];
  const b = Slice_URFtoDLF_Parity_Prun[(N_SLICE2 * URFtoDLF + slice2) * 2 + parity];
  return a > b ? a : b;
}

const HARD_CAP_MS = 5000; // absolute safety cap, even before a first solution

let best, deadline, hardDeadline;

// True once we should stop: past the improvement budget (with a solution in hand)
// or past the absolute safety cap regardless.
function outOfTime() {
  const now = Date.now();
  return (best && now > deadline) || now > hardDeadline;
}

// Phase-2 IDA*. Returns the move list (length <= limit) or null.
function phase2(URFtoDLF, FRtoBR, URtoDF, parity, depth, limit, lastAxis, path) {
  if (URFtoDLF === 0 && URtoDF === 0 && FRtoBR === 0) return path.slice();
  if (depth === limit) return null;
  if (h2(URFtoDLF, URtoDF, FRtoBR, parity) > limit - depth) return null;
  for (let m = 0; m < PHASE2_MOVES.length; m++) {
    const mv = PHASE2_MOVES[m];
    const axis = (mv / 3) | 0;
    if (axis === lastAxis) continue; // never two consecutive turns on one axis
    path.push(mv);
    const res = phase2(
      URFtoDLF_Move[URFtoDLF * N_MOVE + mv],
      FRtoBR_Move[FRtoBR * N_MOVE + mv],
      URtoDF_Move[URtoDF * N_MOVE + mv],
      parityMove[parity * N_MOVE + mv],
      depth + 1, limit, axis, path
    );
    path.pop();
    if (res) return res;
  }
  return null;
}

// At a phase-1 goal (cube in G1), run phase 2 and update `best` if shorter.
function tryPhase2(URFtoDLF, FRtoBR, URtoUL, UBtoDF, parity, phase1path) {
  const URtoDF = MergeURtoULandUBtoDF[URtoUL * 336 + UBtoDF];
  if (URtoDF < 0) return;
  const slice2 = FRtoBR; // FRtoBR < 24 in G1
  const cap = (best ? best.length : MAX_TOTAL) - phase1path.length - 1;
  const lastAxis = phase1path.length ? (phase1path[phase1path.length - 1] / 3) | 0 : -1;
  for (let lim = h2(URFtoDLF, URtoDF, slice2, parity); lim <= cap; lim++) {
    const res = phase2(URFtoDLF, slice2, URtoDF, parity, 0, lim, lastAxis, []);
    if (res) {
      const full = phase1path.concat(res);
      if (!best || full.length < best.length) best = full;
      return;
    }
  }
}

// Phase-1 DFS to exactly `limit` moves, attempting phase 2 at every G1 leaf.
// Keeps improving `best`; a tighter `best` shrinks the phase-2 budget and prunes
// phase-1 branches, so the search converges quickly on a short solution.
function phase1(twist, flip, FRtoBR, URFtoDLF, URtoUL, UBtoDF, parity, depth, limit, lastAxis, path) {
  const slice = (FRtoBR / 24) | 0;
  if (depth === limit) {
    if (twist === 0 && flip === 0 && slice === 0) tryPhase2(URFtoDLF, FRtoBR, URtoUL, UBtoDF, parity, path);
    return;
  }
  if (h1(twist, flip, slice) > limit - depth) return;
  if (best && depth + 2 >= best.length) return; // phase 1 + at least 1 phase-2 move can't beat best
  for (let mv = 0; mv < N_MOVE; mv++) {
    const axis = (mv / 3) | 0;
    if (axis === lastAxis) continue;
    path.push(mv);
    phase1(
      twistMove[twist * N_MOVE + mv],
      flipMove[flip * N_MOVE + mv],
      FRtoBR_Move[FRtoBR * N_MOVE + mv],
      URFtoDLF_Move[URFtoDLF * N_MOVE + mv],
      URtoUL_Move[URtoUL * N_MOVE + mv],
      UBtoDF_Move[UBtoDF * N_MOVE + mv],
      parityMove[parity * N_MOVE + mv],
      depth + 1, limit, axis, path
    );
    path.pop();
    if (outOfTime()) return;
  }
}

// Solve a 54-char facelet string. Returns a list of move indices, or null if the
// cube is invalid (the caller treats null as "fall back / refuse to fake it").
export function solveFacelets(facelets) {
  buildTables();
  const cc = toCubieCube(facelets);
  if (verify(cc) !== 0) return null;

  const twist = cc.getTwist();
  const flip = cc.getFlip();
  const FRtoBR = cc.getFRtoBR();
  const URFtoDLF = cc.getURFtoDLF();
  const URtoUL = cc.getURtoUL();
  const UBtoDF = cc.getUBtoDF();
  const parity = cc.cornerParity();

  best = null;
  deadline = Date.now() + TIME_BUDGET_MS;
  hardDeadline = Date.now() + Math.max(TIME_BUDGET_MS, HARD_CAP_MS);
  const start = h1(twist, flip, (FRtoBR / 24) | 0);
  for (let L1 = start; L1 <= MAX_PHASE1; L1++) {
    if (best && L1 + 1 >= best.length) break; // phase 1 alone already too long
    phase1(twist, flip, FRtoBR, URFtoDLF, URtoUL, UBtoDF, parity, 0, L1, -1, []);
    if (outOfTime()) break; // keep improving across phase-1 depths until then
  }
  return best;
}
