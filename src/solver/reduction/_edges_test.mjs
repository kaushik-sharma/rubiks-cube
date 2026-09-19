// Edge PAIRING stage: every scramble should reach 12/12 paired dedges without
// disturbing the solved centers, quickly.
import { buildCubies } from "../../cube/model.js";
import { readState, applyTurn } from "../cube-model.js";
import { solveCenters } from "./centers.js";
import { pairEdges } from "./edges.js";
import { centersSolved } from "./model.js";

const AXES = ["x", "y", "z"], L = [-1.5, -0.5, 0.5, 1.5];
function scramble4(n) {
  buildCubies(4);
  const st = readState();
  for (let i = 0; i < n; i++) applyTurn(st, AXES[(Math.random()*3)|0], L[(Math.random()*4)|0], Math.random()<0.5?1:-1);
  return st;
}

let full = 0, brokeCenters = 0, totMoves = 0, worst = 0;
const N = 100, t = Date.now();
for (let i = 0; i < N; i++) {
  const st = scramble4(60);
  const moves = [];
  if (!solveCenters(st, (m) => moves.push(m), 4) || !centersSolved(st)) { continue; }
  const before = moves.length;
  const r = pairEdges(st, (m) => moves.push(m), 4);
  if (!centersSolved(st)) brokeCenters++;
  if (r.paired) full++;
  totMoves += moves.length - before;
  worst = Math.max(worst, moves.length - before);
}
console.log(`pairing: ${N} cubes | 12/12 paired ${full} | broke-centers ${brokeCenters} | avg pair-moves ${(totMoves/N).toFixed(0)} | worst ${worst} | ${Date.now()-t}ms`);
console.log(full === N && brokeCenters === 0 ? "PAIRING OK ✓" : "PAIRING FAILURES");
process.exit(full === N && brokeCenters === 0 ? 0 : 1);
