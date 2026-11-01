// Center solving for every supported size. 4×4 and 5×5 differ structurally: the
// odd cube has a rigid face-center frame that must be squared up first, and its
// cheapest operators are too coarse to finish on their own (the library is
// topped up with commutator 3-cycles). Both must reach 100%.
import { buildCubies } from "../../cube/model.js";
import { readState, applyTurn } from "../cube-model.js";
import { solveCenters } from "./centers.js";
import { centersSolved, faceOfColor, faceOfDir } from "./model.js";

const AXES = ["x", "y", "z"];
function scramble(size, n) {
  buildCubies(size);
  const st = readState();
  const off = (size - 1) / 2;
  const layers = []; for (let i = 0; i < size; i++) layers.push(i - off);
  for (let i = 0; i < n; i++) applyTurn(st, AXES[(Math.random()*3)|0], layers[(Math.random()*size)|0], Math.random()<0.5?1:-1);
  return st;
}

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) fails++; };

// The odd-cube face-center frame: six centers with two zero coordinates. A
// middle-slice turn rotates it, and no center operator can put it back, so
// solveCenters has to normalize it up front.
const isFrame = (c) => c.stickers.length === 1 && c.pos.filter((v) => v === 0).length === 2;
const frameHome = (st, size) => st.filter(isFrame).every((c) => faceOfDir(c.pos.map((v) => v / ((size-1)/2))) === faceOfColor(c.stickers[0].color));

buildCubies(5);
const midOnly = readState();
for (const m of [{axis:"x",dir:1},{axis:"y",dir:-1},{axis:"z",dir:1}]) applyTurn(midOnly, m.axis, 0, m.dir);
check("5×5: middle slices do rotate the face-center frame", !frameHome(midOnly, 5));
const fixMoves = [];
solveCenters(midOnly, (m) => fixMoves.push(m), 5);
check("5×5: solveCenters restores the frame", frameHome(midOnly, 5));

for (const [size, N] of [[4, 100], [5, 30]]) {
  let bad = 0, total = 0, worst = 0;
  const t = Date.now();
  for (let i = 0; i < N; i++) {
    const st = scramble(size, 60);
    const moves = [];
    const ok = solveCenters(st, (m) => moves.push(m), size);
    if (!ok || !centersSolved(st) || !frameHome(st, size)) { bad++; continue; }
    total += moves.length; worst = Math.max(worst, moves.length);
  }
  check(`${size}×${size}: ${N - bad}/${N} solved | avg ${(total/Math.max(N-bad,1)).toFixed(0)} qtm | max ${worst} | ${((Date.now()-t)/N).toFixed(0)}ms/cube`, bad === 0);
}

console.log(fails === 0 ? "\nCENTERS OK ✓" : `\nCENTERS FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
