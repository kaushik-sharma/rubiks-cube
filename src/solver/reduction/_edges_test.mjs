// Edge pairing for every supported size. Pairing must reach 12/12 solid edges
// without disturbing the centers solved before it. 5×5 is the harder case: an
// edge is three pieces (midge + two wings), and making one solid pins the
// orientation, which is what forces the odd parity operators into the library.
import { buildCubies } from "../../cube/model.js";
import { readState, applyTurn } from "../cube-model.js";
import { solveCenters } from "./centers.js";
import { pairEdges } from "./edges.js";
import { centersSolved, faceOfDir, faceOfColor } from "./model.js";

const AXES = ["x", "y", "z"];
function scramble(size, n) {
  buildCubies(size);
  const st = readState();
  const off = (size - 1) / 2;
  const layers = []; for (let i = 0; i < size; i++) layers.push(i - off);
  for (let i = 0; i < n; i++) applyTurn(st, AXES[(Math.random()*3)|0], layers[(Math.random()*size)|0], Math.random()<0.5?1:-1);
  return st;
}
// Every piece at an edge location showing the same color pair.
function solidEdges(state) {
  const byLoc = new Map();
  for (const c of state) {
    if (c.stickers.length !== 2) continue;
    const faces = c.stickers.map((s) => faceOfDir(s.dir)).sort();
    const sig = faces.map((f) => faceOfColor(c.stickers.find((s) => faceOfDir(s.dir) === f).color)).join("");
    const id = faces.join("");
    if (!byLoc.has(id)) byLoc.set(id, []);
    byLoc.get(id).push(sig);
  }
  let n = 0;
  for (const sigs of byLoc.values()) if (sigs.every((s) => s === sigs[0])) n++;
  return n;
}

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) fails++; };

for (const [size, N] of [[4, 60], [5, 25]]) {
  let paired = 0, brokeCenters = 0, total = 0, worst = 0;
  const t = Date.now();
  for (let i = 0; i < N; i++) {
    const st = scramble(size, 60);
    if (!solveCenters(st, () => {}, size)) continue;
    const moves = [];
    const r = pairEdges(st, (m) => moves.push(m), size);
    if (!centersSolved(st)) brokeCenters++;
    if (r.paired && solidEdges(st) === 12) { paired++; total += moves.length; worst = Math.max(worst, moves.length); }
  }
  check(`${size}×${size}: ${paired}/${N} reach 12/12 | centers broken ${brokeCenters} | avg ${(total/Math.max(paired,1)).toFixed(0)} qtm | max ${worst} | ${((Date.now()-t)/N).toFixed(0)}ms/cube`,
        paired === N && brokeCenters === 0);
}

console.log(fails === 0 ? "\nPAIRING OK ✓" : `\nPAIRING FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
