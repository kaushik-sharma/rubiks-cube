// Full reduction solve (4×4 and 5×5): every scramble must be solved HONESTLY — the
// emitted move list, replayed on a fresh copy of the scramble, has to reach solved.
import { buildCubies } from "../../cube/model.js";
import { readState, applyTurn, isSolved } from "../cube-model.js";
import { parseAlg } from "./moves.js";
import { solveReduction, reductionParity } from "./reduce.js";
import { centersSolved } from "./model.js";

const clone = (s) => s.map((c) => ({ pos: [...c.pos], stickers: c.stickers.map((x) => ({ dir: [...x.dir], color: x.color })) }));
const AXES = ["x", "y", "z"];
function scramble(size, n) {
  buildCubies(size);
  const st = readState();
  const off = (size - 1) / 2;
  for (let i = 0; i < n; i++) applyTurn(st, AXES[(Math.random()*3)|0], ((Math.random()*size)|0) - off, Math.random()<0.5?1:-1);
  return st;
}

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) fails++; };

// --- 4×4 parity algorithms: detect and self-cancel on the virtual 3×3 ----------
const afterAlg = (size, alg, times) => { buildCubies(size); const st = readState(); for (let t = 0; t < times; t++) for (const m of parseAlg(alg, size)) applyTurn(st, m.axis, m.layer, m.dir); return st; };
const OLL = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2";
const PLL = "2R2 U2 F2 2R2 F2 U2 2R2";
check("4×4: OLL alg yields OLL parity (-3)", reductionParity(afterAlg(4, OLL, 1)) === -3);
check("4×4: OLL alg is self-inverse", reductionParity(afterAlg(4, OLL, 2)) === 0);
check("4×4: OLL alg preserves centers", centersSolved(afterAlg(4, OLL, 1)));
check("4×4: PLL alg yields PLL parity (-6)", reductionParity(afterAlg(4, PLL, 1)) === -6);
check("4×4: PLL alg is self-inverse", reductionParity(afterAlg(4, PLL, 2)) === 0);
check("4×4: PLL alg preserves centers", centersSolved(afterAlg(4, PLL, 1)));

// --- 5×5: why there is no parity stage ---------------------------------------
// The midge+corner+face-center skeleton is a real 3×3, so the 4×4 algs (inner
// slices only) can't change the virtual cube, and no scramble can make it illegal
// once the face centers are home.
check("5×5: OLL alg leaves the virtual 3×3 legal", reductionParity(afterAlg(5, OLL, 1)) === 0);
check("5×5: PLL alg leaves the virtual 3×3 legal", reductionParity(afterAlg(5, PLL, 1)) === 0);
{
  // Scramble with every layer EXCEPT the middle slices: face centers stay put,
  // so the skeleton must read as a legal 3×3 however mixed the rest is.
  let legal = 0;
  const N = 200;
  for (let i = 0; i < N; i++) {
    buildCubies(5); const st = readState();
    for (let k = 0; k < 60; k++) applyTurn(st, AXES[(Math.random()*3)|0], [-2, -1, 1, 2][(Math.random()*4)|0], Math.random()<0.5?1:-1);
    if (reductionParity(st) === 0) legal++;
  }
  check(`5×5: skeleton always a legal 3×3 (${legal}/${N} non-middle-slice scrambles)`, legal === N);
}

// --- end-to-end honesty over many scrambles -----------------------------------
for (const [size, N, turns] of [[4, 50, 60], [5, 30, 80]]) {
  let solved = 0, totMoves = 0, worst = 0;
  const t = Date.now();
  for (let i = 0; i < N; i++) {
    const scrambled = scramble(size, turns);
    const state = clone(scrambled);
    const moves = [];
    if (!solveReduction(state, (m) => moves.push(m), size)) continue;
    const replay = clone(scrambled);
    for (const m of moves) applyTurn(replay, m.axis, m.layer, m.dir);
    if (isSolved(replay) && isSolved(state)) { solved++; totMoves += moves.length; worst = Math.max(worst, moves.length); }
  }
  const ms = Date.now() - t;
  check(`${size}×${size}: end-to-end ${solved}/${N} solved honestly | avg ${(totMoves/Math.max(solved,1)).toFixed(0)} qtm | max ${worst} | ${(ms/N).toFixed(0)}ms/cube`, solved === N);
}

// Unsupported sizes decline instead of guessing.
{
  const st = scramble(6, 30);
  check("6×6: declines (returns false)", solveReduction(st, () => {}, 6) === false);
}

console.log(fails === 0 ? "\nREDUCTION OK ✓" : `\nREDUCTION FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
