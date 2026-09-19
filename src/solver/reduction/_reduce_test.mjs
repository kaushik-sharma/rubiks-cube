// Full 4×4 reduction solve: every scramble must be solved HONESTLY — the emitted
// move list, replayed on a fresh copy of the scramble, has to reach solved.
import { buildCubies } from "../../cube/model.js";
import { readState, applyTurn, isSolved } from "../cube-model.js";
import { parseAlg } from "./moves.js";
import { solveReduction, reductionParity } from "./reduce.js";
import { centersSolved } from "./model.js";

const clone = (s) => s.map((c) => ({ pos: [...c.pos], stickers: c.stickers.map((x) => ({ dir: [...x.dir], color: x.color })) }));
const AXES = ["x", "y", "z"], L = [-1.5, -0.5, 0.5, 1.5];
function scramble4(n) {
  buildCubies(4);
  const st = readState();
  for (let i = 0; i < n; i++) applyTurn(st, AXES[(Math.random()*3)|0], L[(Math.random()*4)|0], Math.random()<0.5?1:-1);
  return st;
}

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? "ok " : "FAIL"} ${name}`); if (!cond) fails++; };

// Parity algorithms detect and self-cancel on the virtual 3×3.
buildCubies(4);
const afterAlg = (alg, times) => { const st = readState(); for (let t = 0; t < times; t++) for (const m of parseAlg(alg, 4)) applyTurn(st, m.axis, m.layer, m.dir); return st; };
const OLL = "2R2 B2 U2 2L U2 2R' U2 2R U2 F2 2R F2 2L' B2 2R2";
const PLL = "2R2 U2 F2 2R2 F2 U2 2R2";
check("OLL alg yields OLL parity (-3)", reductionParity(afterAlg(OLL, 1)) === -3);
check("OLL alg is self-inverse", reductionParity(afterAlg(OLL, 2)) === 0);
check("OLL alg preserves centers", centersSolved(afterAlg(OLL, 1)));
check("PLL alg yields PLL parity (-6)", reductionParity(afterAlg(PLL, 1)) === -6);
check("PLL alg is self-inverse", reductionParity(afterAlg(PLL, 2)) === 0);
check("PLL alg preserves centers", centersSolved(afterAlg(PLL, 1)));

// End-to-end honesty over many scrambles.
let solved = 0, totMoves = 0;
const N = 50, t = Date.now();
for (let i = 0; i < N; i++) {
  const scrambled = scramble4(60);
  const state = clone(scrambled);
  const moves = [];
  if (!solveReduction(state, (m) => moves.push(m), 4)) continue;
  const replay = clone(scrambled);
  for (const m of moves) applyTurn(replay, m.axis, m.layer, m.dir);
  if (isSolved(replay) && isSolved(state)) { solved++; totMoves += moves.length; }
}
check(`end-to-end: ${solved}/${N} solved honestly`, solved === N);
console.log(`avg solution ${(totMoves/Math.max(solved,1)).toFixed(0)} moves | ${Date.now()-t}ms (${((Date.now()-t)/N).toFixed(0)}ms/cube)`);
console.log(fails === 0 ? "\nREDUCTION OK ✓" : `\nREDUCTION FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
