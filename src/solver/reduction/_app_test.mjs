// App-level solve flow, headless (no p5): drives the REAL move engine exactly as
// the UI does — scramble() (Space), let the animation finish, requestSolve()
// (Enter), then animate the queued solution — and checks the live cube ends up
// solved. Covers every size the app offers (3×3, 4×4, 5×5). Also times each
// solve, since computeSolution runs synchronously on the page's main thread.
import { cube, buildCubies } from "../../cube/model.js";
import { engine, updateMoves } from "../../cube/moves.js";
import { scramble, requestSolve, setCubeSize } from "../../cube/actions.js";
import { readState, isSolved } from "../cube-model.js";
import { CUBE_SIZES } from "../../config.js";

let fails = 0;
const check = (name, cond) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}`); if (!cond) fails++; };

// Run frames until the engine is idle (nothing queued, animating or requested).
function drain(maxFrames = 2_000_000) {
  for (let f = 0; f < maxFrames; f++) {
    if (!engine.current && !engine.queue.length && !engine.solveRequested) return true;
    updateMoves();
  }
  return false;
}

// Time only the frame in which the solve itself runs (the main-thread stall).
function solveTimed() {
  requestSolve();
  if (!engine.solveRequested) return { requested: false };
  let stall = 0;
  for (let f = 0; f < 10 && engine.solveRequested; f++) {
    const t = performance.now();
    updateMoves();
    stall = Math.max(stall, performance.now() - t);
  }
  const plan = engine.plan ? engine.plan.length : 0;
  return { requested: true, stall, plan, drained: drain() };
}

check(`app offers sizes ${CUBE_SIZES.join("/")}`, [3, 4, 5].every((n) => CUBE_SIZES.includes(n)));

for (const [size, N] of [[3, 10], [4, 6], [5, 6]]) {
  buildCubies(3); // make sure setCubeSize actually switches
  setCubeSize(size);
  let solved = 0, worstStall = 0, totPlan = 0, firstStall = 0;
  for (let i = 0; i < N; i++) {
    scramble();
    drain();
    const scrambled = !isSolved(readState());
    const r = solveTimed();
    if (i === 0) firstStall = r.stall || 0;
    worstStall = Math.max(worstStall, r.stall || 0);
    totPlan += r.plan || 0;
    if (scrambled && r.requested && r.drained && r.plan > 0 && isSolved(readState())
        && engine.planDone === r.plan) solved++;
  }
  check(`${size}×${size}: ${solved}/${N} solved through the app flow | avg ${(totPlan / N).toFixed(0)} moves | ` +
        `first solve ${(firstStall / 1000).toFixed(1)}s (cold), worst ${(worstStall / 1000).toFixed(1)}s`, solved === N);
}

// A cube that's already solved: Enter does nothing visible (empty plan).
setCubeSize(4); buildCubies(4);
requestSolve(); drain();
check("solved cube: no plan queued", engine.plan === null && isSolved(readState()));

console.log(fails === 0 ? "\nAPP FLOW OK ✓" : `\nAPP FLOW FAILURES: ${fails}`);
process.exit(fails ? 1 : 0);
