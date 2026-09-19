import { buildCubies } from "../../cube/model.js";
import { readState, applyTurn } from "../cube-model.js";
import { parseAlg } from "./moves.js";
import { solveCenters } from "./centers.js";
import { centersSolved } from "./model.js";

const AXES = ["x", "y", "z"];
function scramble4(n) {
  buildCubies(4);
  const st = readState();
  const layers = [-1.5, -0.5, 0.5, 1.5];
  for (let i = 0; i < n; i++) applyTurn(st, AXES[(Math.random()*3)|0], layers[(Math.random()*4)|0], Math.random()<0.5?1:-1);
  return st;
}

let fails=0, totalMoves=0, maxMoves=0;
const N=100;
const t=Date.now();
for (let i=0;i<N;i++){
  const st = scramble4(60);
  const moves=[];
  const ok = solveCenters(st, (m)=>moves.push(m), 4);
  if (!ok || !centersSolved(st)) { fails++; if(fails<=3) console.log("FAIL case", i, "ok="+ok); continue; }
  totalMoves+=moves.length; maxMoves=Math.max(maxMoves,moves.length);
}
console.log(`centers: ${N} cubes | fails ${fails} | avg ${(totalMoves/(N-fails)).toFixed(0)} qtm | max ${maxMoves} | ${Date.now()-t}ms`);
console.log(fails===0?"CENTERS OK":"CENTERS FAILURES");
