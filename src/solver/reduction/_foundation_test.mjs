// Validate the NxN move layer + model utilities before building solver stages.
import { buildCubies, cube } from "../../cube/model.js";
import { readState, applyTurn, isSolved } from "../cube-model.js";
import { parseAlg } from "./moves.js";
import { centersSolved } from "./model.js";

function apply(state, alg, size) {
  for (const m of parseAlg(alg, size)) applyTurn(state, m.axis, m.layer, m.dir);
}
const inv = (moves) => moves.slice().reverse().map((m) => ({ ...m, dir: -m.dir }));

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? "ok " : "FAIL"} ${name}`); if (!cond) fails++; };

// --- 3×3 sanity ---
buildCubies(3);
let s = readState();
for (let i = 0; i < 6; i++) apply(s, "R U R' U'", 3);
check("3x3 (R U R' U')^6 == solved", isSolved(s));

s = readState();
apply(s, "R", 3); apply(s, "R'", 3);
check("3x3 R R' == solved", isSolved(s));

// --- 4×4 move / inverse cancellation ---
buildCubies(4);
for (const alg of ["Rw", "Rw2 Uw' F2 2R", "r U2 r' U2", "3Rw"]) {
  const state = readState();
  const ms = parseAlg(alg, 4);
  for (const m of ms) applyTurn(state, m.axis, m.layer, m.dir);
  for (const m of inv(ms)) applyTurn(state, m.axis, m.layer, m.dir);
  check(`4x4 "${alg}" + inverse == solved`, isSolved(state));
}

// --- 4×4 layer targeting (which coordinates a token turns) ---
const layers = (alg) => [...new Set(parseAlg(alg, 4).map((m) => `${m.axis}${m.layer}`))].sort();
check('4x4 "R" turns only x=1.5', JSON.stringify(layers("R")) === JSON.stringify(["x1.5"]));
check('4x4 "Rw" turns x=1.5 and x=0.5', JSON.stringify(layers("Rw")) === JSON.stringify(["x0.5", "x1.5"]));
check('4x4 "2R" turns only x=0.5', JSON.stringify(layers("2R")) === JSON.stringify(["x0.5"]));

// --- centersSolved detector ---
buildCubies(4);
check("4x4 solved -> centersSolved true", centersSolved(readState()));
s = readState();
apply(s, "2R", 4); // an inner slice scrambles centers
check("4x4 after inner slice -> centersSolved false", !centersSolved(s));

console.log(fails === 0 ? "\nFOUNDATION OK ✓" : `\nFOUNDATION FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
