// Phase 0 de-risk for the 5×5 solver: the 3×3 HAND-OFF, in isolation.
//
// A 5×5 whose centers are uniform and whose edges are paired into solid
// "tredges" (midge + its two wings all matching) behaves exactly like a 3×3
// under the six OUTER face turns. This test builds such states directly — by
// scrambling a solved 5×5 with outer turns only — and checks that:
//   * the piece model is what we think it is (54 centers / 12 midges / 24 wings),
//   * buildVirtual3x3 reads a reduced 5×5 into a legal 3×3,
//   * the Kociemba solution, remapped from layer ±1 to the 5×5 outer layer ±2,
//     genuinely solves the real 5×5.
// No centers/pairing code is involved, so a failure here is a hand-off bug.
import { buildCubies } from "../../cube/model.js";
import { readState, applyTurn, isSolved } from "../cube-model.js";
import { solveKociemba } from "../kociemba/index.js";
import { faceOfDir, faceOfColor, centersSolved } from "./model.js";
import { buildVirtual3x3, reductionParity } from "./reduce.js";

const SIZE = 5, OFF = (SIZE - 1) / 2;
const clone = (s) => s.map((c) => ({ pos: [...c.pos], stickers: c.stickers.map((x) => ({ dir: [...x.dir], color: x.color })) }));

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) fails++; };

// --- piece model -------------------------------------------------------------
buildCubies(SIZE);
const solved = readState();
const centers = solved.filter((c) => c.stickers.length === 1);
const edges = solved.filter((c) => c.stickers.length === 2);
const corners = solved.filter((c) => c.stickers.length === 3);
// The "along-edge" coordinate is the one that isn't ±OFF; 0 = midge, ±1 = wing.
const alongEdge = (c) => c.pos.find((v) => Math.abs(v) !== OFF);
const midges = edges.filter((c) => alongEdge(c) === 0);

check(`98 cubies (got ${solved.length})`, solved.length === 98);
check(`54 centers (got ${centers.length})`, centers.length === 54);
check(`36 edges (got ${edges.length})`, edges.length === 36);
check(`8 corners (got ${corners.length})`, corners.length === 8);
check(`12 midges / 24 wings (got ${midges.length}/${edges.length - midges.length})`, midges.length === 12 && edges.length - midges.length === 24);

// --- reduced-state predicates -------------------------------------------------
// A tredge is solid when all cubies at one edge location show the same color on
// the same face. Grouped by location (the pair of faces the stickers point to).
const locId = (c) => c.stickers.map((s) => faceOfDir(s.dir)).sort().join("");
const colorSig = (c) => c.stickers.map((s) => `${faceOfDir(s.dir)}:${faceOfColor(s.color)}`).sort().join("|");
function solidTredges(state) {
  const byLoc = new Map();
  for (const c of state) {
    if (c.stickers.length !== 2) continue;
    const id = locId(c);
    if (!byLoc.has(id)) byLoc.set(id, []);
    byLoc.get(id).push(colorSig(c));
  }
  let n = 0;
  for (const sigs of byLoc.values()) if (sigs.every((s) => s === sigs[0])) n++;
  return n;
}

// --- the hand-off ------------------------------------------------------------
const v0 = buildVirtual3x3(solved);
check(`solved 5×5 → 26 virtual cubies (got ${v0.length})`, v0.length === 26);
check("solved 5×5 → virtual 3×3 is legal (parity 0)", reductionParity(solved) === 0);
check("solved 5×5: 12/12 solid tredges", solidTredges(solved) === 12);

// Outer-turn-only scrambles keep the cube reduced, so each is a legal hand-off
// case; solving it as a 3×3 must solve the real 5×5.
const OUTER = [];
for (const axis of ["x", "y", "z"]) for (const layer of [-OFF, OFF]) for (const dir of [1, -1]) OUTER.push({ axis, layer, dir });
function scrambleOuter(n) {
  const st = clone(solved);
  for (let i = 0; i < n; i++) { const m = OUTER[(Math.random() * OUTER.length) | 0]; applyTurn(st, m.axis, m.layer, m.dir); }
  return st;
}

const N = 30;
let reduced = 0, legal = 0, handed = 0, totMoves = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const scrambled = scrambleOuter(40);
  if (centersSolved(scrambled) && solidTredges(scrambled) === 12) reduced++;
  if (reductionParity(scrambled) === 0) legal++;

  const moves3 = solveKociemba(buildVirtual3x3(scrambled));
  if (!moves3) continue;
  // Remap each 3×3 face turn (layer ±1) onto the 5×5 outer layer (±2).
  const mapped = moves3.map((m) => ({ axis: m.axis, layer: Math.sign(m.layer) * OFF, dir: m.dir }));
  const replay = clone(scrambled);
  for (const m of mapped) applyTurn(replay, m.axis, m.layer, m.dir);
  if (isSolved(replay)) { handed++; totMoves += mapped.length; }
}
check(`outer scrambles stay reduced: ${reduced}/${N}`, reduced === N);
check(`reduced 5×5 reads as a legal 3×3: ${legal}/${N}`, legal === N);
check(`hand-off solves the real 5×5: ${handed}/${N}`, handed === N);
console.log(`avg hand-off ${(totMoves / Math.max(handed, 1)).toFixed(1)} qtm | ${Date.now() - t0}ms (${((Date.now() - t0) / N).toFixed(0)}ms/cube)`);

console.log(fails === 0 ? "\nHANDOFF-5 OK ✓" : `\nHANDOFF-5 FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
